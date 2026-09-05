import { messagingApi } from '@line/bot-sdk';
import { BRAND, buttonLabel, createMessageActionButton, truncate, type ReportLanguage } from './shared';

export const createFormPromptFlexMessage = (params: {
  title: string;
  prompt: string;
  stepIndex: number;
  totalSteps: number;
  language: ReportLanguage;
  optional?: boolean;
  /**
   * Tappable options for fields with a bounded, listable set of values
   * (e.g. product/service names) — select instead of type. Rendered as
   * quick-reply chips only (not footer buttons, which would get crowded
   * with more than a couple of options); Skip/Cancel remain as both.
   * Capped so the combined quick-reply list never exceeds LINE's 13-item limit.
   */
  options?: string[];
}): messagingApi.FlexMessage => {
  const actions = [
    ...(params.optional ? [{ label: params.language === 'en' ? 'Skip' : 'ข้าม', text: 'SKIP' }] : []),
    { label: params.language === 'en' ? 'Cancel' : 'ยกเลิก', text: 'CANCEL' },
  ];
  const optionItems = (params.options || []).slice(0, 13 - actions.length).map(value => ({
    type: 'action' as const,
    action: { type: 'message' as const, label: buttonLabel(value), text: value },
  }));

  return {
    type: 'flex',
    altText: truncate(params.prompt, 390),
    quickReply: {
      items: [
        ...optionItems,
        ...actions.map(action => ({
          type: 'action' as const,
          action: { type: 'message' as const, label: action.label, text: action.text },
        })),
      ],
    },
    contents: {
      type: 'bubble',
      styles: {
        header: { backgroundColor: BRAND.teal },
        body: { backgroundColor: BRAND.surface },
        footer: { backgroundColor: BRAND.surface },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: params.title, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
          { type: 'text', text: params.language === 'en' ? `Step ${params.stepIndex + 1} of ${params.totalSteps}` : `ขั้นตอน ${params.stepIndex + 1} จาก ${params.totalSteps}`, size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: BRAND.tealTint,
            cornerRadius: BRAND.radius,
            paddingAll: 'md',
            contents: [
              {
                type: 'text',
                text: params.options?.length
                  ? (params.language === 'en' ? 'Tap an option below, or type your own answer.' : 'แตะเลือกตัวเลือกด้านล่าง หรือพิมพ์คำตอบเอง')
                  : (params.language === 'en' ? 'Please type your answer in the chat box.' : 'กรุณาพิมพ์คำตอบในช่องแชท'),
                size: 'xs', color: BRAND.inkSoft, wrap: true,
              },
              { type: 'text', text: params.prompt, size: 'md', color: BRAND.ink, weight: 'bold', margin: 'sm', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: params.optional ? 'horizontal' : 'vertical',
        spacing: 'sm',
        contents: actions.map(action => createMessageActionButton(action.label, action.text, action.text === 'CANCEL' ? 'secondary' : 'primary', action.text === 'CANCEL' ? BRAND.goldTint : BRAND.teal)),
      },
    },
  };
};

/**
 * Grouped optional-fields step for a guided form (see FlowSpec.optionalSummaryStartIndex
 * in guided-forms.ts) — every remaining optional field shown together with
 * its current value, one quick-reply chip per field to fill just that one
 * (returns to this same card afterward), and one primary "finalize" button
 * to create with whatever's been filled. Replaces N sequential prompts with
 * one card for flows where that's a long journey for a repeat user.
 */
export const createOptionalSummaryFlexMessage = (params: {
  title: string;
  fields: { index: number; label: string; value?: string }[];
  language: ReportLanguage;
  finalizeLabel: string;
}): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: truncate(params.title, 390),
    quickReply: {
      items: params.fields.slice(0, 13).map(f => ({
        type: 'action' as const,
        action: { type: 'message' as const, label: buttonLabel(`${f.value ? '✓ ' : ''}${f.label}`), text: `FORM FIELD ${f.index}` },
      })),
    },
    contents: {
      type: 'bubble',
      styles: {
        header: { backgroundColor: BRAND.teal },
        body: { backgroundColor: BRAND.surface },
        footer: { backgroundColor: BRAND.surface },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: params.title, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
          { type: 'text', text: params.language === 'en' ? 'Optional — tap any to fill, or finalize as-is' : 'ไม่บังคับ — แตะเพื่อกรอก หรือสร้างได้เลย', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: params.fields.map(f => ({
          type: 'box' as const,
          layout: 'horizontal' as const,
          backgroundColor: BRAND.paper,
          cornerRadius: BRAND.radius,
          paddingAll: 'sm' as const,
          action: { type: 'message' as const, text: `FORM FIELD ${f.index}` },
          contents: [
            { type: 'text' as const, text: f.label, size: 'sm' as const, weight: 'bold' as const, color: BRAND.ink, flex: 2, wrap: true },
            {
              type: 'text' as const,
              text: f.value || (params.language === 'en' ? '(not set)' : '(ยังไม่ระบุ)'),
              size: 'sm' as const,
              color: f.value ? BRAND.tealStrong : BRAND.inkSoft,
              align: 'end' as const,
              flex: 3,
              wrap: true,
            },
          ],
        })),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [createMessageActionButton(params.finalizeLabel, 'FORM FINALIZE', 'primary', BRAND.teal)],
      },
    },
  };
};
