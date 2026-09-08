import { describe, expect, it } from 'vitest';
import { preferOdooLoginPartner, salesTierForLinkedOdooUser } from '../src/services/odoo/admin';

describe('VERIFY phone → Odoo login vs customer', () => {
  it('treats a contact with no Odoo login as a customer', () => {
    expect(salesTierForLinkedOdooUser({ hasLogin: false })).toBeUndefined();
  });

  it('grants Sales User when the phone belongs to an Odoo login', () => {
    expect(salesTierForLinkedOdooUser({ hasLogin: true })).toBe('salesperson');
    expect(salesTierForLinkedOdooUser({ hasLogin: true, groupIds: [] })).toBe('salesperson');
  });

  it('grants Sales Administrator when the login has the manager group', () => {
    expect(salesTierForLinkedOdooUser({
      hasLogin: true,
      groupIds: [9, 4],
      managerGroupId: 4,
      salesmanGroupId: 3,
    })).toBe('sales_manager');
  });

  it('binds the Odoo-user contact when the same phone is also on a customer', () => {
    const customer = { id: 12, name: 'Ashfaq' };
    const staff = { id: 81, name: 'Sales login' };
    expect(preferOdooLoginPartner([customer, staff], [81])).toEqual(staff);
    expect(preferOdooLoginPartner([customer, staff], [])).toEqual(customer);
  });
});
