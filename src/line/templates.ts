import { messagingApi } from '@line/bot-sdk';
import { getAgentName } from './channels';

type ReportLanguage = 'th' | 'en';

// Cloudnex brand palette — kept consistent across every Flex message.
const BRAND = {
  teal: '#0B6E6A',
  tealStrong: '#063F3D',
  tealTint: '#E3F0EE',
  gold: '#A97A2B',
  goldTint: '#F4E9D4',
  ink: '#10201E',
  inkSoft: '#5B6C69',
  surface: '#FFFFFF',
  paper: '#F1F4F2',
} as const;

const buttonLabel = (label: string): string => {
  const cleaned = label.trim();
  const chars = Array.from(cleaned);
  return chars.length > 20 ? `${chars.slice(0, 17).join('')}...` : cleaned;
};

/**
 * Single source of truth for money formatting — a proper Intl.NumberFormat
 * (locale-correct thousands separators, consistent decimals) plus the
 * currency suffix, in one call. Previously several call sites string-
 * concatenated `${value} บาท`/`${value} THB` directly with no formatting
 * at all, which read fine for small numbers but showed raw floats
 * (e.g. "1234567.891 บาท") for anything with cents or six figures.
 */
export const formatMoney = (value: number, language: ReportLanguage): string => {
  const formatted = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
  return language === 'en' ? `${formatted} THB` : `${formatted} บาท`;
};

const createMessageActionButton = (
  label: string,
  actionText: string,
  style: 'primary' | 'secondary' | 'link' = 'primary',
  color: string = BRAND.teal
): messagingApi.FlexButton => ({
  type: 'button',
  style,
  height: 'sm',
  color,
  action: { type: 'message', label: buttonLabel(label), text: actionText },
});

/**
 * A `uri` action opens a real link when tapped — unlike plain text inside a
 * Flex bubble, which LINE never auto-linkifies or makes selectable. Used
 * for one-tap links (e.g. the Odoo verification link) that would otherwise
 * be inert, uncopyable text.
 */
const createUriActionButton = (
  label: string,
  uri: string,
  style: 'primary' | 'secondary' | 'link' = 'primary',
  color: string = BRAND.teal
): messagingApi.FlexButton => ({
  type: 'button',
  style,
  height: 'sm',
  color,
  action: { type: 'uri', label: buttonLabel(label), uri },
});

const truncate = (value: string, maxLength: number): string => {
  const chars = Array.from(value.trim());
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 3).join('')}...` : value.trim();
};

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
            paddingAll: 'md',
            contents: [
              { type: 'text', text: params.body, color: tone === 'error' ? '#7A271A' : BRAND.ink, size: 'sm', wrap: true },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'box', layout: 'vertical', width: '8px', backgroundColor: toneColor, contents: [{ type: 'filler' }] },
              { type: 'text', text: params.language === 'en' ? 'Use the buttons below for the next step.' : 'ใช้ปุ่มด้านล่างเพื่อไปขั้นตอนถัดไป', size: 'xs', color: BRAND.inkSoft, wrap: true },
            ],
          },
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

export const createProductCardFlexMessage = (productName: string, price: number, stock: number): messagingApi.FlexMessage => {
  const language = (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';
  return {
    type: 'flex',
    altText: truncate(language === 'en' ? `Product: ${productName}` : `สินค้า: ${productName}`, 390),
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
          { type: 'text', text: language === 'en' ? 'Product detail' : 'รายละเอียดสินค้า', color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: language === 'en' ? 'Review and choose the next action' : 'ตรวจสอบข้อมูลแล้วเลือกขั้นตอนต่อไป', color: '#DDEBE9', size: 'xs', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: productName, weight: 'bold', size: 'xl', color: BRAND.ink, wrap: true },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                backgroundColor: BRAND.tealTint,
                paddingAll: 'sm',
                contents: [
                  { type: 'text', text: language === 'en' ? 'Price' : 'ราคา', size: 'xs', color: BRAND.inkSoft },
                  { type: 'text', text: formatMoney(price, language), size: 'sm', color: BRAND.tealStrong, weight: 'bold', wrap: true },
                ],
              },
              {
                type: 'box',
                layout: 'vertical',
                backgroundColor: BRAND.goldTint,
                paddingAll: 'sm',
                contents: [
                  { type: 'text', text: language === 'en' ? 'Stock' : 'คงเหลือ', size: 'xs', color: BRAND.inkSoft },
                  { type: 'text', text: String(stock), size: 'sm', color: BRAND.ink, weight: 'bold', wrap: true },
                ],
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          createMessageActionButton(language === 'en' ? 'Create quote' : 'สร้างใบเสนอราคา', 'FORM DEMO QUOTE', 'primary', BRAND.teal),
          createMessageActionButton(language === 'en' ? 'Search again' : 'ค้นหาอีกครั้ง', 'FORM DEMO PRODUCT', 'secondary', BRAND.tealTint),
          createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint),
        ],
      },
    },
  };
};

const SERVICE_ICON: Record<string, string> = {
  VERIFY: '🔐',
  commerce: '🛍️',
  directory: '👥',
  catalog: '📦',
  reporting: '📊',
  groupBuy: '🤝',
};

export const createServiceHomeFlexMessage = (
  services: { key: string; label: string }[],
  language: ReportLanguage,
  agentName: string
): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: language === 'en' ? `${agentName} services menu` : `เมนูบริการของ ${agentName}`,
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
          { type: 'text', text: language === 'en' ? `${agentName} menu` : `เมนู ${agentName}`, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
          { type: 'text', text: language === 'en' ? 'Tap a service to continue' : 'เลือกบริการเพื่อเริ่มใช้งาน', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: services.slice(0, 10).map(service => ({
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: BRAND.teal,
          action: {
            type: 'message',
            label: buttonLabel(`${SERVICE_ICON[service.key] || ''} ${service.label}`.trim()),
            text: `NAV ${service.key}`,
          },
        })),
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            color: BRAND.tealTint,
            action: { type: 'message', label: language === 'en' ? 'Language' : 'ภาษา', text: language === 'en' ? 'LANG TH' : 'LANG EN' },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            color: BRAND.tealTint,
            action: { type: 'message', label: language === 'en' ? 'Guide' : 'คู่มือ', text: 'GUIDE' },
          },
        ],
      },
    },
  };
};

export const createServiceActionFlexMessage = (
  serviceLabel: string,
  actions: { text: string; label: string }[],
  language: ReportLanguage
): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: truncate(serviceLabel, 390),
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
          { type: 'text', text: serviceLabel, weight: 'bold', size: 'md', wrap: true, color: '#FFFFFF' },
          { type: 'text', text: language === 'en' ? 'Choose one action' : 'เลือกสิ่งที่ต้องการทำ', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: actions.slice(0, 10).map(action => ({
          ...createMessageActionButton(action.label, action.text, 'primary', BRAND.teal),
        })),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            ...createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'primary', BRAND.gold),
          },
        ],
      },
    },
  };
};

export const createOrderSummaryFlexMessage = (total: number): messagingApi.FlexMessage => {
  const language = (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';
  return {
    type: 'flex',
    altText: language === 'en' ? 'Order summary' : 'สรุปคำสั่งซื้อ',
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
          { type: 'text', text: language === 'en' ? 'Quotation created' : 'สร้างใบเสนอราคาแล้ว', weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
          { type: 'text', text: language === 'en' ? 'Summary and next steps' : 'สรุปและขั้นตอนถัดไป', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
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
            paddingAll: 'md',
            contents: [
              { type: 'text', text: language === 'en' ? 'Total' : 'ยอดรวม', size: 'xs', color: BRAND.inkSoft },
              { type: 'text', text: formatMoney(total, language), size: 'xl', color: BRAND.tealStrong, weight: 'bold', wrap: true },
            ],
          },
          { type: 'text', text: language === 'en' ? 'Please follow your payment workflow.' : 'กรุณาชำระเงินตามขั้นตอนที่ร้านกำหนด', size: 'sm', wrap: true, color: BRAND.inkSoft },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          createMessageActionButton(language === 'en' ? 'Check order' : 'เช็คออเดอร์', 'FORM DEMO ORDER', 'primary', BRAND.teal),
          createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint),
        ],
      },
    },
  };
};

export const createFormPromptFlexMessage = (params: {
  title: string;
  prompt: string;
  stepIndex: number;
  totalSteps: number;
  language: ReportLanguage;
  optional?: boolean;
}): messagingApi.FlexMessage => {
  const actions = [
    ...(params.optional ? [{ label: params.language === 'en' ? 'Skip' : 'ข้าม', text: 'SKIP' }] : []),
    { label: params.language === 'en' ? 'Cancel' : 'ยกเลิก', text: 'CANCEL' },
  ];

  return {
    type: 'flex',
    altText: truncate(params.prompt, 390),
    quickReply: {
      items: actions.map(action => ({
        type: 'action',
        action: { type: 'message', label: action.label, text: action.text },
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
            paddingAll: 'md',
            contents: [
              { type: 'text', text: params.language === 'en' ? 'Please type your answer in the chat box.' : 'กรุณาพิมพ์คำตอบในช่องแชท', size: 'xs', color: BRAND.inkSoft, wrap: true },
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
