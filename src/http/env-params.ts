import type { AppEnv } from './env';

export type EnvParam = {
  key: string;
  requiredIn: AppEnv[];
  note: string;
};

/** Canonical variable names for all three lanes. Values stay in the host secret store. */
export const ENV_PARAMS: EnvParam[] = [
  { key: 'APP_ENV', requiredIn: ['development', 'staging', 'production'], note: 'development | staging | production' },
  { key: 'PORT', requiredIn: [], note: 'Defaults to 8080' },
  { key: 'NODE_ENV', requiredIn: ['staging', 'production'], note: 'production on Railway and delivery images' },
  { key: 'LINE_CHANNEL_SECRET', requiredIn: ['staging', 'production'], note: 'Test OA on staging; production OA on delivery' },
  { key: 'LINE_CHANNEL_ACCESS_TOKEN', requiredIn: ['staging', 'production'], note: 'Paired with LINE_CHANNEL_SECRET' },
  { key: 'LINE_AGENT_NAME', requiredIn: [], note: 'Display name in Flex headers' },
  { key: 'ADMIN_USER_ID', requiredIn: ['staging', 'production'], note: 'Fail-closed allowlist for ADMIN ENABLE' },
  { key: 'GOOGLE_CLOUD_PROJECT', requiredIn: ['staging', 'production'], note: 'Firestore project' },
  { key: 'GOOGLE_APPLICATION_CREDENTIALS_JSON', requiredIn: ['staging'], note: 'Required off-GCP (Railway). Omit on Cloud Run ADC' },
  { key: 'ODOO_URL', requiredIn: ['staging', 'production'], note: 'Sandbox on staging' },
  { key: 'ODOO_DB', requiredIn: ['staging', 'production'], note: '' },
  { key: 'ODOO_USERNAME', requiredIn: ['staging', 'production'], note: '' },
  { key: 'ODOO_API_KEY', requiredIn: ['staging', 'production'], note: '' },
  { key: 'ERP_PROVIDER', requiredIn: ['staging', 'production'], note: 'Must be odoo' },
  { key: 'PUBLIC_BASE_URL', requiredIn: ['staging', 'production'], note: 'https://host for verify links' },
  { key: 'OPS_API_TOKEN', requiredIn: ['staging', 'production'], note: 'Protects /ops, GraphQL, docs' },
  { key: 'DEMO_CONTROL_TOKEN', requiredIn: ['staging'], note: 'Demo login; may equal OPS_API_TOKEN' },
  { key: 'ENABLE_DEMO_CONTROL_PANEL', requiredIn: ['staging'], note: 'true on Railway demo; ignored in production' },
  { key: 'ENABLE_WEBHOOK_TEST', requiredIn: ['staging'], note: 'true on Railway; ignored in production' },
  { key: 'WEBHOOK_TEST_TOKEN', requiredIn: ['staging'], note: 'Required when webhook-test is on a production Node image' },
  { key: 'ENABLE_GRAPHQL', requiredIn: [], note: 'Optional ops' },
  { key: 'ENABLE_API_DOCS', requiredIn: [], note: 'Optional ops' },
  { key: 'GOOGLE_AI_STUDIO_API_KEY', requiredIn: [], note: 'Gemini without Vertex ADC' },
];

export const auditEnvParams = (appEnv: AppEnv, env: NodeJS.ProcessEnv = process.env) => {
  const missingRequired = ENV_PARAMS
    .filter(param => param.requiredIn.includes(appEnv) && !env[param.key]?.trim())
    .map(param => param.key);
  const present = ENV_PARAMS.filter(param => Boolean(env[param.key]?.trim())).map(param => param.key);
  return {
    appEnv,
    missingRequired,
    present,
    railwayStagingReady: appEnv !== 'staging' || missingRequired.length === 0,
  };
};
