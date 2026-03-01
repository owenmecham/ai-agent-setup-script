import { spawn } from 'node:child_process';
import pino from 'pino';

const logger = pino({ name: 'deployer' });

export interface DeployResult {
  success: boolean;
  url?: string;
  error?: string;
}

export async function deployToCloudflare(
  projectDir: string,
  projectName: string,
  accountId?: string,
): Promise<DeployResult> {
  logger.info({ projectDir, projectName }, 'Deploying to Cloudflare Pages');

  return new Promise((resolve) => {
    const args = ['pages', 'deploy', projectDir, '--project-name', projectName];
    if (accountId) {
      args.push('--account-id', accountId);
    }

    const proc = spawn('wrangler', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectDir,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.error({ code, stderr }, 'Deployment failed');
        resolve({ success: false, error: stderr });
      } else {
        // Extract URL from wrangler output
        const urlMatch = stdout.match(/https:\/\/[\w.-]+\.pages\.dev/);
        resolve({
          success: true,
          url: urlMatch?.[0] ?? 'Deployed successfully',
        });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
