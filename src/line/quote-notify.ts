import { createQuotationJourneyFlexMessage } from './templates';
import { DEFAULT_CHANNEL_ID, oaChatDeepLink } from './channels';
import { sendTargetedFlexMessage } from './messaging';
import { getPartnerById, getSaleOrderById, getSaleOrderPdfLink, getSaleOrderPortalLink } from '../services/odoo';
import type { OdooSaleOrder } from '../services/odoo/types';
import { findVerifiedUserIdByPartnerId, findLineUserIdByPhone, getUserLanguage, getUserProfile, listVerifiedSalesLineUserIds } from '../services/firestore';
import { getErpAdapter } from '../erp/registry';
import { phoneMatchVariants } from '../services/phone-match';

export type QuoteSendChannel = 'line' | 'email' | 'both';

const quoteInvites = new Map<string, Array<{ orderId: number; channelId: string }>>();

export const saveQuoteInvite = (phone: string, orderId: number, channelId: string): void => {
  for (const key of phoneMatchVariants(phone)) {
    const list = quoteInvites.get(key) || [];
    if (!list.some(invite => invite.orderId === orderId)) list.push({ orderId, channelId });
    quoteInvites.set(key, list);
  }
};

export const takeQuoteInvitesForPhone = (phone: string): Array<{ orderId: number; channelId: string }> => {
  const found: Array<{ orderId: number; channelId: string }> = [];
  for (const key of phoneMatchVariants(phone)) {
    found.push(...(quoteInvites.get(key) || []));
    quoteInvites.delete(key);
  }
  const seen = new Set<number>();
  return found.filter(invite => {
    if (seen.has(invite.orderId)) return false;
    seen.add(invite.orderId);
    return true;
  });
};

const salesAdminUserIds = (): string[] =>
  (process.env.ADMIN_USER_ID || '')
    .split(',')
    .map(value => value.trim())
    .filter(id => id.startsWith('U'));

const salesNotifyUserIds = async (): Promise<string[]> => {
  const fromOdooSales = await listVerifiedSalesLineUserIds();
  return [...new Set([...fromOdooSales, ...salesAdminUserIds()])];
};

export const resolveCustomerLineUserId = async (partner: { id: number; phone?: string } | null): Promise<string | null> => {
  if (!partner) return null;
  if (partner.phone) {
    const byPhone = await findLineUserIdByPhone(partner.phone);
    if (byPhone) return byPhone;
  }
  return findVerifiedUserIdByPartnerId(partner.id);
};

const getOrderLinks = async (orderId: number) => {
  const [portalLink, pdfLink] = await Promise.all([
    getSaleOrderPortalLink(orderId).then(value => value || undefined),
    getSaleOrderPdfLink(orderId).then(value => value || undefined),
  ]);
  return { portalLink, pdfLink };
};

/**
 * Push the journey Flex card to the customer (LINE, by phone or linked
 * partner — they do not need identity VERIFY to receive it) and to verified
 * Odoo sales users. The actor already received a reply, so they are skipped.
 */
export const notifyQuoteParties = async (input: {
  order: OdooSaleOrder;
  channelId?: string;
  actorUserId?: string;
  notifyCustomer?: boolean;
  notifySales?: boolean;
  viaLine?: boolean;
  email?: { to: string; subject: string; body: string };
}): Promise<{ customerLineId: string | null; emailed: boolean; salesPushed: number; inviteUri?: string }> => {
  const notifyCustomer = input.notifyCustomer !== false;
  const notifySales = input.notifySales !== false;
  const viaLine = input.viaLine !== false;
  const channelId = input.channelId || DEFAULT_CHANNEL_ID;

  const partner = input.order.partner_id ? await getPartnerById(input.order.partner_id[0]) : null;
  const customerLineId = notifyCustomer && viaLine ? await resolveCustomerLineUserId(partner) : null;
  const links = await getOrderLinks(input.order.id);

  if (notifyCustomer && viaLine && !customerLineId && partner?.phone) {
    saveQuoteInvite(partner.phone, input.order.id, channelId);
  }

  if (customerLineId && customerLineId !== input.actorUserId) {
    const language = await getUserLanguage(customerLineId);
    await sendTargetedFlexMessage(
      [customerLineId],
      createQuotationJourneyFlexMessage(input.order, { role: 'customer', ...links }, language),
      channelId,
    );
  }

  const salesIds = notifySales
    ? (await salesNotifyUserIds()).filter(id => id !== input.actorUserId && id !== customerLineId)
    : [];
  if (salesIds.length) {
    const language = await getUserLanguage(salesIds[0]);
    await sendTargetedFlexMessage(
      salesIds,
      createQuotationJourneyFlexMessage(input.order, { role: 'admin', ...links }, language),
      channelId,
    );
  }

  let emailed = false;
  if (input.email?.to) {
    emailed = await getErpAdapter().sendQuotationEmail(input.order.id, input.email.to, input.email.subject, input.email.body);
  }

  return {
    customerLineId: customerLineId && customerLineId !== input.actorUserId ? customerLineId : null,
    emailed,
    salesPushed: salesIds.length,
    inviteUri: notifyCustomer && viaLine && !customerLineId ? oaChatDeepLink(channelId) : undefined,
  };
};

export const deliverPendingQuoteInvites = async (userId: string, channelId: string): Promise<void> => {
  const profile = await getUserProfile(userId);
  if (!profile.phone) return;
  const pending = takeQuoteInvitesForPhone(profile.phone);
  if (!pending.length) return;
  const language = await getUserLanguage(userId);
  for (const invite of pending) {
    const order = await getSaleOrderById(invite.orderId);
    if (!order) continue;
    const links = await getOrderLinks(order.id);
    await sendTargetedFlexMessage(
      [userId],
      createQuotationJourneyFlexMessage(order, { role: 'customer', ...links }, language),
      invite.channelId || channelId,
    );
  }
};
