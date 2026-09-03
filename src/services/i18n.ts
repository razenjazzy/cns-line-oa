import type { UserLanguage } from './firestore';

/**
 * Single bilingual source of truth for the quotation-journey feature's own
 * copy and Odoo domain terms, so a translation only ever needs to change in
 * one place. This is additive and scoped to that feature — the rest of the
 * codebase's existing inline `tr(language, th, en)` calls are left as-is;
 * migrating every existing string is a large, low-value churn unrelated to
 * this feature.
 *
 * Reuses UserLanguage ('th' | 'en') rather than introducing a third
 * language type — every call site elsewhere already threads that type.
 */
export type Lang = UserLanguage;

/**
 * The authoritative list is `sale.order`'s own `state` selection field,
 * verified live against the real Odoo instance:
 *   draft -> Quotation, sent -> Quotation Sent, sale -> Sales Order,
 *   cancel -> Cancelled. `done` is included too since some Odoo versions
 *   still emit it for a locked order even though it's deprecated in newer
 *   ones. Never hardcode a 6th value here without re-checking against the
 *   live `fields_get` selection first — see documents for the debug-script
 *   technique used to verify this during planning.
 */
export type OdooSaleOrderState = 'draft' | 'sent' | 'sale' | 'cancel' | 'done';

export const ODOO_STATE_LABELS: Record<OdooSaleOrderState, { en: string; th: string }> = {
  draft: { en: 'Quotation', th: 'ใบเสนอราคา' },
  sent: { en: 'Quotation Sent', th: 'ส่งใบเสนอราคาแล้ว' },
  sale: { en: 'Sales Order', th: 'คำสั่งขาย' },
  cancel: { en: 'Cancelled', th: 'ยกเลิกแล้ว' },
  done: { en: 'Locked', th: 'ล็อกแล้ว' },
};

export const UI_STRINGS = {
  quotation: { en: 'Quotation', th: 'ใบเสนอราคา' },
  customer: { en: 'Customer', th: 'ลูกค้า' },
  items: { en: 'Items', th: 'รายการ' },
  total: { en: 'Total', th: 'ยอดรวม' },
  status: { en: 'Status', th: 'สถานะ' },
  moreItems: { en: 'more item(s)', th: 'รายการเพิ่มเติม' },
  preview: { en: 'Preview', th: 'ดูตัวอย่าง' },
  sendToCustomer: { en: 'Send to customer', th: 'ส่งให้ลูกค้า' },
  confirm: { en: 'Confirm', th: 'ยืนยันคำสั่งซื้อ' },
  approve: { en: 'Approve', th: 'อนุมัติ' },
  viewFullQuotation: { en: 'View full quotation', th: 'ดูใบเสนอราคาฉบับเต็ม' },
  quoteSentToAdmin: { en: 'Sent to the customer for approval.', th: 'ส่งให้ลูกค้าเพื่ออนุมัติแล้ว' },
  quoteNotLinked: {
    en: 'This customer has not verified with the bot yet, so LINE cannot message them. Ask them to message the bot and complete VERIFY first.',
    th: 'ลูกค้ารายนี้ยังไม่ได้ยืนยันตัวตนกับบอท จึงยังส่งข้อความทาง LINE ไม่ได้ กรุณาให้ลูกค้าทักบอทและทำการ VERIFY ก่อน',
  },
  quoteNotYours: {
    en: "This quotation isn't linked to your account.",
    th: 'ใบเสนอราคานี้ไม่ได้ผูกกับบัญชีของคุณ',
  },
  quoteApproved: { en: 'Quotation approved. Thank you!', th: 'อนุมัติใบเสนอราคาแล้ว ขอบคุณค่ะ' },
  quoteNotFound: { en: 'Quotation not found.', th: 'ไม่พบใบเสนอราคานี้' },
  addItem: { en: 'Add item', th: 'เพิ่มรายการ' },
  editItem: { en: 'Edit item', th: 'แก้ไขรายการ' },
  cancelQuote: { en: 'Cancel', th: 'ยกเลิก' },
  createInvoice: { en: 'Create invoice', th: 'สร้างใบแจ้งหนี้' },
  downloadPdf: { en: 'Download PDF', th: 'ดาวน์โหลด PDF' },
  myQuotations: { en: 'My quotations', th: 'ใบเสนอราคาของฉัน' },
  noQuotations: { en: "No quotations found.", th: 'ไม่พบใบเสนอราคา' },
  moreQuotations: { en: 'More quotations exist — ask an admin to narrow the search.', th: 'มีใบเสนอราคาเพิ่มเติม — กรุณาแจ้งแอดมินให้ช่วยค้นหาแบบเจาะจงมากขึ้น' },
} as const;

export type UiStringKey = keyof typeof UI_STRINGS;

/** Same shape as the existing `tr(language, th, en)` helper repeated in every handler file, just table-driven. */
export const t = (key: UiStringKey, language: Lang): string => UI_STRINGS[key][language];

export const stateLabel = (state: string, language: Lang): string => {
  const entry = ODOO_STATE_LABELS[state as OdooSaleOrderState];
  return entry ? entry[language] : state;
};
