import { spawn, type ChildProcess } from 'node:child_process';
import { loadConfig } from './config.js';
import { initLogger, createLogger } from './logger.js';

const logger = createLogger('cli');

async function main() {
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

      // Wire up channels
      if (config.channels.imessage.enabled) {
        const { IMessageChannel } = await import('@murph/channel-imessage');
        agent.addChannel(new IMessageChannel({
          chatDbPath: config.channels.imessage.chat_db_path,
          pollIntervalMs: config.channels.imessage.poll_interval_ms,
        }));
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
            execute: proxy.execute,
          });
        }
      }

      // Register profile.update action
      const { getPool } = await import('./profile-db.js');
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
            fields.push(`updated_at = NOW()`);
            await pool.query(
              `INSERT INTO user_profile (id, ${fields.map(f => f.split(' = ')[0]).join(', ')}, updated_at)
               VALUES ('default', ${values.map((_, i) => `$${i + 1}`).join(', ')}, NOW())
               ON CONFLICT (id) DO UPDATE SET ${fields.join(', ')}`,
              values,
            );
            return { actionId: '', success: true, data: { updated: true } };
          } catch (err) {
            return { actionId: '', success: false, error: err instanceof Error ? err.message : String(err) };
          }
        },
      });

      await agent.start();

      // Start dashboard in production mode
      const dashboardProc: ChildProcess = spawn('pnpm', ['--filter=@murph/dashboard', 'start'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
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
        if (dashboardProc.pid && !dashboardProc.killed) {
          dashboardProc.kill();
          logger.info('Dashboard stopped');
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
