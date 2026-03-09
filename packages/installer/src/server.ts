import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_STEPS, getStep } from './steps/index.js';
import { startAgent, isRunning, AGENT_LABEL } from './launchctl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIZARD_UI_DIR = join(__dirname, 'wizard-ui');

const app = express();
app.use(express.json());

// --- SSE log stream ---

type LogClient = {
  id: number;
  res: express.Response;
};

let logClientId = 0;
const logClients: LogClient[] = [];

function broadcastLog(line: string): void {
  const data = `data: ${JSON.stringify({ line, timestamp: Date.now() })}\n\n`;
  for (const client of logClients) {
    client.res.write(data);
  }
}

// --- Step status tracking ---

const stepStatus: Record<string, 'pending' | 'running' | 'done' | 'error'> = {};
const stepErrors: Record<string, string> = {};

for (const step of ALL_STEPS) {
  stepStatus[step.name] = 'pending';
}

// --- Full Disk Access helpers ---

import { spawnSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

app.post('/api/open-fda-settings', (_req, res) => {
  // Ventura+ / Sequoia format first, fall back to older format
  const result = spawnSync('open', ['x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles']);
  if (result.status !== 0) {
    spawnSync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles']);
  }
  res.json({ opened: true });
});

// Return the detected node binary path (prefer MurphNode.app for FDA)
const appNodePath = join(homedir(), 'murph', 'MurphNode.app', 'Contents', 'MacOS', 'node');

app.get('/api/node-path', (_req, res) => {
  if (existsSync(appNodePath)) {
    res.json({ nodePath: appNodePath });
    return;
  }
  if (existsSync('/usr/local/bin/node')) {
    res.json({ nodePath: '/usr/local/bin/node' });
    return;
  }
  let nodePath = 'node';
  try {
    nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
  } catch {
    nodePath = '/usr/local/bin/node';
  }
  res.json({ nodePath });
});

// Check whether the node binary can read ~/Library/Messages/chat.db (FDA proxy)
app.get('/api/check-node-fda', (_req, res) => {
  let nodePath: string;
  if (existsSync(appNodePath)) {
    nodePath = appNodePath;
  } else if (existsSync('/usr/local/bin/node')) {
    nodePath = '/usr/local/bin/node';
  } else {
    try {
      nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
    } catch {
      nodePath = '/usr/local/bin/node';
    }
  }

  const chatDbPath = join(homedir(), 'Library', 'Messages', 'chat.db');
  // Spawn the target binary to test access — the installer's own process may not have FDA
  const result = spawnSync(nodePath, [
    '-e',
    `require('fs').accessSync(${JSON.stringify(chatDbPath)}, require('fs').constants.R_OK)`,
  ], { stdio: 'pipe', timeout: 5000 });
  const granted = result.status === 0;
  res.json({ granted, nodePath });
});

// --- Routes ---

// Serve wizard UI
app.use(express.static(WIZARD_UI_DIR));

app.get('/', (_req, res) => {
  res.sendFile(join(WIZARD_UI_DIR, 'index.html'));
});



// --- Accessibility helpers ---

function checkAccessibility(): boolean {
  const result = spawnSync('osascript', [
    '-e', 'tell application "System Events" to get name of first process',
  ], { stdio: 'pipe', timeout: 5000 });
  return result.status === 0;
}

// Check Accessibility
app.get('/api/check-accessibility', (_req, res) => {
  res.json({ granted: checkAccessibility() });
});

// Open Accessibility settings pane
app.post('/api/open-accessibility-settings', (_req, res) => {
  spawnSync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility']);
  res.json({ opened: true });
});

// List steps with status
app.get('/api/steps', async (_req, res) => {
  const steps = await Promise.all(
    ALL_STEPS.map(async (step) => {
      // If we haven't run it yet, do a quick check
      if (stepStatus[step.name] === 'pending') {
        try {
          const checkResult = await step.check();
          if (checkResult === 'done') {
            stepStatus[step.name] = 'done';
            stepErrors[step.name] = '';
          }
        } catch {
          // leave as pending
        }
      }

      return {
        name: step.name,
        label: step.label,
        description: step.description,
        required: step.required,
        status: stepStatus[step.name],
        error: stepErrors[step.name] ?? null,
      };
    }),
  );

  res.json(steps);
});

// Run a specific step
app.post('/api/steps/:name/run', async (req, res) => {
  const step = getStep(req.params.name);
  if (!step) {
    res.status(404).json({ error: 'Step not found' });
    return;
  }

  if (stepStatus[step.name] === 'running') {
    res.status(409).json({ error: 'Step is already running' });
    return;
  }

  stepStatus[step.name] = 'running';
  stepErrors[step.name] = '';
  broadcastLog(`--- Starting: ${step.label} ---`);

  try {
    await step.execute((line) => {
      broadcastLog(line);
    });
    stepStatus[step.name] = 'done';
    broadcastLog(`--- Completed: ${step.label} ---`);
    res.json({ status: 'done' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stepStatus[step.name] = 'error';
    stepErrors[step.name] = message;
    broadcastLog(`--- Failed: ${step.label}: ${message} ---`);
    res.status(500).json({ status: 'error', error: message });
  }
});

// Run all steps sequentially
app.post('/api/run-all', async (_req, res) => {
  res.json({ started: true });

  // Run in background
  (async () => {
    for (const step of ALL_STEPS) {
      if (stepStatus[step.name] === 'done') {
        broadcastLog(`--- Skipping (already done): ${step.label} ---`);
        continue;
      }

      stepStatus[step.name] = 'running';
      stepErrors[step.name] = '';
      broadcastLog(`--- Starting: ${step.label} ---`);

      try {
        await step.execute((line) => broadcastLog(line));
        stepStatus[step.name] = 'done';
        broadcastLog(`--- Completed: ${step.label} ---`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stepStatus[step.name] = 'error';
        stepErrors[step.name] = message;
        broadcastLog(`--- Failed: ${step.label}: ${message} ---`);

        if (step.required) {
          broadcastLog(`--- Installation halted: required step "${step.label}" failed ---`);
          return;
        }
      }
    }

    broadcastLog('--- All steps complete! ---');
  })();
});

// SSE log stream
app.get('/api/log-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const clientId = logClientId++;
  const client: LogClient = { id: clientId, res };
  logClients.push(client);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ line: 'Connected to install log stream', timestamp: Date.now() })}\n\n`);

  req.on('close', () => {
    const idx = logClients.findIndex(c => c.id === clientId);
    if (idx !== -1) logClients.splice(idx, 1);
  });
});

// Save configuration choices
app.post('/api/config', (req, res) => {
  // Config is handled by the config step
  // This endpoint receives user preferences from the wizard
  broadcastLog(`Configuration received: ${JSON.stringify(req.body)}`);
  res.json({ saved: true });
});

// Finish: start agent, wait for dashboard, signal completion
app.post('/api/finish', async (_req, res) => {
  broadcastLog('Starting Murph agent via LaunchAgent...');

  if (!isRunning(AGENT_LABEL)) {
    startAgent(AGENT_LABEL);
  }

  // Poll for dashboard to be ready (up to 15 seconds)
  let dashboardReady = false;
  for (let i = 0; i < 15; i++) {
    try {
      const probe = await fetch('http://localhost:3141', { signal: AbortSignal.timeout(2000) });
      if (probe.ok || probe.status === 304) {
        dashboardReady = true;
        break;
      }
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (dashboardReady) {
    broadcastLog('Murph agent started! Dashboard available at http://localhost:3141');
    res.json({ success: true, dashboardUrl: 'http://localhost:3141' });

    setTimeout(() => {
      broadcastLog('Wizard server shutting down. Use the dashboard for ongoing management.');
      process.exit(0);
    }, 2000);
  } else {
    broadcastLog('Agent started but dashboard is not responding yet. Check agent logs at ~/.murph/agent.stderr.log');
    res.json({
      success: false,
      error: 'Dashboard did not start. Check ~/.murph/agent.stderr.log for details.',
    });
  }
});

// Agent status
app.get('/api/agent-status', (_req, res) => {
  res.json({
    running: isRunning(AGENT_LABEL),
  });
});

// --- Start server ---

const PORT = parseInt(process.env.INSTALLER_PORT ?? '3142', 10);

app.listen(PORT, () => {
  console.log(`Murph Install Wizard running at http://localhost:${PORT}`);
  console.log('Open this URL in your browser to begin installation.');
});
