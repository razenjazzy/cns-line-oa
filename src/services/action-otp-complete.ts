import { consumeActionOtpChallengeByToken, getUserLanguage, getUserProfile, setLastActionOtpAt } from './firestore';
import { sendTargetedFlexMessage, sendTargetedMessage } from '../line/messaging';
import { DEFAULT_CHANNEL_ID, getBrandTitle, resolveChannelConfig } from '../line/channels';
import { getSaleOrderPortalLink } from './odoo';
import { appLogger } from './logger';

/** After action OTP, these commands should open the Odoo portal instead of the identity-verify HTML page. */
export const portalOrderIdFromPendingCommand = (text: string): number | null => {
  const trimmed = text.trim();
  if (/^QUOTE INVOICE SEND\b/i.test(trimmed)) return null;
  const match = trimmed.match(/^(QUOTE CONFIRM|QUOTE APPROVE|QUOTE INVOICE)\s+(\d+)\b/i);
  if (!match) return null;
  const id = Number(match[2]);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export const completeActionOtpByLinkToken = async (token: string): Promise<{
  ok: boolean;
  message: string;
  channelId?: string;
  redirectUrl?: string;
}> => {
  const consumed = await consumeActionOtpChallengeByToken({ token });
  if (!consumed.ok || !consumed.data) {
    const reason = consumed.error || '';
    if (reason.includes('action_otp_expired')) return { ok: false, message: 'This action was not verified. The link expired. Retry from LINE.' };
    if (reason.includes('action_otp_locked')) return { ok: false, message: 'This action was not verified. Too many attempts. Retry from LINE.' };
    return { ok: false, message: 'This action was not verified. The link is invalid or already used.' };
  }

  await setLastActionOtpAt(consumed.data.userId);
  const profile = await getUserProfile(consumed.data.userId);
  const language = await getUserLanguage(consumed.data.userId);
  const channelId = consumed.data.channelId || DEFAULT_CHANNEL_ID;
  const channel = resolveChannelConfig(channelId);
  const { resolveCommandReply } = await import('../line/command-router');
  const messages = await resolveCommandReply({
    text: consumed.data.pendingCommandText,
    userId: consumed.data.userId,
    userLanguage: language,
    profile,
    agentName: getBrandTitle(language),
    baseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    requestId: `action-verify-${consumed.data.id}`,
    channel: channel ? { channelId: channel.channelId, enabledServices: channel.enabledServices } : undefined,
    actionOtpReplay: true,
  });

  for (const message of messages) {
    if (message.type === 'flex') {
      await sendTargetedFlexMessage([consumed.data.userId], message, channelId);
    } else if (message.type === 'text') {
      await sendTargetedMessage([consumed.data.userId], message.text, channelId);
    }
  }

  const trimmed = consumed.data.pendingCommandText;
  const replayFailed = messages.some(message => /failed to confirm|not found|staff-only|admin-only|ไม่สำเร็จ|ไม่พบ|for sales users/i.test(JSON.stringify(message)));
  const portalOrderId = replayFailed ? null : portalOrderIdFromPendingCommand(trimmed);
  const redirectUrl = portalOrderId ? (await getSaleOrderPortalLink(portalOrderId) || undefined) : undefined;

  appLogger.info('action_otp_web_verified', {
    gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null,
    pending: trimmed.slice(0, 40),
    portalRedirect: Boolean(redirectUrl),
  });

  if (redirectUrl) {
    return { ok: true, message: 'Action verified. Opening the quotation.', channelId, redirectUrl };
  }
  return { ok: true, message: 'Action verified. Return to LINE for the next step.', channelId };
};
