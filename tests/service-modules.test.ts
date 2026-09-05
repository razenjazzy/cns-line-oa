import { describe, expect, it } from 'vitest';
import { getDemoPlatformPayload, SERVICE_MODULES } from '../src/platform/service-modules';

describe('service modules catalog', () => {
  it('lists live LINE domains without treating Mongo as ERP', () => {
    const ids = SERVICE_MODULES.map(mod => mod.id);
    expect(ids).toEqual(expect.arrayContaining([
      'identity',
      'commerce',
      'directory',
      'catalog',
      'groupBuy',
      'reporting',
      'aiFallback',
      'platform',
      'erp',
      'ops',
      'admin',
      'sales',
      'approvals',
    ]));
    expect(SERVICE_MODULES.filter(mod => mod.store === 'mongo').map(mod => mod.id)).toEqual(['aiFallback']);
    expect(SERVICE_MODULES.find(mod => mod.id === 'erp')?.store).toBe('odoo');
    expect(SERVICE_MODULES.find(mod => mod.id === 'identity')?.store).toBe('firestore');
  });

  it('exposes a demo-day payload with talk track', () => {
    const payload = getDemoPlatformPayload();
    expect(payload.modules).toHaveLength(SERVICE_MODULES.length);
    expect(payload.demoDayScript.length).toBeGreaterThanOrEqual(8);
    expect(payload.stores.mongo).toMatch(/Never users/i);
  });
});
