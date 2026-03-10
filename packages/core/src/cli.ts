import { spawn, type ChildProcess } from 'node:child_process';
import { loadConfig } from './config.js';
import { initLogger, createLogger } from './logger.js';

const logger = createLogger('cli');

async function main() {
  // Ensure uv tool binaries (~/.local/bin) are reachable even in non-interactive shells
  const home = process.env.HOME ?? '';
  const localBin = `${home}/.local/bin`;
  if (home && !process.env.PATH?.includes(localBin)) {
    process.env.PATH = `${localBin}:${process.env.PATH ?? ''}`;
  }

  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'secret': {
      const subcommand = args[1];
      if (subcommand === 'set') {
        const [name, value] = [args[2], args[3]];
        if (!name || !value) {
          console.error('Usage: pnpm murph secret set <name> <value>');
          process.exit(1);
        }
        // Dynamic import to avoid loading security module until needed
        const { SecretStore } = await import('@murph/security');
        const store = new SecretStore();
        await store.init();
        await store.set(name, value);
        console.log(`Secret '${name}' stored successfully.`);
      } else if (subcommand === 'list') {
        const { SecretStore } = await import('@murph/security');
        const store = new SecretStore();
        await store.init();
        const secrets = await store.list();
        if (secrets.length === 0) {
          console.log('No secrets stored.');
        } else {
          console.log('Stored secrets:');
          for (const name of secrets) {
            console.log(`  - ${name}`);
          }
        }
      } else if (subcommand === 'delete') {
        const name = args[2];
        if (!name) {
          console.error('Usage: pnpm murph secret delete <name>');
          process.exit(1);
        }
        const { SecretStore } = await import('@murph/security');
        const store = new SecretStore();
        await store.init();
        await store.delete(name);
        console.log(`Secret '${name}' deleted.`);
      } else {
        console.error('Usage: pnpm murph secret <set|list|delete>');
        process.exit(1);
      }
      break;
    }

    case 'start': {
      const { getConfigManager } = await import('./config.js');
      const configManager = getConfigManager();
      const config = configManager.load();
      initLogger(config.logging.level, config.logging.file);
      const { Agent } = await import('./agent.js');
      const { IPCServer } = await import('./ipc-server.js');

      const agent = new Agent(config, configManager);
      const ipcServer = new IPCServer(agent);

      // Wire up memory
      let memoryManager: { start(): Promise<void>; stop(): Promise<void> } | null = null;
      try {
        const { MemoryManager } = await import('@murph/memory');
        memoryManager = new MemoryManager({
          databaseUrl: config.database.url,
          shortTermBufferSize: config.memory.short_term_buffer_size,
          flushIntervalSeconds: config.memory.flush_interval_seconds,
          semanticSearchLimit: config.memory.semantic_search_limit,
          knowledgeSearchLimit: config.memory.knowledge_search_limit,
          maxContextTokens: config.memory.max_context_tokens,
          ollamaUrl: config.embedding.ollama_url,
          embeddingModel: config.embedding.model,
        });
        await memoryManager.start();
        agent.setMemory(memoryManager as any);
        logger.info('MemoryManager started');
      } catch (err) {
        logger.warn({ err }, 'Failed to start MemoryManager — running without memory');
      }

      // Start IPC server and set up event forwarding
      await ipcServer.start();
      ipcServer.setupEventForwarding();

      // Import pool early — needed by channel callbacks and action registrations
      const { getPool } = await import('./profile-db.js');

      // Wire up channels
      if (config.channels.imessage.enabled) {
        const { IMessageChannel } = await import('@murph/channel-imessage');
        const pool = getPool(config.database.url);

        agent.addChannel(new IMessageChannel({
          chatDbPath: config.channels.imessage.chat_db_path,
          pollIntervalMs: config.channels.imessage.poll_interval_ms,
          allowedSenders: config.channels.imessage.allowed_senders,
          logger: createLogger('channel-imessage'),
          checkOutboundGrant: async (sender: string) => {
            const result = await pool.query(
              `SELECT id, outbound_message, conversation_id
               FROM outbound_grants
               WHERE recipient = $1 AND expires_at > NOW()
               ORDER BY expires_at DESC
               LIMIT 1`,
              [sender.toLowerCase()],
            );
            if (result.rows.length === 0) return null;
            const row = result.rows[0];
            return {
              grantId: row.id,
              outboundMessage: row.outbound_message,
              conversationId: row.conversation_id ?? undefined,
            };
          },
          extendOutboundGrant: async (grantId: string) => {
            await pool.query(
              `UPDATE outbound_grants
               SET expires_at = NOW() + INTERVAL '1 hour', updated_at = NOW()
               WHERE id = $1`,
              [grantId],
            );
          },
        }));

        // Register imessage.send action
        const { sendToRecipient } = await import('@murph/channel-imessage');
        agent.getRegistry().register({
          name: 'imessage.send',
          description: 'Send an iMessage to a phone number or email address. Creates a temporary 1-hour reply window for the recipient. Params: recipient (phone/email), message (text)',
          parameterSchema: {
            type: 'object',
            required: ['recipient', 'message'],
            properties: {
              recipient: { type: 'string', description: 'Phone number or email address' },
              message: { type: 'string', description: 'Message text to send' },
            },
          },
          execute: async (params) => {
            try {
              const recipient = params.recipient as string;
              const message = params.message as string;
              await sendToRecipient(recipient, message);
              const grantResult = await pool.query(
                `INSERT INTO outbound_grants (recipient, outbound_message, expires_at)
                 VALUES ($1, $2, NOW() + INTERVAL '1 hour')
                 RETURNING id, expires_at`,
                [recipient.toLowerCase(), message],
              );
              const grant = grantResult.rows[0];
              return {
                actionId: '',
                success: true,
                data: { sent: true, grantId: grant.id, expiresAt: grant.expires_at },
              };
            } catch (err) {
              return {
                actionId: '',
                success: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          },
        });
      }

      // Wire up MCP servers
      let mcpManager: import('@murph/mcp-client').McpClientManager | null = null;
      if (config.mcp_servers.length > 0) {
        const { McpClientManager, createToolProxies } = await import('@murph/mcp-client');
        mcpManager = new McpClientManager();
        for (const server of config.mcp_servers) {
          try {
            await mcpManager.connect(server);
            logger.info({ server: server.name }, 'MCP server connected');
          } catch (err) {
            logger.error({ server: server.name, err }, 'Failed to connect MCP server');
          }
        }
        const proxies = createToolProxies(mcpManager);
        for (const proxy of proxies) {
          agent.getRegistry().register({
            name: proxy.name,
            description: proxy.description,
            parameterSchema: proxy.parameterSchema,
            execute: proxy.execute,
          });
        }
      }

      // Wire up native Google Workspace integration
      let googleClient: any = null;
      try {
        const googleMod = await import('@murph/integration-google');
        googleClient = new googleMod.GoogleClient();
        await googleClient.init();
        if (await googleClient.isAuthenticated()) {
          googleMod.registerGoogleTools(agent.getRegistry(), googleClient);
          logger.info('Google Workspace connected (googleapis SDK)');
        } else {
          logger.warn('Google Workspace not authenticated — run: pnpm murph google-auth');
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to initialize Google Workspace');
      }

      // Register profile.update action
      agent.getRegistry().register({
        name: 'profile.update',
        description: 'Update user profile information. Parameters: name, location, profession, hobbies (array), bio, social_twitter, social_linkedin, social_github, social_instagram, social_facebook',
        execute: async (params) => {
          try {
            const pool = getPool(config.database.url);
            const fields: string[] = [];
            const values: unknown[] = [];
            let idx = 1;
            for (const key of ['name', 'location', 'profession', 'bio', 'social_twitter', 'social_linkedin', 'social_github', 'social_instagram', 'social_facebook']) {
              if (params[key] !== undefined) {
                fields.push(`${key} = $${idx}`);
                values.push(params[key]);
                idx++;
              }
            }
            if (params.hobbies !== undefined) {
              fields.push(`hobbies = $${idx}`);
              values.push(Array.isArray(params.hobbies) ? params.hobbies : [params.hobbies]);
              idx++;
            }
            if (fields.length === 0) {
              return { actionId: '', success: false, error: 'No fields to update' };
            }
            await pool.query(
              `INSERT INTO user_profile (id, ${fields.map(f => f.split(' = ')[0]).join(', ')}, updated_at)
               VALUES ('default', ${values.map((_, i) => `$${i + 1}`).join(', ')}, NOW())
               ON CONFLICT (id) DO UPDATE SET ${fields.join(', ')}, updated_at = NOW()`,
              values,
            );
            return { actionId: '', success: true, data: { updated: true } };
          } catch (err) {
            return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
          }
        },
      });

      // Wire up scheduler and register scheduler actions
      let scheduler: import('@murph/scheduler').Scheduler | null = null;
      if (!config.scheduler.enabled) {
        logger.info('Scheduler disabled by config');
      } else try {
        const { Scheduler } = await import('@murph/scheduler');
        const schedulerPool = getPool(config.database.url);
        scheduler = new Scheduler(schedulerPool);

        // When a task fires, execute its action through the registry
        scheduler.onTaskDue(async (task) => {
          logger.info({ taskId: task.id, action: task.action }, 'Scheduled task firing');
          try {
            const result = await agent.getRegistry().execute({
              id: task.id,
              name: task.action,
              description: '',
              parameters: task.parameters,
              approval: 'auto',
            });
            logger.info({ taskId: task.id, success: result.success }, 'Scheduled task completed');
          } catch (err) {
            logger.error({ taskId: task.id, err }, 'Scheduled task failed');
          }
        });

        await scheduler.start();
        logger.info('Scheduler started');

        agent.getRegistry().register({
          name: 'scheduler.create',
          description: 'Create a scheduled task. Params: name (string), cronExpression (string, e.g. "0 9 * * *"), action (string — action to run), parameters (object, optional), enabled (boolean, default true), oneShot (boolean, default false — if true, task is automatically deleted after it fires once)',
          parameterSchema: {
            type: 'object',
            required: ['name', 'cronExpression', 'action'],
            properties: {
              name: { type: 'string' },
              cronExpression: { type: 'string' },
              action: { type: 'string' },
              parameters: { type: 'object' },
              enabled: { type: 'boolean' },
              oneShot: { type: 'boolean', description: 'If true, task is deleted after firing once. Use for one-time reminders.' },
            },
          },
          execute: async (params) => {
            try {
              const task = await scheduler!.createTask({
                name: params.name as string,
                cronExpression: params.cronExpression as string,
                action: params.action as string,
                parameters: (params.parameters as Record<string, unknown>) ?? {},
                enabled: params.enabled !== false,
                oneShot: params.oneShot === true,
              });
              return { actionId: '', success: true, data: task };
            } catch (err) {
              return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
            }
          },
        });

        agent.getRegistry().register({
          name: 'scheduler.list',
          description: 'List all scheduled tasks',
          execute: async () => {
            try {
              const tasks = await scheduler!.listTasks();
              return { actionId: '', success: true, data: tasks };
            } catch (err) {
              return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
            }
          },
        });

        // Helper: resolve a query string to a task ID (UUID passthrough or name search)
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const resolveTaskId = async (query: string): Promise<{ id: string } | { error: string; matches?: import('@murph/scheduler').ScheduledTask[] }> => {
          if (UUID_RE.test(query)) return { id: query };
          const matches = await scheduler!.findTasksByName(query);
          if (matches.length === 0) return { error: `No task found matching "${query}"` };
          if (matches.length === 1) return { id: matches[0].id };
          return {
            error: `Multiple tasks match "${query}". Please clarify which one.`,
            matches: matches.map((t) => ({ id: t.id, name: t.name, cronExpression: t.cronExpression, action: t.action, enabled: t.enabled }) as any),
          };
        };

        agent.getRegistry().register({
          name: 'scheduler.delete',
          description: 'Delete a scheduled task by name or ID. Pass a query string — if it\'s a UUID the task is deleted directly; otherwise a case-insensitive name search is performed. If multiple tasks match, the list is returned so you can ask the user to clarify.',
          parameterSchema: {
            type: 'object',
            required: ['query'],
            properties: { query: { type: 'string' } },
          },
          execute: async (params) => {
            try {
              const resolved = await resolveTaskId(params.query as string);
              if ('error' in resolved) {
                return { actionId: '', success: false, error: resolved.error, data: (resolved as any).matches };
              }
              await scheduler!.deleteTask(resolved.id);
              return { actionId: '', success: true, data: { deleted: true, id: resolved.id } };
            } catch (err) {
              return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
            }
          },
        });

        agent.getRegistry().register({
          name: 'scheduler.update',
          description: 'Update a scheduled task by name or ID. Pass a query string to identify the task, plus any fields to update: name (string), cronExpression (string), action (string), parameters (object), enabled (boolean). If multiple tasks match the query, the list is returned so you can ask the user to clarify.',
          parameterSchema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string' },
              name: { type: 'string' },
              cronExpression: { type: 'string' },
              action: { type: 'string' },
              parameters: { type: 'object' },
              enabled: { type: 'boolean' },
            },
          },
          execute: async (params) => {
            try {
              const { query, ...updates } = params;
              const resolved = await resolveTaskId(query as string);
              if ('error' in resolved) {
                return { actionId: '', success: false, error: resolved.error, data: (resolved as any).matches };
              }
              await scheduler!.updateTask(resolved.id, updates);
              return { actionId: '', success: true, data: { updated: true, id: resolved.id } };
            } catch (err) {
              return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
            }
          },
        });
      } catch (err) {
        logger.warn({ err }, 'Failed to start Scheduler — running without scheduler');
      }

      // Wire up email maintenance engine
      let emailMaintenanceEngine: import('./email-maintenance.js').EmailMaintenanceEngine | null = null;
      if (config.email_maintenance.enabled && googleClient) {
        try {
          const { EmailMaintenanceEngine } = await import('./email-maintenance.js');
          const emPool = getPool(config.database.url);
          emailMaintenanceEngine = new EmailMaintenanceEngine(googleClient, emPool, config.agent.timezone);
          emailMaintenanceEngine.startCron(config.email_maintenance);
          agent.setEmailMaintenance(emailMaintenanceEngine);
          logger.info('Email maintenance engine started');
        } catch (err) {
          logger.warn({ err }, 'Failed to start email maintenance engine');
        }
      } else if (!config.email_maintenance.enabled) {
        logger.info('Email maintenance disabled by config');
      }

      // Listen for config changes on email_maintenance paths
      if (configManager) {
        configManager.on('config:changed', (event: import('@murph/config').ConfigChangeEvent) => {
          for (const path of event.changedPaths) {
            if (path.startsWith('email_maintenance')) {
              if (emailMaintenanceEngine) {
                emailMaintenanceEngine.reconfigure(event.current.email_maintenance);
                logger.info('Email maintenance engine reconfigured');
              } else if (event.current.email_maintenance.enabled && googleClient) {
                // Engine wasn't created before, create now
                import('./email-maintenance.js').then(({ EmailMaintenanceEngine }) => {
                  const emPool = getPool(config.database.url);
                  emailMaintenanceEngine = new EmailMaintenanceEngine(googleClient!, emPool, event.current.agent.timezone);
                  emailMaintenanceEngine.startCron(event.current.email_maintenance);
                  agent.setEmailMaintenance(emailMaintenanceEngine);
                  logger.info('Email maintenance engine started after config change');
                }).catch(err => {
                  logger.error({ err }, 'Failed to start email maintenance engine after config change');
                });
              }
              break;
            }
          }
        });
      }

      // Register system.update action
      agent.getRegistry().register({
        name: 'system.update',
        description: 'Update Murph: pulls latest code, installs dependencies, builds, runs migrations, and restarts the agent via LaunchAgent. Use this to apply updates.',
        execute: async (_params) => {
          try {
            const { execSync } = await import('node:child_process');
            const cwd = process.cwd();

            const runStep = (cmd: string, label: string) => {
              logger.info({ cmd }, `system.update: ${label}`);
              execSync(cmd, { cwd, stdio: 'pipe', timeout: 300000 });
            };

            runStep('git pull --ff-only', 'Pulling latest code');
            runStep('pnpm install', 'Installing dependencies');
            runStep('pnpm build', 'Building');
            runStep('pnpm run migrate', 'Running migrations');

            // Restart via LaunchAgent (KeepAlive will bring us back with new code)
            logger.info('system.update: Restarting agent via launchctl stop');
            try {
              execSync('launchctl stop com.murph.agent', { stdio: 'pipe', timeout: 10000 });
            } catch {
              // If not managed by launchctl, just exit and let nohup or manual restart handle it
              logger.info('system.update: Not managed by LaunchAgent, exiting for manual restart');
              process.exit(0);
            }

            return { actionId: '', success: true, data: { updated: true, message: 'Update applied, agent restarting' } };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error({ err }, 'system.update failed');
            return { actionId: '', success: false, error: message };
          }
        },
      });

      // Hourly cleanup of expired outbound grants (> 24 hours old)
      const grantCleanupPool = getPool(config.database.url);
      const grantCleanupInterval = setInterval(async () => {
        try {
          const result = await grantCleanupPool.query(
            `DELETE FROM outbound_grants WHERE expires_at < NOW() - INTERVAL '24 hours'`,
          );
          if (result.rowCount && result.rowCount > 0) {
            logger.info({ deleted: result.rowCount }, 'Cleaned up expired outbound grants');
          }
        } catch (err) {
          logger.error({ err }, 'Failed to clean up outbound grants');
        }
      }, 60 * 60 * 1000); // every hour

      // Wire up auto-updater
      let autoUpdater: import('./auto-updater.js').AutoUpdater | null = null;
      if (config.auto_update.enabled) {
        const { AutoUpdater } = await import('./auto-updater.js');
        autoUpdater = new AutoUpdater(config.auto_update, process.cwd(), config.agent.timezone);
        autoUpdater.start();
      } else {
        logger.info('Auto-updater disabled by config');
      }

      await agent.start();

      // Start dashboard in standalone mode
      const { join: pathJoin } = await import('node:path');
      const dashboardServerPath = pathJoin(process.cwd(), 'packages', 'dashboard', '.next', 'standalone', 'packages', 'dashboard', 'server.js');
      const dashboardProc: ChildProcess = spawn('node', [dashboardServerPath], {
        cwd: pathJoin(process.cwd(), 'packages', 'dashboard'),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: { ...process.env, PORT: '3141', HOSTNAME: 'localhost' },
      });

      dashboardProc.stderr?.on('data', (data: Buffer) => {
        logger.error({ output: data.toString().trim() }, 'Dashboard stderr');
      });

      dashboardProc.on('error', (err) => {
        logger.error({ err }, 'Dashboard process error');
      });

      dashboardProc.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
          logger.error({ code, signal }, 'Dashboard exited unexpectedly');
        }
      });

      dashboardProc.unref();
      logger.info({ pid: dashboardProc.pid }, 'Dashboard started');

      // Keep the process alive until explicitly stopped
      const keepAlive = setInterval(() => {}, 1 << 30);

      const shutdown = async () => {
        clearInterval(keepAlive);
        clearInterval(grantCleanupInterval);
        if (dashboardProc.pid && !dashboardProc.killed) {
          dashboardProc.kill();
          logger.info('Dashboard stopped');
        }
        if (autoUpdater) {
          autoUpdater.stop();
        }
        if (emailMaintenanceEngine) {
          emailMaintenanceEngine.stopCron();
          logger.info('Email maintenance engine stopped');
        }
        if (scheduler) {
          await scheduler.stop();
          logger.info('Scheduler stopped');
        }
        if (mcpManager) {
          await mcpManager.disconnectAll();
          logger.info('MCP servers disconnected');
        }
        if (memoryManager) {
          await memoryManager.stop();
          logger.info('MemoryManager stopped');
        }
        await agent.stop();
        await ipcServer.stop();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      break;
    }

    case 'google-auth': {
      const { existsSync } = await import('node:fs');
      const { createInterface } = await import('node:readline');
      const { createServer } = await import('node:http');
      const { execSync: execSyncAuth } = await import('node:child_process');

      const configDir = `${process.env.HOME ?? ''}/.config/murph/google`;
      const credPath = `${configDir}/client_secret.json`;
      const tokenPath = `${configDir}/token.json`;

      console.log('Google Workspace Setup');
      console.log('─'.repeat(50));
      console.log('');

      // 1. Check for client_secret.json
      if (!existsSync(credPath)) {
        console.log('Missing Google OAuth credentials.');
        console.log('');
        console.log('Setup instructions:');
        console.log('  1. Go to https://console.cloud.google.com/apis/credentials');
        console.log('  2. Create a project (or select existing)');
        console.log('  3. Create OAuth 2.0 Client ID (type: Desktop app)');
        console.log('  4. Download the JSON and save to:');
        console.log(`     ${credPath}`);
        console.log('  5. Enable these APIs: Gmail, Calendar, Drive, Tasks');
        console.log('  6. Re-run: pnpm murph google-auth');
        process.exit(1);
      }
      console.log('✓ client_secret.json found');

      // 2. Check existing auth
      const { GoogleClient: GC, GOOGLE_SCOPES: scopes } = await import('@murph/integration-google');
      let alreadyAuthenticated = false;
      try {
        const testClient = new GC({ credentialsPath: credPath, tokenPath });
        await testClient.init();
        alreadyAuthenticated = await testClient.isAuthenticated();
      } catch {}

      if (alreadyAuthenticated) {
        console.log('');
        console.log('Google Workspace is already authenticated.');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));
        const reauth = await ask('Re-authenticate? (y/N) ');
        rl.close();
        if (reauth.toLowerCase() !== 'y') {
          console.log('  Keeping existing credentials.');
          process.exit(0);
        }
      }

      // 3. Start temporary HTTP server and open browser
      console.log('');
      console.log('Starting Google authorization...');
      console.log('A browser window will open for Google OAuth consent.');
      console.log('');

      const redirectUri = 'http://localhost:9876/callback';

      try {
        const authUrl = await GC.getAuthUrl(credPath, scopes, redirectUri);

        const code = await new Promise<string>((resolve, reject) => {
          let timeoutId: ReturnType<typeof setTimeout>;
          const server = createServer((req, res) => {
            const url = new URL(req.url ?? '/', `http://localhost:9876`);
            if (url.pathname === '/callback') {
              const authCode = url.searchParams.get('code');
              if (authCode) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h2>Authentication successful!</h2><p>You can close this tab and return to the terminal.</p></body></html>');
                clearTimeout(timeoutId);
                server.close();
                resolve(authCode);
              } else {
                const error = url.searchParams.get('error') ?? 'No code received';
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<html><body><h2>Error</h2><p>${error}</p></body></html>`);
                clearTimeout(timeoutId);
                server.close();
                reject(new Error(error));
              }
            }
          });

          server.listen(9876, () => {
            console.log('Waiting for authorization...');
            try {
              execSyncAuth(`open "${authUrl}"`, { stdio: 'ignore' });
            } catch {
              console.log('Could not open browser automatically.');
              console.log('Open this URL in your browser:');
              console.log(`  ${authUrl}`);
            }
          });

          // 5-minute timeout
          timeoutId = setTimeout(() => {
            server.close();
            reject(new Error('Authorization timed out'));
          }, 5 * 60 * 1000);
        });

        // Exchange code for tokens
        await GC.exchangeCode(credPath, tokenPath, code, redirectUri);

        // Verify
        const verifyClient = new GC({ credentialsPath: credPath, tokenPath });
        await verifyClient.init();
        const verified = await verifyClient.isAuthenticated();

        console.log('');
        if (verified) {
          console.log('✓ Google Workspace authentication successful!');
        } else {
          console.log('! Authentication may not have completed.');
          console.log('  Re-run: pnpm murph google-auth');
        }
      } catch (err) {
        console.error('');
        console.error('✗ Authentication failed.');
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        console.error('');
        console.error('Troubleshooting:');
        console.error('  - Ensure client_secret.json is valid (Desktop app type)');
        console.error('  - Enable the required APIs in Google Cloud Console');
        console.error('  - Then re-run: pnpm murph google-auth');
        process.exit(1);
      }

      console.log('');
      console.log('Google Workspace is connected. Available services:');
      console.log('  • Gmail — read, search, send email');
      console.log('  • Calendar — view and manage events');
      console.log('  • Tasks — manage task lists');
      console.log('  • Drive — search and read files (read-only)');
      console.log('');
      console.log('Restart Murph to activate: pnpm murph start');
      break;
    }

    case 'setup-plaud': {
      const { execSync } = await import('node:child_process');
      const { existsSync } = await import('node:fs');
      const { readFileSync, writeFileSync } = await import('node:fs');
      const { join: pathJoin } = await import('node:path');

      console.log('Plaud MCP Setup');
      console.log('─'.repeat(40));
      console.log('');

      // 1. Check Plaud Desktop
      if (!existsSync('/Applications/PLAUD.app')) {
        console.error('✗ Plaud Desktop is not installed.');
        console.error('  Download from: https://global.plaud.ai/pages/app-download');
        console.error('  Install and sign in, then re-run this command.');
        process.exit(1);
      }
      console.log('✓ Plaud Desktop is installed');

      // 2. Check uv
      try {
        execSync('which uv', { stdio: 'ignore' });
        console.log('✓ uv is installed');
      } catch {
        console.log('Installing uv...');
        try {
          execSync('brew install uv', { stdio: 'inherit' });
          console.log('✓ uv installed');
        } catch {
          console.error('✗ Failed to install uv. Try manually: brew install uv');
          process.exit(1);
        }
      }

      // 3. Install Plaud MCP
      try {
        execSync('which plaud-mcp', { stdio: 'ignore' });
        console.log('✓ plaud-mcp is already installed');
      } catch {
        console.log('Installing Plaud MCP server...');
        try {
          execSync('uv tool install plaud-mcp --from "git+https://github.com/davidlinjiahao/plaud-mcp"', {
            stdio: 'inherit',
          });
          console.log('✓ plaud-mcp installed');
        } catch {
          console.error('✗ Failed to install plaud-mcp.');
          console.error('  Try manually: uv tool install plaud-mcp --from "git+https://github.com/davidlinjiahao/plaud-mcp"');
          process.exit(1);
        }
      }

      // 4. Check if Plaud MCP server is in config
      const configPath = pathJoin(process.cwd(), 'murph.config.yaml');
      if (existsSync(configPath)) {
        const configContent = readFileSync(configPath, 'utf-8');
        if (!configContent.includes('name: "plaud"')) {
          console.log('');
          console.log('Adding Plaud MCP server to murph.config.yaml...');
          const plaudEntry = '\n  - name: "plaud"\n    transport: "stdio"\n    command: "plaud-mcp"\n';
          const updated = configContent.replace(
            /(mcp_servers:.*(?:\n  - .*)*)/,
            `$1${plaudEntry}`,
          );
          writeFileSync(configPath, updated, 'utf-8');
          console.log('✓ Plaud MCP server added to config');
        } else {
          console.log('✓ Plaud MCP server already in config');
        }
      }

      // 5. Verify connection
      console.log('');
      console.log('Verifying Plaud Desktop connection...');
      try {
        const result = execSync('plaud-mcp --help 2>&1', {
          timeout: 10000,
          encoding: 'utf-8',
        });
        console.log('✓ plaud-mcp is functional');
      } catch {
        console.log('! Could not verify plaud-mcp. Ensure Plaud Desktop is running and signed in.');
      }

      console.log('');
      console.log('Plaud MCP setup complete.');
      console.log('Restart Murph to activate: pnpm murph start');
      break;
    }

    case 'doctor': {
      const { runDoctor, printDoctorResult } = await import('./doctor.js');
      const result = await runDoctor();
      printDoctorResult(result);
      process.exit(result.failed > 0 ? 1 : 0);
      break;
    }

    case 'tui': {
      // Dynamic import to launch TUI — use string variable to avoid TS
      // resolving the module at compile time (tui is not a core dependency)
      const tuiModule = '@murph/tui';
      try {
        await import(/* webpackIgnore: true */ tuiModule);
      } catch (err) {
        console.error('Failed to launch TUI. Make sure @murph/tui is built.');
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      }
      break;
    }

    default:
      console.log('Murph AI Agent Framework');
      console.log('');
      console.log('Commands:');
      console.log('  start              Start the agent');
      console.log('  tui                Launch terminal UI');
      console.log('  doctor             Run system diagnostics');
      console.log('  google-auth        Set up Google Workspace (OAuth)');
      console.log('  setup-plaud        Set up Plaud MCP server');
      console.log('  secret set <n> <v> Store a secret');
      console.log('  secret list        List all secrets');
      console.log('  secret delete <n>  Delete a secret');
      break;
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
