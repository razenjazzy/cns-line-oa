import { randomUUID } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = '[REDACTED]';
const SECRET_KEY = /(token|secret|password|api[-_]?key|authorization|otp|access[-_]?token|cookie)/i;

const configuredLevel = (): LogLevel => {
  const value = (process.env.LOG_LEVEL || 'info').trim().toLowerCase();
  return value === 'debug' || value === 'warn' || value === 'error' ? value : 'info';
};

const sanitize = (value: unknown, key = ''): unknown => {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(item => sanitize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)]));
  }
  return value;
};

export type AppLogger = {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

export const createLogger = (scope: string): AppLogger => {
  const write = (level: LogLevel, message: string, fields: LogFields = {}): void => {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[configuredLevel()]) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      ...sanitize(fields) as LogFields,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
};

export const appLogger = createLogger('app');

export const createExecutionId = (scope: string): string => `${scope}-${randomUUID()}`;