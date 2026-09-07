import type { UserLanguage } from '../services/firestore';
import { DEFAULT_CHANNEL_ID, resolveChannelConfig } from './channels';
import { appLogger } from '../services/logger';

export const richMenuIdForLanguage = (language: UserLanguage, env: NodeJS.ProcessEnv = process.env): string | undefined => {
  const key = language === 'th' ? 'LINE_RICH_MENU_TH' : 'LINE_RICH_MENU_EN';
  return env[key]?.trim() || undefined;
};

/**
 * Best-effort per-user rich-menu swap after LANG. Unset LINE_RICH_MENU_EN /
 * LINE_RICH_MENU_TH is a no-op so language still saves when menus are unpublished.
 * Never links the old yellow PNGs — only IDs from env (set by upload-rich-menu.mjs).
 */
export const linkUserRichMenu = async (
  userId: string,
  language: UserLanguage,
  channelId: string = DEFAULT_CHANNEL_ID,
): Promise<void> => {
  const richMenuId = richMenuIdForLanguage(language);
  if (!richMenuId) return;
  const channel = resolveChannelConfig(channelId || DEFAULT_CHANNEL_ID);
  if (!channel) {
    appLogger.warn('rich_menu_link_skipped_no_channel', { channelId, language });
    return;
  }
  try {
    const response = await fetch(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(richMenuId)}`,
      { method: 'POST', headers: { Authorization: `Bearer ${channel.channelAccessToken}` } },
    );
    if (!response.ok) {
      appLogger.warn('rich_menu_link_failed', { language, status: response.status, body: await response.text() });
    }
  } catch (error) {
    appLogger.warn('rich_menu_link_failed', { language, error: String(error) });
  }
};
