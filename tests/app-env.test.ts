import { describe, expect, it } from 'vitest';
import { resolveAppEnv, resolveDemoEnabled, resolveWebhookTestEnabled } from '../src/http/env';

describe('APP_ENV lanes', () => {
  it('uses an explicit staging lane even when NODE_ENV is production', () => {
    expect(resolveAppEnv({ NODE_ENV: 'production', APP_ENV: 'staging' })).toBe('staging');
  });

  it('fails closed to production when NODE_ENV is production and APP_ENV is unset', () => {
    expect(resolveAppEnv({ NODE_ENV: 'production' })).toBe('production');
  });

  it('defaults local work to development', () => {
    expect(resolveAppEnv({ NODE_ENV: 'development' })).toBe('development');
    expect(resolveAppEnv({})).toBe('development');
  });

  it('never opens demo or webhook-test in delivery production', () => {
    const production = { NODE_ENV: 'production', APP_ENV: 'production', ENABLE_DEMO_CONTROL_PANEL: 'true', ENABLE_WEBHOOK_TEST: 'true' };
    expect(resolveDemoEnabled(production)).toBe(false);
    expect(resolveWebhookTestEnabled(production)).toBe(false);
  });

  it('opens demo on staging only when the flag is set', () => {
    expect(resolveDemoEnabled({ NODE_ENV: 'production', APP_ENV: 'staging' })).toBe(false);
    expect(resolveDemoEnabled({ NODE_ENV: 'production', APP_ENV: 'staging', ENABLE_DEMO_CONTROL_PANEL: 'true' })).toBe(true);
  });
});
