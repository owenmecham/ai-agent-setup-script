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

      // Start IPC server and set up event forwarding
      await ipcServer.start();
      ipcServer.setupEventForwarding();

      // Additional setup would go here (memory, channels, etc.)
      await agent.start();

      // Keep the process alive until explicitly stopped
      const keepAlive = setInterval(() => {}, 1 << 30);

      const shutdown = async () => {
        clearInterval(keepAlive);
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
