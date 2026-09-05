import { executeKwRead, getOdooConfig, loginRead } from './client';

export const isOdooConfigured = (): boolean => getOdooConfig() !== null;

export const pingOdoo = async (): Promise<string> => {
  const config = getOdooConfig();
  if (!config) return 'Odoo is not configured (missing ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY).';

  const uid = await loginRead(config);
  if (!uid) return 'Odoo login failed. Check ODOO_USERNAME and ODOO_API_KEY.';
  return `Odoo connected successfully (uid=${uid}).`;
};

/**
 * Best-effort Odoo-native sales tier for a verified partner, resolved from
 * their linked res.users login's security-group membership. Returns
 * undefined (never throws) whenever any step can't be completed — no
 * res.users record for this partner (the common case: most verified LINE
 * users are customer contacts, not Odoo employees), the Sales Team groups
 * can't be resolved on this instance, or any RPC step fails. Callers must
 * treat undefined as "fall back to today's plain admin behavior", never as
 * an error to surface to the user — this is a refinement layered on top of
 * the existing role check, not a precondition for it.
 *
 * Field names for a user's security groups differ across Odoo versions
 * (this project has seen an instance using group_ids/all_group_ids rather
 * than the classic groups_id) — each candidate is tried in turn rather than
 * hardcoded, mirroring how getPartnerPhoneFields handles res.partner phone
 * field variability elsewhere in this file's sibling modules.
 */
export const findOdooSalesTierByPartnerId = async (partnerId: number): Promise<'salesperson' | 'sales_manager' | undefined> => {
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

    // Resolve the two Sales Team security groups by their stable external
    // ID (module='sales_team') rather than a numeric id, which varies per
    // instance/install.
    const groupRefs = await executeKwRead<Array<{ name: string; res_id: number }>>(
      config, uid, 'ir.model.data', 'search_read',
      [[['module', '=', 'sales_team'], ['name', 'in', ['group_sale_salesman', 'group_sale_manager']]]],
      { fields: ['name', 'res_id'] }
    );
    const managerGroupId = groupRefs.find(g => g.name === 'group_sale_manager')?.res_id;
    const salesmanGroupId = groupRefs.find(g => g.name === 'group_sale_salesman')?.res_id;
    if (!managerGroupId && !salesmanGroupId) return undefined;

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
    if (!userGroupIds.length) return undefined;

    if (managerGroupId && userGroupIds.includes(managerGroupId)) return 'sales_manager';
    if (salesmanGroupId && userGroupIds.includes(salesmanGroupId)) return 'salesperson';
    return undefined;
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
