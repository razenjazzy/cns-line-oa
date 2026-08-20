import type { CommandHandler } from './index';
import { createBotTextFlexMessage } from '../templates';
import { isGroupBuyCommand, isGroupBuyEnabledForUser } from '../../services/feature-flags';
import { handleGroupBuyCommand } from '../../services/group-buy';
import { recordGroupBuyGate } from '../../services/kpi';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (value: string, language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: 'info',
  });

/**
 * Single handler that owns all Group-Buy commands:
 * START GROUPBUY, JOIN GROUPBUY, STATUS GROUPBUY,
 * CONFIRM GROUPBUY, CANCEL GROUPBUY
 *
 * Feature-flag gate (rollout % + allowlist) is enforced here so the
 * gating logic is co-located with the feature, not scattered across
 * command-router.
 */
export const groupBuyHandler: CommandHandler = {
  name: 'group-buy',
  match: (_u, ctx) => isGroupBuyCommand(ctx.text.trim()),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, agentName, text } = ctx;

    const gate = isGroupBuyEnabledForUser(userId);
    recordGroupBuyGate(gate.enabled, gate.reason);

    if (!gate.enabled) {
      return [botText(tr(userLanguage,
        `${agentName} ฟีเจอร์ Group-Buy ยังไม่เปิดใช้งานสำหรับบัญชีนี้`,
        `${agentName} Group-Buy is not enabled for this account yet.`,
      ), userLanguage)];
    }

    const message = await handleGroupBuyCommand({
      text: text.trim(),
      userId,
      userLanguage,
      isAdmin: profile.role === 'admin',
      agentName,
    });

    return [botText(message, userLanguage)];
  },
};
