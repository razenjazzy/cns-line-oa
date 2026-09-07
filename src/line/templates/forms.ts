import { messagingApi } from '@line/bot-sdk';
import { t, tFill } from '../../services/i18n';
import { BRAND, buttonLabel, createDatePickerButton, createMessageActionButton, truncate, type ReportLanguage } from './shared';

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
  contextNote?: string;
  datePickerData?: string;
}): messagingApi.FlexMessage => {
  const actions = [
    ...(params.optional ? [{ label: t('skip', params.language), text: 'SKIP' }] : []),
    { label: t('cancelForm', params.language), text: 'CANCEL' },
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
          { type: 'text', text: tFill('stepOf', params.language, { current: params.stepIndex + 1, total: params.totalSteps }), size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingBottom: 'lg',
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
                  ? t('tapOptionOrType', params.language)
                  : params.datePickerData
                    ? t('pickDateOrType', params.language)
                    : t('typeAnswer', params.language),
                size: 'xs', color: BRAND.inkSoft, wrap: true,
              },
              ...(params.contextNote ? [{ type: 'text' as const, text: params.contextNote, size: 'sm' as const, color: BRAND.tealStrong, wrap: true, margin: 'sm' as const }] : []),
              { type: 'text', text: params.prompt, size: 'md', color: BRAND.ink, weight: 'bold', margin: 'sm', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...(params.datePickerData ? [createDatePickerButton(t('pickDate', params.language), params.datePickerData)] : []),
          ...actions.map(action => createMessageActionButton(action.label, action.text, action.text === 'CANCEL' ? 'secondary' : 'primary', action.text === 'CANCEL' ? BRAND.goldTint : BRAND.teal)),
        ],
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
        action: { type: 'message' as const, label: buttonLabel(`${f.value ? '☑' : '☐'} ${f.label}`), text: `FORM FIELD ${f.index}` },
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
          { type: 'text', text: t('optionalSummaryHint', params.language), size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingBottom: 'lg',
        contents: params.fields.map(f => ({
          type: 'box' as const,
          layout: 'horizontal' as const,
          spacing: 'sm' as const,
          backgroundColor: BRAND.paper,
          cornerRadius: BRAND.radius,
          paddingAll: 'md' as const,
          action: { type: 'message' as const, text: `FORM FIELD ${f.index}` },
          contents: [
            f.value
              ? {
                  type: 'box' as const,
                  layout: 'vertical' as const,
                  width: '22px',
                  height: '22px',
                  cornerRadius: '11px',
                  backgroundColor: BRAND.teal,
                  justifyContent: 'center' as const,
                  flex: 0,
                  contents: [{
                    type: 'text' as const,
                    text: '✓',
                    size: 'xs' as const,
                    color: '#FFFFFF',
                    align: 'center' as const,
                    gravity: 'center' as const,
                  }],
                }
              : {
                  type: 'box' as const,
                  layout: 'vertical' as const,
                  width: '22px',
                  height: '22px',
                  flex: 0,
                  contents: [{ type: 'filler' as const }],
                },
            {
              type: 'text' as const,
              text: f.label,
              size: 'sm' as const,
              color: BRAND.inkSoft,
              wrap: true,
              flex: 2,
              gravity: 'center' as const,
            },
            {
              type: 'text' as const,
              text: f.value || ' ',
              size: 'sm' as const,
              weight: 'bold' as const,
              color: f.value ? BRAND.ink : BRAND.inkSoft,
              wrap: true,
              align: 'end' as const,
              flex: 3,
              gravity: 'center' as const,
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
