import type { CommandHandler } from './index';
import { createBotTextFlexMessage, createFormPromptFlexMessage, createQuotationEditFlexMessage, createQuotationJourneyFlexMessage, createQuotationListFlexMessage, createQuotationMoreFlexMessage, createQuoteSendComposerFlexMessage } from '../templates';
import { DEFAULT_CHANNEL_ID, getBrandTitle } from '../channels';
import {
  getSaleOrderById,
  getSaleOrderPortalLink,
  getSaleOrderPdfLink,
  getSaleOrdersForPartner,
  markSaleOrderSent,
  findSaleOrderLineByProduct,
} from '../../services/odoo/sales';
import {
  findProductByQuery,
} from '../../services/odoo/catalog';
import {
  getPartnerById,
  getPartnerByPhone,
} from '../../services/odoo/partners';
import type { OdooSaleOrder } from '../../services/odoo/types';
import { recordAuditEvent, saveApprovalRecord, setLastQuoteListFrom, setUserPendingFlow, transitionStoredApproval, getUserLanguage } from '../../services/firestore';
import type { UserLanguage, UserProfile } from '../../services/firestore';
import { createApprovalRecord } from '../../services/approval-policy';
import { t } from '../../services/i18n';
import { sendTargetedFlexMessage } from '../messaging';
import { notifyQuoteParties, resolveCustomerLineUserId, type QuoteSendChannel } from '../quote-notify';
import { getErpAdapter } from '../../erp/registry';
import { decodeQuoteListCursor, encodeQuoteListCursor } from '../quote-list-cursor';
import { FLOW_SPECS } from '../../services/guided-forms';
import { canManageQuoteLines, isQuoteStaff, quoteJourneyRole, syncStaffProfile } from '../quote-access';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const inferTone = (value: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = value.toLowerCase();
  if (/failed|error|invalid|not found|not linked|ไม่สำเร็จ|ไม่พบ|ไม่ได้ผูก|ยังไม่ได้ยืนยัน/.test(lower)) return 'error';
  if (/success|approved|sent|confirmed|สำเร็จ|อนุมัติ|ส่งให้ลูกค้า/.test(lower)) return 'success';
  return 'info';
};

const botText = (value: string, language: UserLanguage, actions?: { label: string; text: string; style?: 'primary' | 'secondary' }[]) =>
  createBotTextFlexMessage({
    title: getBrandTitle(language),
    body: value,
    language,
    tone: inferTone(value),
    actions,
  });

const statusRetryActions = (orderId: number, language: UserLanguage) => [
  { label: t('retryStatus', language), text: `QUOTE STATUS ${orderId}`, style: 'primary' as const },
];

const adminOnlyReply = (language: UserLanguage) =>
  botText(tr(language, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.'), language);

const staffOnlyReply = (language: UserLanguage) =>
  botText(tr(language, 'คำสั่งนี้สำหรับพนักงานขาย', 'This action is for sales users.'), language);

const staffCardOptions = (profile: UserProfile, links: { portalLink?: string; pdfLink?: string }) => ({
  role: quoteJourneyRole(profile),
  salesTier: profile.salesTier,
  canManageLines: canManageQuoteLines(profile),
  ...links,
});

const notFoundReply = (language: UserLanguage) => botText(t('quoteNotFound', language), language);

// Every journey-card render wants both links together; fetched in parallel
// since they're independent reads (getSaleOrderPdfLink internally calls the
// same get_portal_url as getSaleOrderPortalLink, but that's a cheap,
// idempotent Odoo call — not worth threading the token through by hand).
const getOrderLinks = async (orderId: number): Promise<{ portalLink?: string; pdfLink?: string }> => {
  const [portalLink, pdfLink] = await Promise.all([getSaleOrderPortalLink(orderId), getSaleOrderPdfLink(orderId)]);
  return { portalLink: portalLink || undefined, pdfLink: pdfLink || undefined };
};

// Exported for direct unit testing (same rationale as command-validators.ts's
// parsers) — pure functions, no need to exercise them through a full
// CommandHandler.handle() call with mocked Odoo/Firestore.
export const parseOrderId = (text: string, prefix: string): number | null => {
  const raw = text.trim().replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
  const first = raw.split(/\s+/)[0] || '';
  const id = Number(first);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const isEmailLike = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const parseOrderIdAndOptionalEmail = (text: string, prefix: string): { orderId: number; channel: QuoteSendChannel; email?: string } | null => {
  const raw = text.trim().replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
  const [idRaw, ...rest] = raw.split(/\s+/);
  const orderId = Number(idRaw);
  if (!Number.isFinite(orderId) || orderId <= 0) return null;
  if (!rest.length) return { orderId, channel: 'both' };

  const first = rest[0].toLowerCase();
  if (first === 'line' || first === 'email' || first === 'both') {
    const email = rest.slice(1).join(' ').trim();
    if (email && !isEmailLike(email)) return null;
    return { orderId, channel: first, ...(email ? { email: email.toLowerCase() } : {}) };
  }

  const email = rest.join(' ').trim();
  if (!isEmailLike(email)) return null;
  return { orderId, channel: 'both', email: email.toLowerCase() };
};

// "<prefix> <orderId> <product>,<qty>" — the orderId is a separate token
// (not part of the CSV payload) since it comes from the prefilled button
// text (`QUOTE ADD <id> `), with the product/qty typed in after it.
export const parseOrderIdAndProductQty = (text: string, prefix: string): { orderId: number; productName: string; qty: number } | null => {
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

// "<prefix> <orderId> <product>" — no qty, no comma-split payload (unlike
// parseOrderIdAndProductQty): the whole remainder after the orderId is the
// product name/query, used by QUOTE REMOVE to delete a line entirely.
export const parseOrderIdAndProductName = (text: string, prefix: string): { orderId: number; productName: string } | null => {
  const raw = text.trim().replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
  const firstSpace = raw.indexOf(' ');
  if (firstSpace === -1) return null;

  const orderId = Number(raw.slice(0, firstSpace).trim());
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  const productName = raw.slice(firstSpace + 1).trim();
  if (!productName) return null;

  return { orderId, productName };
};

// "<prefix> <orderId> <free-text message>" — unlike parseOrderIdAndProductQty,
// the remainder is arbitrary text (a message to the customer), not a
// comma-split payload.
const parseOrderIdAndMessage = (text: string, prefix: string): { orderId: number; message: string } | null => {
  const raw = text.trim().replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
  const firstSpace = raw.indexOf(' ');
  if (firstSpace === -1) return null;

  const orderId = Number(raw.slice(0, firstSpace).trim());
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  const message = raw.slice(firstSpace + 1).trim();
  if (!message) return null;

  return { orderId, message };
};

// Push the customer their order's current card after an admin-side state
// change (e.g. QUOTE CONFIRM) that they weren't the one who triggered.
// Silent no-op — not a failure — when the order has no linked partner or
// that partner hasn't verified with the bot yet (same platform constraint
// as quote-send); best-effort beyond that, since it's a courtesy push on
// top of a state change that already succeeded.
const sendChannelSummary = (
  language: UserLanguage,
  result: { customerLineId: string | null; emailed: boolean },
  wanted: QuoteSendChannel,
): string => {
  const lineOk = Boolean(result.customerLineId);
  const emailOk = result.emailed;
  if (wanted === 'line' && !lineOk) return t('quoteNotLinked', language);
  if (wanted === 'email' && !emailOk) return t('noPartnerEmail', language);
  if (!lineOk && !emailOk) return t('quoteNotLinked', language);
  if (lineOk && emailOk) return t('sentViaBoth', language);
  if (lineOk) return t('sentViaLine', language);
  return t('sentViaEmail', language);
};

const notifyCustomerOfOrderUpdate = async (order: OdooSaleOrder, channelId: string | undefined, actorUserId?: string): Promise<void> => {
  await notifyQuoteParties({ order, channelId, actorUserId });
};

// QUOTE STATUS <orderId> — anyone; the journey card's button set adapts to
// whether the requester is an admin or a plain (customer) user.
const quoteStatusHandler: CommandHandler = {
  name: 'quote-status',
  match: (u) => u.startsWith('QUOTE STATUS'),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const orderId = parseOrderId(text, 'QUOTE STATUS');
    if (!orderId) return [notFoundReply(userLanguage)];

    const order = await getSaleOrderById(orderId);
    if (!order) return [notFoundReply(userLanguage)];

    const profile = await syncStaffProfile(ctx.userId, ctx.profile);
    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    return [createQuotationJourneyFlexMessage(order, staffCardOptions(profile, { portalLink, pdfLink }), userLanguage)];
  },
};

// QUOTE CONFIRM <orderId> — sales staff, Quotation -> Sales Order.
const quoteConfirmHandler: CommandHandler = {
  name: 'quote-confirm',
  match: (u) => u.startsWith('QUOTE CONFIRM'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];

    const orderId = parseOrderId(text, 'QUOTE CONFIRM');
    if (!orderId) return [notFoundReply(userLanguage)];

    const ok = await getErpAdapter().confirmOrder(orderId);
    recordAuditEvent({ action: 'quote_confirm', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(orderId) });
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
      return [botText(
        tr(userLanguage, `ยืนยันคำสั่งซื้อ #${orderId} สำเร็จแล้ว แต่โหลดรายละเอียดล่าสุดไม่สำเร็จ`, `Order #${orderId} confirmed, but reloading its details failed.`),
        userLanguage,
        statusRetryActions(orderId, userLanguage),
      )];
    }

    notifyCustomerOfOrderUpdate(order, channel?.channelId, userId)
      .catch(err => console.warn('quote-confirm: customer notify failed (non-fatal):', err));

    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    return [createQuotationJourneyFlexMessage(order, staffCardOptions(profile, { portalLink, pdfLink }), userLanguage)];
  },
};

// QUOTE SEND OPTIONS <orderId> — email / LINE / both composer (More).
const quoteSendOptionsHandler: CommandHandler = {
  name: 'quote-send-options',
  match: (u) => u.startsWith('QUOTE SEND OPTIONS'),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const profile = await syncStaffProfile(ctx.userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];
    const orderId = parseOrderId(text, 'QUOTE SEND OPTIONS');
    if (!orderId) return [notFoundReply(userLanguage)];
    const order = await getSaleOrderById(orderId);
    if (!order || !order.partner_id) return [notFoundReply(userLanguage)];
    const partner = await getPartnerById(order.partner_id[0]);
    return [createQuoteSendComposerFlexMessage(order, partner?.email, userLanguage, 'quotation', partner?.phone)];
  },
};

// QUOTE SEND <orderId> — staff footer Send. Marks Odoo sent and pushes the
// customer Flex (Approve, View Quote, Download PDF) so the bar can move to
// Quotation Sent. Confirm on the same row still converts to Sales Order.
const quoteSendHandler: CommandHandler = {
  name: 'quote-send',
  match: (u) => u.startsWith('QUOTE SEND') && !u.startsWith('QUOTE SEND CONFIRM') && !u.startsWith('QUOTE SEND OPTIONS'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];
    const orderId = parseOrderId(text, 'QUOTE SEND');
    if (!orderId) return [notFoundReply(userLanguage)];
    const order = await getSaleOrderById(orderId);
    if (!order || !order.partner_id) return [notFoundReply(userLanguage)];

    await markSaleOrderSent(orderId);
    const sentOrder = (await getSaleOrderById(orderId)) || { ...order, state: 'sent' };
    const result = await notifyQuoteParties({
      order: sentOrder,
      channelId: channel?.channelId,
      actorUserId: userId,
      viaLine: true,
    });
    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    recordAuditEvent({
      action: 'quote_send',
      outcome: result.customerLineId ? 'success' : 'failure',
      actorUserId: userId,
      channelId: channel?.channelId,
      requestId,
      targetId: String(orderId),
      detail: `line:${result.customerLineId ? 'line' : 'no_line'}`,
    });
    return [
      botText(sendChannelSummary(userLanguage, result, 'line'), userLanguage),
      createQuotationJourneyFlexMessage(sentOrder, staffCardOptions(profile, { portalLink, pdfLink }), userLanguage),
    ];
  },
};

const quoteSendConfirmHandler: CommandHandler = {
  name: 'quote-send-confirm',
  match: (u) => u.startsWith('QUOTE SEND CONFIRM'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];

    const parsed = parseOrderIdAndOptionalEmail(text, 'QUOTE SEND CONFIRM');
    if (!parsed) return [notFoundReply(userLanguage)];
    const { orderId, channel: sendChannel } = parsed;

    const order = await getSaleOrderById(orderId);
    if (!order || !order.partner_id) return [notFoundReply(userLanguage)];

    const partner = await getPartnerById(order.partner_id[0]);
    const sendEmailAddr = parsed.email || partner?.email;
    if (parsed.email && partner && parsed.email !== partner.email) {
      await getErpAdapter().updateCustomer(partner.id, { email: parsed.email });
    }

    await markSaleOrderSent(orderId);
    const sentOrder = (await getSaleOrderById(orderId)) || order;
    const viaLine = sendChannel !== 'email';
    const viaEmail = sendChannel !== 'line';
    const result = await notifyQuoteParties({
      order: sentOrder,
      channelId: channel?.channelId,
      actorUserId: userId,
      viaLine,
      email: viaEmail && sendEmailAddr ? {
        to: sendEmailAddr,
        subject: userLanguage === 'en' ? `Quotation ${order.name}` : `ใบเสนอราคา ${order.name}`,
        body: userLanguage === 'en'
          ? `Please review quotation ${order.name}. Confirm in LINE to proceed.`
          : `กรุณาตรวจสอบใบเสนอราคา ${order.name} ยืนยันใน LINE เพื่อดำเนินการต่อ`,
      } : undefined,
    });

    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    recordAuditEvent({
      action: 'quote_send',
      outcome: result.customerLineId || result.emailed ? 'success' : 'failure',
      actorUserId: userId,
      channelId: channel?.channelId,
      requestId,
      targetId: String(orderId),
      detail: `${sendChannel}:${result.customerLineId ? 'line' : 'no_line'}:${result.emailed ? 'email' : 'no_email'}`,
    });

    return [
      botText(sendChannelSummary(userLanguage, result, sendChannel), userLanguage),
      createQuotationJourneyFlexMessage(sentOrder, staffCardOptions(profile, { portalLink, pdfLink }), userLanguage),
    ];
  },
};

const quoteMoreHandler: CommandHandler = {
  name: 'quote-more',
  match: (u) => u.startsWith('QUOTE MORE'),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const profile = await syncStaffProfile(ctx.userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];
    const orderId = parseOrderId(text, 'QUOTE MORE');
    if (!orderId) return [notFoundReply(userLanguage)];
    const order = await getSaleOrderById(orderId);
    if (!order) return [notFoundReply(userLanguage)];
    return [createQuotationMoreFlexMessage(order, { salesTier: profile.salesTier }, userLanguage)];
  },
};

const quoteLinesHandler: CommandHandler = {
  name: 'quote-lines',
  match: (u) => u.startsWith('QUOTE LINES'),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const profile = await syncStaffProfile(ctx.userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];
    const orderId = parseOrderId(text, 'QUOTE LINES');
    if (!orderId) return [notFoundReply(userLanguage)];
    const order = await getSaleOrderById(orderId);
    if (!order) return [notFoundReply(userLanguage)];
    if (order.state === 'cancel' || order.state === 'sale') {
      return [botText(tr(userLanguage, 'แก้ไขใบเสนอราคานี้ไม่ได้แล้ว', 'This quote can no longer be edited.'), userLanguage)];
    }
    return [createQuotationEditFlexMessage(order, userLanguage)];
  },
};

// QUOTE APPROVE <orderId> — the order's own customer only. Authorization
// is checked here, server-side, regardless of which buttons the journey
// card happened to render for this requester — never trust the client.
const quoteApproveHandler: CommandHandler = {
  name: 'quote-approve',
  match: (u) => u.startsWith('QUOTE APPROVE'),
  handle: async (ctx) => {
    const { userLanguage, profile, text, userId, channel } = ctx;
    const orderId = parseOrderId(text, 'QUOTE APPROVE');
    if (!orderId) return [notFoundReply(userLanguage)];

    const order = await getSaleOrderById(orderId);
    if (!order || !order.partner_id) return [notFoundReply(userLanguage)];

    if (!profile.odooPartnerId || profile.odooPartnerId !== order.partner_id[0]) {
      return [botText(t('quoteNotYours', userLanguage), userLanguage)];
    }

    const ok = await getErpAdapter().confirmOrder(orderId);
    if (!ok) {
      // Success is audited via the approval_requested/approved/completed
      // chain below (Track A2's own audit record, not a second store) — but
      // a failed confirmOrder never reaches that chain, so it needs its own
      // event here or a failed approval attempt would be entirely unaudited.
      recordAuditEvent({ action: 'quote_approve', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, requestId: ctx.requestId, targetId: String(orderId) });
      return [botText(tr(userLanguage, 'อนุมัติไม่สำเร็จ กรุณาลองใหม่', 'Approval failed. Please try again.'), userLanguage)];
    }

    const adminUserId = process.env.ADMIN_USER_ID?.trim();
    const approvalRecord = createApprovalRecord({
      id: `quote-approval-${orderId}`,
      actorUserId: adminUserId || 'odoo-approval',
      commandId: 'QUOTE_APPROVE',
      targetId: String(orderId),
      channelId: channel?.channelId || DEFAULT_CHANNEL_ID,
    });
    const savedApproval = await saveApprovalRecord(approvalRecord, { requestId: ctx.requestId });
    if (savedApproval.ok) {
      await transitionStoredApproval(approvalRecord.id, { type: 'approve', approverUserId: userId }, new Date(), { requestId: ctx.requestId });
      await transitionStoredApproval(approvalRecord.id, { type: 'complete' }, new Date(), { requestId: ctx.requestId });
    } else {
      // The Odoo confirm already succeeded (ok === true) at this point —
      // the approval-record bookkeeping failing separately shouldn't leave
      // that real mutation completely unaudited.
      recordAuditEvent({ action: 'quote_approve', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, requestId: ctx.requestId, targetId: String(orderId), detail: 'approval_record_save_failed' });
    }
    const confirmed = (await getSaleOrderById(orderId)) || order;
    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    notifyQuoteParties({ order: confirmed, channelId: channel?.channelId, actorUserId: userId, notifyCustomer: false })
      .catch(err => console.warn('quote-approve: sales notify failed (non-fatal):', err));

    return [
      botText(t('quoteApproved', userLanguage), userLanguage),
      createQuotationJourneyFlexMessage(confirmed, { role: 'customer', portalLink, pdfLink }, userLanguage),
    ];
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
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];

    const parsed = parseOrderIdAndProductQty(text, 'QUOTE ADD');
    if (!parsed) return [usageReply(userLanguage, 'QUOTE ADD 17 Widget,2')];

    const product = await findProductByQuery(parsed.productName);
    if (!product) {
      return [botText(tr(userLanguage, `ไม่พบสินค้าที่ตรงกับ "${parsed.productName}"`, `No product matched "${parsed.productName}".`), userLanguage)];
    }

    // Odoo web itself doesn't merge a re-added product into its existing
    // line either, but a second, separate line for the same product on
    // one quote is confusing for a sales user (and easy to create by
    // accident via QUOTE ADD) — point at QUOTE EDIT instead, which already
    // exists specifically for changing an existing line's quantity.
    const existingLine = await findSaleOrderLineByProduct(parsed.orderId, product.id);
    if (existingLine) {
      return [botText(tr(
        userLanguage,
        `"${product.name}" มีอยู่ในใบเสนอราคานี้แล้ว (จำนวน ${existingLine.qty}) ใช้ QUOTE EDIT เพื่อแก้ไขจำนวนแทน`,
        `"${product.name}" is already on this quote (qty ${existingLine.qty}). Use QUOTE EDIT to change its quantity instead.`,
      ), userLanguage)];
    }

    const ok = await getErpAdapter().addQuoteLine(parsed.orderId, product.id, parsed.qty);
    recordAuditEvent({ action: 'quote_add_line', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(parsed.orderId), detail: `${product.id}x${parsed.qty}` });
    if (!ok) {
      return [botText(tr(userLanguage, 'เพิ่มรายการไม่สำเร็จ กรุณาลองใหม่', 'Failed to add the item. Please try again.'), userLanguage)];
    }

    const order = await getSaleOrderById(parsed.orderId);
    if (!order) return [notFoundReply(userLanguage)];

    notifyCustomerOfOrderUpdate(order, channel?.channelId, userId)
      .catch(err => console.warn('quote-add: customer notify failed (non-fatal):', err));

    return [createQuotationEditFlexMessage(order, userLanguage)];
  },
};

// QUOTE EDIT <orderId> <product>,<qty> — admin-only. Updates the quantity of
// an *existing* line matching that product; doesn't add a new one (use
// QUOTE ADD for that).
const quoteEditHandler: CommandHandler = {
  name: 'quote-edit',
  match: (u) => u.startsWith('QUOTE EDIT'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];

    const parsed = parseOrderIdAndProductQty(text, 'QUOTE EDIT');
    if (!parsed) return [usageReply(userLanguage, 'QUOTE EDIT 17 Widget,3')];

    const product = await findProductByQuery(parsed.productName);
    if (!product) {
      return [botText(tr(userLanguage, `ไม่พบสินค้าที่ตรงกับ "${parsed.productName}"`, `No product matched "${parsed.productName}".`), userLanguage)];
    }

    const ok = await getErpAdapter().editQuoteLine(parsed.orderId, product.id, parsed.qty);
    recordAuditEvent({ action: 'quote_edit_line', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(parsed.orderId), detail: `${product.id}x${parsed.qty}` });
    if (!ok) {
      return [botText(tr(
        userLanguage,
        `ไม่พบ "${parsed.productName}" ในใบเสนอราคานี้ ใช้ QUOTE ADD เพื่อเพิ่มรายการใหม่แทน`,
        `"${parsed.productName}" isn't already on this quote. Use QUOTE ADD to add it as a new item instead.`,
      ), userLanguage)];
    }

    const order = await getSaleOrderById(parsed.orderId);
    if (!order) return [notFoundReply(userLanguage)];

    notifyCustomerOfOrderUpdate(order, channel?.channelId, userId)
      .catch(err => console.warn('quote-edit: customer notify failed (non-fatal):', err));

    return [createQuotationEditFlexMessage(order, userLanguage)];
  },
};

// QUOTE REMOVE <orderId> <product> — admin-only. Deletes an existing line
// entirely (mirrors Odoo web's own line-delete), as opposed to QUOTE EDIT
// which only changes a quantity. Day-to-day sales action, same as
// Add/Edit — not manager-restricted the way Cancel/Invoice are.
const quoteRemoveHandler: CommandHandler = {
  name: 'quote-remove',
  match: (u) => u.startsWith('QUOTE REMOVE'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];

    const parsed = parseOrderIdAndProductName(text, 'QUOTE REMOVE');
    if (!parsed) return [usageReply(userLanguage, 'QUOTE REMOVE 17 Widget')];

    const product = await findProductByQuery(parsed.productName);
    if (!product) {
      return [botText(tr(userLanguage, `ไม่พบสินค้าที่ตรงกับ "${parsed.productName}"`, `No product matched "${parsed.productName}".`), userLanguage)];
    }

    const ok = await getErpAdapter().removeQuoteLine(parsed.orderId, product.id);
    recordAuditEvent({ action: 'quote_remove_line', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(parsed.orderId), detail: String(product.id) });
    if (!ok) {
      return [botText(tr(
        userLanguage,
        `ไม่พบ "${parsed.productName}" ในใบเสนอราคานี้ หรือไม่สามารถลบได้ในขณะนี้`,
        `"${parsed.productName}" isn't on this quote, or it can't be removed right now.`,
      ), userLanguage)];
    }

    const order = await getSaleOrderById(parsed.orderId);
    if (!order) return [notFoundReply(userLanguage)];

    notifyCustomerOfOrderUpdate(order, channel?.channelId, userId)
      .catch(err => console.warn('quote-remove: customer notify failed (non-fatal):', err));

    return [createQuotationEditFlexMessage(order, userLanguage)];
  },
};

// QUOTE CANCEL <orderId> — admin-only, single-tap. Odoo's own cancel is
// reversible (reset to draft in Odoo web) — not exposed as a LINE command
// since it's outside this journey's scope.
const quoteCancelHandler: CommandHandler = {
  name: 'quote-cancel',
  match: (u) => u.startsWith('QUOTE CANCEL'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];
    // Manager-level action per Odoo's own convention — never trust which
    // buttons the client happened to render (same discipline as QUOTE
    // APPROVE's partner-id check). Undefined tier (no linked Odoo user,
    // today's default) keeps today's behavior; only an explicitly-resolved
    // 'salesperson' is restricted.
    if (profile.salesTier === 'salesperson') {
      recordAuditEvent({ action: 'quote_cancel', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, detail: 'sales_tier_restricted' });
      return [botText(tr(userLanguage, 'การยกเลิกใบเสนอราคาต้องได้รับสิทธิ์ระดับผู้จัดการฝ่ายขาย', 'Cancelling a quotation requires sales-manager-level access.'), userLanguage)];
    }

    const orderId = parseOrderId(text, 'QUOTE CANCEL');
    if (!orderId) return [notFoundReply(userLanguage)];

    const ok = await getErpAdapter().cancelQuote(orderId);
    recordAuditEvent({ action: 'quote_cancel', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(orderId) });
    if (!ok) {
      return [botText(tr(userLanguage, 'ยกเลิกใบเสนอราคาไม่สำเร็จ กรุณาลองใหม่', 'Failed to cancel the quotation. Please try again.'), userLanguage)];
    }

    const order = await getSaleOrderById(orderId);
    if (!order) {
      return [botText(
        tr(userLanguage, `ยกเลิกใบเสนอราคา #${orderId} สำเร็จแล้ว แต่โหลดรายละเอียดล่าสุดไม่สำเร็จ`, `Quotation #${orderId} cancelled, but reloading its details failed.`),
        userLanguage,
        statusRetryActions(orderId, userLanguage),
      )];
    }

    notifyCustomerOfOrderUpdate(order, channel?.channelId, userId)
      .catch(err => console.warn('quote-cancel: customer notify failed (non-fatal):', err));

    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    return [createQuotationJourneyFlexMessage(order, staffCardOptions(profile, { portalLink, pdfLink }), userLanguage)];
  },
};

const quoteInvoiceSendHandler: CommandHandler = {
  name: 'quote-invoice-send',
  match: (u) => u.startsWith('QUOTE INVOICE SEND') && !u.startsWith('QUOTE INVOICE SEND CONFIRM'),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const profile = await syncStaffProfile(ctx.userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];
    const orderId = parseOrderId(text, 'QUOTE INVOICE SEND');
    if (!orderId) return [notFoundReply(userLanguage)];
    const order = await getSaleOrderById(orderId);
    if (!order || order.state !== 'sale' || !order.partner_id) return [notFoundReply(userLanguage)];
    const partner = await getPartnerById(order.partner_id[0]);
    return [createQuoteSendComposerFlexMessage(order, partner?.email, userLanguage, 'invoice', partner?.phone)];
  },
};

const quoteInvoiceSendConfirmHandler: CommandHandler = {
  name: 'quote-invoice-send-confirm',
  match: (u) => u.startsWith('QUOTE INVOICE SEND CONFIRM'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];

    const parsed = parseOrderIdAndOptionalEmail(text, 'QUOTE INVOICE SEND CONFIRM');
    if (!parsed) return [notFoundReply(userLanguage)];
    const { orderId, channel: sendChannel } = parsed;

    const order = await getSaleOrderById(orderId);
    if (!order || order.state !== 'sale' || !order.partner_id) return [notFoundReply(userLanguage)];

    if (order.invoice_status === 'to invoice') {
      const created = await getErpAdapter().createInvoice(orderId);
      if (!created) {
        return [botText(tr(userLanguage, 'สร้างใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่', 'Failed to create the invoice. Please try again.'), userLanguage)];
      }
    }

    const partner = await getPartnerById(order.partner_id[0]);
    const sendEmailAddr = parsed.email || partner?.email;
    if (parsed.email && partner && parsed.email !== partner.email) {
      await getErpAdapter().updateCustomer(partner.id, { email: parsed.email });
    }

    const invoicedOrder = (await getSaleOrderById(orderId)) || order;
    const viaLine = sendChannel !== 'email';
    const viaEmail = sendChannel !== 'line';
    const result = await notifyQuoteParties({
      order: invoicedOrder,
      channelId: channel?.channelId,
      actorUserId: userId,
      viaLine,
      email: viaEmail && sendEmailAddr ? {
        to: sendEmailAddr,
        subject: userLanguage === 'en' ? `Invoice ${order.name}` : `ใบแจ้งหนี้ ${order.name}`,
        body: userLanguage === 'en'
          ? `Please review invoice ${order.name}.`
          : `กรุณาตรวจสอบใบแจ้งหนี้ ${order.name}`,
      } : undefined,
    });

    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    recordAuditEvent({
      action: 'quote_invoice',
      outcome: result.customerLineId || result.emailed ? 'success' : 'failure',
      actorUserId: userId,
      channelId: channel?.channelId,
      requestId,
      targetId: String(orderId),
      detail: `${sendChannel}:${result.customerLineId ? 'line' : 'no_line'}:${result.emailed ? 'email' : 'no_email'}`,
    });

    return [
      botText(sendChannelSummary(userLanguage, result, sendChannel), userLanguage),
      createQuotationJourneyFlexMessage(invoicedOrder, staffCardOptions(profile, { portalLink, pdfLink }), userLanguage),
    ];
  },
};

// QUOTE INVOICE <orderId> — sales staff. Only meaningful once
// the order is confirmed and has something left to invoice (mirrors Odoo
// web's own Create Invoice button condition: invoice_status === 'to invoice').
const quoteInvoiceHandler: CommandHandler = {
  name: 'quote-invoice',
  match: (u) => u.startsWith('QUOTE INVOICE') && !u.startsWith('QUOTE INVOICE SEND'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];

    const orderId = parseOrderId(text, 'QUOTE INVOICE');
    if (!orderId) return [notFoundReply(userLanguage)];

    const existing = await getSaleOrderById(orderId);
    if (!existing) return [notFoundReply(userLanguage)];
    if (existing.state !== 'sale' || (existing.invoice_status !== 'to invoice' && existing.invoice_status !== 'upselling')) {
      return [botText(tr(userLanguage, 'ใบเสนอราคานี้ยังไม่พร้อมออกใบแจ้งหนี้ (ต้องยืนยันคำสั่งซื้อก่อน)', 'This quotation isn\'t ready to invoice yet (it needs to be confirmed first, or is already fully invoiced).'), userLanguage)];
    }

    const ok = await getErpAdapter().createInvoice(orderId);
    recordAuditEvent({ action: 'quote_invoice', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(orderId) });
    if (!ok) {
      return [botText(tr(userLanguage, 'สร้างใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่', 'Failed to create the invoice. Please try again.'), userLanguage)];
    }

    const order = await getSaleOrderById(orderId);
    if (!order) {
      return [botText(
        tr(userLanguage, `สร้างใบแจ้งหนี้สำหรับ #${orderId} สำเร็จแล้ว แต่โหลดรายละเอียดล่าสุดไม่สำเร็จ`, `Invoice created for #${orderId}, but reloading its details failed.`),
        userLanguage,
        statusRetryActions(orderId, userLanguage),
      )];
    }

    notifyQuoteParties({ order, channelId: channel?.channelId, actorUserId: userId })
      .catch(err => console.warn('quote-invoice: notify failed (non-fatal):', err));

    const { portalLink, pdfLink } = await getOrderLinks(orderId);
    return [createQuotationJourneyFlexMessage(order, staffCardOptions(profile, { portalLink, pdfLink }), userLanguage)];
  },
};

// QUOTE LIST [phone] — "my quotations". No phone: the requester's own
// orders (customer's own profile.odooPartnerId — same identity source
// quoteApproveHandler's authorization check relies on). With a phone:
// admin-only lookup of someone else's orders, same phone->partner
// resolution commerce.ts already uses for QUOTE CREATE's admin path.
const quoteListHandler: CommandHandler = {
  name: 'quote-list',
  match: (u) => u === 'QUOTE LIST' || u.startsWith('QUOTE LIST '),
  handle: async (ctx) => {
    const { userLanguage, text, userId } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    const rest = text.trim().replace(/^QUOTE LIST\s*/i, '').trim();
    const cursorMatch = rest.match(/^CURSOR\s+(\S+)\s*(.*)$/i);
    const offsetMatch = cursorMatch ? null : rest.match(/^OFFSET\s+(\d+)\s*(.*)$/i);
    const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
    const cursor = cursorMatch ? (decodeQuoteListCursor(cursorMatch[1]) || undefined) : undefined;
    const afterOffset = (cursorMatch ? cursorMatch[2] : offsetMatch ? offsetMatch[2] : rest).trim();
    const rangeMatch = afterOffset.match(/^FROM\s+(\d{4}-\d{2}-\d{2})(?:\s+TO\s+(\d{4}-\d{2}-\d{2}))?\s*(.*)$/i);
    const toOnlyMatch = afterOffset.match(/^TO\s+(\d{4}-\d{2}-\d{2})\s*(.*)$/i);

    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    let phoneArg = afterOffset;

    if (rangeMatch) {
      dateFrom = rangeMatch[1];
      dateTo = rangeMatch[2];
      phoneArg = (rangeMatch[3] || '').trim();
      await setLastQuoteListFrom(ctx.userId, dateFrom);
    } else if (toOnlyMatch) {
      dateTo = toOnlyMatch[1];
      dateFrom = ctx.profile.lastQuoteListFrom;
      phoneArg = (toOnlyMatch[2] || '').trim();
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(afterOffset)) {
      phoneArg = '';
    }

    let partnerId: number | undefined;
    if (phoneArg && !phoneArg.startsWith('OFFSET') && !phoneArg.startsWith('FROM')) {
      if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];
      const partner = await getPartnerByPhone(phoneArg);
      partnerId = partner?.id;
    } else {
      partnerId = profile.odooPartnerId;
    }

    if (!partnerId) {
      return [botText(t('quoteNotLinked', userLanguage), userLanguage)];
    }

    const DISPLAY_LIMIT = 5;
    const fetched = await getSaleOrdersForPartner(partnerId, {
      limit: DISPLAY_LIMIT + 1,
      offset: cursor ? 0 : offset,
      cursor,
      dateFrom,
      dateTo,
    });
    const hasMore = fetched.length > DISPLAY_LIMIT;
    const page = fetched.slice(0, DISPLAY_LIMIT);
    const nextCursor = hasMore && page.length ? encodeQuoteListCursor(page[page.length - 1]) : undefined;
    return [createQuotationListFlexMessage(page, hasMore, userLanguage, nextCursor, dateFrom, dateTo, userId)];
  },
};

// QUOTE MESSAGE <orderId> <text> — admin-only. Sends a short custom message
// to that order's customer, tied to the specific quote the admin is already
// looking at — transactional, not marketing, so (unlike MESSAGE CUSTOMER in
// sales-message.ts) this doesn't check marketingOptIn, same as QUOTE SEND's
// existing unconditional push.
const quoteMessageHandler: CommandHandler = {
  name: 'quote-message',
  match: (u) => u.startsWith('QUOTE MESSAGE'),
  handle: async (ctx) => {
    const { userLanguage, userId, channel, requestId, text } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];

    const parsed = parseOrderIdAndMessage(text, 'QUOTE MESSAGE');
    if (!parsed) return [usageReply(userLanguage, 'QUOTE MESSAGE 17 Your quote is ready for review!')];

    const order = await getSaleOrderById(parsed.orderId);
    if (!order || !order.partner_id) return [notFoundReply(userLanguage)];

    const partner = await getPartnerById(order.partner_id[0]);
    const customerUserId = await resolveCustomerLineUserId(partner);
    if (!customerUserId) {
      recordAuditEvent({ action: 'quote_message', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(parsed.orderId), detail: 'customer_not_linked' });
      return [botText(t('quoteNotLinked', userLanguage), userLanguage)];
    }

    const customerLanguage = await getUserLanguage(customerUserId);
    await sendTargetedFlexMessage([customerUserId], botText(parsed.message, customerLanguage), channel?.channelId || DEFAULT_CHANNEL_ID);

    recordAuditEvent({ action: 'quote_message', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(parsed.orderId) });
    return [botText(tr(userLanguage, 'ส่งข้อความให้ลูกค้าแล้ว', 'Message sent to the customer.'), userLanguage)];
  },
};

const quoteCreateMoreHandler: CommandHandler = {
  name: 'quote-create-more',
  match: (u) => u.startsWith('QUOTE CREATE MORE'),
  handle: async (ctx) => {
    const { userLanguage, userId, text, agentName } = ctx;
    const profile = await syncStaffProfile(userId, ctx.profile);
    if (!isQuoteStaff(profile)) return [staffOnlyReply(userLanguage)];
    const orderId = parseOrderId(text, 'QUOTE CREATE MORE');
    if (!orderId) return [notFoundReply(userLanguage)];
    const order = await getSaleOrderById(orderId);
    if (!order?.partner_id) return [notFoundReply(userLanguage)];
    const partner = await getPartnerById(order.partner_id[0]);
    const customerName = order.partner_id[1];
    const phone = partner?.phone || '';
    if (!phone) {
      return [botText(tr(userLanguage, 'ลูกค้านี้ยังไม่มีเบอร์โทรใน Odoo', 'This customer has no phone in Odoo.'), userLanguage)];
    }
    const flowSpec = FLOW_SPECS.QUOTE_CREATE;
    const collected = { customerName, phone };
    await setUserPendingFlow(userId, {
      flow: flowSpec.key,
      stepIndex: 0,
      collected,
      expiresAt: new Date(Date.now() + Number(process.env.GUIDED_FORM_TTL_MINUTES || 10) * 60 * 1000).toISOString(),
    });
    const options = flowSpec.fields[0].loadOptions
      ? await flowSpec.fields[0].loadOptions(collected).catch(() => [])
      : undefined;
    return [createFormPromptFlexMessage({
      title: tr(userLanguage, `${agentName} ${flowSpec.labelTh}`, `${agentName} ${flowSpec.labelEn}`),
      prompt: tr(userLanguage, flowSpec.fields[0].promptTh, flowSpec.fields[0].promptEn),
      stepIndex: 0,
      totalSteps: flowSpec.fields.length,
      language: userLanguage,
      contextNote: tr(userLanguage, `ลูกค้า: ${customerName}`, `Customer: ${customerName}`),
      options,
    })];
  },
};

export const quotationHandlers: CommandHandler[] = [
  quoteCreateMoreHandler,
  quoteStatusHandler,
  quoteConfirmHandler,
  quoteSendConfirmHandler,
  quoteSendOptionsHandler,
  quoteSendHandler,
  quoteMoreHandler,
  quoteLinesHandler,
  quoteApproveHandler,
  quoteAddHandler,
  quoteEditHandler,
  quoteRemoveHandler,
  quoteCancelHandler,
  quoteInvoiceSendConfirmHandler,
  quoteInvoiceSendHandler,
  quoteInvoiceHandler,
  quoteMessageHandler,
  quoteListHandler,
];
