import type { z } from 'zod';
import type { MurphConfigSchema, ApprovalLevelSchema } from './schema.js';

export type MurphConfig = z.infer<typeof MurphConfigSchema>;
export type ApprovalLevel = z.infer<typeof ApprovalLevelSchema>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface ConfigChangeEvent {
  previous: MurphConfig;
  current: MurphConfig;
  changedPaths: string[];
}
