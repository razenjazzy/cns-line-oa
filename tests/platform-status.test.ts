import { describe, expect, it } from 'vitest';
import { getPlatformFlags } from '../src/platform/status';

describe('platform flags', () => {
  it('exposes a complete non-secret snapshot', () => {
    const flags = getPlatformFlags();
    expect(flags.erpProvider).toBe('odoo');
    expect(flags).toEqual(expect.objectContaining({
      lineConfigured: expect.any(Boolean),
      firestoreProjectConfigured: expect.any(Boolean),
      odooConfigured: expect.any(Boolean),
      graphqlEnabled: expect.any(Boolean),
      apiDocsEnabled: expect.any(Boolean),
      lineWebhookAsync: false,
      adminAllowlistConfigured: expect.any(Boolean),
      skillsLoaded: expect.any(Number),
    }));
  });
});
