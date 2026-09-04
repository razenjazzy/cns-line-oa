import crypto from 'crypto';
import {
  consumeOdooVerificationByOtp,
  consumeOdooVerificationByToken,
  createOdooVerificationChallenge,
  getUserLanguage,
  recordAuditEvent,
  setUserOdooPartner,
  setUserOdooVerificationStatus,
  UserLanguage,
} from './firestore';
import { getPartnerByPhone } from './odoo/partners';
import { DEFAULT_CHANNEL_ID } from '../line/channels';
import { sendTargetedMessage, sendTargetedFlexMessage } from '../line/messaging';
import { createBotTextFlexMessage } from '../line/templates';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const normalizePhone = (value: string): string => value.replace(/[^0-9+]/g, '').trim();

const buildBaseUrl = (fallbackBaseUrl?: string): string => {
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim();
  const candidate = fromEnv || fallbackBaseUrl || 'http://localhost:8080';
  return candidate.replace(/\/$/, '');
};

export const generateOtp = (): string => {
  const value = crypto.randomInt(0, 1_000_000);
  return String(value).padStart(6, '0');
};

const generateLinkToken = (): string => crypto.randomBytes(24).toString('hex');

// Fired on every successful verification completion (OTP-typed or
// magic-link), regardless of which path got there — the sales/admin side
// wants to know a customer just came online, same "notify the other party
// on success" pattern already used by quote-approve. Best-effort: a push
// or audit-write failure here must never turn a completed verification
// into a reported failure for the customer.
const notifyAdminOfVerification = async (params: { userId: string; phone: string; partnerId: number; channelId?: string }): Promise<void> => {
  recordAuditEvent({
    action: 'verification_success',
    outcome: 'success',
    actorUserId: params.userId,
    channelId: params.channelId,
    targetId: String(params.partnerId),
    detail: `phone=${params.phone}`,
  });

  const adminUserId = process.env.ADMIN_USER_ID?.trim();
  if (!adminUserId) return;
  try {
    const adminLanguage = await getUserLanguage(adminUserId);
    await sendTargetedMessage(
      [adminUserId],
      tr(adminLanguage, `ลูกค้ายืนยันบัญชี Odoo แล้ว (เบอร์ ${params.phone})`, `A customer just verified their Odoo account (phone ${params.phone}).`),
      params.channelId,
    );
  } catch (err) {
    console.warn('notifyAdminOfVerification: admin notify failed (non-fatal):', err);
  }
};

type StartVerificationInput = {
  userId: string;
  rawPhone: string;
  language: UserLanguage;
  agentName: string;
  fallbackBaseUrl?: string;
  channelId?: string;
};

export type StartVerificationResult = {
  message: string;
  /** Present only once a challenge was actually created — render as a real uri-action button, never as raw text (Flex text isn't linkified or selectable). */
  link?: string;
  linkLabel?: string;
};

export const startOdooUserVerification = async (input: StartVerificationInput): Promise<StartVerificationResult> => {
  const phone = normalizePhone(input.rawPhone);
  if (!phone) {
    return { message: tr(input.language, `วิธีใช้: VERIFY START <เบอร์โทร>`, `Usage: VERIFY START <phone>`) };
  }

  const partner = await getPartnerByPhone(phone);
  if (!partner) {
    return {
      message: tr(
        input.language,
        `${input.agentName} ไม่พบบัญชี Odoo ที่ตรงกับเบอร์ ${phone}`,
        `${input.agentName} no Odoo user matched phone ${phone}`
      ),
    };
  }

  const otpCode = generateOtp();
  const linkToken = generateLinkToken();
  const created = await createOdooVerificationChallenge({
    userId: input.userId,
    channelId: input.channelId || DEFAULT_CHANNEL_ID,
    partnerId: partner.id,
    phone,
    otpCode,
    linkToken,
  });

  if (!created.ok || !created.data) {
    return {
      message: tr(
        input.language,
        `${input.agentName} ไม่สามารถเริ่มการยืนยันตัวตนได้ กรุณาลองใหม่`,
        `${input.agentName} could not start verification. Please try again.`
      ),
    };
  }

  const link = `${buildBaseUrl(input.fallbackBaseUrl)}/verify/odoo?token=${encodeURIComponent(linkToken)}`;
  // Kept short deliberately — Flex button labels get truncated at 20 chars
  // (see buttonLabel() in templates.ts), and a label cut off mid-word
  // ("Open verification...") reads worse than a short, complete one.
  const linkLabel = tr(input.language, 'ยืนยันตอนนี้', 'Verify now');
  const includeOtpInMessage = /^(1|true|yes|on)$/i.test(process.env.ODOO_VERIFY_DEBUG_INCLUDE_OTP || 'false');

  if (includeOtpInMessage) {
    return {
      message: tr(
        input.language,
        `${input.agentName} เริ่มการยืนยันบัญชี Odoo แล้ว\n- ผู้ใช้: ${partner.name}\n- เบอร์: ${phone}\n- OTP: ${otpCode} (หมดอายุใน 10 นาที)\n\nแตะปุ่มด้านล่างเพื่อยืนยันทันที หรือพิมพ์: VERIFY OTP <รหัส>`,
        `${input.agentName} started Odoo account verification\n- User: ${partner.name}\n- Phone: ${phone}\n- OTP: ${otpCode} (expires in 10 minutes)\n\nTap the button below to verify instantly, or type: VERIFY OTP <code>`
      ),
      link,
      linkLabel,
    };
  }

  console.log('[verification] OTP generated', {
    userId: input.userId,
    phone,
    partnerId: partner.id,
    challengeId: created.data.id,
    otpCode,
  });

  return {
    message: tr(
      input.language,
      `${input.agentName} เริ่มการยืนยันบัญชี Odoo แล้ว\n- ผู้ใช้: ${partner.name}\n- เบอร์: ${phone}\n\nแตะปุ่มด้านล่างเพื่อยืนยันทันที หรือกรอก OTP ที่ได้รับด้วยคำสั่ง: VERIFY OTP <รหัส>`,
      `${input.agentName} started Odoo account verification\n- User: ${partner.name}\n- Phone: ${phone}\n\nTap the button below to verify instantly, or submit the received OTP via: VERIFY OTP <code>`
    ),
    link,
    linkLabel,
  };
};

type VerifyOtpInput = {
  userId: string;
  otpCode: string;
  language: UserLanguage;
  agentName: string;
};

export const verifyOdooUserByOtp = async (input: VerifyOtpInput): Promise<string> => {
  const code = input.otpCode.trim();
  if (!/^\d{6}$/.test(code)) {
    return tr(input.language, `วิธีใช้: VERIFY OTP <รหัส 6 หลัก>`, `Usage: VERIFY OTP <6-digit-code>`);
  }

  const consumed = await consumeOdooVerificationByOtp({ userId: input.userId, otpCode: code });
  if (!consumed.ok || !consumed.data) {
    const reason = consumed.error || '';
    if (reason.includes('verification_invalid_otp')) {
      return tr(input.language, `${input.agentName} รหัส OTP ไม่ถูกต้อง`, `${input.agentName} invalid OTP.`);
    }
    if (reason.includes('verification_locked')) {
      return tr(input.language, `${input.agentName} กรอก OTP ผิดหลายครั้งเกินไป กรุณาเริ่มใหม่ด้วย VERIFY START <phone>`, `${input.agentName} too many incorrect OTP attempts. Start again with VERIFY START <phone>.`);
    }
    if (reason.includes('verification_expired')) {
      return tr(input.language, `${input.agentName} OTP หมดอายุแล้ว กรุณาเริ่มใหม่ด้วย VERIFY START <phone>`, `${input.agentName} OTP expired. Start again with VERIFY START <phone>.`);
    }
    return tr(input.language, `${input.agentName} ยืนยัน OTP ไม่สำเร็จ กรุณาลองใหม่`, `${input.agentName} OTP verification failed. Please try again.`);
  }

  const bindResult = await setUserOdooPartner(input.userId, consumed.data.partnerId, undefined, consumed.data.phone);
  if (!bindResult.ok) {
    return tr(input.language, `${input.agentName} ยืนยันสำเร็จ แต่ผูกบัญชีผู้ใช้ไม่สำเร็จ กรุณาลองอีกครั้ง`, `${input.agentName} verification succeeded but user binding failed. Please retry.`);
  }

  const verifiedAt = consumed.data.verifiedAt || new Date().toISOString();
  const statusResult = await setUserOdooVerificationStatus(input.userId, true, verifiedAt);
  if (!statusResult.ok) {
    return tr(input.language, `${input.agentName} ยืนยันสำเร็จ แต่บันทึกสถานะยืนยันไม่สำเร็จ`, `${input.agentName} verification succeeded but failed to persist verification status.`);
  }

  notifyAdminOfVerification({ userId: input.userId, phone: consumed.data.phone, partnerId: consumed.data.partnerId, channelId: consumed.data.channelId })
    .catch(err => console.warn('verifyOdooUserByOtp: post-verify notify failed (non-fatal):', err));

  return tr(
    input.language,
    `${input.agentName} ยืนยันตัวตน Odoo สำเร็จแล้ว`,
    `${input.agentName} Odoo user verification completed successfully.`
  );
};

export const verifyOdooUserByToken = async (token: string): Promise<{ ok: boolean; message: string; channelId?: string }> => {
  const normalized = token.trim();
  if (!normalized) {
    return { ok: false, message: 'Missing token.' };
  }

  const consumed = await consumeOdooVerificationByToken(normalized);
  if (!consumed.ok || !consumed.data) {
    if ((consumed.error || '').includes('verification_expired')) {
      return { ok: false, message: 'Verification link expired.' };
    }
    return { ok: false, message: 'Verification link is invalid or already used.' };
  }

  const bindResult = await setUserOdooPartner(consumed.data.userId, consumed.data.partnerId, undefined, consumed.data.phone);
  if (!bindResult.ok) {
    return { ok: false, message: 'Verification succeeded, but failed to bind Odoo user profile.' };
  }

  const verifiedAt = consumed.data.verifiedAt || new Date().toISOString();
  const statusResult = await setUserOdooVerificationStatus(consumed.data.userId, true, verifiedAt);
  if (!statusResult.ok) {
    return { ok: false, message: 'Verification succeeded, but failed to persist verification status.' };
  }

  // The magic-link flow completes over plain HTTP, so without this push the
  // customer's LINE chat never learns the verification actually succeeded.
  // A Flex card (not plain text) so there's an actual tappable next step —
  // createBotTextFlexMessage already renders a "Home" button by default,
  // same as every other bot reply in this codebase.
  const language = await getUserLanguage(consumed.data.userId);
  const successCard = createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: tr(language, '✅ ยืนยันบัญชี Odoo สำเร็จแล้ว', '✅ Your Odoo account is now verified.'),
    language,
    tone: 'success',
  });
  await sendTargetedFlexMessage([consumed.data.userId], successCard, consumed.data.channelId);

  notifyAdminOfVerification({ userId: consumed.data.userId, phone: consumed.data.phone, partnerId: consumed.data.partnerId, channelId: consumed.data.channelId })
    .catch(err => console.warn('verifyOdooUserByToken: post-verify notify failed (non-fatal):', err));

  return { ok: true, message: 'Odoo user verification completed successfully. You can return to LINE now.', channelId: consumed.data.channelId };
};
