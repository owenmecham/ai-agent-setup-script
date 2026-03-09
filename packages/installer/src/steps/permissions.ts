import { spawnSync } from 'node:child_process';
import type { InstallStep } from './index.js';

function checkAccessibility(): boolean {
  const result = spawnSync('osascript', [
    '-e', 'tell application "System Events" to get name of first process',
  ], { stdio: 'pipe', timeout: 5000 });
  return result.status === 0;
}

export const permissions: InstallStep = {
  name: 'permissions',
  label: 'macOS Permissions',
  description: 'Verify Accessibility permissions',
  required: false,

  async check() {
    return checkAccessibility() ? 'done' : 'needed';
  },

  async execute(emit) {
    if (checkAccessibility()) {
      emit('Accessibility is granted');
    } else {
      emit('Accessibility is NOT yet granted.');
      emit('For Accessibility access (needed for sending iMessages via AppleScript):');
      emit('  1. Open System Settings > Privacy & Security > Accessibility');
      emit('  2. Add Terminal.app (or your terminal)');
      emit('');
      emit('You can verify these permissions later from the dashboard.');
    }
  },
};
