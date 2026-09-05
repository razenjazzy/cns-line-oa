import { messagingApi } from '@line/bot-sdk';

export type ReportLanguage = 'th' | 'en';

// Cloudnex brand palette — kept consistent across every Flex message.
export const BRAND = {
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
export const defaultUiLanguage = (): ReportLanguage => (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';

export const buttonLabel = (label: string): string => {
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

export const createMessageActionButton = (
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
export const createUriActionButton = (
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
export const createPrefillButton = (
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

export const truncate = (value: string, maxLength: number): string => {
  const chars = Array.from(value.trim());
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 3).join('')}...` : value.trim();
};
