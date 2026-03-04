import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { MurphConfigSchema, type MurphConfig } from '@murph/config';

export type DashboardConfig = MurphConfig;

function getConfigPath(): string {
  return resolve(process.cwd(), 'murph.config.yaml');
}

export function loadDashboardConfig(): DashboardConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw);
  return MurphConfigSchema.parse(parsed) as DashboardConfig;
}

export function loadRawConfig(): Record<string, unknown> {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return {};
  }
  const raw = readFileSync(path, 'utf-8');
  return (parseYaml(raw) ?? {}) as Record<string, unknown>;
}

export function writeDashboardConfig(updates: Record<string, unknown>): DashboardConfig {
  const path = getConfigPath();
  const existing = loadRawConfig();
  const merged = deepMerge(existing, updates);
  const validated = MurphConfigSchema.parse(merged) as DashboardConfig;
  writeFileSync(path, stringifyYaml(merged, { lineWidth: 120 }), 'utf-8');
  return validated;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Redact secret references (${...}) from config for safe display */
export function redactSecrets(config: DashboardConfig): DashboardConfig {
  return JSON.parse(
    JSON.stringify(config, (_key, value) => {
      if (typeof value === 'string' && value.match(/^\$\{.+\}$/)) {
        return '********';
      }
      return value;
    })
  );
}
