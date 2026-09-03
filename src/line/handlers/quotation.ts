import type { CommandHandler } from './index';
import { createBotTextFlexMessage, createQuotationJourneyFlexMessage, createQuotationListFlexMessage } from '../templates';
import {
  getSaleOrderById,
  getSaleOrderPortalLink,
  getSaleOrderPdfLink,
  getSaleOrdersForPartner,
  confirmSaleOrder,
  markSaleOrderSent,
  cancelSaleOrder,
  addSaleOrderLine,
  updateSaleOrderLineQty,
  createInvoiceForSaleOrder,
  findProductByQuery,
  getPartnerById,
  getPartnerByPhone,
  type OdooSaleOrder,
} from '../../services/odoo';
import { findVerifiedUserIdByPhone, getUserLanguage, recordAuditEvent } from '../../services/firestore';
import type { UserLanguage } from '../../services/firestore';
import { t } from '../../services/i18n';
import { sendTargetedMessage, sendTargetedFlexMessage } from '../messaging';
import { DEFAULT_CHANNEL_ID } from '../channels';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const inferTone = (value: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = value.toLowerCase();
  if (/failed|error|invalid|not found|not linked|ไม่สำเร็จ|ไม่พบ|ไม่ได้ผูก|ยังไม่ได้ยืนยัน/.test(lower)) return 'error';
  if (/success|approved|sent|confirmed|สำเร็จ|อนุมัติ|ส่งให้ลูกค้า/.test(lower)) return 'success';
  return 'info';
};

const botText = (value: string, language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: inferTone(value),
  });

const adminOnlyReply = (language: UserLanguage) =>
  botText(tr(language, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.'), language);

const notFoundReply = (language: UserLanguage) => botText(t('quoteNotFound', language), language);

// Every journey-card render wants both links together; fetched in parallel
// since they're independent reads (getSaleOrderPdfLink internally calls the
// same get_portal_url as getSaleOrderPortalLink, but that's a cheap,
// idempotent Odoo call — not worth threading the token through by hand).
const getOrderLinks = async (orderId: number): Promise<{ portalLink?: string; pdfLink?: string }> => {
  const [portalLink, pdfLink] = await Promise.all([getSaleOrderPortalLink(orderId), getSaleOrderPdfLink(orderId)]);
  return { portalLink: portalLink || undefined, pdfLink: pdfLink || undefined };
};

const parseOrderId = (text: string, prefix: string): number | null => {
  const raw = text.trim().replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
};

// "<prefix> <orderId> <product>,<qty>" — the orderId is a separate token
// (not part of the CSV payload) since it comes from the prefilled button
// text (`QUOTE ADD <id> `), with the product/qty typed in after it.
const parseOrderIdAndProductQty = (text: string, prefix: string): { orderId: number; productName: string; qty: number } | null => {
  const raw = text.trim().replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
  const firstSpace = raw.indexOf(' ');
  if (firstSpace === -1) return null;

  const orderId = Number(raw.slice(0, firstSpace).trim());
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  const [productNameRaw, qtyRaw] = raw.slice(firstSpace + 1).trim().split(',').map(v => v.trim());
  const productName = productNameRaw || '';
  const qty = Number(qtyRaw || '');
  if (!productName || !Number.isFinite(qty) || qty <= 0 || qty > 10000) return null;

  return { orderId, productName, qty };
};

const usageReply = (language: UserLanguage, example: string) =>
  botText(tr(language, `รูปแบบไม่ถูกต้อง ตัวอย่าง: ${example}`, `That doesn't look right. Example: ${example}`), language);

// Push the customer their order's current card after an admin-side state
// change (e.g. QUOTE CONFIRM) that they weren't the one who triggered.
// Silent no-op — not a failure — when the order has no linked partner or
// that partner hasn't verified with the bot yet (same platform constraint
// as quote-send); best-effort beyond that, since it's a courtesy push on
// top of a state change that already succeeded.
const notifyCustomerOfOrderUpdate = async (order: OdooSaleOrder, channelId: string | undefined): Promise<void> => {
  if (!order.partner_id) return;
  try {
    const partner = await getPartnerById(order.partner_id[0]);
    const customerUserId = partner?.phone ? await findVerifiedUserIdByPhone(partner.phone) : null;
    if (!customerUserId) return;
    const language = await getUserLanguage(customerUserId);
    const { portalLink, pdfLink } = await getOrderLinks(order.id);
    const card = createQuotationJourneyFlexMessage(order, { role: 'customer', portalLink, pdfLink }, language);
    await sendTargetedFlexMessage([customerUserId], card, channelId || DEFAULT_CHANNEL_ID);
  } catch (err) {
    console.warn('notifyCustomerOfOrderUpdate: customer notify failed (non-fatal):', err);
  }
};

// QUOTE STATUS <orderId> — anyone; the journey card's button set adapts to
// whether the requester is an admin or a plain (customer) user.
const quoteStatusHandler: CommandHandler = {
  name: 'quote-status',
  match: (u) => u.startsWith('QUOTE STATUS'),
  handle: async (ctx) => {
    const { userLanguage, profile, text } = ctx;
    const orderId = parseOrderId(text, 'QUOTE STATUS');
    if (!orderId) return [notFoundReply(userLanguage)];

    const order = await getSaleOrderById(orderId);
    if (!order) return [notFoundReply(userLanguage)];

    const role = profile.role === 'admin' ? 'admin' : 'customer';
    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    return [createQuotationJourneyFlexMessage(order, { role, portalLink, pdfLink }, userLanguage)];
  },
};

// QUOTE CONFIRM <orderId> — admin-only, Quotation -> Sales Order.
const quoteConfirmHandler: CommandHandler = {
  name: 'quote-confirm',
  match: (u) => u.startsWith('QUOTE CONFIRM'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const orderId = parseOrderId(text, 'QUOTE CONFIRM');
    if (!orderId) return [notFoundReply(userLanguage)];

    const ok = await confirmSaleOrder(orderId);
    recordAuditEvent({ action: 'quote_confirm', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: String(orderId) });
    if (!ok) {
      return [botText(tr(userLanguage, 'ยืนยันคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่', 'Failed to confirm the order. Please try again.'), userLanguage)];
    }

    // The order state change already succeeded in Odoo at this point (ok
    // was true) — a re-read failure here is a display problem, not a
    // failed confirm, so this must never fall back to notFoundReply (that
    // would tell the admin the order doesn't exist right after they just
    // confirmed it).
    const order = await getSaleOrderById(orderId);
    if (!order) {
      return [botText(tr(userLanguage, `ยืนยันคำสั่งซื้อ #${orderId} สำเร็จแล้ว แต่โหลดรายละเอียดล่าสุดไม่สำเร็จ พิมพ์ QUOTE STATUS ${orderId} เพื่อตรวจสอบอีกครั้ง`, `Order #${orderId} confirmed, but reloading its details failed. Try QUOTE STATUS ${orderId} to check it.`), userLanguage)];
    }

    notifyCustomerOfOrderUpdate(order, channel?.channelId)
      .catch(err => console.warn('quote-confirm: customer notify failed (non-fatal):', err));

    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    return [createQuotationJourneyFlexMessage(order, { role: 'admin', portalLink, pdfLink }, userLanguage)];
  },
};

// QUOTE SEND <orderId> — admin-only. Pushes the customer-facing journey
// card (Approve + View) to whichever LINE user has already verified with
// this order's customer phone. LINE can only message a userId that has
// interacted with the OA before, so a customer who's never messaged the
// bot genuinely cannot be reached here — the admin is told so, not left
// guessing why nothing happened.
const quoteSendHandler: CommandHandler = {
  name: 'quote-send',
  match: (u) => u.startsWith('QUOTE SEND'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const orderId = parseOrderId(text, 'QUOTE SEND');
    if (!orderId) return [notFoundReply(userLanguage)];

    const order = await getSaleOrderById(orderId);
    if (!order || !order.partner_id) return [notFoundReply(userLanguage)];

    const partner = await getPartnerById(order.partner_id[0]);
    const customerUserId = partner?.phone ? await findVerifiedUserIdByPhone(partner.phone) : null;

    if (!customerUserId) {
      recordAuditEvent({ action: 'quote_send', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: String(orderId), detail: 'customer_not_linked' });
      return [botText(t('quoteNotLinked', userLanguage), userLanguage)];
    }

    await markSaleOrderSent(orderId);
    const sentOrder = (await getSaleOrderById(orderId)) || order;
    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    const customerCard = createQuotationJourneyFlexMessage(sentOrder, { role: 'customer', portalLink, pdfLink }, userLanguage);

    // Best-effort: a delivery failure here shouldn't hide the fact that
    // the order was already marked sent in Odoo, so it's logged but not
    // surfaced as a hard failure to the admin beyond the audit record.
    await sendTargetedFlexMessage([customerUserId], customerCard, channel?.channelId || DEFAULT_CHANNEL_ID);

    recordAuditEvent({ action: 'quote_send', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, targetId: String(orderId) });
    return [botText(t('quoteSentToAdmin', userLanguage), userLanguage)];
  },
};

// QUOTE APPROVE <orderId> — the order's own customer only. Authorization
// is checked here, server-side, regardless of which buttons the journey
// card happened to render for this requester — never trust the client.
const quoteApproveHandler: CommandHandler = {
  name: 'quote-approve',
  match: (u) => u.startsWith('QUOTE APPROVE'),
  handle: async (ctx) => {
    const { userLanguage, profile, text } = ctx;
    const orderId = parseOrderId(text, 'QUOTE APPROVE');
    if (!orderId) return [notFoundReply(userLanguage)];

    const order = await getSaleOrderById(orderId);
    if (!order || !order.partner_id) return [notFoundReply(userLanguage)];

    if (!profile.odooPartnerId || profile.odooPartnerId !== order.partner_id[0]) {
      return [botText(t('quoteNotYours', userLanguage), userLanguage)];
    }

    const ok = await confirmSaleOrder(orderId);
    if (!ok) {
      return [botText(tr(userLanguage, 'อนุมัติไม่สำเร็จ กรุณาลองใหม่', 'Approval failed. Please try again.'), userLanguage)];
    }

    const adminUserId = process.env.ADMIN_USER_ID?.trim();
    if (adminUserId) {
      // Best-effort notification back to the salesperson — never blocks
      // the customer's own success reply below.
      sendTargetedMessage(
        [adminUserId],
        tr(userLanguage, `ลูกค้าอนุมัติใบเสนอราคา ${order.name} แล้ว`, `Customer approved quotation ${order.name}.`),
      ).catch(err => console.warn('quote-approve: admin notify failed (non-fatal):', err));
    }

    return [botText(t('quoteApproved', userLanguage), userLanguage)];
  },
};

// QUOTE ADD <orderId> <product>,<qty> — admin-only. Appends a new line to a
// draft/sent order. Normally reached via the journey card's "Add item"
// button, which opens the keyboard prefilled with "QUOTE ADD <id> " for the
// admin to complete — see createPrefillButton in templates.ts.
const quoteAddHandler: CommandHandler = {
  name: 'quote-add',
  match: (u) => u.startsWith('QUOTE ADD'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const parsed = parseOrderIdAndProductQty(text, 'QUOTE ADD');
    if (!parsed) return [usageReply(userLanguage, 'QUOTE ADD 17 Widget,2')];

    const product = await findProductByQuery(parsed.productName);
    if (!product) {
      return [botText(tr(userLanguage, `ไม่พบสินค้าที่ตรงกับ "${parsed.productName}"`, `No product matched "${parsed.productName}".`), userLanguage)];
    }

    const ok = await addSaleOrderLine(parsed.orderId, product.id, parsed.qty);
    recordAuditEvent({ action: 'quote_add_line', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: String(parsed.orderId), detail: `${product.id}x${parsed.qty}` });
    if (!ok) {
      return [botText(tr(userLanguage, 'เพิ่มรายการไม่สำเร็จ กรุณาลองใหม่', 'Failed to add the item. Please try again.'), userLanguage)];
    }

    const order = await getSaleOrderById(parsed.orderId);
    if (!order) return [notFoundReply(userLanguage)];

    notifyCustomerOfOrderUpdate(order, channel?.channelId)
      .catch(err => console.warn('quote-add: customer notify failed (non-fatal):', err));

    const { portalLink, pdfLink } = await getOrderLinks(parsed.orderId);
    return [createQuotationJourneyFlexMessage(order, { role: 'admin', portalLink, pdfLink }, userLanguage)];
  },
};

// QUOTE EDIT <orderId> <product>,<qty> — admin-only. Updates the quantity of
// an *existing* line matching that product; doesn't add a new one (use
// QUOTE ADD for that).
const quoteEditHandler: CommandHandler = {
  name: 'quote-edit',
  match: (u) => u.startsWith('QUOTE EDIT'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const parsed = parseOrderIdAndProductQty(text, 'QUOTE EDIT');
    if (!parsed) return [usageReply(userLanguage, 'QUOTE EDIT 17 Widget,3')];

    const product = await findProductByQuery(parsed.productName);
    if (!product) {
      return [botText(tr(userLanguage, `ไม่พบสินค้าที่ตรงกับ "${parsed.productName}"`, `No product matched "${parsed.productName}".`), userLanguage)];
    }

    const ok = await updateSaleOrderLineQty(parsed.orderId, product.id, parsed.qty);
    recordAuditEvent({ action: 'quote_edit_line', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: String(parsed.orderId), detail: `${product.id}x${parsed.qty}` });
    if (!ok) {
      return [botText(tr(
        userLanguage,
        `ไม่พบ "${parsed.productName}" ในใบเสนอราคานี้ ใช้ QUOTE ADD เพื่อเพิ่มรายการใหม่แทน`,
        `"${parsed.productName}" isn't already on this quote. Use QUOTE ADD to add it as a new item instead.`,
      ), userLanguage)];
    }

    const order = await getSaleOrderById(parsed.orderId);
    if (!order) return [notFoundReply(userLanguage)];

    notifyCustomerOfOrderUpdate(order, channel?.channelId)
      .catch(err => console.warn('quote-edit: customer notify failed (non-fatal):', err));

    const { portalLink, pdfLink } = await getOrderLinks(parsed.orderId);
    return [createQuotationJourneyFlexMessage(order, { role: 'admin', portalLink, pdfLink }, userLanguage)];
  },
};

// QUOTE CANCEL <orderId> — admin-only, single-tap. Odoo's own cancel is
// reversible (reset to draft in Odoo web) — not exposed as a LINE command
// since it's outside this journey's scope.
const quoteCancelHandler: CommandHandler = {
  name: 'quote-cancel',
  match: (u) => u.startsWith('QUOTE CANCEL'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const orderId = parseOrderId(text, 'QUOTE CANCEL');
    if (!orderId) return [notFoundReply(userLanguage)];

    const ok = await cancelSaleOrder(orderId);
    recordAuditEvent({ action: 'quote_cancel', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: String(orderId) });
    if (!ok) {
      return [botText(tr(userLanguage, 'ยกเลิกใบเสนอราคาไม่สำเร็จ กรุณาลองใหม่', 'Failed to cancel the quotation. Please try again.'), userLanguage)];
    }

    const order = await getSaleOrderById(orderId);
    if (!order) {
      return [botText(tr(userLanguage, `ยกเลิกใบเสนอราคา #${orderId} สำเร็จแล้ว แต่โหลดรายละเอียดล่าสุดไม่สำเร็จ`, `Quotation #${orderId} cancelled, but reloading its details failed.`), userLanguage)];
    }

    notifyCustomerOfOrderUpdate(order, channel?.channelId)
      .catch(err => console.warn('quote-cancel: customer notify failed (non-fatal):', err));

    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    return [createQuotationJourneyFlexMessage(order, { role: 'admin', portalLink, pdfLink }, userLanguage)];
  },
};

// QUOTE INVOICE <orderId> — admin-only, single-tap. Only meaningful once
// the order is confirmed and has something left to invoice (mirrors Odoo
// web's own Create Invoice button condition: invoice_status === 'to invoice').
const quoteInvoiceHandler: CommandHandler = {
  name: 'quote-invoice',
  match: (u) => u.startsWith('QUOTE INVOICE'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const orderId = parseOrderId(text, 'QUOTE INVOICE');
    if (!orderId) return [notFoundReply(userLanguage)];

    const existing = await getSaleOrderById(orderId);
    if (!existing) return [notFoundReply(userLanguage)];
    if (existing.state !== 'sale' || existing.invoice_status !== 'to invoice') {
      return [botText(tr(userLanguage, 'ใบเสนอราคานี้ยังไม่พร้อมออกใบแจ้งหนี้ (ต้องยืนยันคำสั่งซื้อก่อน)', 'This quotation isn\'t ready to invoice yet (it needs to be confirmed first, or is already fully invoiced).'), userLanguage)];
    }

    const ok = await createInvoiceForSaleOrder(orderId);
    recordAuditEvent({ action: 'quote_invoice', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: String(orderId) });
    if (!ok) {
      return [botText(tr(userLanguage, 'สร้างใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่', 'Failed to create the invoice. Please try again.'), userLanguage)];
    }

    const order = await getSaleOrderById(orderId);
    if (!order) {
      return [botText(tr(userLanguage, `สร้างใบแจ้งหนี้สำหรับ #${orderId} สำเร็จแล้ว แต่โหลดรายละเอียดล่าสุดไม่สำเร็จ`, `Invoice created for #${orderId}, but reloading its details failed.`), userLanguage)];
    }

    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    return [createQuotationJourneyFlexMessage(order, { role: 'admin', portalLink, pdfLink }, userLanguage)];
  },
};

// QUOTE LIST [phone] — "my quotations". No phone: the requester's own
// orders (customer's own profile.odooPartnerId — same identity source
// quoteApproveHandler's authorization check relies on). With a phone:
// admin-only lookup of someone else's orders, same phone->partner
// resolution commerce.ts already uses for DEMO QUOTE's admin path.
const quoteListHandler: CommandHandler = {
  name: 'quote-list',
  match: (u) => u === 'QUOTE LIST' || u.startsWith('QUOTE LIST '),
  handle: async (ctx) => {
    const { userLanguage, profile, text } = ctx;
    const phoneArg = text.trim().replace(/^QUOTE LIST\s*/i, '').trim();

    let partnerId: number | undefined;
    if (phoneArg) {
      if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];
      const partner = await getPartnerByPhone(phoneArg);
      partnerId = partner?.id;
    } else {
      partnerId = profile.odooPartnerId;
    }

    if (!partnerId) {
      return [botText(t('quoteNotLinked', userLanguage), userLanguage)];
    }

    // Fetch one extra beyond the display cap purely to detect "there's
    // more" — no pagination in this pass, so an exact total isn't needed.
    const DISPLAY_LIMIT = 8;
    const fetched = await getSaleOrdersForPartner(partnerId, DISPLAY_LIMIT + 1);
    const hasMore = fetched.length > DISPLAY_LIMIT;
    return [createQuotationListFlexMessage(fetched.slice(0, DISPLAY_LIMIT), hasMore, userLanguage)];
  },
};

export const quotationHandlers: CommandHandler[] = [
  quoteStatusHandler,
  quoteConfirmHandler,
  quoteSendHandler,
  quoteApproveHandler,
  quoteAddHandler,
  quoteEditHandler,
  quoteCancelHandler,
  quoteInvoiceHandler,
  quoteListHandler,
];
