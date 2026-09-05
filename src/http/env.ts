const envFlag = (value: string | undefined): boolean => /^(1|true|yes|on)$/i.test(value || '');

export type AppEnv = 'development' | 'staging' | 'production';

/**
 * Deployment lane. Independent of NODE_ENV.
 * - development: local + API tests
 * - staging: Railway demo
 * - production: final delivery (demo and webhook-test stay off)
 *
 * Unset APP_ENV + NODE_ENV=production fails closed to production.
 */
export const resolveAppEnv = (env: NodeJS.ProcessEnv = process.env): AppEnv => {
  const explicit = env.APP_ENV?.trim().toLowerCase();
  if (explicit === 'development' || explicit === 'staging' || explicit === 'production') {
    return explicit;
  }
  if (env.NODE_ENV === 'production') return 'production';
  return 'development';
};

const stagingOrDevFlag = (appEnv: AppEnv, flag: string | undefined): boolean => {
  if (appEnv === 'production') return false;
  if (appEnv === 'development') return true;
  return envFlag(flag);
};

const opsSurfaceFlag = (appEnv: AppEnv, flag: string | undefined): boolean => {
  if (appEnv === 'development') return true;
  return envFlag(flag);
};

export const resolveDemoEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  stagingOrDevFlag(resolveAppEnv(env), env.ENABLE_DEMO_CONTROL_PANEL);

export const resolveWebhookTestEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  stagingOrDevFlag(resolveAppEnv(env), env.ENABLE_WEBHOOK_TEST);

export const resolveGraphqlEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  opsSurfaceFlag(resolveAppEnv(env), env.ENABLE_GRAPHQL);

export const appEnv = resolveAppEnv();
export const isStaging = appEnv === 'staging';
export const isDeliveryProduction = appEnv === 'production';
/** Node production mode (secure cookies, no Claw). True on Railway staging and delivery. */
export const isProduction = process.env.NODE_ENV === 'production';

export const isWebhookTestEnabled = resolveWebhookTestEnabled();
export const isDemoControlEnabled = resolveDemoEnabled();
export const allowDemoHeaderTokenFallbackInProd = appEnv === 'development' && envFlag(process.env.ALLOW_DEMO_HEADER_TOKEN_FALLBACK);
export const isApiDocsEnabled = opsSurfaceFlag(appEnv, process.env.ENABLE_API_DOCS);
export const isGraphqlEnabled = resolveGraphqlEnabled();
export const isGraphiqlEnabled = isGraphqlEnabled && !isDeliveryProduction;
export const isOpsJobsAsync = envFlag(process.env.OPS_JOBS_ASYNC);
export const isLineWebhookAsync = envFlag(process.env.LINE_WEBHOOK_ASYNC);
export const isBullmqWorkerEnabled = envFlag(process.env.RUN_BULLMQ_WORKER);
export const isMongoVectorEnabled = envFlag(process.env.MONGO_VECTOR_ENABLED);
export const mongoUri = process.env.MONGODB_URI?.trim() || '';
export const mongoDbName = process.env.MONGO_DB_NAME?.trim() || 'cns_line_oa';
export const bullmqPrefix = process.env.BULLMQ_PREFIX?.trim() || 'cns';
export const webhookTestToken = process.env.WEBHOOK_TEST_TOKEN?.trim() || '';
export const opsApiToken = process.env.OPS_API_TOKEN?.trim() || '';
export const demoControlToken = process.env.DEMO_CONTROL_TOKEN?.trim() || opsApiToken;
export const initialDemoSessionSecret = process.env.DEMO_SESSION_SECRET?.trim() || demoControlToken;
export const demoSessionTtlMinutes = Number(process.env.DEMO_SESSION_TTL_MINUTES || 30);
export const demoSessionRotateGraceDefaultMinutes = Number(process.env.DEMO_SESSION_ROTATE_GRACE_MINUTES || 30);
export const demoSessionCookieName = 'demo_control_session';
export const demoSessionConfigKey = process.env.DEMO_SESSION_CONFIG_KEY?.trim() || 'demoSessionSecretsV1';
export const readyzTimeoutMs = Number(process.env.READYZ_TIMEOUT_MS || 2500);
