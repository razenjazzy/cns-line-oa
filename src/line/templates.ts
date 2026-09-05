import { messagingApi } from '@line/bot-sdk';
import { getAgentName } from './channels';
import type { OdooSaleOrder } from '../services/odoo/types';
import { t, stateLabel, type Lang } from '../services/i18n';

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
  /** Applied to every background-colored box so cards read as one consistent, rounded design language instead of a mix of square and rounded shapes. */
  radius: '12px',
} as const;

/**
 * Fallback only for callers that genuinely have no per-user language to pass
 * (there are none left in this codebase as of this fix — every call site
 * now threads the actual UserLanguage through). Two Flex builders used to
 * read this env var directly instead of taking a `language` parameter at
 * all, so a user's LANG EN/LANG TH choice was silently ignored for product
 * cards and order summaries no matter what they'd set.
 */
const defaultUiLanguage = (): ReportLanguage => (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';

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
  height: 'md',
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
  height: 'md',
  color,
  action: { type: 'uri', label: buttonLabel(label), uri },
});

/**
 * A button that opens the keyboard prefilled with editable text, instead of
 * sending a fixed command — for actions that need free-form input (which
 * product, what quantity) a plain message/uri button can't carry. LINE
 * handles this entirely client-side (no postback-event handling needed on
 * our end: src/line/webhook.ts only processes `message` events, so the
 * accompanying postback is silently ignored — the user's edited text then
 * arrives as a normal text message through the existing pipeline).
 */
const createPrefillButton = (
  label: string,
  fillInText: string,
  style: 'primary' | 'secondary' | 'link' = 'secondary',
  color: string = BRAND.tealTint
): messagingApi.FlexButton => ({
  type: 'button',
  style,
  height: 'md',
  color,
  action: {
    type: 'postback',
    label: buttonLabel(label),
    data: `action=prefill&text=${encodeURIComponent(fillInText)}`,
    inputOption: 'openKeyboard',
    fillInText,
  } as messagingApi.PostbackAction,
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

export const createProductCardFlexMessage = (productName: string, price: number, stock: number, language: ReportLanguage = defaultUiLanguage()): messagingApi.FlexMessage => {
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
                flex: 1,
                backgroundColor: BRAND.tealTint,
                cornerRadius: BRAND.radius,
                paddingAll: 'sm',
                contents: [
                  { type: 'text', text: language === 'en' ? 'Price' : 'ราคา', size: 'xs', color: BRAND.inkSoft },
                  { type: 'text', text: formatMoney(price, language), size: 'sm', color: BRAND.tealStrong, weight: 'bold', wrap: true },
                ],
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                backgroundColor: BRAND.goldTint,
                cornerRadius: BRAND.radius,
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
          createMessageActionButton(language === 'en' ? 'Create quote' : 'สร้างใบเสนอราคา', 'FORM QUOTE CREATE', 'primary', BRAND.teal),
          createMessageActionButton(language === 'en' ? 'Search again' : 'ค้นหาอีกครั้ง', 'FORM PRODUCT FIND', 'secondary', BRAND.tealTint),
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
          height: 'md',
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
            height: 'md',
            flex: 1,
            color: BRAND.tealTint,
            action: { type: 'message', label: language === 'en' ? 'Language' : 'ภาษา', text: language === 'en' ? 'LANG TH' : 'LANG EN' },
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'md',
            flex: 1,
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

export const createAdminConfigFlexMessage = (
  channelId: string,
  services: { key: string; label: string; enabled: boolean; nextCommand: string }[],
  language: ReportLanguage,
): messagingApi.FlexMessage => ({
  type: 'flex',
  altText: language === 'en' ? `Service configuration: ${channelId}` : `ตั้งค่าบริการ: ${channelId}`,
  contents: {
    type: 'bubble',
    styles: { header: { backgroundColor: BRAND.tealStrong }, body: { backgroundColor: BRAND.surface }, footer: { backgroundColor: BRAND.surface } },
    header: {
      type: 'box', layout: 'vertical', paddingAll: 'md',
      contents: [
        { type: 'text', text: language === 'en' ? 'Service configuration' : 'ตั้งค่าบริการ', color: '#FFFFFF', weight: 'bold', size: 'md' },
        { type: 'text', text: channelId, color: '#DDEBE9', size: 'xs', margin: 'xs' },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: services.map(service => ({
        type: 'button', style: service.enabled ? 'primary' : 'secondary', height: 'md', color: service.enabled ? BRAND.teal : BRAND.goldTint,
        action: { type: 'message', label: buttonLabel(`${service.enabled ? 'ON' : 'OFF'} ${service.label}`), text: service.nextCommand },
      })),
    },
    footer: {
      type: 'box', layout: 'vertical', contents: [createMessageActionButton(language === 'en' ? 'Back' : 'ย้อนกลับ', 'NAV HOME', 'secondary', BRAND.gold)],
    },
  },
});

export const createOrderSummaryFlexMessage = (total: number, language: ReportLanguage = defaultUiLanguage()): messagingApi.FlexMessage => {
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
            cornerRadius: BRAND.radius,
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
          createMessageActionButton(language === 'en' ? 'Check order' : 'เช็คออเดอร์', 'FORM ORDER STATUS', 'primary', BRAND.teal),
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

const QUOTATION_STATE_SEQUENCE = ['draft', 'sent', 'sale'] as const;

/**
 * Mirrors the real Odoo Sales record's status bar (Quotation -> Quotation
 * Sent -> Sales Order) plus the actions relevant to who's looking at it.
 * `role` controls the action set — an admin can drive the order forward
 * (Confirm/Send); a customer can only Approve their own order or view it.
 * See quotation.ts for the authorization check that keeps that split real
 * (a customer's Approve tap is rejected server-side if the order isn't
 * theirs, regardless of what buttons this card happens to render).
 */
export const createQuotationJourneyFlexMessage = (
  order: OdooSaleOrder,
  options: { role: 'admin' | 'customer'; salesTier?: 'salesperson' | 'sales_manager'; portalLink?: string; pdfLink?: string },
  language: Lang
): messagingApi.FlexMessage => {
  const customerName = order.partner_id?.[1] || '-';
  const isCancelled = order.state === 'cancel';
  const currentIndex = isCancelled ? -1 : QUOTATION_STATE_SEQUENCE.indexOf(order.state as typeof QUOTATION_STATE_SEQUENCE[number]);

  const lines = order.lines || [];
  const visibleLines = lines.slice(0, 4);
  const extraCount = lines.length - visibleLines.length;

  const statusRow: messagingApi.FlexBox = isCancelled
    ? {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F8D7DA',
        cornerRadius: BRAND.radius,
        paddingAll: 'sm',
        contents: [
          { type: 'text', text: stateLabel('cancel', language), align: 'center', weight: 'bold', size: 'sm', color: '#7A271A' },
        ],
      }
    : {
        type: 'box',
        layout: 'horizontal',
        spacing: 'xs',
        contents: QUOTATION_STATE_SEQUENCE.map((state, index) => ({
          type: 'box',
          layout: 'vertical',
          flex: 1,
          cornerRadius: BRAND.radius,
          paddingAll: 'xs',
          backgroundColor: index === currentIndex ? BRAND.teal : BRAND.tealTint,
          contents: [
            {
              type: 'text',
              text: stateLabel(state, language),
              size: 'xxs',
              align: 'center',
              wrap: true,
              color: index === currentIndex ? '#FFFFFF' : BRAND.tealStrong,
              weight: index === currentIndex ? 'bold' : 'regular',
            },
          ],
        })),
      };

  // Organized as rows (rather than one flat button list) so each row stays
  // simple regardless of how many actions the admin has available for this
  // state — mirrors Odoo web's own button visibility per state.
  const footerRows: messagingApi.FlexButton[][] = [];
  const canStillAct = !isCancelled && order.state !== 'sale';
  // Matches Odoo web's own Create Invoice button condition exactly
  // (sale.order.form: invisible="invoice_status != 'to invoice'").
  const canInvoice = !isCancelled && order.state === 'sale' && order.invoice_status === 'to invoice';
  // Odoo's own convention: cancellation and invoicing are manager-level
  // actions. Only an explicitly-resolved 'salesperson' tier loses them —
  // undefined (no linked Odoo user, today's default) and 'sales_manager'
  // both keep today's full admin action set. See findOdooSalesTierByPartnerId.
  const isRestrictedToSalesperson = options.salesTier === 'salesperson';

  if (options.role === 'admin') {
    if (canStillAct) {
      footerRows.push([
        createMessageActionButton(t('confirm', language), `QUOTE CONFIRM ${order.id}`, 'primary', BRAND.teal),
        createMessageActionButton(t('sendToCustomer', language), `QUOTE SEND ${order.id}`, 'secondary', BRAND.tealTint),
      ]);
      const lineActionButtons = [
        createPrefillButton(t('addItem', language), `QUOTE ADD ${order.id} `, 'secondary', BRAND.tealTint),
        createPrefillButton(t('editItem', language), `QUOTE EDIT ${order.id} `, 'secondary', BRAND.tealTint),
        ...(isRestrictedToSalesperson ? [] : [createMessageActionButton(t('cancelQuote', language), `QUOTE CANCEL ${order.id}`, 'secondary', BRAND.goldTint)]),
      ];
      footerRows.push(lineActionButtons);
    }
    if (canInvoice && !isRestrictedToSalesperson) {
      footerRows.push([createMessageActionButton(t('createInvoice', language), `QUOTE INVOICE ${order.id}`, 'primary', BRAND.teal)]);
    }
    footerRows.push([createPrefillButton(t('messageCustomer', language), `QUOTE MESSAGE ${order.id} `, 'secondary', BRAND.tealTint)]);
    if (options.portalLink || options.pdfLink) {
      footerRows.push([
        ...(options.portalLink ? [createUriActionButton(t('preview', language), options.portalLink, 'secondary', BRAND.goldTint)] : []),
        ...(options.pdfLink ? [createUriActionButton(t('downloadPdf', language), options.pdfLink, 'secondary', BRAND.goldTint)] : []),
      ]);
    }
  } else {
    if (canStillAct) {
      footerRows.push([createMessageActionButton(t('approve', language), `QUOTE APPROVE ${order.id}`, 'primary', BRAND.teal)]);
    }
    if (options.portalLink || options.pdfLink) {
      footerRows.push([
        ...(options.portalLink ? [createUriActionButton(t('viewFullQuotation', language), options.portalLink, 'secondary', BRAND.tealTint)] : []),
        ...(options.pdfLink ? [createUriActionButton(t('downloadPdf', language), options.pdfLink, 'secondary', BRAND.tealTint)] : []),
      ]);
    }
  }
  footerRows.push([createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint)]);

  const footerContents: messagingApi.FlexComponent[] = footerRows.map(row =>
    row.length === 1
      ? row[0]
      : { type: 'box', layout: 'horizontal', spacing: 'xs', contents: row.map(button => ({ ...button, flex: 1 })) }
  );

  return {
    type: 'flex',
    altText: truncate(`${t('quotation', language)} ${order.name} — ${customerName} — ${formatMoney(order.amount_total, language)}`, 390),
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
          { type: 'text', text: order.name, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true },
          { type: 'text', text: `${t('customer', language)}: ${customerName}`, size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          statusRow,
          ...(visibleLines.length ? [{
            type: 'box' as const,
            layout: 'vertical' as const,
            spacing: 'xs' as const,
            contents: [
              { type: 'text' as const, text: t('items', language), size: 'xs' as const, color: BRAND.inkSoft },
              ...visibleLines.map(line => ({
                type: 'box' as const,
                layout: 'horizontal' as const,
                backgroundColor: BRAND.paper,
                cornerRadius: BRAND.radius,
                paddingAll: 'sm' as const,
                contents: [
                  { type: 'text' as const, text: line.productName, size: 'sm' as const, weight: 'bold' as const, color: BRAND.ink, wrap: true, flex: 3 },
                  { type: 'text' as const, text: `× ${line.qty}`, size: 'sm' as const, color: BRAND.inkSoft, align: 'end' as const, flex: 1 },
                ],
              })),
              ...(extraCount > 0 ? [{ type: 'text' as const, text: `+${extraCount} ${t('moreItems', language)}`, size: 'xs' as const, color: BRAND.inkSoft }] : []),
            ],
          }] : []),
          ...(order.note ? [{
            type: 'box' as const,
            layout: 'vertical' as const,
            backgroundColor: BRAND.paper,
            cornerRadius: BRAND.radius,
            paddingAll: 'sm' as const,
            contents: [
              { type: 'text' as const, text: truncate(order.note, 200), size: 'xs' as const, color: BRAND.inkSoft, wrap: true },
            ],
          }] : []),
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: BRAND.tealTint,
            cornerRadius: BRAND.radius,
            paddingAll: 'md',
            contents: [
              { type: 'text', text: t('total', language), size: 'xs', color: BRAND.inkSoft },
              { type: 'text', text: formatMoney(order.amount_total, language), size: 'xl', color: BRAND.tealStrong, weight: 'bold', wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: footerContents,
      },
    },
  };
};

/**
 * "My quotations" — one tappable row per order (QUOTE STATUS <id>), capped
 * at however many the caller passed in (getSaleOrdersForPartner already
 * caps the query itself). No pagination in this pass — matches the rest of
 * this feature's "simple UX" scope; a caller with more than that many
 * orders is told to ask an admin to narrow the search instead.
 */
export const createQuotationListFlexMessage = (
  orders: OdooSaleOrder[],
  hasMore: boolean,
  language: Lang
): messagingApi.FlexMessage => {
  return {
    type: 'flex',
    altText: truncate(t('myQuotations', language), 390),
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
          { type: 'text', text: t('myQuotations', language), weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: orders.length
          ? [
              // A tappable box (not a button — LINE buttons cap labels at
              // 20 chars, which forced "S00023 · 1,851 THB" with no status
              // or date, unreadable for a sales user). A box's own action
              // makes the whole row tappable with no label-length limit at
              // all, so status + date + total can all be shown plainly.
              ...orders.map(order => ({
                type: 'box' as const,
                layout: 'horizontal' as const,
                backgroundColor: BRAND.paper,
                cornerRadius: BRAND.radius,
                paddingAll: 'sm' as const,
                action: { type: 'message' as const, text: `QUOTE STATUS ${order.id}` },
                contents: [
                  {
                    type: 'box' as const,
                    layout: 'vertical' as const,
                    flex: 3,
                    contents: [
                      { type: 'text' as const, text: order.name, size: 'sm' as const, weight: 'bold' as const, color: BRAND.ink, wrap: true },
                      {
                        type: 'text' as const,
                        text: `${stateLabel(order.state, language)}${order.date_order ? ` · ${order.date_order.split(' ')[0]}` : ''}`,
                        size: 'xs' as const, color: BRAND.inkSoft, wrap: true,
                      },
                    ],
                  },
                  {
                    type: 'text' as const,
                    text: formatMoney(order.amount_total, language),
                    size: 'sm' as const, weight: 'bold' as const, color: BRAND.tealStrong, align: 'end' as const, flex: 2, gravity: 'center' as const,
                  },
                ],
              })),
              ...(hasMore ? [{ type: 'text' as const, text: t('moreQuotations', language), size: 'xs' as const, color: BRAND.inkSoft, wrap: true }] : []),
            ]
          : [{ type: 'text', text: t('noQuotations', language), size: 'sm', color: BRAND.inkSoft, wrap: true }],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint)],
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
