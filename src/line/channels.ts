export type ChannelContext = {
  channelId: string;
  enabledServices: string[] | null; // null = unrestricted (all services allowed)
};

export type ChannelConfig = ChannelContext & {
  channelSecret: string;
  channelAccessToken: string;
};

export const DEFAULT_CHANNEL_ID = 'default';

const parseServiceList = (value: string | undefined): string[] | null => {
  if (value === undefined) return null;
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
};

const toEnvKey = (channelId: string): string => channelId.toUpperCase().replace(/[^A-Z0-9]/g, '_');

/**
 * Resolves channel credentials/config from environment variables only.
 * The default channel preserves the existing flat LINE_CHANNEL_SECRET /
 * LINE_CHANNEL_ACCESS_TOKEN vars for backward compatibility. Additional
 * channels are configured via LINE_CHANNEL_<ID>_SECRET / _ACCESS_TOKEN / _SERVICES.
 * Returns null when the channel is unknown or missing required credentials.
 */
export const resolveChannelConfig = (channelId: string): ChannelConfig | null => {
  const normalized = channelId.trim();
  if (!normalized) return null;

  if (normalized === DEFAULT_CHANNEL_ID) {
    const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim() || '';
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || '';
    if (!channelSecret || !channelAccessToken) return null;

    return {
      channelId: DEFAULT_CHANNEL_ID,
      channelSecret,
      channelAccessToken,
      enabledServices: parseServiceList(process.env.LINE_CHANNEL_DEFAULT_SERVICES),
    };
  }

  const envKey = toEnvKey(normalized);
  const channelSecret = process.env[`LINE_CHANNEL_${envKey}_SECRET`]?.trim() || '';
  const channelAccessToken = process.env[`LINE_CHANNEL_${envKey}_ACCESS_TOKEN`]?.trim() || '';
  if (!channelSecret || !channelAccessToken) return null;

  return {
    channelId: normalized,
    channelSecret,
    channelAccessToken,
    enabledServices: parseServiceList(process.env[`LINE_CHANNEL_${envKey}_SERVICES`]),
  };
};
