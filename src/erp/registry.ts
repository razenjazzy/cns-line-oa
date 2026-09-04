import type { ErpAdapter, ErpProviderName } from './adapter';
import { odooAdapter } from './odoo-adapter';

const configuredProvider = (): ErpProviderName => {
  const provider = process.env.ERP_PROVIDER?.trim().toLowerCase() || 'odoo';
  if (provider === 'odoo' || provider === 'sap' || provider === 'quickbooks' || provider === 'oracle') {
    return provider;
  }
  throw new Error(`Unsupported ERP provider: ${provider}`);
};

export const getErpAdapter = (): ErpAdapter => {
  const provider = configuredProvider();
  if (provider === 'odoo') return odooAdapter;
  throw new Error(`ERP provider is configured but not implemented: ${provider}`);
};
