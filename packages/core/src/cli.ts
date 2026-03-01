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
      const config = loadConfig();
      initLogger(config.logging.level, config.logging.file);
      const { Agent } = await import('./agent.js');
      const agent = new Agent(config);
      // Additional setup would go here (memory, channels, etc.)
      await agent.start();

      process.on('SIGINT', async () => {
        await agent.stop();
        process.exit(0);
      });
      break;
    }

    default:
      console.log('Murph AI Agent Framework');
      console.log('');
      console.log('Commands:');
      console.log('  start              Start the agent');
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
