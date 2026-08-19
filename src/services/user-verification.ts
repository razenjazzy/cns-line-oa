import crypto from 'crypto';
import {
  consumeOdooVerificationByOtp,
  consumeOdooVerificationByToken,
  createOdooVerificationChallenge,
  setUserOdooPartner,
  setUserOdooVerificationStatus,
  UserLanguage,
} from './firestore';
import { getPartnerByPhone } from './odoo';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const normalizePhone = (value: string): string => value.replace(/[^0-9+]/g, '').trim();

const buildBaseUrl = (fallbackBaseUrl?: string): string => {
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim();
  const candidate = fromEnv || fallbackBaseUrl || 'http://localhost:8080';
  return candidate.replace(/\/$/, '');
};

const generateOtp = (): string => {
  const value = crypto.randomInt(0, 1_000_000);
  return String(value).padStart(6, '0');
};

const generateLinkToken = (): string => crypto.randomBytes(24).toString('hex');

type StartVerificationInput = {
  userId: string;
  rawPhone: string;
  language: UserLanguage;
  agentName: string;
  fallbackBaseUrl?: string;
};

export const startOdooUserVerification = async (input: StartVerificationInput): Promise<string> => {
  const phone = normalizePhone(input.rawPhone);
  if (!phone) {
    return tr(input.language, `วิธีใช้: VERIFY START <เบอร์โทร>`, `Usage: VERIFY START <phone>`);
  }

  const partner = await getPartnerByPhone(phone);
  if (!partner) {
    return tr(
      input.language,
      `${input.agentName} ไม่พบบัญชี Odoo ที่ตรงกับเบอร์ ${phone}`,
      `${input.agentName} no Odoo user matched phone ${phone}`
    );
  }

  const otpCode = generateOtp();
  const linkToken = generateLinkToken();
  const created = await createOdooVerificationChallenge({
    userId: input.userId,
    partnerId: partner.id,
    phone,
    otpCode,
    linkToken,
  });

  if (!created.ok || !created.data) {
    return tr(
      input.language,
      `${input.agentName} ไม่สามารถเริ่มการยืนยันตัวตนได้ กรุณาลองใหม่`,
      `${input.agentName} could not start verification. Please try again.`
    );
  }

  const link = `${buildBaseUrl(input.fallbackBaseUrl)}/verify/odoo?token=${encodeURIComponent(linkToken)}`;
  const includeOtpInMessage = /^(1|true|yes|on)$/i.test(process.env.ODOO_VERIFY_DEBUG_INCLUDE_OTP || 'false');

  if (includeOtpInMessage) {
    return tr(
      input.language,
      `${input.agentName} เริ่มการยืนยันบัญชี Odoo แล้ว\n- ผู้ใช้: ${partner.name}\n- เบอร์: ${phone}\n- OTP: ${otpCode} (หมดอายุใน 10 นาที)\n- ลิงก์ยืนยัน: ${link}\n\nยืนยันด้วย: VERIFY OTP <รหัส>`,
      `${input.agentName} started Odoo account verification\n- User: ${partner.name}\n- Phone: ${phone}\n- OTP: ${otpCode} (expires in 10 minutes)\n- Verify link: ${link}\n\nConfirm with: VERIFY OTP <code>`
    );
  }

  console.log('[verification] OTP generated', {
    userId: input.userId,
    phone,
    partnerId: partner.id,
    challengeId: created.data.id,
    otpCode,
  });

  return tr(
    input.language,
    `${input.agentName} เริ่มการยืนยันบัญชี Odoo แล้ว\n- ผู้ใช้: ${partner.name}\n- เบอร์: ${phone}\n- ลิงก์ยืนยัน: ${link}\n\nกรอก OTP ที่ได้รับด้วยคำสั่ง: VERIFY OTP <รหัส>`,
    `${input.agentName} started Odoo account verification\n- User: ${partner.name}\n- Phone: ${phone}\n- Verify link: ${link}\n\nSubmit the received OTP via: VERIFY OTP <code>`
  );
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

  return tr(
    input.language,
    `${input.agentName} ยืนยันตัวตน Odoo สำเร็จแล้ว`,
    `${input.agentName} Odoo user verification completed successfully.`
  );
};

export const verifyOdooUserByToken = async (token: string): Promise<{ ok: boolean; message: string }> => {
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

  return { ok: true, message: 'Odoo user verification completed successfully. You can return to LINE now.' };
};
