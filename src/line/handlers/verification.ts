import type { CommandHandler } from './index';
import { startOdooUserVerification, verifyOdooUserByOtp } from '../../services/user-verification';
import { createBotTextFlexMessage } from '../templates';
import type { UserLanguage } from '../../services/firestore';

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
    return [botText(message, userLanguage)];
  },
};

// VERIFY STATUS — show current Odoo verification status
const verifyStatusHandler: CommandHandler = {
  name: 'verify-status',
  match: (u) => u === 'VERIFY STATUS',
  handle: async (ctx) => {
    const { userLanguage, profile, agentName } = ctx;
    return [botText(tr(
      userLanguage,
      profile.odooVerified
        ? `${agentName} บัญชี Odoo ของคุณยืนยันแล้ว${profile.odooVerifiedAt ? ` เมื่อ ${profile.odooVerifiedAt}` : ''}`
        : `${agentName} บัญชี Odoo ของคุณยังไม่ยืนยัน\nเริ่มด้วย: VERIFY START <เบอร์โทร>`,
      profile.odooVerified
        ? `${agentName} your Odoo account is verified${profile.odooVerifiedAt ? ` at ${profile.odooVerifiedAt}` : ''}`
        : `${agentName} your Odoo account is not verified yet\nStart with: VERIFY START <phone>`,
    ), userLanguage)];
  },
};

export const verificationHandlers: CommandHandler[] = [
  verifyStartHandler,
  verifyOtpHandler,
  verifyStatusHandler,
];
