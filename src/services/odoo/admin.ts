import { executeKwRead, getOdooConfig, loginRead } from './client';

export const isOdooConfigured = (): boolean => getOdooConfig() !== null;

export const pingOdoo = async (): Promise<string> => {
  const config = getOdooConfig();
  if (!config) return 'Odoo is not configured (missing ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY).';

  const uid = await loginRead(config);
  if (!uid) return 'Odoo login failed. Check ODOO_USERNAME and ODOO_API_KEY.';
  return `Odoo connected successfully (uid=${uid}).`;
};

export type OdooSalesTier = 'salesperson' | 'sales_manager';

/**
 * Phone VERIFY is one flow. A linked `res.users` login is Sales staff
 * (Sales User, or Sales Administrator when that group is present). A
 * `res.partner` with no login is a customer. Group lookup is best-effort:
 * a login without readable Sales groups is still staff, not a customer.
 */
export const salesTierForLinkedOdooUser = (input: {
  hasLogin: boolean;
  groupIds?: number[];
  managerGroupId?: number;
  salesmanGroupId?: number;
}): OdooSalesTier | undefined => {
  if (!input.hasLogin) return undefined;
  const groups = input.groupIds || [];
  if (input.managerGroupId && groups.includes(input.managerGroupId)) return 'sales_manager';
  if (input.salesmanGroupId && groups.includes(input.salesmanGroupId)) return 'salesperson';
  return 'salesperson';
};

/** When several contacts share a phone, bind the one that has an Odoo login. */
export const preferOdooLoginPartner = <T extends { id: number }>(partners: T[], loginPartnerIds: number[]): T => {
  const preferred = partners.find(partner => loginPartnerIds.includes(partner.id));
  return preferred || partners[0];
};

export const pickLinkedOdooUserPartnerId = async (partnerIds: number[]): Promise<number | undefined> => {
  if (!partnerIds.length) return undefined;
  const config = getOdooConfig();
  if (!config) return undefined;
  try {
    const uid = await loginRead(config);
    if (!uid) return undefined;
    const searchUsers = (domain: unknown[]) => executeKwRead<Array<{ partner_id?: unknown }>>(
      config, uid, 'res.users', 'search_read',
      [domain],
      { fields: ['partner_id'], limit: 20 }
    );
    const rows = await searchUsers([['partner_id', 'in', partnerIds], ['active', '=', true]])
      .catch(() => searchUsers([['partner_id', 'in', partnerIds]]));
    const loginIds = rows.map(row => {
      const partner = row.partner_id;
      if (typeof partner === 'number') return partner;
      if (Array.isArray(partner) && typeof partner[0] === 'number') return partner[0];
      return undefined;
    }).filter((id): id is number => typeof id === 'number');
    return partnerIds.find(id => loginIds.includes(id));
  } catch (err) {
    console.error('pickLinkedOdooUserPartnerId error:', err);
    return undefined;
  }
};

/**
 * Sales staff vs customer for a verified partner: login → Sales User (or
 * Sales Administrator); no `res.users` → customer (`undefined`). Never throws.
 */
export const findOdooSalesTierByPartnerId = async (partnerId: number): Promise<OdooSalesTier | undefined> => {
  const config = getOdooConfig();
  if (!config) return undefined;

  try {
    const uid = await loginRead(config);
    if (!uid) return undefined;

    const userIds = await executeKwRead<number[]>(
      config, uid, 'res.users', 'search',
      [[['partner_id', '=', partnerId]]],
      { limit: 1 }
    );
    if (!userIds.length) return undefined;
    const odooUserId = userIds[0];

    const groupRefs = await executeKwRead<Array<{ name: string; res_id: number }>>(
      config, uid, 'ir.model.data', 'search_read',
      [[['module', '=', 'sales_team'], ['name', 'in', ['group_sale_salesman', 'group_sale_manager']]]],
      { fields: ['name', 'res_id'] }
    ).catch(() => [] as Array<{ name: string; res_id: number }>);
    const managerGroupId = groupRefs.find(g => g.name === 'group_sale_manager')?.res_id;
    const salesmanGroupId = groupRefs.find(g => g.name === 'group_sale_salesman')?.res_id;

    let userGroupIds: number[] = [];
    for (const field of ['all_group_ids', 'group_ids', 'groups_id']) {
      try {
        const rows = await executeKwRead<Array<Record<string, unknown>>>(
          config, uid, 'res.users', 'read', [[odooUserId]], { fields: [field] }
        );
        const raw = rows[0]?.[field];
        if (Array.isArray(raw)) {
          userGroupIds = raw as number[];
          break;
        }
      } catch {
        // This field doesn't exist on this instance/version — try the next candidate.
      }
    }

    return salesTierForLinkedOdooUser({
      hasLogin: true,
      groupIds: userGroupIds,
      managerGroupId,
      salesmanGroupId,
    });
  } catch (err) {
    console.error('findOdooSalesTierByPartnerId error:', err);
    return undefined;
  }
};

export const verifyOdooAdminAccess = async (): Promise<{ ok: boolean; message: string }> => {
  const config = getOdooConfig();
  if (!config) {
    return { ok: false, message: 'Odoo is not configured.' };
  }

  const uid = await loginRead(config);
  if (!uid) {
    return { ok: false, message: 'Odoo login failed.' };
  }

  const canWritePartners = await executeKwRead<boolean>(
    config,
    uid,
    'res.partner',
    'check_access_rights',
    ['write'],
    { raise_exception: false }
  );

  if (!canWritePartners) {
    return { ok: false, message: 'Odoo user lacks admin-level write rights on res.partner.' };
  }

  return { ok: true, message: `Odoo admin verified (uid=${uid}).` };
};
