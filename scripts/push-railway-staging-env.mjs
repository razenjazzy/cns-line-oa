#!/usr/bin/env node
/**
 * Pushes .env.staging into the linked Railway service.
 * Does not print values. Requires: npx @railway/cli login && railway link
 *
 *   node scripts/push-railway-staging-env.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parseEnv = (text) => {
  const values = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const eq = line.indexOf('=');
    const key = line.slice(0, eq);
    let value = line.slice(eq + 1);
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
};

const keys = [
  'APP_ENV', 'NODE_ENV', 'PORT', 'ERP_PROVIDER', 'DEFAULT_LANGUAGE',
  'PUBLIC_BASE_URL',
  'LINE_CHANNEL_ID', 'LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_BASIC_ID',
  'LINE_AGENT_NAME_EN', 'LINE_AGENT_NAME_TH',
  'LINE_RICH_MENU_EN', 'LINE_RICH_MENU_TH', 'LINE_RICH_MENU_JSON',
  'ADMIN_USER_ID',
  'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS_JSON', 'GOOGLE_AI_STUDIO_API_KEY',
  'ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY',
  'OPS_API_TOKEN', 'DEMO_CONTROL_TOKEN', 'WEBHOOK_TEST_TOKEN',
  'ENABLE_DEMO_CONTROL_PANEL', 'ENABLE_WEBHOOK_TEST', 'ENABLE_GRAPHQL', 'ENABLE_API_DOCS',
  'LINE_WEBHOOK_ASYNC', 'OPS_JOBS_ASYNC', 'RUN_BULLMQ_WORKER', 'MONGO_VECTOR_ENABLED', 'CLAWFRAMEWORK_ENABLED',
];

const env = parseEnv(readFileSync(join(root, '.env.staging'), 'utf8'));
const railway = ['npx', '--yes', '@railway/cli'];
let failed = 0;
for (const key of keys) {
  const value = env[key];
  if (value === undefined || value === '') {
    console.log(`skip empty ${key}`);
    continue;
  }
  const result = spawnSync(railway[0], [...railway.slice(1), 'variable', 'set', key, '--stdin', '--skip-deploys'], {
    encoding: 'utf8',
    cwd: root,
    input: value,
  });
  if (result.status !== 0) {
    failed += 1;
    const err = (result.stderr || result.stdout || '').trim().split('\n').slice(-2).join(' ');
    console.error(`FAIL ${key}: ${err}`);
  } else {
    console.log(`SET ${key}`);
  }
}
if (failed) {
  console.error(`${failed} variables failed. Run: npx @railway/cli login && npx @railway/cli link`);
  process.exit(1);
}
console.log('Railway variables updated. Redeploying…');
const redeploy = spawnSync(railway[0], [...railway.slice(1), 'redeploy', '--yes'], { encoding: 'utf8', cwd: root });
if (redeploy.status !== 0) {
  console.error((redeploy.stderr || redeploy.stdout || 'redeploy failed').trim());
  console.error('Variables are set. Click Redeploy in the Railway dashboard if needed.');
  process.exit(1);
}
console.log('Redeploy started.');
