import { ConfigManager, MurphConfigSchema } from '@murph/config';
import type { MurphConfig } from './types.js';

export { MurphConfigSchema };

let configManager: ConfigManager | null = null;

export function getConfigManager(configPath?: string): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager(configPath);
  }
  return configManager;
}

export function loadConfig(configPath?: string): MurphConfig {
  const manager = getConfigManager(configPath);
  return manager.load();
}

export function resetConfigCache(): void {
  if (configManager) {
    configManager.resetCache();
  }
}

export function getConfigPath(configPath?: string): string {
  const manager = getConfigManager(configPath);
  return manager.getPath();
}

export function writeConfig(updates: Record<string, unknown>, configPath?: string): MurphConfig {
  const manager = getConfigManager(configPath);
  // Synchronous wrapper for backward compatibility — update() is async but
  // the underlying operations are synchronous filesystem calls.
  let result: MurphConfig | null = null;
  manager.update(updates as any).then((r) => { result = r; });
  // Since the file I/O in update() is actually synchronous (readFileSync/writeFileSync),
  // the promise resolves in the same microtask. Return the loaded config as fallback.
  return result ?? manager.get();
}
