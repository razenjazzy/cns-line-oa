import { describe, expect, it } from 'vitest';
import * as firestoreUsers from '../src/services/firestore/users';
import * as firestoreAudit from '../src/services/firestore/audit-repository';
import * as odooCatalog from '../src/services/odoo/catalog';
import * as odooSales from '../src/services/odoo/sales';

describe('domain compatibility facades', () => {
  it('exposes Firestore user and audit operations from domain paths', () => {
    expect(typeof firestoreUsers.getUserProfile).toBe('function');
    expect(typeof firestoreUsers.setUserRole).toBe('function');
    expect(typeof firestoreAudit.recordAuditEvent).toBe('function');
    expect(typeof firestoreAudit.listRecentAuditEventsPage).toBe('function');
  });

  it('exposes Odoo catalog and sales operations from domain paths', () => {
    expect(typeof odooCatalog.findProductByQuery).toBe('function');
    expect(typeof odooCatalog.createServiceCatalogItem).toBe('function');
    expect(typeof odooSales.findOrderByReference).toBe('function');
    expect(typeof odooSales.createQuotationFromLine).toBe('function');
  });
});
