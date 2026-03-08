import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import type { InstallStep } from './index.js';

function hasFda(): boolean {
  try {
    accessSync(`${homedir()}/Library/Messages/chat.db`, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export const permissions: InstallStep = {
  name: 'permissions',
  label: 'macOS Permissions',
  description: 'Verify Full Disk Access and Accessibility permissions',
  required: false,

  async check() {
    return hasFda() ? 'done' : 'needed';
  },

  async execute(emit) {
    if (hasFda()) {
      emit('Full Disk Access is granted');
    } else {
      emit('Full Disk Access is NOT yet granted.');
      emit('To grant it:');
      emit('  1. Open System Settings > Privacy & Security > Full Disk Access');
      emit('  2. Add Terminal.app (or your terminal)');
      emit('  3. Restart your terminal');
      emit('');
      emit('For Accessibility access (needed for sending iMessages via AppleScript):');
      emit('  1. Open System Settings > Privacy & Security > Accessibility');
      emit('  2. Add Terminal.app (or your terminal)');
      emit('');
      emit('You can verify these permissions later from the dashboard.');
    }
  },
};
