import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('auto-updater');

export interface AutoUpdateConfig {
  enabled: boolean;
  check_interval_hours: number;
  install_hour: number;
}

export class AutoUpdater {
  private interval: ReturnType<typeof setInterval> | null = null;
  private config: AutoUpdateConfig;
  private installDir: string;
  private timezone: string;

  constructor(config: AutoUpdateConfig, installDir: string, timezone: string) {
    this.config = config;
    this.installDir = installDir;
    this.timezone = timezone;
  }

  start(): void {
    if (!this.config.enabled) {
      logger.info('Auto-updater disabled by config');
      return;
    }

    const intervalMs = this.config.check_interval_hours * 60 * 60 * 1000;
    logger.info(
      { checkIntervalHours: this.config.check_interval_hours, installHour: this.config.install_hour },
      'Auto-updater enabled',
    );

    this.interval = setInterval(() => {
      this.check().catch((err) => {
        logger.error({ err }, 'Auto-update check failed');
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Auto-updater stopped');
    }
  }

  private async check(): Promise<void> {
    const localHead = await this.exec('git', ['rev-parse', 'HEAD'], this.installDir, 15_000);
    if (!localHead) {
      logger.warn('Could not determine local HEAD');
      return;
    }

    const remoteOutput = await this.exec(
      'git',
      ['ls-remote', 'origin', 'HEAD'],
      this.installDir,
      15_000,
    );
    if (!remoteOutput) {
      logger.warn('Could not fetch remote HEAD');
      return;
    }

    const remoteHead = remoteOutput.split(/\s/)[0];
    if (!remoteHead) {
      logger.warn('Could not parse remote HEAD from ls-remote output');
      return;
    }

    if (localHead.trim() === remoteHead.trim()) {
      logger.debug('Already up to date');
      return;
    }

    logger.info({ localHead: localHead.trim(), remoteHead: remoteHead.trim() }, 'Update available');

    // Check if current hour matches the install window
    const now = new Date();
    const currentHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: this.timezone,
      }).format(now),
      10,
    );

    if (currentHour !== this.config.install_hour) {
      logger.info(
        { currentHour, installHour: this.config.install_hour },
        'Update available but outside install window, deferring',
      );
      return;
    }

    logger.info('Inside install window — launching update');
    this.launchUpdate();
  }

  private launchUpdate(): void {
    const scriptPath = join(this.installDir, 'install.sh');
    const child = spawn('bash', [scriptPath, '--update', '--yes'], {
      cwd: this.installDir,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    logger.info({ pid: child.pid }, 'Update process launched (detached)');
  }

  private exec(cmd: string, args: string[], cwd: string, timeout: number): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(cmd, args, { cwd, timeout }, (err, stdout) => {
        if (err) {
          resolve(null);
        } else {
          resolve(stdout);
        }
      });
    });
  }
}
