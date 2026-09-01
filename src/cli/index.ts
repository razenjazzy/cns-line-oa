#!/usr/bin/env node
/**
 * cns — operator CLI for cns-line-oa.
 *
 * A thin terminal client over the app's existing ops/admin HTTP endpoints
 * (see src/ops-client/client.ts). Configure via environment variables:
 *   CNS_BASE_URL       target instance, default http://localhost:8080
 *   OPS_API_TOKEN       required for: kpi, audit, rotate-session, rotate-audit-log
 *   ADMIN_SECRET_TOKEN  required for: jobs:* (mutating)
 *   WEBHOOK_TEST_TOKEN  optional, only if the target instance requires one for /webhook-test
 *
 * Run `cns help` for the command list.
 */

import {
  getHealthz,
  getKpiSnapshot,
  getReadyz,
  getWorkflowAudit,
  OpsClientError,
  resolveOpsClientConfig,
  rotateAuditLog,
  rotateDemoSession,
  sendTestChatMessage,
  triggerDailyReport,
  triggerSegmentation,
  triggerSeedOdoo,
} from '../ops-client/client';

export type Flags = Record<string, string | boolean>;

export const parseArgs = (argv: string[]): { command: string; positional: string[]; flags: Flags } => {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Flags = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }

  return { command: command || 'help', positional, flags };
};

const HELP = `cns — cns-line-oa operator CLI

Usage: cns <command> [args] [--flags]

Read-only:
  health                          GET /healthz
  ready                           GET /readyz
  kpi                             GET /ops/kpi                    (needs OPS_API_TOKEN)
  audit                           GET /ops/workflow-audit         (needs OPS_API_TOKEN)
  chat <text> [--user <id>]       POST /webhook-test, prints the bot's reply

Mutating (require --yes to actually run):
  rotate-session --secret <s> [--grace-minutes <n>]   (needs OPS_API_TOKEN)
  rotate-audit-log                                    (needs OPS_API_TOKEN; archives to BigQuery then deletes from Firestore)
  jobs:daily-report                                   (needs ADMIN_SECRET_TOKEN)
  jobs:segmentation                                   (needs ADMIN_SECRET_TOKEN)
  jobs:seed-odoo                                       (needs ADMIN_SECRET_TOKEN)

Config (env vars): CNS_BASE_URL, OPS_API_TOKEN, ADMIN_SECRET_TOKEN, WEBHOOK_TEST_TOKEN
`;

const printJson = (value: unknown): void => {
  console.log(JSON.stringify(value, null, 2));
};

const confirmOrExplain = (flags: Flags, description: string): boolean => {
  if (flags.yes === true) return true;
  console.log(`This will ${description}. Re-run with --yes to actually do it.`);
  return false;
};

const run = async (): Promise<number> => {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  const config = resolveOpsClientConfig();

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;

    case 'health':
      printJson(await getHealthz(config));
      return 0;

    case 'ready': {
      const result = await getReadyz(config);
      printJson(result);
      return result.ready ? 0 : 1;
    }

    case 'kpi':
      printJson(await getKpiSnapshot(config));
      return 0;

    case 'audit':
      printJson(await getWorkflowAudit(config));
      return 0;

    case 'chat': {
      const text = positional.join(' ');
      if (!text) {
        console.error('Usage: cns chat <text> [--user <id>]');
        return 1;
      }
      const userId = typeof flags.user === 'string' ? flags.user : undefined;
      printJson(await sendTestChatMessage(config, text, userId));
      return 0;
    }

    case 'rotate-session': {
      const secret = typeof flags.secret === 'string' ? flags.secret : '';
      if (!secret || secret.length < 16) {
        console.error('Usage: cns rotate-session --secret <at-least-16-chars> [--grace-minutes <n>]');
        return 1;
      }
      if (!confirmOrExplain(flags, `rotate the demo session secret on ${config.baseUrl}`)) return 0;
      const graceMinutes = typeof flags['grace-minutes'] === 'string' ? Number(flags['grace-minutes']) : undefined;
      printJson(await rotateDemoSession(config, secret, graceMinutes));
      return 0;
    }

    case 'rotate-audit-log': {
      if (!confirmOrExplain(flags, `archive audit events past the retention window to BigQuery, then delete them from Firestore on ${config.baseUrl}`)) return 0;
      printJson(await rotateAuditLog(config));
      return 0;
    }

    case 'jobs:daily-report':
      if (!confirmOrExplain(flags, `trigger the daily report job on ${config.baseUrl} (sends a real LINE message to the admin)`)) return 0;
      console.log(await triggerDailyReport(config));
      return 0;

    case 'jobs:segmentation':
      if (!confirmOrExplain(flags, `trigger the segmentation job on ${config.baseUrl} (sends real multicast LINE messages)`)) return 0;
      console.log(await triggerSegmentation(config));
      return 0;

    case 'jobs:seed-odoo':
      if (!confirmOrExplain(flags, `seed sample data into the Odoo instance behind ${config.baseUrl}`)) return 0;
      console.log(await triggerSeedOdoo(config));
      return 0;

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      return 1;
  }
};

// Guarded so this module can be imported (e.g. by tests) without launching
// the CLI as a side effect — only runs when invoked directly as a script.
if (require.main === module) {
  run()
    .then(code => process.exit(code))
    .catch(error => {
      if (error instanceof OpsClientError) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error('Unexpected error:', error);
      }
      process.exit(1);
    });
}
