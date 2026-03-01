import { Worker } from 'node:worker_threads';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface SandboxResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

export class Sandbox {
  private timeoutMs: number;

  constructor(timeoutMs: number = 30_000) {
    this.timeoutMs = timeoutMs;
  }

  async execute(code: string, context?: Record<string, unknown>): Promise<SandboxResult> {
    const sandboxId = randomUUID();
    const sandboxDir = join(tmpdir(), `murph-sandbox-${sandboxId}`);
    mkdirSync(sandboxDir, { recursive: true });

    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');

      // Restrict access
      const originalRequire = require;
      const allowedModules = new Set(['path', 'url', 'querystring', 'util', 'crypto']);

      globalThis.require = (mod) => {
        if (!allowedModules.has(mod)) {
          throw new Error('Module not allowed in sandbox: ' + mod);
        }
        return originalRequire(mod);
      };

      // Remove dangerous globals
      delete globalThis.process.env;
      delete globalThis.process.exit;

      try {
        const fn = new Function('context', workerData.code);
        const result = fn(workerData.context || {});

        Promise.resolve(result).then(
          (output) => parentPort.postMessage({ success: true, output: String(output ?? '') }),
          (err) => parentPort.postMessage({ success: false, error: err.message }),
        );
      } catch (err) {
        parentPort.postMessage({ success: false, error: err.message });
      }
    `;

    const workerFile = join(sandboxDir, 'worker.cjs');
    writeFileSync(workerFile, workerCode);

    const start = Date.now();

    try {
      return await new Promise<SandboxResult>((resolve) => {
        const worker = new Worker(workerFile, {
          workerData: { code, context },
          resourceLimits: {
            maxOldGenerationSizeMb: 64,
            maxYoungGenerationSizeMb: 16,
            codeRangeSizeMb: 16,
          },
        });

        const timeout = setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            error: 'Execution timed out',
            duration: Date.now() - start,
          });
        }, this.timeoutMs);

        worker.on('message', (msg: { success: boolean; output?: string; error?: string }) => {
          clearTimeout(timeout);
          resolve({
            success: msg.success,
            output: msg.output,
            error: msg.error,
            duration: Date.now() - start,
          });
        });

        worker.on('error', (err) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            error: err.message,
            duration: Date.now() - start,
          });
        });
      });
    } finally {
      try {
        rmSync(sandboxDir, { recursive: true, force: true });
      } catch {
        // Cleanup failure is non-critical
      }
    }
  }
}
