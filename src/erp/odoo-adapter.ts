import { createServiceCatalogItem, deleteServiceCatalogItem, findProductByQuery, getServiceByIdentifier, listServiceCatalogItems, updateServiceCatalogItem } from '../services/odoo/catalog';
import { addSaleOrderLine, cancelSaleOrder, confirmSaleOrder, createInvoiceForSaleOrder, createQuotationFromLine, findOrderByReference, removeSaleOrderLine, updateSaleOrderLineQty } from '../services/odoo/sales';
import { createPartnerFromLine, deletePartnerFromLine, getPartnerByPhone, updatePartnerFromLine } from '../services/odoo/partners';
import { getDailySalesSnapshot } from '../services/odoo/reporting';
import type { OdooProduct } from '../services/odoo/types';
import type { ErpAdapter, ErpCustomerUpdate, ErpPartner, ErpPermission, ErpProduct, ErpProviderName, ErpQuoteDraft, ErpQuotationOptions, ErpService, ErpServiceUpdate, ErpWriteAction } from './adapter';

const toErpProduct = (product: OdooProduct): ErpProduct => ({
  id: product.id,
  name: product.name,
  sku: product.default_code,
  price: product.list_price,
  quantity: product.qty_available,
  currency: 'THB',
});

const permissionForAction = (action: ErpWriteAction): ErpPermission => {
  switch (action) {
    case 'quote.create':
    case 'quote.update':
    case 'quote.cancel':
    case 'order.confirm':
    case 'invoice.create':
      return { role: 'staff', channel: 'line', requiresOtp: true };
    case 'customer.create':
    case 'customer.update':
      return { role: 'admin', channel: 'ops', requiresOtp: true };
    case 'service.create':
    case 'service.update':
      return { role: 'admin', channel: 'admin', requiresOtp: true };
    default:
      return { role: 'customer', channel: 'line' };
  }
};

const toErpService = (service: { id: number; name: string; default_code?: string; list_price: number; qty_available: number }): ErpService => ({
  id: service.id,
  name: service.name,
  sku: service.default_code,
  price: service.list_price,
  quantity: service.qty_available,
});

export const odooAdapter: ErpAdapter = {
  name: 'odoo' as ErpProviderName,
  capabilities: {
    supportsProductSearch: true,
    supportsCustomerLookup: true,
    supportsQuoteCreation: true,
    supportsOrderConfirmation: true,
    supportsInvoiceCreation: true,
    supportsDailyReport: true,
  },
  async searchProducts(query: string, limit = 10): Promise<ErpProduct[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const product = await findProductByQuery(normalized);
    return product ? [toErpProduct(product)].slice(0, limit) : [];
  },
  async listServices(limit = 10): Promise<ErpService[]> {
    const services = await listServiceCatalogItems(limit);
    return services.map(toErpService);
  },
  async lookupService(identifier: string): Promise<ErpService | null> {
    const service = await getServiceByIdentifier(identifier);
    return service ? toErpService(service) : null;
  },
  async createService(name: string, sku: string, price: number): Promise<ErpService | null> {
    const service = await createServiceCatalogItem(name, sku, price);
    return service ? toErpService(service) : null;
  },
  async updateService(identifier: string, update: ErpServiceUpdate): Promise<ErpService | null> {
    const service = await updateServiceCatalogItem(identifier, { name: update.name, price: update.price, code: update.sku });
    return service ? toErpService(service) : null;
  },
  async deleteService(identifier: string): Promise<boolean> {
    return deleteServiceCatalogItem(identifier);
  },
  async lookupCustomer(query: string): Promise<ErpPartner | null> {
    const normalized = query.trim();
    if (!normalized) return null;
    const partner = await getPartnerByPhone(normalized);
    return partner ? {
      id: partner.id,
      name: partner.name,
      phone: partner.phone,
      email: partner.email,
    } : null;
  },
  async createCustomer(name: string, phone: string, email?: string): Promise<ErpPartner | null> {
    const partner = await createPartnerFromLine(name, phone, email);
    return partner ? { id: partner.id, name: partner.name, phone: partner.phone, email: partner.email } : null;
  },
  async updateCustomer(id: number, update: ErpCustomerUpdate): Promise<ErpPartner | null> {
    const partner = await updatePartnerFromLine(id, update.name, update.phone, update.email);
    return partner ? { id: partner.id, name: partner.name, phone: partner.phone, email: partner.email } : null;
  },
  async deleteCustomer(id: number): Promise<boolean> {
    return deletePartnerFromLine(id);
  },
  async createQuotation(partnerName: string, phone: string, productName: string, qty: number, options?: ErpQuotationOptions): Promise<ErpQuoteDraft | null> {
    const { partnerId, ...extra } = options || {};
    const result = await createQuotationFromLine(partnerName, phone, productName, qty, partnerId, extra);
    if (!result) return null;
    return {
      id: result.orderId,
      name: result.orderName,
      total: result.total,
      currency: 'THB',
    };
  },
  async confirmOrder(orderId: number): Promise<boolean> {
    return confirmSaleOrder(orderId);
  },
  async createInvoice(orderId: number): Promise<boolean> {
    return createInvoiceForSaleOrder(orderId);
  },
  async addQuoteLine(orderId: number, productId: number, qty: number): Promise<boolean> {
    return addSaleOrderLine(orderId, productId, qty);
  },
  async editQuoteLine(orderId: number, productId: number, qty: number): Promise<boolean> {
    return updateSaleOrderLineQty(orderId, productId, qty);
  },
  async removeQuoteLine(orderId: number, productId: number): Promise<boolean> {
    return removeSaleOrderLine(orderId, productId);
  },
  async cancelQuote(orderId: number): Promise<boolean> {
    return cancelSaleOrder(orderId);
  },
  async getOrderStatus(orderRef: string): Promise<{ id: number; name: string; state: string; amountTotal?: number } | null> {
    const order = await findOrderByReference(orderRef);
    return order ? {
      id: order.id,
      name: order.name,
      state: order.state,
      amountTotal: order.amount_total,
    } : null;
  },
  async getDailySnapshot() {
    return getDailySalesSnapshot();
  },
  async getDailySummary(): Promise<string | null> {
    const rows = await this.getDailySnapshot();
    return rows.length
      ? rows.map(row => `${row.product}: ${row.salesYesterday} sold, ${row.stock} in stock, ${row.revenueYesterday} revenue`).join('\n')
      : null;
  },
  permissionFor: permissionForAction,
};

export const odooProviderName: ErpProviderName = 'odoo';
