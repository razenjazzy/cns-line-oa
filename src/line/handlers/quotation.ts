import type { CommandHandler } from './index';
import { createBotTextFlexMessage, createQuotationJourneyFlexMessage } from '../templates';
import {
  getSaleOrderById,
  getSaleOrderPortalLink,
  confirmSaleOrder,
  markSaleOrderSent,
  getPartnerById,
} from '../../services/odoo';
import { findVerifiedUserIdByPhone, recordAuditEvent } from '../../services/firestore';
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

const parseOrderId = (text: string, prefix: string): number | null => {
  const raw = text.trim().replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
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
    const portalLink = (await getSaleOrderPortalLink(orderId)) || undefined;
    return [createQuotationJourneyFlexMessage(order, { role, portalLink }, userLanguage)];
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

    const order = await getSaleOrderById(orderId);
    if (!order) return [notFoundReply(userLanguage)];
    const portalLink = (await getSaleOrderPortalLink(orderId)) || undefined;
    return [createQuotationJourneyFlexMessage(order, { role: 'admin', portalLink }, userLanguage)];
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
    const portalLink = (await getSaleOrderPortalLink(orderId)) || undefined;
    const customerCard = createQuotationJourneyFlexMessage(sentOrder, { role: 'customer', portalLink }, userLanguage);

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

export const quotationHandlers: CommandHandler[] = [
  quoteStatusHandler,
  quoteConfirmHandler,
  quoteSendHandler,
  quoteApproveHandler,
];
