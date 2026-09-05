import { messagingApi } from '@line/bot-sdk';
import { getAgentName } from '../channels';
import { BRAND, createMessageActionButton, createUriActionButton, formatMoney, truncate, type ReportLanguage } from './shared';

export const createBotTextFlexMessage = (params: {
  title: string;
  body: string;
  language: ReportLanguage;
  tone?: 'info' | 'success' | 'warning' | 'error';
  primaryAction?: { label: string; text: string };
  secondaryAction?: { label: string; text: string };
  /** Optional quick-reply chips (e.g. Confirm/Cancel on a destructive action). */
  quickReplyActions?: { label: string; text: string }[];
  /**
   * A real tappable link (e.g. the Odoo verification link), rendered as the
   * top footer button. When present, primaryAction/Home is demoted to a
   * secondary button since the link becomes the message's main call to
   * action.
   */
  linkAction?: { label: string; uri: string };
}): messagingApi.FlexMessage => {
  const tone = params.tone || 'info';
  const toneColor = tone === 'error'
    ? '#B42318'
    : tone === 'warning'
      ? BRAND.gold
      : tone === 'success'
        ? BRAND.teal
        : BRAND.tealStrong;
  const titlePrefix = tone === 'error'
    ? (params.language === 'en' ? 'Needs attention' : 'ต้องตรวจสอบ')
    : tone === 'warning'
      ? (params.language === 'en' ? 'Notice' : 'แจ้งเตือน')
      : tone === 'success'
        ? (params.language === 'en' ? 'Done' : 'สำเร็จ')
        : params.title;

  return {
    type: 'flex',
    altText: truncate(`${params.title}: ${params.body}`, 380),
    ...(params.quickReplyActions?.length ? {
      quickReply: {
        items: params.quickReplyActions.slice(0, 13).map(action => ({
          type: 'action' as const,
          action: { type: 'message' as const, label: action.label, text: action.text },
        })),
      },
    } : {}),
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
          { type: 'text', text: titlePrefix, color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: params.title, color: '#DDEBE9', size: 'xs', margin: 'xs', wrap: true },
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
            backgroundColor: tone === 'warning' ? BRAND.goldTint : BRAND.tealTint,
            cornerRadius: BRAND.radius,
            paddingAll: 'md',
            contents: [
              { type: 'text', text: params.body, color: tone === 'error' ? '#7A271A' : BRAND.ink, size: 'sm', wrap: true },
            ],
          },
          { type: 'text', text: params.language === 'en' ? 'Use the buttons below for the next step.' : 'ใช้ปุ่มด้านล่างเพื่อไปขั้นตอนถัดไป', size: 'xs', color: toneColor, wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...(params.linkAction ? [createUriActionButton(params.linkAction.label, params.linkAction.uri, 'primary', BRAND.teal)] : []),
          createMessageActionButton(
            params.primaryAction?.label || (params.language === 'en' ? 'Home' : 'หน้าหลัก'),
            params.primaryAction?.text || 'NAV HOME',
            params.linkAction ? 'secondary' : 'primary',
            params.linkAction ? BRAND.goldTint : BRAND.teal
          ),
          ...(params.secondaryAction ? [createMessageActionButton(params.secondaryAction.label, params.secondaryAction.text, 'secondary', BRAND.goldTint)] : []),
        ],
      },
    },
  };
};

export const createDailyReportFlexMessage = (reportData: any, insights: string, language: ReportLanguage = 'th'): messagingApi.FlexMessage => {
  const agentName = getAgentName();
  const rows = (() => {
    try {
      const parsed = JSON.parse(String(reportData)) as Array<{ product?: string; salesYesterday?: number; revenueYesterday?: number; stock?: number }>;
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch {
      return [];
    }
  })();

  return {
    type: 'flex',
    altText: language === 'en' ? 'Daily sales and inventory report' : 'สรุปรายงานยอดขายและสต็อกประจำวัน',
    contents: {
      type: 'bubble',
      styles: {
        header: { backgroundColor: BRAND.tealStrong },
        body: { backgroundColor: BRAND.surface },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: language === 'en' ? `Daily report by ${agentName}` : `รายงานประจำวันโดย ${agentName}`, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: insights, wrap: true, size: 'sm', color: BRAND.ink },
          ...(rows.length ? [{ type: 'separator', margin: 'md' } as const] : []),
          ...rows.flatMap(row => ([
            { type: 'text', text: row.product || '-', weight: 'bold', size: 'sm', margin: 'md', wrap: true, color: BRAND.tealStrong } as const,
            { type: 'text', text: language === 'en'
              ? `Sales ${Number(row.salesYesterday || 0).toFixed(0)} | Revenue ${formatMoney(row.revenueYesterday || 0, language)} | Stock ${Number(row.stock || 0).toFixed(0)}`
              : `ขาย ${Number(row.salesYesterday || 0).toFixed(0)} | รายได้ ${formatMoney(row.revenueYesterday || 0, language)} | คงเหลือ ${Number(row.stock || 0).toFixed(0)}`,
              size: 'xs', color: BRAND.inkSoft, wrap: true } as const,
          ])),
        ],
      },
    },
  };
};
