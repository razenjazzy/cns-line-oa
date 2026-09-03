import type { CommandHandler } from './index';
import { createBotTextFlexMessage } from '../templates';
import { DEFAULT_CHANNEL_ID } from '../channels';
import {
  createActionOtpChallenge,
  consumeActionOtpChallenge,
  setLastActionOtpAt,
  type UserLanguage,
  type UserProfile,
} from '../../services/firestore';
import { generateOtp } from '../../services/user-verification';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (title: string, body: string, language: UserLanguage, tone: 'info' | 'success' | 'warning' | 'error') =>
  createBotTextFlexMessage({ title, body, language, tone });

const ACTION_OTP_WINDOW_MINUTES = Number(process.env.ACTION_OTP_WINDOW_MINUTES || 10);

/**
 * Commands that create/edit/delete a quote (or send a customer-facing
 * message on its behalf) — view-only commands (QUOTE STATUS, QUOTE LIST)
 * are deliberately not gated. Scoped to the quote lifecycle only, not
 * USER/SERVICE CRUD or ADMIN ENABLE/DISABLE — see documents/BACKLOG.md.
 */
const GATED_MUTATION_PREFIXES = [
  'DEMO QUOTE',
  'QUOTE ADD',
  'QUOTE EDIT',
  'QUOTE CANCEL',
  'QUOTE CONFIRM',
  'QUOTE SEND',
  'QUOTE INVOICE',
  'QUOTE APPROVE',
  'QUOTE MESSAGE',
  'MESSAGE CUSTOMER',
];

const isGatedMutation = (upperText: string): boolean => GATED_MUTATION_PREFIXES.some(p => upperText.startsWith(p));

const hasFreshActionOtp = (profile: UserProfile): boolean => {
  if (!profile.lastActionOtpAt) return false;
  const ageMs = Date.now() - new Date(profile.lastActionOtpAt).getTime();
  return ageMs < ACTION_OTP_WINDOW_MINUTES * 60 * 1000;
};

// Step-up OTP gate — registered first in the handler registry (see
// src/line/handlers/index.ts) so it intercepts a gated command before the
// real handler ever runs. Only applies to already-verified users (an
// unverified self-service DEMO QUOTE caller has no established identity to
// "step up" from — that path is unchanged, same as before this feature).
const actionOtpGateHandler: CommandHandler = {
  name: 'action-otp-gate',
  match: (upperText, ctx) => {
    if (!ctx.profile.odooVerified) return false;
    if (!isGatedMutation(upperText)) return false;
    return !hasFreshActionOtp(ctx.profile);
  },
  handle: async (ctx) => {
    const { userLanguage, userId, channel, text: originalText } = ctx;
    const otpCode = generateOtp();
    const created = await createActionOtpChallenge({
      userId,
      channelId: channel?.channelId || DEFAULT_CHANNEL_ID,
      otpCode,
      pendingCommandText: originalText,
    });

    if (!created.ok) {
      // A transient Firestore error creating the challenge itself — logged
      // server-side already. Ask the user to retry rather than silently
      // either blocking the action forever or bypassing the gate.
      console.warn('action-otp-gate: challenge creation failed:', created.error);
      return [botText(
        tr(userLanguage, 'ลองอีกครั้ง', 'Please try again'),
        tr(userLanguage, 'ไม่สามารถเริ่มการยืนยันได้ในขณะนี้ กรุณาลองคำสั่งเดิมอีกครั้ง', 'Could not start verification right now. Please retry the same action.'),
        userLanguage,
        'error',
      )];
    }

    return [botText(
      tr(userLanguage, 'ยืนยันก่อนดำเนินการ', 'Confirm before continuing'),
      tr(userLanguage,
        `เพื่อความปลอดภัย กรุณายืนยันด้วยรหัส: ${otpCode}\nพิมพ์: ACTION VERIFY ${otpCode}`,
        `For your security, confirm with this code: ${otpCode}\nReply: ACTION VERIFY ${otpCode}`,
      ),
      userLanguage,
      'warning',
    )];
  },
};

// ACTION VERIFY <code> — consumes the step-up challenge, then replays the
// original gated command (which now passes the freshness check) so the
// user sees the action's real result, not a generic "verified" message.
const actionVerifyHandler: CommandHandler = {
  name: 'action-verify',
  match: (u) => u.startsWith('ACTION VERIFY'),
  handle: async (ctx) => {
    const { userLanguage, userId, text: rawText } = ctx;
    const code = rawText.trim().replace(/^ACTION VERIFY\s*/i, '').trim();

    const consumed = await consumeActionOtpChallenge({ userId, otpCode: code });
    if (!consumed.ok || !consumed.data) {
      const reason = consumed.error || '';
      // Only these three are genuine "the code itself didn't work" outcomes
      // — anything else (a Firestore error, a missing index, a transient
      // failure) must not be reported as "invalid code", which would
      // falsely tell a user who typed the *correct* code that they got it
      // wrong. Logged either way so a real infra problem is still visible.
      if (reason.includes('action_otp_locked')) {
        return [botText(tr(userLanguage, 'ยืนยันไม่สำเร็จ', 'Verification failed'), tr(userLanguage,
          'กรอกรหัสผิดหลายครั้งเกินไป กรุณาลองคำสั่งเดิมอีกครั้งเพื่อขอรหัสใหม่',
          'Too many incorrect attempts. Please retry the original action to get a new code.',
        ), userLanguage, 'error')];
      }
      if (reason.includes('action_otp_expired')) {
        return [botText(tr(userLanguage, 'รหัสหมดอายุ', 'Code expired'), tr(userLanguage,
          'รหัสหมดอายุแล้ว กรุณาลองคำสั่งเดิมอีกครั้งเพื่อขอรหัสใหม่',
          'That code expired. Please retry the original action to get a new code.',
        ), userLanguage, 'error')];
      }
      if (reason.includes('action_otp_invalid') || reason.includes('action_otp_not_found')) {
        return [botText(tr(userLanguage, 'รหัสไม่ถูกต้อง', 'Invalid code'), tr(userLanguage,
          'รหัสไม่ถูกต้อง กรุณาลองใหม่ หรือลองคำสั่งเดิมอีกครั้งเพื่อขอรหัสใหม่',
          'That code is not correct. Try again, or retry the original action for a new code.',
        ), userLanguage, 'error')];
      }
      console.error('action-verify: consumeActionOtpChallenge failed with an unexpected error (not a wrong-code outcome):', reason);
      return [botText(tr(userLanguage, 'เกิดข้อผิดพลาด', 'Something went wrong'), tr(userLanguage,
        'ไม่สามารถตรวจสอบรหัสได้ในขณะนี้ กรุณาลองอีกครั้งในอีกสักครู่',
        "Couldn't check that code right now — please try again in a moment.",
      ), userLanguage, 'error')];
    }

    await setLastActionOtpAt(userId);
    const { resolveCommandReply } = await import('../command-router');
    // ctx.profile is a plain snapshot from this request, not a live
    // reference — replaying with the stale profile (no lastActionOtpAt)
    // would fail hasFreshActionOtp's check all over again and gate the
    // very action this code just verified. Patch it in locally instead of
    // re-fetching from Firestore, same "just-written value" shortcut every
    // other handler here already takes after its own writes.
    const freshProfile = { ...ctx.profile, lastActionOtpAt: new Date().toISOString() };
    return resolveCommandReply({ ...ctx, profile: freshProfile, text: consumed.data.pendingCommandText });
  },
};

export const actionOtpHandlers: CommandHandler[] = [
  actionOtpGateHandler,
  actionVerifyHandler,
];
