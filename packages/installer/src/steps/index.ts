import { checkMacOS } from './check-macos.js';
import { xcodeCli } from './xcode-cli.js';
import { homebrew } from './homebrew.js';
import { nodejs } from './nodejs.js';
import { nodeAppBundle } from './node-app-bundle.js';
import { pnpmStep } from './pnpm.js';
import { postgresql } from './postgresql.js';
import { ollama } from './ollama.js';
import { claudeCli } from './claude-cli.js';
import { extractPayload } from './extract-payload.js';
import { build } from './build.js';
import { migrate } from './migrate.js';
import { config } from './config.js';
import { launchagent } from './launchagent.js';
import { verify } from './verify.js';

export interface InstallStep {
  name: string;
  label: string;
  description: string;
  required: boolean;
  check(): Promise<'done' | 'needed' | 'error'>;
  execute(emit: (line: string) => void): Promise<void>;
}

export const ALL_STEPS: InstallStep[] = [
  checkMacOS,
  xcodeCli,
  homebrew,
  nodejs,
  nodeAppBundle,
  pnpmStep,
  postgresql,
  ollama,
  claudeCli,
  extractPayload,
  build,
  config,
  migrate,
  launchagent,
  verify,
];

export function getStep(name: string): InstallStep | undefined {
  return ALL_STEPS.find(s => s.name === name);
}
