import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InstallStep } from './index.js';
import { getMurphDir } from '../util.js';

export const config: InstallStep = {
  name: 'config',
  label: 'Configuration',
  description: 'Generate murph.config.yaml if needed',
  required: true,

  async check() {
    const configPath = join(getMurphDir(), 'murph.config.yaml');
    return existsSync(configPath) ? 'done' : 'needed';
  },

  async execute(emit) {
    const configPath = join(getMurphDir(), 'murph.config.yaml');

    if (existsSync(configPath)) {
      emit('Configuration file already exists');
      return;
    }

    // Check if template or example config exists to copy from
    const templatePath = join(getMurphDir(), 'murph.config.yaml.template');
    const examplePath = join(getMurphDir(), 'murph.config.example.yaml');

    if (existsSync(templatePath)) {
      const content = readFileSync(templatePath, 'utf-8');
      writeFileSync(configPath, content, 'utf-8');
      emit('Configuration created from template');
    } else if (existsSync(examplePath)) {
      const content = readFileSync(examplePath, 'utf-8');
      writeFileSync(configPath, content, 'utf-8');
      emit('Configuration created from example template');
    } else {
      emit('No config template found — creating minimal config');
      writeFileSync(configPath, 'database:\n  url: postgresql://localhost:5432/murph\n', 'utf-8');
    }

    emit('You can customize settings in murph.config.yaml or via the dashboard');
  },
};
