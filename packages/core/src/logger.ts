import pino from 'pino';

let rootLogger: pino.Logger | null = null;

export function initLogger(level: string = 'info', file?: string): pino.Logger {
  const targets: pino.TransportTargetOptions[] = [
    { target: 'pino-pretty', options: { colorize: true }, level },
  ];

  if (file) {
    targets.push({
      target: 'pino/file',
      options: { destination: file.replace('~', process.env.HOME ?? '') },
      level,
    });
  }

  rootLogger = pino({
    level,
    transport: { targets },
  });

  return rootLogger;
}

export function createLogger(name: string): pino.Logger {
  if (!rootLogger) {
    rootLogger = pino({ level: 'info' });
  }
  return rootLogger.child({ module: name });
}

export function setLogLevel(level: string): void {
  if (rootLogger) {
    rootLogger.level = level;
  }
}
