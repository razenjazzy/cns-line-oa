import type { CommandHandler } from './index';
import { createBotTextFlexMessage } from '../templates';
import { getPartnerByPhone } from '../../services/odoo';
import {
  findVerifiedUserIdByPhone,
  getUserLanguage,
  getUserProfile,
  recordAuditEvent,
  type UserLanguage,
} from '../../services/firestore';
import { sendTargetedFlexMessage } from '../messaging';
import { DEFAULT_CHANNEL_ID } from '../channels';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (value: string, language: UserLanguage, tone: 'info' | 'success' | 'warning' | 'error' = 'info') =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone,
  });

const adminOnlyReply = (language: UserLanguage) =>
  botText(tr(language, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.'), language, 'error');

// "<prefix> <phone> <free-text message>" — same shape as quotation.ts's
// parseOrderIdAndMessage, just keyed by phone instead of an order id.
const parsePhoneAndMessage = (text: string, prefix: string): { phone: string; message: string } | null => {
  const raw = text.trim().replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
  const firstSpace = raw.indexOf(' ');
  if (firstSpace === -1) return null;

  const phone = raw.slice(0, firstSpace).trim();
  const message = raw.slice(firstSpace + 1).trim();
  if (!phone || !message) return null;

  return { phone, message };
};

// MESSAGE CUSTOMER <phone> <text> — admin-only general messaging tool, not
// tied to a specific quote (that's QUOTE MESSAGE in quotation.ts, which is
// transactional and doesn't need marketing consent). This one reuses the
// exact marketingOptIn gate src/jobs/segmentation.ts already applies before
// any non-transactional outbound message — refuses rather than silently
// sending to someone who hasn't opted in via PROMO ON.
const messageCustomerHandler: CommandHandler = {
  name: 'sales-message-customer',
  match: (u) => u.startsWith('MESSAGE CUSTOMER'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const parsed = parsePhoneAndMessage(text, 'MESSAGE CUSTOMER');
    if (!parsed) {
      return [botText(tr(userLanguage,
        'รูปแบบไม่ถูกต้อง ตัวอย่าง: MESSAGE CUSTOMER 0812345678 สวัสดีค่ะ มีโปรโมชันใหม่',
        'That doesn\'t look right. Example: MESSAGE CUSTOMER 0812345678 Hi! We have a new offer for you.',
      ), userLanguage, 'error')];
    }

    const partner = await getPartnerByPhone(parsed.phone);
    const customerUserId = partner?.phone ? await findVerifiedUserIdByPhone(partner.phone) : null;
    if (!customerUserId) {
      recordAuditEvent({ action: 'sales_message', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: parsed.phone, detail: 'customer_not_linked' });
      return [botText(tr(userLanguage,
        'ไม่พบลูกค้าที่ยืนยันตัวตนด้วยเบอร์นี้ ลูกค้าต้องทักบอทและทำการ VERIFY ก่อน',
        'No verified customer found for that phone — they need to message the bot and complete VERIFY first.',
      ), userLanguage, 'error')];
    }

    const customerProfile = await getUserProfile(customerUserId);
    if (!customerProfile.marketingOptIn) {
      recordAuditEvent({ action: 'sales_message', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: parsed.phone, detail: 'not_opted_in' });
      return [botText(tr(userLanguage,
        'ลูกค้ารายนี้ยังไม่ได้เปิดรับข้อความทางการตลาด (PROMO ON) จึงยังส่งข้อความนี้ไม่ได้ หากเป็นเรื่องใบเสนอราคาที่มีอยู่แล้ว ใช้ QUOTE MESSAGE แทนได้',
        "This customer hasn't opted in to marketing messages (PROMO ON), so this can't be sent. If it's about an existing quote, use QUOTE MESSAGE instead — that doesn't need marketing consent.",
      ), userLanguage, 'warning')];
    }

    const customerLanguage = await getUserLanguage(customerUserId);
    await sendTargetedFlexMessage([customerUserId], botText(parsed.message, customerLanguage), channel?.channelId || DEFAULT_CHANNEL_ID);

    recordAuditEvent({ action: 'sales_message', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, targetId: parsed.phone });
    return [botText(tr(userLanguage, 'ส่งข้อความแล้ว', 'Message sent.'), userLanguage, 'success')];
  },
};

export const salesMessageHandlers: CommandHandler[] = [
  messageCustomerHandler,
];
