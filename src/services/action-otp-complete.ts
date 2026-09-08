import { consumeActionOtpChallengeByToken, getUserLanguage, getUserProfile, setLastActionOtpAt } from './firestore';
import { sendTargetedFlexMessage, sendTargetedMessage } from '../line/messaging';
import { DEFAULT_CHANNEL_ID, getBrandTitle, resolveChannelConfig } from '../line/channels';
import { appLogger } from './logger';

export const completeActionOtpByLinkToken = async (token: string): Promise<{ ok: boolean; message: string; channelId?: string }> => {
  const consumed = await consumeActionOtpChallengeByToken({ token });
  if (!consumed.ok || !consumed.data) {
    const reason = consumed.error || '';
    if (reason.includes('action_otp_expired')) return { ok: false, message: 'Verification link expired.' };
    if (reason.includes('action_otp_locked')) return { ok: false, message: 'Too many attempts. Retry the action in LINE.' };
    return { ok: false, message: 'Verification link is invalid or already used.' };
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

  appLogger.info('action_otp_web_verified', {
    gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null,
    pending: consumed.data.pendingCommandText.slice(0, 40),
  });

  return { ok: true, message: 'Action verified. You can return to LINE now.', channelId };
};
