import type { CommandHandler } from './index';
import { startOdooUserVerification, verifyOdooUserByOtp } from '../../services/user-verification';
import { createBotTextFlexMessage } from '../templates';
import type { UserLanguage } from '../../services/firestore';
import { syncStaffProfile } from '../quote-access';
import { buildHomeMenuMessage } from '../command-router';
import { DEFAULT_CHANNEL_ID } from '../channels';
import { linkUserRichMenu } from '../rich-menu';
import { clearSalesLogin } from '../../services/sales-session';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const inferTone = (value: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = value.toLowerCase();
  if (/failed|error|invalid|ไม่สำเร็จ|ไม่พบ/.test(lower)) return 'error';
  if (/success|สำเร็จ/.test(lower)) return 'success';
  return 'info';
};

const botText = (value: string, language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: inferTone(value),
  });

// VERIFY START <phone> — initiate OTP + magic-link verification challenge
const verifyStartHandler: CommandHandler = {
  name: 'verify-start',
  match: (u) => u.startsWith('VERIFY START'),
  handle: async (ctx) => {
    const { userLanguage, userId, agentName, baseUrl, text, channel } = ctx;
    const phone = text.trim().replace(/^VERIFY START\s*/i, '').trim();
    const result = await startOdooUserVerification({
      userId,
      rawPhone: phone,
      language: userLanguage,
      agentName,
      fallbackBaseUrl: baseUrl,
      channelId: channel?.channelId,
    });
    // The link (when present) must render as a real uri-action button —
    // Flex text isn't auto-linkified or selectable, so a raw URL in the
    // body was previously an inert, uncopyable string.
    return [createBotTextFlexMessage({
      title: tr(userLanguage, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
      body: result.message,
      language: userLanguage,
      tone: inferTone(result.message),
      ...(result.link ? { linkAction: { label: result.linkLabel || 'Open link', uri: result.link } } : {}),
    })];
  },
};

// VERIFY OTP <6-digit-code> — submit OTP to complete verification
const verifyOtpHandler: CommandHandler = {
  name: 'verify-otp',
  match: (u) => u.startsWith('VERIFY OTP'),
  handle: async (ctx) => {
    const { userLanguage, userId, agentName, text } = ctx;
    const otpCode = text.trim().replace(/^VERIFY OTP\s*/i, '').trim();
    const message = await verifyOdooUserByOtp({ userId, otpCode, language: userLanguage, agentName });
    const card = botText(message, userLanguage);
    if (!/✅/.test(message)) return [card];
    return [
      card,
      buildHomeMenuMessage(userLanguage, agentName, ctx.channel, ctx.profile.role === 'admin', true),
    ];
  },
};

// VERIFY STATUS — show current Odoo verification status
const verifyStatusHandler: CommandHandler = {
  name: 'verify-status',
  match: (u) => u === 'VERIFY STATUS',
  handle: async (ctx) => {
    const { userLanguage, profile, agentName, userId } = ctx;
    const synced = await syncStaffProfile(userId, profile);
    return [createBotTextFlexMessage({
      title: tr(userLanguage, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
      body: tr(
        userLanguage,
        profile.odooVerified
          ? `${agentName} บัญชี Odoo ของคุณยืนยันแล้ว (${synced.salesTier === 'sales_manager' ? 'ผู้ดูแลฝ่ายขาย' : synced.salesTier === 'salesperson' ? 'ผู้ใช้ฝ่ายขาย' : 'ลูกค้า'})${synced.odooVerifiedAt ? ` เมื่อ ${synced.odooVerifiedAt}` : ''}`
          : `${agentName} บัญชี Odoo ของคุณยังไม่ยืนยัน`,
        profile.odooVerified
          ? `${agentName} your Odoo account is verified as ${synced.salesTier === 'sales_manager' ? 'Sales Administrator' : synced.salesTier === 'salesperson' ? 'Sales User' : 'customer'}${synced.odooVerifiedAt ? ` at ${synced.odooVerifiedAt}` : ''}`
          : `${agentName} your Odoo account is not verified yet`,
      ),
      language: userLanguage,
      tone: 'info',
      actions: [{ label: tr(userLanguage, 'ยืนยันอีกครั้ง', 'Verify again'), text: 'FORM VERIFY' }],
    })];
  },
};

const verifySignoutHandler: CommandHandler = {
  name: 'verify-signout',
  match: (u) => u === 'VERIFY SIGNOUT',
  handle: async (ctx) => {
    const { userLanguage, userId, agentName, channel, profile } = ctx;
    await clearSalesLogin(userId);
    if (!ctx.isGroupContext) {
      await linkUserRichMenu(userId, userLanguage, channel?.channelId || DEFAULT_CHANNEL_ID, 'default', false);
    }
    return [
      createBotTextFlexMessage({
        title: tr(userLanguage, 'ออกจากระบบแล้ว', 'Signed out'),
        body: tr(userLanguage, `${agentName} ยกเลิกการยืนยันแล้ว แตะ Verify เพื่อเข้าอีกครั้ง`, `${agentName} verification is off. Tap Verify to sign in again.`),
        language: userLanguage,
        tone: 'success',
      }),
      buildHomeMenuMessage(userLanguage, agentName, channel, profile.role === 'admin', false),
    ];
  },
};

export const verificationHandlers: CommandHandler[] = [
  verifySignoutHandler,
  verifyStartHandler,
  verifyOtpHandler,
  verifyStatusHandler,
];
