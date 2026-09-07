import type { CommandHandler } from './index';
import { createBotTextFlexMessage, createSalesFeatureTogglesFlexMessage } from '../templates';
import { SERVICE_CATALOG } from '../../services/service-catalog';
import {
  describeAllFeatureToggles,
  ensureFeatureTogglesLoaded,
  parseServiceToggleKey,
  setFeatureToggle,
} from '../../services/feature-toggles';
import { recordAuditEvent, type UserLanguage } from '../../services/firestore';
import { canManageQuoteLines, syncStaffProfile } from '../quote-access';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const adminOnlyReply = (language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: tr(language, 'คำสั่งนี้สำหรับผู้ดูแลฝ่ายขาย', 'This action is for sales administrators.'),
    language,
    tone: 'error',
  });

const labeledRows = (language: UserLanguage, channel?: Parameters<typeof describeAllFeatureToggles>[0]) =>
  describeAllFeatureToggles(channel).map((row) => {
    const def = SERVICE_CATALOG.find(svc => svc.key === row.key);
    return {
      ...row,
      label: language === 'en' ? (def?.labelEn || row.key) : (def?.labelTh || row.key),
    };
  });

const listMessage = (language: UserLanguage, channel?: Parameters<typeof describeAllFeatureToggles>[0], notice?: string) =>
  createSalesFeatureTogglesFlexMessage({
    rows: labeledRows(language, channel),
    language,
    notice,
  });

const salesFeaturesListHandler: CommandHandler = {
  name: 'sales-features-list',
  match: (u) => u === 'SALES FEATURES' || u === 'SALES FEATURE',
  handle: async (ctx) => {
    const profile = await syncStaffProfile(ctx.userId, ctx.profile);
    if (!canManageQuoteLines(profile)) return [adminOnlyReply(ctx.userLanguage)];
    await ensureFeatureTogglesLoaded();
    return [listMessage(ctx.userLanguage, ctx.channel)];
  },
};

const salesFeatureToggleHandler: CommandHandler = {
  name: 'sales-feature-toggle',
  match: (u) => u.startsWith('SALES FEATURE ') && u !== 'SALES FEATURE',
  handle: async (ctx) => {
    const profile = await syncStaffProfile(ctx.userId, ctx.profile);
    if (!canManageQuoteLines(profile)) return [adminOnlyReply(ctx.userLanguage)];

    const parts = ctx.text.trim().split(/\s+/);
    const key = parseServiceToggleKey(parts[2] || '');
    const action = (parts[3] || '').toUpperCase();
    if (!key || (action !== 'ON' && action !== 'OFF')) {
      await ensureFeatureTogglesLoaded();
      return [listMessage(ctx.userLanguage, ctx.channel, tr(ctx.userLanguage,
        'รูปแบบ: SALES FEATURE catalog OFF',
        'Usage: SALES FEATURE catalog OFF',
      ))];
    }

    const result = await setFeatureToggle(key, action === 'ON', ctx.channel);
    if (!result.ok && result.reason === 'env-forced') {
      recordAuditEvent({
        action: 'sales_feature_toggle',
        outcome: 'failure',
        actorUserId: ctx.userId,
        channelId: ctx.channel?.channelId,
        requestId: ctx.requestId,
        detail: `env-forced:${key}`,
      });
      return [listMessage(ctx.userLanguage, ctx.channel, tr(ctx.userLanguage,
        `เปิด ${key} ไม่ได้ เพราะ env ปิดบริการนี้ไว้`,
        `Cannot turn ${key} on — env has this service disabled.`,
      ))];
    }

    recordAuditEvent({
      action: 'sales_feature_toggle',
      outcome: 'success',
      actorUserId: ctx.userId,
      channelId: ctx.channel?.channelId,
      requestId: ctx.requestId,
      detail: `${key}:${action}`,
    });
    return [listMessage(ctx.userLanguage, ctx.channel)];
  },
};

export const salesFeaturesHandlers: CommandHandler[] = [
  salesFeaturesListHandler,
  salesFeatureToggleHandler,
];
