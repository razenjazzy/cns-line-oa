/**
 * Command router — single source of truth for LINE command dispatch.
 *
 * Shared by:
 *   - src/line/webhook.ts  (real LINE traffic, per-channel signature validated)
 *   - src/index.ts         (/webhook-test, signature-free dev harness)
 *
 * Architecture (refactored):
 *   The original 637-line if/else chain is replaced by a modular
 *   CommandHandler registry (src/line/handlers/index.ts). Each domain
 *   is a self-contained file. Adding a new command = add one file.
 *
 * Dispatch order:
 *   1. Guided-form intercept  (unchanged)
 *   2. First-contact menu     (unchanged)
 *   3. Service channel gate   (unchanged)
 *   4. Guided FORM * handler  (unchanged)
 *   5. Handler registry       (NEW — replaces the if/else chain)
 *   6. Keyword guidance       (near-miss suggestions)
 *   7. AI chat fallback       (Gemini → ClawBridge → heuristic)
 */

import { messagingApi } from '@line/bot-sdk';
import {
  markConsentNoticeShown,
  markUserFirstContact,
  setUserPendingFlow,
  getUserProfile,
  UserLanguage,
  UserProfile,
} from '../services/firestore';
import { isServiceConfigured, isServiceEnabledForChannel, isCommandDisabled } from '../services/service-catalog';
import { resolveServiceForCommand } from '../services/service-catalog';
import { FLOW_SPECS, getFlowByStartCommand } from '../services/guided-forms';
import { createBotTextFlexMessage, createFormPromptFlexMessage, createOptionalSummaryFlexMessage, createServiceHomeFlexMessage } from './templates';
import { getAvailableServices } from '../services/service-catalog';
import { ChannelContext, DEFAULT_CHANNEL_ID, getBrandTitle } from './channels';
import { linkUserRichMenu, trayVariantForCommand } from './rich-menu';
import { clearSalesLogin, hasActiveSalesSession, salesSessionExpired } from '../services/sales-session';
import type { FlowSpec } from '../services/guided-forms';
import { COMMAND_HANDLERS } from './handlers/index';
import { buildKeywordGuidanceMessages } from './handlers/help';
import { handleChatFallback } from './handlers/chat-fallback';
import { checkMessagesAgainstLineLimits } from './message-limits';
import { bindPostbackData } from './postback';
import { withSpan } from '../observability/tracing';
import { appLogger } from '../services/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandReplyContext = {
  text: string;
  userId: string;
  userLanguage: UserLanguage;
  profile: UserProfile;
  agentName: string;
  baseUrl: string;
  requestId?: string;
  channel?: ChannelContext;
  isGroupContext?: boolean;
  /** Set only after ACTION VERIFY so the original CUD can run once. */
  actionOtpReplay?: boolean;
};

// ---------------------------------------------------------------------------
// Shared helpers (used by handler modules via import)
// ---------------------------------------------------------------------------

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const inferTone = (value: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = value.toLowerCase();
  if (/failed|fail|error|unauthorized|invalid|not found|ไม่สำเร็จ|ไม่พบ|ล้มเหลว|ไม่ได้|ผิด/.test(lower)) return 'error';
  if (/warning|notice|รอสักครู่|กำลัง|ตรวจสอบ/.test(lower)) return 'warning';
  if (/success|created|updated|deleted|enabled|disabled|complete|สำเร็จ|เรียบร้อย|แล้ว/.test(lower)) return 'success';
  return 'info';
};

export const text = (
  value: string,
  language: UserLanguage = 'en',
  title?: string,
  actions?: { label: string; text: string; style?: 'primary' | 'secondary' }[],
): messagingApi.Message =>
  createBotTextFlexMessage({
    title: title || getBrandTitle(language),
    body: value,
    language,
    tone: inferTone(value),
    actions,
  });

export const buildHomeMenuMessage = (
  language: UserLanguage,
  agentName: string,
  channel: ChannelContext | undefined,
  isAdmin: boolean,
  salesSessionActive = false,
): messagingApi.Message => {
  const availableServices = getAvailableServices(channel, isAdmin);
  const menuItems = [
    { key: 'VERIFY', label: tr(language, 'ยืนยันตัวตน', 'Verify account') },
    ...availableServices.map(svc => ({ key: svc.key, label: language === 'en' ? svc.labelEn : svc.labelTh })),
  ];
  return createServiceHomeFlexMessage(menuItems, language, agentName, salesSessionActive);
};

// ---------------------------------------------------------------------------
// Guided form helpers
// ---------------------------------------------------------------------------

const GUIDED_FORM_TTL_MINUTES = Number(process.env.GUIDED_FORM_TTL_MINUTES || 10);
const buildFlowExpiry = (): string => new Date(Date.now() + GUIDED_FORM_TTL_MINUTES * 60 * 1000).toISOString();

const buildFormPromptMessage = async (
  language: UserLanguage,
  agentName: string,
  flowSpec: FlowSpec,
  stepIndex: number,
  userId: string,
  promptOverride?: string,
  contextNote?: string,
  collected: Record<string, string> = {},
): Promise<messagingApi.Message> => {
  const field = flowSpec.fields[stepIndex];
  const options = field.loadOptions
    ? await field.loadOptions(collected).catch(err => { console.warn('buildFormPromptMessage: loadOptions failed (non-fatal):', err); return []; })
    : undefined;
  const savedPhoneNote = field.key === 'phone' && options?.[0]
    ? tr(language,
      `เบอร์ใน Odoo: ${options[0]}`,
      `Saved in Odoo: ${options[0]}`,
    )
    : undefined;
  return createFormPromptFlexMessage({
    title: tr(language, `${agentName} ${flowSpec.labelTh}`, `${agentName} ${flowSpec.labelEn}`),
    prompt: promptOverride || tr(language, field.promptTh, field.promptEn),
    stepIndex,
    totalSteps: flowSpec.fields.length,
    language,
    optional: field.optional,
    options,
    contextNote: contextNote || savedPhoneNote,
    datePickerData: field.widget === 'date' ? bindPostbackData(`form.date.${field.key}`, userId) : undefined,
  });
};

/**
 * Runs once, the moment a flow first enters summary mode — fills in any
 * field from FlowSpec.optionalSummaryStartIndex onward that declares a
 * defaultValue and hasn't already been answered (e.g. typed during the
 * flow's earlier linear phase, before summary mode existed for this
 * field range). Never overwrites a value the user already provided.
 */
const applyFieldDefaults = async (flowSpec: FlowSpec, collected: Record<string, string>): Promise<Record<string, string>> => {
  const startIndex = flowSpec.optionalSummaryStartIndex ?? flowSpec.fields.length;
  const withDefaults = { ...collected };
  for (const field of flowSpec.fields.slice(startIndex)) {
    if (withDefaults[field.key]) continue;
    if (field.defaultValue) {
      withDefaults[field.key] = field.defaultValue();
      continue;
    }
    if (field.loadDefault) {
      const loaded = await field.loadDefault().catch(err => {
        console.warn('applyFieldDefaults: loadDefault failed (non-fatal):', err);
        return undefined;
      });
      if (loaded) withDefaults[field.key] = loaded;
    }
  }
  return withDefaults;
};

const nextUnfilledIndex = (flowSpec: FlowSpec, collected: Record<string, string>, fromIndex: number): number => {
  const stop = flowSpec.optionalSummaryStartIndex ?? flowSpec.fields.length;
  let i = fromIndex;
  while (i < stop && collected[flowSpec.fields[i].key]) i += 1;
  return i;
};

const buildOptionalSummaryMessage = (
  language: UserLanguage,
  agentName: string,
  flowSpec: FlowSpec,
  collected: Record<string, string>,
): messagingApi.Message => {
  const startIndex = flowSpec.optionalSummaryStartIndex ?? flowSpec.fields.length;
  const fields = flowSpec.fields.slice(startIndex).map((field, offset) => ({
    index: startIndex + offset,
    label: tr(language, field.summaryLabelTh || field.promptTh, field.summaryLabelEn || field.promptEn),
    value: collected[field.key] || undefined,
  }));
  return createOptionalSummaryFlexMessage({
    title: tr(language, `${agentName} ${flowSpec.labelTh}`, `${agentName} ${flowSpec.labelEn}`),
    fields,
    language,
    finalizeLabel: tr(language, 'สร้างเลย', 'Create now'),
  });
};

// ---------------------------------------------------------------------------
// Guided form step handler
// ---------------------------------------------------------------------------

const handleGuidedFormStep = async (ctx: CommandReplyContext): Promise<messagingApi.Message[]> => {
  const { profile, userId, userLanguage, agentName } = ctx;
  const trimmed = ctx.text.trim();
  const upperText = trimmed.toUpperCase();
  const pending = profile.pendingFlow!;

  const flowSpec = FLOW_SPECS[pending.flow as keyof typeof FLOW_SPECS];

  if (!flowSpec) {
    await setUserPendingFlow(userId, null);
    return [];
  }

  if (upperText === 'CANCEL' || upperText === 'BACK' || upperText === 'NAV HOME' || upperText === 'NAV') {
    await setUserPendingFlow(userId, null);
    return [
      text(tr(userLanguage, `${agentName} ยกเลิกแบบฟอร์มแล้ว`, `${agentName} form cancelled.`)),
      buildHomeMenuMessage(userLanguage, agentName, ctx.channel, profile.role === 'admin', hasActiveSalesSession(profile)),
    ];
  }

  // --- Grouped optional-fields summary mode ---
  if (pending.summaryMode) {
    if (upperText === 'FORM FINALIZE') {
      await setUserPendingFlow(userId, null);
      const finalCommandText = flowSpec.buildFinalCommand(pending.collected);
      return resolveCommandReply({ ...ctx, text: finalCommandText, profile: { ...profile, pendingFlow: undefined } });
    }

    const fieldMatch = pending.editingFieldIndex === undefined ? upperText.match(/^FORM FIELD (\d+)$/) : null;
    if (fieldMatch) {
      const idx = Number(fieldMatch[1]);
      if (flowSpec.fields[idx]) {
        await setUserPendingFlow(userId, { ...pending, editingFieldIndex: idx, expiresAt: buildFlowExpiry() });
        return [await buildFormPromptMessage(userLanguage, agentName, flowSpec, idx, userId, undefined, undefined, pending.collected)];
      }
    }

    if (pending.editingFieldIndex !== undefined) {
      const field = flowSpec.fields[pending.editingFieldIndex];
      const isSkip = Boolean(field.optional) && upperText === 'SKIP';
      const value = isSkip ? '' : trimmed;

      if (!isSkip && !field.validate(value)) {
        return [await buildFormPromptMessage(
          userLanguage, agentName, flowSpec, pending.editingFieldIndex, userId,
          tr(userLanguage,
            `ค่าที่กรอกไม่ถูกต้อง กรุณาลองใหม่\n${field.promptTh}`,
            `That doesn't look right, please try again.\n${field.promptEn}`,
          ),
          undefined,
          pending.collected,
        )];
      }

      const collected = { ...pending.collected, [field.key]: value };
      // Omit editingFieldIndex entirely rather than setting it to
      // `undefined` — the Firestore SDK rejects any document field whose
      // value is `undefined` outright (throws, not a no-op), which was
      // silently failing this exact write and rolling the cache back to
      // the pre-edit state, discarding whatever the user just answered.
      const { editingFieldIndex: _clearedFieldIndex, ...pendingWithoutEditingField } = pending;
      await setUserPendingFlow(userId, { ...pendingWithoutEditingField, collected, expiresAt: buildFlowExpiry() });
      return [buildOptionalSummaryMessage(userLanguage, agentName, flowSpec, collected)];
    }

    // Idling at the summary card with unrecognized input — re-show it
    // rather than treating stray text as an error.
    return [buildOptionalSummaryMessage(userLanguage, agentName, flowSpec, pending.collected)];
  }

  // --- Linear one-field-at-a-time mode (existing behavior) ---
  const field = flowSpec.fields[pending.stepIndex];
  const isSkip = Boolean(field.optional) && upperText === 'SKIP';
  const value = isSkip ? '' : trimmed;

  if (!isSkip && !field.validate(value)) {
    return [await buildFormPromptMessage(
      userLanguage, agentName, flowSpec, pending.stepIndex, userId,
      tr(userLanguage,
        `ค่าที่กรอกไม่ถูกต้อง กรุณาลองใหม่\n${field.promptTh}`,
        `That doesn't look right, please try again.\n${field.promptEn}`,
      ),
      undefined,
      pending.collected,
    )];
  }

  const collected = { ...pending.collected, [field.key]: value };
  const nextIndex = nextUnfilledIndex(flowSpec, collected, pending.stepIndex + 1);

  if (flowSpec.optionalSummaryStartIndex !== undefined && nextIndex >= flowSpec.optionalSummaryStartIndex) {
    const collectedWithDefaults = await applyFieldDefaults(flowSpec, collected);
    await setUserPendingFlow(userId, {
      flow: flowSpec.key,
      stepIndex: nextIndex,
      collected: collectedWithDefaults,
      expiresAt: buildFlowExpiry(),
      summaryMode: true,
    });
    return [buildOptionalSummaryMessage(userLanguage, agentName, flowSpec, collectedWithDefaults)];
  }

  if (nextIndex >= flowSpec.fields.length) {
    await setUserPendingFlow(userId, null);
    const finalCommandText = flowSpec.buildFinalCommand(collected);
    return resolveCommandReply({ ...ctx, text: finalCommandText, profile: { ...profile, pendingFlow: undefined } });
  }

  await setUserPendingFlow(userId, {
    flow: flowSpec.key,
    stepIndex: nextIndex,
    collected,
    expiresAt: buildFlowExpiry(),
  });
  return [await buildFormPromptMessage(userLanguage, agentName, flowSpec, nextIndex, userId, undefined, undefined, collected)];
};

// ---------------------------------------------------------------------------
// FORM * handler
// ---------------------------------------------------------------------------

const handleFormCommand = async (ctx: CommandReplyContext): Promise<messagingApi.Message[] | null> => {
  const { profile, userId, userLanguage, agentName } = ctx;
  const upperText = ctx.text.trim().toUpperCase();

  if (!upperText.startsWith('FORM ')) return null;

  if (/^FORM FIELD \d+$/.test(upperText)) {
    return [text(tr(userLanguage,
      `${agentName} ฟิลด์นี้ไม่ได้เปิดอยู่ กรุณาเริ่มสร้างใบเสนอราคาใหม่`,
      `${agentName} that field is no longer open. Start Create a quote again.`,
    ), userLanguage)];
  }

  if (upperText === 'FORM QUOTE CREATE FROM CARD') {
    const product = profile.lastProductContext;
    const flowSpec = FLOW_SPECS.QUOTE_CREATE;
    if (!product?.productName) {
      return handleFormCommand({ ...ctx, text: 'FORM QUOTE CREATE' });
    }
    if (flowSpec.requiresAdmin && profile.role !== 'admin') {
      return [text(tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.'), userLanguage)];
    }
    if (ctx.isGroupContext) {
      return [text(tr(userLanguage,
        `${agentName} แบบฟอร์มทีละขั้นใช้ไม่ได้ในแชทกลุ่ม กรุณาใช้คำสั่งบรรทัดเดียวแทน`,
        `${agentName} step-by-step forms aren't available in group chats.`,
      ), userLanguage)];
    }
    const qtyIndex = Math.max(flowSpec.fields.findIndex(field => field.key === 'qty'), 1);
    await setUserPendingFlow(userId, {
      flow: flowSpec.key,
      stepIndex: qtyIndex,
      collected: { productName: product.productName, productId: String(product.productId) },
      expiresAt: buildFlowExpiry(),
    });
    return [await buildFormPromptMessage(
      userLanguage,
      agentName,
      flowSpec,
      qtyIndex,
      userId,
      undefined,
      tr(userLanguage, `ใช้สินค้า: ${product.productName}`, `Using: ${product.productName}`),
      { productName: product.productName, productId: String(product.productId) },
    )];
  }

  const flowSpec = getFlowByStartCommand(upperText);
  if (!flowSpec) {
    return [text(tr(userLanguage, `${agentName} ไม่พบแบบฟอร์มนี้`, `${agentName} form not found.`), userLanguage)];
  }

  if (flowSpec.requiresAdmin && profile.role !== 'admin') {
    return [text(tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.'), userLanguage)];
  }

  if (ctx.isGroupContext) {
    return [text(tr(userLanguage,
      `${agentName} แบบฟอร์มทีละขั้นใช้ไม่ได้ในแชทกลุ่ม กรุณาใช้คำสั่งบรรทัดเดียวแทน เช่น: ${flowSpec.startCommand.replace('FORM ', '')} ...`,
      `${agentName} step-by-step forms aren't available in group chats. Please use the single-line command instead, e.g.: ${flowSpec.startCommand.replace('FORM ', '')} ...`,
    ), userLanguage)];
  }

  if (flowSpec.key === 'VERIFY' && hasActiveSalesSession(profile)) {
    return [createBotTextFlexMessage({
      title: tr(userLanguage, 'ปิดเซสชันยืนยัน?', 'End verification session?'),
      body: tr(userLanguage, 'แตะยืนยันเพื่อออกจากเซสชัน Sales หรือยกเลิกเพื่อใช้งานต่อ', 'Confirm to sign out of the sales session, or cancel to keep it on.'),
      language: userLanguage,
      tone: 'warning',
      actions: [
        { label: tr(userLanguage, 'ยืนยันออก', 'Sign out'), text: 'VERIFY SIGNOUT', style: 'primary' },
        { label: tr(userLanguage, 'ยกเลิก', 'Cancel'), text: 'NAV HOME', style: 'secondary' },
      ],
    })];
  }

  await setUserPendingFlow(userId, {
    flow: flowSpec.key,
    stepIndex: 0,
    collected: {},
    expiresAt: buildFlowExpiry(),
  });
  const prompt = await buildFormPromptMessage(userLanguage, agentName, flowSpec, 0, userId);
  if (flowSpec.key === 'VERIFY' && profile.odooVerified) {
    return [
      text(tr(userLanguage,
        `${agentName} คุณยืนยันตัวตนแล้ว หากยืนยันอีกครั้ง ระบบจะยกเลิกเซสชันเดิมแล้วเริ่มใหม่`,
        `${agentName} you are already verified. Verify again to replace the previous session and start over.`,
      ), userLanguage),
      prompt,
    ];
  }
  return [prompt];
};

// ---------------------------------------------------------------------------
// Main dispatch — resolveCommandReply
// ---------------------------------------------------------------------------

const isGuestAllowedCommand = (upperText: string, pendingFlow?: { flow: string }): boolean => {
  if (pendingFlow?.flow === 'VERIFY') return true;
  if (upperText === 'NAV HOME' || upperText === 'NAV' || upperText === 'BACK') return true;
  if (upperText === 'NAV VERIFY' || upperText.startsWith('FORM VERIFY') || upperText.startsWith('VERIFY ')) return true;
  if (upperText === 'LANG' || upperText.startsWith('LANG ') || upperText === 'ENGLISH' || upperText === 'THAI' || upperText === 'ภาษาไทย') return true;
  if (upperText === 'GUIDE' || upperText.startsWith('GUIDE ')) return true;
  if (upperText === 'MY DATA' || upperText === 'DELETE MY DATA') return true;
  if (upperText === 'START' || upperText === 'HELP' || upperText === 'OPTIONS' || upperText === 'MENU' || upperText === 'เริ่มต้น') return true;
  return false;
};

const dispatchCommandReply = async (ctx: CommandReplyContext): Promise<messagingApi.Message[]> => {
  const { userId, userLanguage, agentName } = ctx;
  if (salesSessionExpired(ctx.profile)) {
    await clearSalesLogin(userId);
    ctx.profile = { ...ctx.profile, odooVerified: false, salesSessionExpiresAt: undefined };
  }
  const { profile } = ctx;
  const trimmed = ctx.text.trim();
  const upperText = trimmed.toUpperCase();
  const sessionOn = hasActiveSalesSession(profile);
  const trayVariant = trayVariantForCommand(trimmed);
  if (trayVariant && !ctx.isGroupContext) {
    await linkUserRichMenu(userId, userLanguage, ctx.channel?.channelId || DEFAULT_CHANNEL_ID, trayVariant, sessionOn);
  }

  // Step 1: Guided form intercept
  if (profile.pendingFlow) {
    if (!profile.odooVerified && profile.pendingFlow.flow !== 'VERIFY') {
      await setUserPendingFlow(userId, null);
    } else {
      const result = await handleGuidedFormStep(ctx);
      if (result.length > 0) return result;
    }
  }

  // Step 2: First-contact → PDPA data-collection notice (once, informational —
  // does not block any feature) + show home menu immediately
  if (!profile.firstMessageAt && !ctx.isGroupContext) {
    await markUserFirstContact(userId);
    await markConsentNoticeShown(userId);
    return [
      text(tr(userLanguage,
        `ก่อนเริ่มใช้งาน ${agentName} ขอเก็บข้อมูลที่คุณให้ไว้ (เช่น เบอร์โทร ชื่อ) เพื่อยืนยันตัวตนและให้บริการเท่านั้น`,
        `Before we begin: ${agentName} stores what you share (like your phone number and name) only to verify your identity and provide service.`,
      ), userLanguage, undefined, [
        { label: tr(userLanguage, 'ข้อมูลของฉัน', 'My data'), text: 'MY DATA', style: 'primary' },
        { label: tr(userLanguage, 'ลบข้อมูล', 'Delete my data'), text: 'DELETE MY DATA', style: 'secondary' },
      ]),
      buildHomeMenuMessage(userLanguage, agentName, ctx.channel, profile.role === 'admin', false),
    ];
  }

  if (!profile.odooVerified && !isGuestAllowedCommand(upperText, profile.pendingFlow)) {
    return [text(tr(userLanguage,
      `${agentName} กรุณายืนยันด้วยเบอร์ในบัญชีผู้ใช้ Odoo ก่อนใช้บริการ ลูกค้าที่ไม่ได้ยืนยันจะเห็นเฉพาะข้อความที่ผู้ใช้ Odoo ส่งมา`,
      `${agentName} verify with the phone on your Odoo user account before using services. Unverified customers only see messages a verified Odoo user sends.`,
    ), userLanguage, undefined, [
      { label: tr(userLanguage, 'ยืนยันตัวตน', 'Verify'), text: 'FORM VERIFY', style: 'primary' },
    ])];
  }

  // Step 3: Service channel gate
  const gatedService = resolveServiceForCommand(upperText);
  if (gatedService && (!isServiceConfigured(gatedService) || !isServiceEnabledForChannel(gatedService, ctx.channel))) {
    return [text(tr(userLanguage,
      `${agentName} บริการนี้ไม่เปิดใช้งานสำหรับช่องทางนี้`,
      `${agentName} this service is not available on this channel.`,
    ), userLanguage)];
  }

  if (isCommandDisabled(upperText)) {
    return [text(tr(userLanguage,
      `${agentName} คำสั่งนี้ถูกปิดใช้งาน`,
      `${agentName} this command is disabled.`,
    ), userLanguage)];
  }

  // Step 4: FORM * guided form start
  const formResult = await handleFormCommand(ctx);
  if (formResult !== null) return formResult;

  // Step 5: Handler registry (skill-based dispatch)
  for (const handler of COMMAND_HANDLERS) {
    if (handler.match(upperText, ctx)) {
      return handler.handle(ctx);
    }
  }

  // Step 6: Keyword proximity guidance (near-miss suggestions)
  const guidanceMessages = buildKeywordGuidanceMessages({
    text: trimmed,
    userLanguage,
    agentName,
    channel: ctx.channel,
    profile,
  });
  if (guidanceMessages) return guidanceMessages;

  // Step 7: AI chat fallback (Gemini → ClawBridge → Odoo heuristic)
  return handleChatFallback(ctx);
};

/**
 * Thin wrapper around the dispatch logic above — the single choke point both
 * webhook.ts and index.ts's /webhook-test send through, so every outgoing
 * message set gets checked against LINE's hard limits (src/line/message-limits.ts)
 * in one place instead of duplicating the check at each call site. A
 * violation here means the send is about to fail with the customer getting
 * nothing — logged loudly rather than discovered from a support ticket.
 */
export const resolveCommandReply = async (ctx: CommandReplyContext): Promise<messagingApi.Message[]> => {
  return withSpan('line.resolveCommandReply', { 'line.user_id': ctx.userId, 'http.request_id': ctx.requestId || '' }, async () => {
    const trayVariant = trayVariantForCommand(ctx.text.trim());
    const messages = await dispatchCommandReply(ctx);
    if (trayVariant && !ctx.isGroupContext) {
      const latest = await getUserProfile(ctx.userId);
      await linkUserRichMenu(
        ctx.userId,
        latest.language || ctx.userLanguage,
        ctx.channel?.channelId || DEFAULT_CHANNEL_ID,
        'default',
        hasActiveSalesSession(latest),
      );
    }
    const violations = checkMessagesAgainstLineLimits(messages);
    if (violations.length) {
      appLogger.error('line_limits_violation', { requestId: ctx.requestId, violations });
    }
    return messages;
  });
};
