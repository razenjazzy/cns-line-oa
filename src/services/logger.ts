import { randomUUID } from 'node:crypto';
import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

const REDACTED = '[REDACTED]';
const SECRET_KEY = /(token|secret|password|api[-_]?key|authorization|otp|access[-_]?token|cookie)/i;

const configuredLevel = (): LogLevel => {
  const value = (process.env.LOG_LEVEL || 'info').trim().toLowerCase();
  return value === 'debug' || value === 'warn' || value === 'error' ? value : 'info';
};

export const sanitizeLogValue = (value: unknown, key = ''): unknown => {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(item => sanitizeLogValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeLogValue(entryValue, entryKey)]));
  }
  return value;
};

const rootLogger = pino(
  {
    level: configuredLevel(),
    base: undefined,
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  {
    write(line: string) {
      const trimmed = line.trim();
      try {
        const parsed = JSON.parse(trimmed) as { level?: string };
        if (parsed.level === 'error') console.error(trimmed);
        else if (parsed.level === 'warn') console.warn(trimmed);
        else console.log(trimmed);
      } catch {
        console.log(trimmed);
      }
    },
  },
);

export type AppLogger = {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

export const createLogger = (scope: string): AppLogger => {
  const write = (level: LogLevel, message: string, fields: LogFields = {}): void => {
    const sanitized = sanitizeLogValue(fields) as LogFields;
    rootLogger[level]({ scope, ...sanitized }, message);
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
