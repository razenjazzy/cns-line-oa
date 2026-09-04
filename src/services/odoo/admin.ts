import { executeKwRead, getOdooConfig, loginRead } from './client';

export const isOdooConfigured = (): boolean => getOdooConfig() !== null;

export const pingOdoo = async (): Promise<string> => {
  const config = getOdooConfig();
  if (!config) return 'Odoo is not configured (missing ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY).';

  const uid = await loginRead(config);
  if (!uid) return 'Odoo login failed. Check ODOO_USERNAME and ODOO_API_KEY.';
  return `Odoo connected successfully (uid=${uid}).`;
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
