#!/usr/bin/env node
/**
 * cns-line-oa MCP server.
 *
 * Exposes this app's own ops/admin surface as MCP tools, over the exact
 * same HTTP endpoints and tokens as src/cli (see src/ops-client/client.ts).
 * No Firestore/Odoo/GCP credentials are read here and no privileged logic
 * is reimplemented — every tool is a pass-through to an endpoint that is
 * already authenticated server-side by requireOpsToken/adminOnly.
 *
 * Tokens are read only from this process's own environment, never accepted
 * as a tool argument, so a prompt cannot trick the model into exfiltrating
 * or substituting a token through tool-call arguments.
 *
 * Configure via env vars before launching (see README "MCP server" section):
 *   CNS_BASE_URL, OPS_API_TOKEN, ADMIN_SECRET_TOKEN, WEBHOOK_TEST_TOKEN
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getHealthz,
  getKpiSnapshot,
  getReadyz,
  getWorkflowAudit,
  getPlatformStatus,
  OpsClientError,
  resolveOpsClientConfig,
  rotateAuditLog,
  rotateDemoSession,
  sendTestChatMessage,
  triggerDailyReport,
  triggerSegmentation,
  triggerSeedOdoo,
} from '../ops-client/client';

const config = resolveOpsClientConfig();

const asToolResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

const asErrorResult = (error: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: error instanceof OpsClientError ? error.message : String(error) }],
});

const server = new McpServer({ name: 'cns-line-oa', version: '1.0.0' });

server.registerTool(
  'healthz',
  { title: 'Health check', description: `Liveness check for the cns-line-oa instance at ${config.baseUrl}. Always safe to call.` },
  async () => {
    try { return asToolResult(await getHealthz(config)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'readyz',
  { title: 'Readiness check', description: 'Dependency-level readiness (Firestore, Odoo, rate limiter) for the instance. Always safe to call.' },
  async () => {
    try { return asToolResult(await getReadyz(config)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'get_kpi_snapshot',
  { title: 'Get KPI snapshot', description: 'HTTP request counters and Group-Buy feature-gate stats since process start. Read-only. Requires OPS_API_TOKEN in the server environment.' },
  async () => {
    try { return asToolResult(await getKpiSnapshot(config)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'get_workflow_audit',
  { title: 'Get workflow audit', description: 'Security/readiness self-check (token config, dependency health, feature flags) with a 0-100 score. Read-only. Requires OPS_API_TOKEN.' },
  async () => {
    try { return asToolResult(await getWorkflowAudit(config)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'get_platform_status',
  { title: 'Get platform status', description: 'Full APP_ENV flags, probes, and service modules from GET /ops/platform. Read-only. Requires OPS_API_TOKEN.' },
  async () => {
    try { return asToolResult(await getPlatformStatus(config)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'send_test_chat_message',
  {
    title: 'Send a test chat message',
    description: 'Sends one message through the exact same command router real LINE users hit, via the signature-free /webhook-test endpoint. Local and Railway staging only. Disabled when APP_ENV=production.',
    inputSchema: { text: z.string().min(1), userId: z.string().optional() },
  },
  async ({ text, userId }) => {
    try { return asToolResult(await sendTestChatMessage(config, text, userId)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'rotate_demo_session_secret',
  {
    title: 'Rotate the demo session secret',
    description: 'Rotates the signing secret for the /demo control panel\'s login sessions, with a grace period for the previous secret. Requires OPS_API_TOKEN. This changes production auth state — only call when the user has explicitly asked for a rotation.',
    inputSchema: { newSecret: z.string().min(16), graceMinutes: z.number().int().min(0).optional() },
  },
  async ({ newSecret, graceMinutes }) => {
    try { return asToolResult(await rotateDemoSession(config, newSecret, graceMinutes)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'rotate_audit_log',
  {
    title: 'Rotate the audit log',
    description: 'Archives audit-trail events older than the retention window (AUDIT_RETENTION_DAYS) to BigQuery, then deletes them from Firestore. Requires OPS_API_TOKEN. Safe to call anytime — it never deletes a batch that failed to archive, and no-ops (archives nothing) if BigQuery isn\'t configured, but it does permanently remove old rows from Firestore once archived, so only call when the user has asked to run or check the rotation policy.',
  },
  async () => {
    try { return asToolResult(await rotateAuditLog(config)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'trigger_daily_report',
  {
    title: 'Trigger the daily report job',
    description: 'DANGER: sends a real Odoo sales/inventory summary to the configured admin over LINE, immediately. Requires ADMIN_SECRET_TOKEN. Only call when the user has explicitly asked to send the report right now.',
  },
  async () => {
    try { return asToolResult(await triggerDailyReport(config)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'trigger_segmentation',
  {
    title: 'Trigger the segmentation job',
    description: 'DANGER: runs customer segmentation and sends real multicast LINE messages to segmented users, immediately. Requires ADMIN_SECRET_TOKEN. Only call when the user has explicitly asked for this campaign to go out now.',
  },
  async () => {
    try { return asToolResult(await triggerSegmentation(config)); } catch (error) { return asErrorResult(error); }
  }
);

server.registerTool(
  'trigger_seed_odoo',
  {
    title: 'Seed sample Odoo data',
    description: 'Writes demo customer/product/quotation records into the connected Odoo instance. Requires ADMIN_SECRET_TOKEN. Do not call against a production Odoo database unless the user explicitly confirms it is safe to do so.',
  },
  async () => {
    try { return asToolResult(await triggerSeedOdoo(config)); } catch (error) { return asErrorResult(error); }
  }
);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`cns-line-oa MCP server ready, target=${config.baseUrl}`);
};

main().catch(error => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
