import { createQuotationJourneyFlexMessage } from './templates';
import { DEFAULT_CHANNEL_ID, getBrandTitle } from './channels';
import { sendTargetedFlexMessage } from './messaging';
import { getPartnerById, getSaleOrderPdfLink, getSaleOrderPortalLink } from '../services/odoo';
import type { OdooSaleOrder } from '../services/odoo/types';
import { findVerifiedUserIdByPartnerId, findLineUserIdByPhone, getUserLanguage, getUserProfile, listVerifiedSalesLineUserIds } from '../services/firestore';
import { startOdooUserVerification } from '../services/user-verification';
import { createBotTextFlexMessage } from './templates';
import { getErpAdapter } from '../erp/registry';

export type QuoteSendChannel = 'line' | 'email' | 'both';

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
 * Push the journey Flex card to the verified customer (LINE, by phone or
 * linked Odoo partner) and to verified Odoo sales users on LINE (plus any
 * ADMIN_USER_ID operators). The actor already received a reply, so they
 * are skipped on the LINE push. LINE admin is not required for sales.
 */
export const notifyQuoteParties = async (input: {
  order: OdooSaleOrder;
  channelId?: string;
  actorUserId?: string;
  notifyCustomer?: boolean;
  notifySales?: boolean;
  viaLine?: boolean;
  email?: { to: string; subject: string; body: string };
}): Promise<{ customerLineId: string | null; emailed: boolean; salesPushed: number }> => {
  const notifyCustomer = input.notifyCustomer !== false;
  const notifySales = input.notifySales !== false;
  const viaLine = input.viaLine !== false;
  const channelId = input.channelId || DEFAULT_CHANNEL_ID;

  const partner = input.order.partner_id ? await getPartnerById(input.order.partner_id[0]) : null;
  const customerLineId = notifyCustomer && viaLine ? await resolveCustomerLineUserId(partner) : null;
  const links = await getOrderLinks(input.order.id);

  if (customerLineId && customerLineId !== input.actorUserId) {
    const language = await getUserLanguage(customerLineId);
    await sendTargetedFlexMessage(
      [customerLineId],
      createQuotationJourneyFlexMessage(input.order, { role: 'customer', ...links }, language),
      channelId,
    );
    const customerProfile = await getUserProfile(customerLineId);
    if (!customerProfile.odooVerified && partner?.phone) {
      const challenge = await startOdooUserVerification({
        userId: customerLineId,
        rawPhone: partner.phone,
        language,
        agentName: getBrandTitle(language),
        channelId,
      });
      if (challenge.link) {
        await sendTargetedFlexMessage(
          [customerLineId],
          createBotTextFlexMessage({
            title: language === 'en' ? 'Verify your number' : 'ยืนยันเบอร์ของคุณ',
            body: challenge.message,
            language,
            tone: 'info',
            linkAction: { label: challenge.linkLabel || (language === 'en' ? 'Verify now' : 'ยืนยันตอนนี้'), uri: challenge.link },
          }),
          channelId,
        );
      }
    }
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
  };
};
