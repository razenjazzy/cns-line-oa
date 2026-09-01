import { getPlatformConfig, setPlatformConfig } from '../services/firestore';

export type ChannelContext = {
  channelId: string;
  enabledServices: string[] | null; // null = unrestricted (all services allowed)
};

export type ChannelConfig = ChannelContext & {
  channelSecret: string;
  channelAccessToken: string;
};

export const DEFAULT_CHANNEL_ID = 'default';

/**
 * Single source of truth for the bot's persona name and its fallback, so a
 * future rename can't drift between call sites (previously duplicated as a
 * literal in six files).
 */
export const getAgentName = (): string => process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';

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

const channelServiceOverrideKey = (channelId: string): string => `channelServices:${channelId}`;

/**
 * Per-channel module enablement was env-var-only, which meant every toggle
 * needed a redeploy. This adds a Firestore-backed override on top of the env
 * default (reusing the existing generic platformConfig store) so an admin
 * command can flip modules per channel at runtime.
 */
export const getChannelServiceOverride = async (channelId: string): Promise<string[] | null | undefined> => {
  const stored = await getPlatformConfig<{ services: string[] | null }>(channelServiceOverrideKey(channelId));
  return stored ? stored.services : undefined;
};

export const setChannelServiceOverride = async (channelId: string, services: string[] | null): Promise<{ ok: boolean; error?: string }> => {
  return setPlatformConfig(channelServiceOverrideKey(channelId), { services } as unknown as Record<string, unknown>);
};

/**
 * Combines the env-resolved channel config with any live Firestore override
 * into the ChannelContext passed down into resolveCommandReply. An override
 * (even `null`, meaning explicitly unrestricted) always wins over the env
 * default; a channel with no override keeps its existing env-driven behavior.
 */
export const resolveEffectiveChannelContext = async (config: ChannelConfig): Promise<ChannelContext> => {
  const override = await getChannelServiceOverride(config.channelId);
  return {
    channelId: config.channelId,
    enabledServices: override !== undefined ? override : config.enabledServices,
  };
};
