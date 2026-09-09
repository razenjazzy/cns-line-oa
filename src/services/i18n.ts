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
  moreActions: { en: 'More', th: 'เพิ่มเติม' },
  sendNow: { en: 'Send', th: 'ส่ง' },
  createMore: { en: 'Create More', th: 'สร้างเพิ่ม' },
  sendComposerTitle: { en: 'Send quotation', th: 'ส่งใบเสนอราคา' },
  invoiceSendComposerTitle: { en: 'Send invoice', th: 'ส่งใบแจ้งหนี้' },
  sendInvoice: { en: 'Send Invoice', th: 'ส่งใบแจ้งหนี้' },
  invoiceSentToCustomer: { en: 'Invoice sent to the customer.', th: 'ส่งใบแจ้งหนี้ให้ลูกค้าแล้ว' },
  emailTo: { en: 'To', th: 'ถึง' },
  emailSubject: { en: 'Subject', th: 'เรื่อง' },
  noPartnerEmail: { en: 'No email on this customer. Type one below or send via LINE if they verified.', th: 'ลูกค้ายังไม่มีอีเมล พิมพ์อีเมลด้านล่าง หรือส่งทาง LINE ได้ถ้ายืนยันตัวตนแล้ว' },
  typeEmail: { en: 'Type email', th: 'พิมพ์อีเมล' },
  nextPage: { en: 'Next 5', th: 'ถัดไป 5 รายการ' },
  filterDates: { en: 'Filter dates', th: 'กรองวันที่' },
  // Kept short deliberately — this button often sits half-width next to
  // "Download", and a longer label gets visually clipped by the LINE
  // client itself (its width-based clipping, not the 20-char cap below).
  viewFullQuotation: { en: 'View Quote', th: 'ดูใบเสนอราคา' },
  quoteSentToAdmin: { en: 'Quotation sent to the customer to Confirm or Approve.', th: 'ส่งใบเสนอราคาให้ลูกค้าเพื่อยืนยันหรืออนุมัติแล้ว' },
  sentViaLine: { en: 'Quotation sent to the customer on LINE to Confirm or Approve.', th: 'ส่งใบเสนอราคาให้ลูกค้าทาง LINE เพื่อยืนยันหรืออนุมัติแล้ว' },
  sentViaEmail: { en: 'Sent to the customer by email.', th: 'ส่งให้ลูกค้าทางอีเมลแล้ว' },
  sentViaBoth: { en: 'Quotation sent on LINE and by email for the customer to Confirm or Approve.', th: 'ส่งใบเสนอราคาทาง LINE และอีเมลให้ลูกค้าเพื่อยืนยันหรืออนุมัติแล้ว' },
  sendViaLine: { en: 'Send LINE', th: 'ส่ง LINE' },
  sendViaEmail: { en: 'Send Email', th: 'ส่งอีเมล' },
  sendViaBoth: { en: 'Send both', th: 'ส่งทั้งคู่' },
  phoneField: { en: 'Phone', th: 'เบอร์โทร' },
  quoteNotLinked: {
    en: 'This customer has not opened the Official Account yet. Share the Add friend link below or send email. They do not need VERIFY to receive it.',
    th: 'ลูกค้ายังไม่ได้เพิ่ม Official Account นี้ ส่งลิงก์เพิ่มเพื่อนด้านล่างหรือส่งอีเมล ลูกค้าไม่ต้อง VERIFY เพื่อรับใบเสนอราคา',
  },
  addFriend: { en: 'Add friend', th: 'เพิ่มเพื่อน' },
  quoteNotYours: {
    en: "This quotation isn't linked to your account.",
    th: 'ใบเสนอราคานี้ไม่ได้ผูกกับบัญชีของคุณ',
  },
  quoteApproved: { en: 'Quotation approved. Thank you!', th: 'อนุมัติใบเสนอราคาแล้ว ขอบคุณค่ะ' },
  quoteNotFound: { en: 'Quotation not found.', th: 'ไม่พบใบเสนอราคานี้' },
  addItem: { en: 'Add item', th: 'เพิ่มรายการ' },
  editItem: { en: 'Edit item', th: 'แก้ไขรายการ' },
  editQuote: { en: 'Edit Quote', th: 'แก้ไขใบเสนอราคา' },
  editQuoteHint: { en: 'Tap a line to change qty. Add or remove below.', th: 'แตะรายการเพื่อแก้จำนวน เพิ่มหรือลบด้านล่าง' },
  removeItem: { en: 'Remove', th: 'ลบรายการ' },
  cancelQuote: { en: 'Cancel', th: 'ยกเลิก' },
  createInvoice: { en: 'Invoice', th: 'ใบแจ้งหนี้' },
  downloadPdf: { en: 'Download', th: 'ดาวน์โหลด' },
  print: { en: 'Print', th: 'พิมพ์' },
  myQuotations: { en: 'My quotations', th: 'ใบเสนอราคาของฉัน' },
  noQuotations: { en: "No quotations found.", th: 'ไม่พบใบเสนอราคา' },
  moreQuotations: { en: 'More quotations exist — ask an admin to narrow the search.', th: 'มีใบเสนอราคาเพิ่มเติม — กรุณาแจ้งแอดมินให้ช่วยค้นหาแบบเจาะจงมากขึ้น' },
  messageCustomer: { en: 'Message customer', th: 'ส่งข้อความลูกค้า' },
  home: { en: 'Home', th: 'หน้าหลัก' },
  back: { en: 'Back', th: 'ย้อนกลับ' },
  skip: { en: 'Skip', th: 'ข้าม' },
  cancelForm: { en: 'Cancel', th: 'ยกเลิก' },
  pickDate: { en: '📅 Pick date', th: '📅 เลือกวันที่' },
  dateFrom: { en: '📅 From', th: '📅 จาก' },
  dateTo: { en: '📅 To', th: '📅 ถึง' },
  createQuote: { en: 'Create quote', th: 'สร้างใบเสนอราคา' },
  searchAgain: { en: 'Search again', th: 'ค้นหาอีกครั้ง' },
  productDetail: { en: 'Product detail', th: 'รายละเอียดสินค้า' },
  productNext: { en: 'Review and choose the next action', th: 'ตรวจสอบข้อมูลแล้วเลือกขั้นตอนต่อไป' },
  price: { en: 'Price', th: 'ราคา' },
  stock: { en: 'Stock', th: 'คงเหลือ' },
  checkOrder: { en: 'Check order', th: 'เช็คออเดอร์' },
  retryStatus: { en: 'Check status', th: 'เช็คสถานะ' },
  listTapHint: { en: '{n} found — tap one for details', th: 'พบ {n} รายการ — แตะเพื่อดูรายละเอียด' },
  noQuotationsYet: { en: 'No quotations yet', th: 'ยังไม่มีใบเสนอราคา' },
  orderKind: { en: 'Order', th: 'คำสั่งขาย' },
  needsAttention: { en: 'Needs attention', th: 'ต้องตรวจสอบ' },
  notice: { en: 'Notice', th: 'แจ้งเตือน' },
  done: { en: 'Done', th: 'สำเร็จ' },
  nextStepHint: { en: 'Use the buttons below for the next step.', th: 'ใช้ปุ่มด้านล่างเพื่อไปขั้นตอนถัดไป' },
  tapOptionOrType: { en: 'Tap an option below, or type your own answer.', th: 'แตะเลือกตัวเลือกด้านล่าง หรือพิมพ์คำตอบเอง' },
  pickDateOrType: { en: 'Pick a date, or type YYYY-MM-DD.', th: 'เลือกวันที่ หรือพิมพ์ YYYY-MM-DD' },
  typeAnswer: { en: 'Please type your answer in the chat box.', th: 'กรุณาพิมพ์คำตอบในช่องแชท' },
  stepOf: { en: 'Step {current} of {total}', th: 'ขั้นตอน {current} จาก {total}' },
  optionalSummaryHint: { en: 'Optional — tap any to fill, or finalize as-is', th: 'ไม่บังคับ — แตะเพื่อกรอก หรือสร้างได้เลย' },
  tapService: { en: 'Tap a service to continue', th: 'เลือกบริการเพื่อเริ่มใช้งาน' },
  chooseAction: { en: 'Choose one action', th: 'เลือกสิ่งที่ต้องการทำ' },
  languageToggle: { en: 'Language', th: 'ภาษา' },
  guide: { en: 'Guide', th: 'คู่มือ' },
  invoiceField: { en: 'Invoice', th: 'ใบแจ้งหนี้' },
  invoiceToInvoice: { en: 'To invoice', th: 'รอเปิดบิล' },
  invoiceInvoiced: { en: 'Invoiced', th: 'เปิดบิลแล้ว' },
  invoiceUpselling: { en: 'Upselling', th: 'เสนอเพิ่ม' },
  myData: { en: 'My data', th: 'ข้อมูลของฉัน' },
  deleteMyData: { en: 'Delete my data', th: 'ลบข้อมูล' },
} as const;

export type UiStringKey = keyof typeof UI_STRINGS;

/** Same shape as the existing `tr(language, th, en)` helper repeated in every handler file, just table-driven. */
export const t = (key: UiStringKey, language: Lang): string => UI_STRINGS[key][language];

export const tFill = (key: UiStringKey, language: Lang, vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((acc, [name, value]) => acc.split(`{${name}}`).join(String(value)), t(key, language));

export const invoiceStatusLabel = (status: string | undefined, language: Lang): string => {
  if (status === 'to invoice') return t('invoiceToInvoice', language);
  if (status === 'invoiced') return t('invoiceInvoiced', language);
  if (status === 'upselling') return t('invoiceUpselling', language);
  return '';
};

export const stateLabel = (state: string, language: Lang): string => {
  const entry = ODOO_STATE_LABELS[state as OdooSaleOrderState];
  return entry ? entry[language] : state;
};
