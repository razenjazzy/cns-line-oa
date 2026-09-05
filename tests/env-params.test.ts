import { describe, expect, it } from 'vitest';
import { auditEnvParams } from '../src/http/env-params';

describe('environment param catalog', () => {
  it('requires APP_ENV=staging plus LINE, Odoo, and demo flags for Railway', () => {
    const audit = auditEnvParams('staging', {
      APP_ENV: 'staging',
      NODE_ENV: 'production',
      LINE_CHANNEL_SECRET: 'x',
      LINE_CHANNEL_ACCESS_TOKEN: 'x',
      ADMIN_USER_ID: 'U1',
      GOOGLE_CLOUD_PROJECT: 'p',
      GOOGLE_APPLICATION_CREDENTIALS_JSON: '{}',
      ODOO_URL: 'https://odoo.example',
      ODOO_DB: 'db',
      ODOO_USERNAME: 'u',
      ODOO_API_KEY: 'k',
      ERP_PROVIDER: 'odoo',
      PUBLIC_BASE_URL: 'https://app.example',
      OPS_API_TOKEN: 'ops',
      DEMO_CONTROL_TOKEN: 'demo',
      ENABLE_DEMO_CONTROL_PANEL: 'true',
      ENABLE_WEBHOOK_TEST: 'true',
      WEBHOOK_TEST_TOKEN: 'wh',
    });
    expect(audit.missingRequired).toEqual([]);
    expect(audit.railwayStagingReady).toBe(true);
  });

  it('does not require demo flags in production', () => {
    const audit = auditEnvParams('production', { APP_ENV: 'production' });
    expect(audit.missingRequired).not.toContain('ENABLE_DEMO_CONTROL_PANEL');
    expect(audit.missingRequired).toContain('LINE_CHANNEL_SECRET');
  });
});
