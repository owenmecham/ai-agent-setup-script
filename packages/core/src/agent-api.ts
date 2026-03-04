import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { Agent } from './agent.js';
import { createLogger } from './logger.js';
import type { ConfigManager } from '@murph/config';

const logger = createLogger('agent-api');

export class AgentAPI {
  private server: Server | null = null;
  private agent: Agent;
  private configManager: ConfigManager | null;
  private port: number;
  private startTime = Date.now();

  constructor(agent: Agent, configManager: ConfigManager | null, port: number = 3140) {
    this.agent = agent;
    this.configManager = configManager;
    this.port = port;
  }

  async start(): Promise<void> {
    this.startTime = Date.now();

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        logger.error({ err }, 'Unhandled API error');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, '127.0.0.1', () => {
        logger.info({ port: this.port }, 'Agent API started');
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS for localhost dashboard
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3141');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
    const path = url.pathname;

    // Route matching
    if (path === '/health' && req.method === 'GET') {
      await this.handleHealth(res);
    } else if (path === '/status' && req.method === 'GET') {
      this.handleStatus(res);
    } else if (path === '/approvals' && req.method === 'GET') {
      this.handleListApprovals(res);
    } else if (path.match(/^\/approvals\/[^/]+\/resolve$/) && req.method === 'POST') {
      const id = path.split('/')[2];
      await this.handleResolveApproval(req, res, id);
    } else if (path === '/config' && req.method === 'GET') {
      this.handleGetConfig(res);
    } else if (path === '/config' && req.method === 'PATCH') {
      await this.handleUpdateConfig(req, res);
    } else if (path === '/audit' && req.method === 'GET') {
      await this.handleAudit(req, res, url);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  private async handleHealth(res: ServerResponse): Promise<void> {
    try {
      const { runDoctor } = await import('./doctor.js');
      const result = await runDoctor();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Health check failed' }));
    }
  }

  private handleStatus(res: ServerResponse): void {
    const config = this.agent.getConfig();
    const channels = this.agent.getChannels().map(c => c.name);
    const pending = this.agent.getApprovalGate().getPending();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: config.agent.name,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      channels,
      pendingApprovals: pending.length,
      model: config.agent.model,
    }));
  }

  private handleListApprovals(res: ServerResponse): void {
    const pending = this.agent.getApprovalGate().getPending();
    const items = pending.map(p => ({
      id: p.id,
      action: p.action.name,
      parameters: p.action.parameters,
      requestedAt: p.requestedAt.toISOString(),
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(items));
  }

  private async handleResolveApproval(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const body = await readBody(req);
    const { approved, resolvedBy } = body as { approved: boolean; resolvedBy?: string };

    this.agent.getApprovalGate().resolve(id, approved, resolvedBy ?? 'api');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  private handleGetConfig(res: ServerResponse): void {
    const config = this.configManager ? this.configManager.get() : this.agent.getConfig();
    const redacted = redactSecrets(config);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(redacted));
  }

  private async handleUpdateConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.configManager) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ConfigManager not available' }));
      return;
    }

    const body = await readBody(req);
    const { path, value } = body as { path?: string; value?: unknown };

    try {
      let updated;
      if (path && value !== undefined) {
        updated = await this.configManager.set(path, value);
      } else {
        // Treat body as partial config update
        updated = await this.configManager.update(body as any);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(redactSecrets(updated)));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Update failed' }));
    }
  }

  private async handleAudit(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    try {
      const entries = await this.agent.getAuditLogger().query({
        limit,
        offset,
        action: url.searchParams.get('action') ?? undefined,
        status: url.searchParams.get('status') ?? undefined,
        channel: url.searchParams.get('channel') ?? undefined,
        since: url.searchParams.get('since') ? new Date(url.searchParams.get('since')!) : undefined,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entries));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
  }
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function redactSecrets(config: unknown): unknown {
  return JSON.parse(
    JSON.stringify(config, (_key, value) => {
      if (typeof value === 'string' && value.match(/^\$\{.+\}$/)) {
        return '********';
      }
      return value;
    })
  );
}
