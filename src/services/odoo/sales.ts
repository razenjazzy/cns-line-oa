export {
  addSaleOrderLine,
  cancelSaleOrder,
  confirmSaleOrder,
  createInvoiceForSaleOrder,
  createQuotationFromLine,
  findOrderByReference,
  findPaymentTermByName,
  findSaleOrderLineByProduct,
  getSaleOrderById,
  getSaleOrderPdfLink,
  getSaleOrderPortalLink,
  getSaleOrdersForPartner,
  markSaleOrderSent,
  updateSaleOrderLineQty,
} from '../odoo';
export type { OdooSaleOrder, OdooSaleOrderLine } from './types';
