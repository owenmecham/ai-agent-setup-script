import { spawn } from 'node:child_process';
import pino from 'pino';

const logger = pino({ name: 'code-generator' });

export async function generateCode(projectDir: string, instructions: string): Promise<string> {
  logger.info({ projectDir }, 'Generating code with Claude');

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '-p',
      '--model', 'sonnet',
      '--allowedTools', 'Edit,Write,Bash,Read,Glob,Grep',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectDir,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.error({ code, stderr }, 'Code generation failed');
        reject(new Error(`Code generation failed: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', (err) => reject(err));

    proc.stdin.write(instructions);
    proc.stdin.end();
  });
}
