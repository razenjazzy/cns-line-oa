import type { UserLanguage } from '../services/firestore';
import { DEFAULT_CHANNEL_ID, resolveChannelConfig } from './channels';
import { appLogger } from '../services/logger';

export type RichMenuVariant = 'default' | 'home' | 'verify' | 'commerce' | 'orders' | 'help' | 'language';

const parseMenuMap = (env: NodeJS.ProcessEnv): Record<string, Record<string, string>> => {
  const raw = env.LINE_RICH_MENU_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const richMenuIdForLanguage = (
  language: UserLanguage,
  env: NodeJS.ProcessEnv = process.env,
  variant: RichMenuVariant = 'default',
  salesSessionActive = false,
): string | undefined => {
  const map = parseMenuMap(env)[language] || {};
  const sessionKey = salesSessionActive ? `${variant}-verified` : variant;
  const mapped = map[sessionKey]?.trim() || map[variant]?.trim();
  if (mapped) return mapped;
  if (variant !== 'default') {
    const fallback = (salesSessionActive ? map['default-verified'] : undefined) || map.default?.trim();
    if (fallback) return fallback;
  }
  const key = language === 'th' ? 'LINE_RICH_MENU_TH' : 'LINE_RICH_MENU_EN';
  return env[key]?.trim() || undefined;
};

export const trayVariantForCommand = (text: string): RichMenuVariant | undefined => {
  const upper = text.trim().toUpperCase();
  if (upper === 'NAV HOME' || upper === 'NAV' || upper === 'BACK') return 'home';
  if (upper === 'FORM VERIFY') return 'verify';
  if (upper === 'NAV COMMERCE' || /^NAV\s+COMMERCE$/i.test(text.trim())) return 'commerce';
  if (upper === 'FORM ORDER STATUS') return 'orders';
  if (upper === 'GUIDE' || upper.startsWith('GUIDE ')) return 'help';
  if (upper === 'LANG' || upper === 'LANG EN' || upper === 'LANG TH' || upper === 'ENGLISH' || upper === 'THAI' || upper === 'ภาษาไทย') return 'language';
  return undefined;
};

export const linkUserRichMenu = async (
  userId: string,
  language: UserLanguage,
  channelId: string = DEFAULT_CHANNEL_ID,
  variant: RichMenuVariant = 'default',
  salesSessionActive = false,
): Promise<void> => {
  const richMenuId = richMenuIdForLanguage(language, process.env, variant, salesSessionActive);
  if (!richMenuId) return;
  const channel = resolveChannelConfig(channelId || DEFAULT_CHANNEL_ID);
  if (!channel) {
    appLogger.warn('rich_menu_link_skipped_no_channel', { channelId, language, variant });
    return;
  }
  try {
    const response = await fetch(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(richMenuId)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${channel.channelAccessToken}` } },
    );
    if (!response.ok) {
      appLogger.warn('rich_menu_link_failed', { language, variant, status: response.status, body: await response.text() });
    }
  } catch (error) {
    appLogger.warn('rich_menu_link_failed', { language, variant, error: String(error) });
  }
};
