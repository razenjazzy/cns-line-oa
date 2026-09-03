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
  UserLanguage,
  UserProfile,
} from '../services/firestore';
import { isServiceEnabledForChannel } from '../services/service-catalog';
import { resolveServiceForCommand } from '../services/service-catalog';
import { FLOW_SPECS, getFlowByStartCommand } from '../services/guided-forms';
import { createBotTextFlexMessage, createFormPromptFlexMessage, createOptionalSummaryFlexMessage, createServiceHomeFlexMessage } from './templates';
import { getAvailableServices } from '../services/service-catalog';
import { ChannelContext } from './channels';
import type { FlowSpec } from '../services/guided-forms';
import { COMMAND_HANDLERS } from './handlers/index';
import { buildKeywordGuidanceMessages } from './handlers/help';
import { handleChatFallback } from './handlers/chat-fallback';
import { checkMessagesAgainstLineLimits } from './message-limits';

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
  channel?: ChannelContext;
  isGroupContext?: boolean;
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

const inferLanguage = (value: string): UserLanguage => /[\u0E00-\u0E7F]/.test(value) ? 'th' : 'en';

export const text = (value: string, language: UserLanguage = inferLanguage(value), title?: string): messagingApi.Message =>
  createBotTextFlexMessage({
    title: title || tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: inferTone(value),
  });

export const buildHomeMenuMessage = (
  language: UserLanguage,
  agentName: string,
  channel: ChannelContext | undefined,
  isAdmin: boolean,
): messagingApi.Message => {
  const availableServices = getAvailableServices(channel, isAdmin);
  const menuItems = [
    { key: 'VERIFY', label: tr(language, 'ยืนยันตัวตน', 'Verify account') },
    ...availableServices.map(svc => ({ key: svc.key, label: language === 'en' ? svc.labelEn : svc.labelTh })),
  ];
  return createServiceHomeFlexMessage(menuItems, language, agentName);
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
  promptOverride?: string,
): Promise<messagingApi.Message> => {
  const field = flowSpec.fields[stepIndex];
  // Best-effort: a picker-options load failure shouldn't block the step
  // itself — falls back to free-text entry (field.validate still applies).
  const options = field.loadOptions
    ? await field.loadOptions().catch(err => { console.warn('buildFormPromptMessage: loadOptions failed (non-fatal):', err); return []; })
    : undefined;
  return createFormPromptFlexMessage({
    title: tr(language, `${agentName} ${flowSpec.labelTh}`, `${agentName} ${flowSpec.labelEn}`),
    prompt: promptOverride || tr(language, field.promptTh, field.promptEn),
    stepIndex,
    totalSteps: flowSpec.fields.length,
    language,
    optional: field.optional,
    options,
  });
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
      buildHomeMenuMessage(userLanguage, agentName, ctx.channel, profile.role === 'admin'),
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
        return [await buildFormPromptMessage(userLanguage, agentName, flowSpec, idx)];
      }
    }

    if (pending.editingFieldIndex !== undefined) {
      const field = flowSpec.fields[pending.editingFieldIndex];
      const isSkip = Boolean(field.optional) && upperText === 'SKIP';
      const value = isSkip ? '' : trimmed;

      if (!isSkip && !field.validate(value)) {
        return [await buildFormPromptMessage(
          userLanguage, agentName, flowSpec, pending.editingFieldIndex,
          tr(userLanguage,
            `ค่าที่กรอกไม่ถูกต้อง กรุณาลองใหม่\n${field.promptTh}`,
            `That doesn't look right, please try again.\n${field.promptEn}`,
          ),
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
      userLanguage, agentName, flowSpec, pending.stepIndex,
      tr(userLanguage,
        `ค่าที่กรอกไม่ถูกต้อง กรุณาลองใหม่\n${field.promptTh}`,
        `That doesn't look right, please try again.\n${field.promptEn}`,
      ),
    )];
  }

  const collected = { ...pending.collected, [field.key]: value };
  const nextIndex = pending.stepIndex + 1;

  if (flowSpec.optionalSummaryStartIndex !== undefined && nextIndex === flowSpec.optionalSummaryStartIndex) {
    await setUserPendingFlow(userId, {
      flow: flowSpec.key,
      stepIndex: nextIndex,
      collected,
      expiresAt: buildFlowExpiry(),
      summaryMode: true,
    });
    return [buildOptionalSummaryMessage(userLanguage, agentName, flowSpec, collected)];
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
  return [await buildFormPromptMessage(userLanguage, agentName, flowSpec, nextIndex)];
};

// ---------------------------------------------------------------------------
// FORM * handler
// ---------------------------------------------------------------------------

const handleFormCommand = async (ctx: CommandReplyContext): Promise<messagingApi.Message[] | null> => {
  const { profile, userId, userLanguage, agentName } = ctx;
  const upperText = ctx.text.trim().toUpperCase();

  if (!upperText.startsWith('FORM ')) return null;

  const flowSpec = getFlowByStartCommand(upperText);
  if (!flowSpec) {
    return [text(tr(userLanguage, `${agentName} ไม่พบแบบฟอร์มนี้`, `${agentName} form not found.`))];
  }

  if (flowSpec.requiresAdmin && profile.role !== 'admin') {
    return [text(tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.'))];
  }

  if (ctx.isGroupContext) {
    return [text(tr(userLanguage,
      `${agentName} แบบฟอร์มทีละขั้นใช้ไม่ได้ในแชทกลุ่ม กรุณาใช้คำสั่งบรรทัดเดียวแทน เช่น: ${flowSpec.startCommand.replace('FORM ', '')} ...`,
      `${agentName} step-by-step forms aren't available in group chats. Please use the single-line command instead, e.g.: ${flowSpec.startCommand.replace('FORM ', '')} ...`,
    ))];
  }

  await setUserPendingFlow(userId, {
    flow: flowSpec.key,
    stepIndex: 0,
    collected: {},
    expiresAt: buildFlowExpiry(),
  });
  return [await buildFormPromptMessage(userLanguage, agentName, flowSpec, 0)];
};

// ---------------------------------------------------------------------------
// Main dispatch — resolveCommandReply
// ---------------------------------------------------------------------------

const dispatchCommandReply = async (ctx: CommandReplyContext): Promise<messagingApi.Message[]> => {
  const { profile, userId, userLanguage, agentName } = ctx;
  const trimmed = ctx.text.trim();
  const upperText = trimmed.toUpperCase();

  // Step 1: Guided form intercept
  if (profile.pendingFlow) {
    const result = await handleGuidedFormStep(ctx);
    if (result.length > 0) return result;
    // flowSpec was null — fall through to normal dispatch
  }

  // Step 2: First-contact → PDPA data-collection notice (once, informational —
  // does not block any feature) + show home menu immediately
  if (!profile.firstMessageAt && !ctx.isGroupContext) {
    await markUserFirstContact(userId);
    await markConsentNoticeShown(userId);
    return [
      text(tr(userLanguage,
        `ก่อนเริ่มใช้งาน ${agentName} ขอเก็บข้อมูลที่คุณให้ไว้ (เช่น เบอร์โทร ชื่อ) เพื่อยืนยันตัวตนและให้บริการเท่านั้น\nพิมพ์ MY DATA เพื่อดูข้อมูลของคุณ หรือ DELETE MY DATA เพื่อขอลบข้อมูลได้ทุกเมื่อ`,
        `Before we begin: ${agentName} stores what you share (like your phone number and name) only to verify your identity and provide service.\nType MY DATA anytime to see what's stored, or DELETE MY DATA to request erasure.`,
      ), userLanguage),
      buildHomeMenuMessage(userLanguage, agentName, ctx.channel, profile.role === 'admin'),
    ];
  }

  // Step 3: Service channel gate
  const gatedService = resolveServiceForCommand(upperText);
  if (gatedService && !isServiceEnabledForChannel(gatedService, ctx.channel)) {
    return [text(tr(userLanguage,
      `${agentName} บริการนี้ไม่เปิดใช้งานสำหรับช่องทางนี้`,
      `${agentName} this service is not available on this channel.`,
    ))];
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
  const messages = await dispatchCommandReply(ctx);
  const violations = checkMessagesAgainstLineLimits(messages);
  if (violations.length) {
    console.error('[line-limits] Outgoing message set violates LINE Messaging API limits and may fail to send:', violations);
  }
  return messages;
};
