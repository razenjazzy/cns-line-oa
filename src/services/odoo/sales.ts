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
  removeSaleOrderLine,
  updateSaleOrderLineQty,
} from '../odoo';
export type { OdooSaleOrder, OdooSaleOrderLine } from './types';
