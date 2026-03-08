import type { InstallStep } from './index.js';
import { installAgent, isLoaded, buildAgentPlist, AGENT_LABEL } from '../launchctl.js';
import { getMurphDir } from '../util.js';

export const launchagent: InstallStep = {
  name: 'launchagent',
  label: 'LaunchAgent Setup',
  description: 'Install macOS LaunchAgent for auto-start and crash recovery',
  required: true,

  async check() {
    return isLoaded(AGENT_LABEL) ? 'done' : 'needed';
  },

  async execute(emit) {
    const murphDir = getMurphDir();

    emit('Generating LaunchAgent plist...');
    const plist = buildAgentPlist(murphDir);

    emit('Installing LaunchAgent (com.murph.agent)...');
    installAgent(AGENT_LABEL, plist);

    emit('LaunchAgent installed with KeepAlive and RunAtLoad enabled');
    emit('Murph will auto-start on login and restart on crash');
  },
};
