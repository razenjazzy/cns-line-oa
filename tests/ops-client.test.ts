import { describe, expect, it } from 'vitest';
import { resolveOpsClientConfig } from '../src/ops-client/client';

describe('resolveOpsClientConfig', () => {
  it('defaults to localhost:8080 with no tokens', () => {
    expect(resolveOpsClientConfig({})).toEqual({
      baseUrl: 'http://localhost:8080',
      opsApiToken: undefined,
      adminSecretToken: undefined,
      webhookTestToken: undefined,
    });
  });

  it('strips a trailing slash from CNS_BASE_URL', () => {
    expect(resolveOpsClientConfig({ CNS_BASE_URL: 'https://staging.example.com/' }).baseUrl)
      .toBe('https://staging.example.com');
  });

  it('reads and trims tokens from env', () => {
    const config = resolveOpsClientConfig({
      OPS_API_TOKEN: '  ops-token  ',
      ADMIN_SECRET_TOKEN: 'admin-token',
      WEBHOOK_TEST_TOKEN: '',
    });
    expect(config.opsApiToken).toBe('ops-token');
    expect(config.adminSecretToken).toBe('admin-token');
    expect(config.webhookTestToken).toBeUndefined();
  });
});
