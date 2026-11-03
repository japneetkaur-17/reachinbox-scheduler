/* Tiny structured logger: timestamp + level + scope. Keeps deps light. */
type Level = 'info' | 'warn' | 'error' | 'debug';

function log(level: Level, msg: string, meta?: unknown) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  meta === undefined ? out(line) : out(line, meta);
}

export const logger = {
  info: (m: string, meta?: unknown) => log('info', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  error: (m: string, meta?: unknown) => log('error', m, meta),
  debug: (m: string, meta?: unknown) => {
    if (process.env.DEBUG) log('debug', m, meta);
  },
};
