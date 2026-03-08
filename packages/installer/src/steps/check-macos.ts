import { platform, release } from 'node:os';
import type { InstallStep } from './index.js';

export const checkMacOS: InstallStep = {
  name: 'check-macos',
  label: 'macOS Check',
  description: 'Verify this is a macOS system',
  required: true,

  async check() {
    return platform() === 'darwin' ? 'done' : 'error';
  },

  async execute(emit) {
    if (platform() !== 'darwin') {
      throw new Error('Murph requires macOS');
    }
    emit(`macOS detected (${release()})`);
  },
};
