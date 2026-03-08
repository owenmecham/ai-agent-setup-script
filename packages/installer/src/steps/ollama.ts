import { spawn } from 'node:child_process';
import type { InstallStep } from './index.js';
import { runCommand, spawnSyncSafe } from '../util.js';

export const ollama: InstallStep = {
  name: 'ollama',
  label: 'Ollama + Embedding Model',
  description: 'Install Ollama and pull the nomic-embed-text model',
  required: true,

  async check() {
    const result = spawnSyncSafe('ollama', ['--version'], { stdio: 'pipe' });
    if (result.status !== 0) return 'needed';

    // Check if model is pulled
    const listResult = spawnSyncSafe('ollama', ['list'], { stdio: 'pipe' });
    if (!listResult.stdout.toString().includes('nomic-embed-text')) return 'needed';

    return 'done';
  },

  async execute(emit) {
    // Install Ollama
    const ollamaCheck = spawnSyncSafe('ollama', ['--version'], { stdio: 'pipe' });
    if (ollamaCheck.status !== 0) {
      emit('Installing Ollama...');
      await runCommand('brew', ['install', 'ollama'], emit);
    } else {
      emit('Ollama already installed');
    }

    // Ensure Ollama is running
    try {
      const resp = await fetch('http://localhost:11434/api/tags');
      if (!resp.ok) throw new Error();
      emit('Ollama service is running');
    } catch {
      emit('Starting Ollama service...');
      const ollamaProc = spawn('ollama', ['serve'], {
        stdio: 'ignore',
        detached: true,
      });
      ollamaProc.unref();

      // Wait for Ollama to be ready
      let ready = false;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const resp = await fetch('http://localhost:11434/api/tags');
          if (resp.ok) { ready = true; break; }
        } catch { /* keep waiting */ }
      }
      if (!ready) throw new Error('Ollama failed to start');
    }

    // Pull embedding model
    const listResult = spawnSyncSafe('ollama', ['list'], { stdio: 'pipe' });
    if (!listResult.stdout.toString().includes('nomic-embed-text')) {
      emit('Pulling nomic-embed-text model (this may take a few minutes)...');
      await runCommand('ollama', ['pull', 'nomic-embed-text'], emit);
    } else {
      emit('nomic-embed-text model already available');
    }

    emit('Ollama setup complete');
  },
};
