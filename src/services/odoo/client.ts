import { withSpan } from '../../observability/tracing';
import { appLogger } from '../logger';

export type OdooConfig = {
  url: string;
  db: string;
  username: string;
  apiKey: string;
};

export const getOdooConfig = (): OdooConfig | null => {
  const url = process.env.ODOO_URL?.trim() || '';
  const db = process.env.ODOO_DB?.trim() || '';
  const username = process.env.ODOO_USERNAME?.trim() || '';
  const apiKey = process.env.ODOO_API_KEY?.trim() || '';

  if (!url || !db || !username || !apiKey) return null;
  return { url, db, username, apiKey };
};

export const isTransientOdooError = (error: unknown): boolean => {
  const message = String(error || '');
  if (/timed out/i.test(message)) return true;
  if (/fetch failed|network|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(message)) return true;

  const httpMatch = message.match(/Odoo HTTP\s+(\d{3})/i);
  if (!httpMatch) return false;

  const status = Number(httpMatch[1]);
  return status === 429 || status >= 500;
};

const ODOO_RPC_TIMEOUT_MS = Number(process.env.ODOO_RPC_TIMEOUT_MS || 7000);
const ODOO_READ_RETRY_ATTEMPTS = Number(process.env.ODOO_READ_RETRY_ATTEMPTS || 3);
const ODOO_READ_RETRY_BASE_DELAY_MS = Number(process.env.ODOO_READ_RETRY_BASE_DELAY_MS || 250);
const ODOO_WRITE_RETRY_ATTEMPTS = Number(process.env.ODOO_WRITE_RETRY_ATTEMPTS || 2);

type JsonRpcResponse<T> = {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const withReadRetry = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
  const maxAttempts = Math.max(1, ODOO_READ_RETRY_ATTEMPTS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < maxAttempts && isTransientOdooError(error);
      if (!shouldRetry) break;

      const backoffMs = ODOO_READ_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      appLogger.warn('odoo_read_retry', { label, attempt, maxAttempts, error: String(error) });
      await delay(backoffMs);
    }
  }

  throw lastError;
};

/**
 * Only safe for idempotent mutations (write/unlink on a known id) — never
 * wrap `create` in this, since retrying a create after an ambiguous
 * (timeout-like) failure risks creating a duplicate record.
 */
export const withIdempotentWriteRetry = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
  const maxAttempts = Math.max(1, ODOO_WRITE_RETRY_ATTEMPTS);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < maxAttempts && isTransientOdooError(error);
      if (!shouldRetry) break;

      const backoffMs = ODOO_READ_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      appLogger.warn('odoo_write_retry', { label, attempt, maxAttempts, error: String(error) });
      await delay(backoffMs);
    }
  }

  throw lastError;
};

const jsonRpc = async <T>(config: OdooConfig, service: string, method: string, args: unknown[]): Promise<T> => {
  return withSpan('odoo.jsonrpc', { 'odoo.service': service, 'odoo.method': method }, async () => {
  const endpoint = `${config.url.replace(/\/$/, '')}/jsonrpc`;
  const body = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service,
      method,
      args,
    },
    id: Date.now(),
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), ODOO_RPC_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Odoo RPC timed out after ${ODOO_RPC_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    throw new Error(`Odoo HTTP ${response.status}`);
  }

  const data = (await response.json()) as JsonRpcResponse<T>;
  if (data.error) {
    throw new Error(`Odoo RPC error: ${data.error.message}`);
  }

  if (data.result === undefined) {
    throw new Error('Odoo RPC returned no result');
  }

  return data.result;
  });
};

export const login = async (config: OdooConfig): Promise<number> => {
  return jsonRpc<number>(config, 'common', 'login', [
    config.db,
    config.username,
    config.apiKey,
  ]);
};

export const executeKw = async <T>(
  config: OdooConfig,
  uid: number,
  model: string,
  method: string,
  positionalArgs: unknown[],
  keywordArgs: Record<string, unknown> = {}
): Promise<T> => {
  return jsonRpc<T>(config, 'object', 'execute_kw', [
    config.db,
    uid,
    config.apiKey,
    model,
    method,
    positionalArgs,
    keywordArgs,
  ]);
};

export const loginRead = async (config: OdooConfig): Promise<number> => {
  return withReadRetry('login', async () => login(config));
};

export const executeKwRead = async <T>(
  config: OdooConfig,
  uid: number,
  model: string,
  method: string,
  positionalArgs: unknown[],
  keywordArgs: Record<string, unknown> = {}
): Promise<T> => {
  return withReadRetry(`${model}.${method}`, async () => executeKw<T>(config, uid, model, method, positionalArgs, keywordArgs));
};

