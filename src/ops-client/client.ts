/**
 * Thin HTTP client over this app's own ops/admin endpoints.
 *
 * Shared by src/cli (human operator terminal) and src/mcp (agent tool
 * access) so the two surfaces can't drift apart the way the old LINE
 * command router did before it was deduplicated. Neither surface talks to
 * Firestore/Odoo/GCP directly — everything goes through the same HTTP API
 * the app already exposes and protects with requireOpsToken/adminOnly, so
 * adding a CLI or an MCP server does not add a new privileged code path.
 */

export type OpsClientConfig = {
  baseUrl: string;
  opsApiToken?: string;
  adminSecretToken?: string;
  webhookTestToken?: string;
};

export class OpsClientError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: unknown) {
    super(message);
    this.name = 'OpsClientError';
  }
}

export const resolveOpsClientConfig = (env: NodeJS.ProcessEnv = process.env): OpsClientConfig => ({
  baseUrl: (env.CNS_BASE_URL || 'http://localhost:8080').replace(/\/$/, ''),
  opsApiToken: env.OPS_API_TOKEN?.trim() || undefined,
  adminSecretToken: env.ADMIN_SECRET_TOKEN?.trim() || undefined,
  webhookTestToken: env.WEBHOOK_TEST_TOKEN?.trim() || undefined,
});

const request = async <T>(
  config: OpsClientConfig,
  method: 'GET' | 'POST',
  path: string,
  options: { token?: string; body?: unknown } = {}
): Promise<T> => {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new OpsClientError(`Could not reach ${config.baseUrl}${path}: ${String(error)}`);
  }

  const text = await response.text();
  const parsed = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const message = (parsed && typeof parsed === 'object' && 'error' in parsed)
      ? String((parsed as { error: unknown }).error)
      : `HTTP ${response.status}`;
    throw new OpsClientError(message, response.status, parsed ?? text);
  }

  return (parsed as T) ?? (text as unknown as T);
};

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const requireToken = (token: string | undefined, name: string): string => {
  if (!token) {
    throw new OpsClientError(`${name} is not set. Export it before running this command.`);
  }
  return token;
};

// ---------------------------------------------------------------------------
// Public, unauthenticated
// ---------------------------------------------------------------------------

export const getHealthz = (config: OpsClientConfig) =>
  request<{ ok: boolean; service: string; environment: string; timestamp: string }>(config, 'GET', '/healthz');

export const getReadyz = (config: OpsClientConfig) =>
  request<{ ready: boolean; checks: Array<{ name: string; ok: boolean; message: string }>; uptimeSeconds: number }>(
    config, 'GET', '/readyz'
  );

// ---------------------------------------------------------------------------
// Ops-token protected (read-mostly, safe for an AI agent to call freely)
// ---------------------------------------------------------------------------

export const getKpiSnapshot = (config: OpsClientConfig) =>
  request<Record<string, unknown>>(config, 'GET', '/ops/kpi', { token: requireToken(config.opsApiToken, 'OPS_API_TOKEN') });

export const getWorkflowAudit = (config: OpsClientConfig) =>
  request<Record<string, unknown>>(config, 'GET', '/ops/workflow-audit', { token: requireToken(config.opsApiToken, 'OPS_API_TOKEN') });

export const rotateDemoSession = (config: OpsClientConfig, newSecret: string, graceMinutes?: number) =>
  request<Record<string, unknown>>(config, 'POST', '/ops/demo-session/rotate', {
    token: requireToken(config.opsApiToken, 'OPS_API_TOKEN'),
    body: { newSecret, ...(graceMinutes !== undefined ? { graceMinutes } : {}) },
  });

// Archives audit events past the retention window to BigQuery, then deletes
// them from Firestore. See documents/AUDIT_LOG_POLICY.md. No-ops safely (does
// not delete anything) if BigQuery isn't configured.
export const rotateAuditLog = (config: OpsClientConfig) =>
  request<Record<string, unknown>>(config, 'POST', '/ops/audit-log/rotate', { token: requireToken(config.opsApiToken, 'OPS_API_TOKEN') });

// ---------------------------------------------------------------------------
// Admin-token protected (mutating — every call here changes production data
// or sends real LINE messages; both CLI and MCP require explicit confirmation
// before reaching these, see src/cli/index.ts and src/mcp/server.ts)
// ---------------------------------------------------------------------------

export const triggerDailyReport = (config: OpsClientConfig) =>
  request<string>(config, 'POST', '/jobs/daily-report', { token: requireToken(config.adminSecretToken, 'ADMIN_SECRET_TOKEN') });

export const triggerSegmentation = (config: OpsClientConfig) =>
  request<string>(config, 'POST', '/jobs/segmentation', { token: requireToken(config.adminSecretToken, 'ADMIN_SECRET_TOKEN') });

export const triggerSeedOdoo = (config: OpsClientConfig) =>
  request<string>(config, 'POST', '/jobs/seed-odoo', { token: requireToken(config.adminSecretToken, 'ADMIN_SECRET_TOKEN') });

// ---------------------------------------------------------------------------
// Dev-only chat probe — talks to /webhook-test, which is itself disabled in
// production unless ENABLE_WEBHOOK_TEST=true (see src/index.ts). Never a
// production administration path.
// ---------------------------------------------------------------------------

export const sendTestChatMessage = (config: OpsClientConfig, text: string, userId?: string) =>
  request<Array<{ type: string; text?: string; altText?: string }>>(config, 'POST', '/webhook-test', {
    token: config.webhookTestToken,
    body: { text, userId: userId || 'cli_user' },
  });
