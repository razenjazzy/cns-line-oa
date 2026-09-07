import type { ChannelContext } from '../line/channels';
import { getPlatformConfig, setPlatformConfig } from './firestore';
import type { ServiceKey } from './service-catalog';

export const FEATURE_TOGGLES_CONFIG_KEY = 'salesFeatureTogglesV1';
export const SERVICE_TOGGLE_KEYS: ServiceKey[] = ['commerce', 'directory', 'catalog', 'reporting', 'groupBuy'];

const CACHE_TTL_MS = 15_000;

export type FeatureToggleSource = 'env-forced' | 'live-override' | 'default';

export type FeatureToggleDescription = {
  key: ServiceKey;
  effective: boolean;
  source: FeatureToggleSource;
  envConfigured: boolean;
  channelAllows: boolean;
  liveOverride: boolean | undefined;
};

type ToggleMap = Partial<Record<ServiceKey, boolean>>;

let cache: ToggleMap = {};
let cacheLoadedAt = 0;
let loadInFlight: Promise<void> | null = null;

const isServiceKey = (value: string): value is ServiceKey =>
  (SERVICE_TOGGLE_KEYS as string[]).includes(value);

export const parseServiceToggleKey = (raw: string): ServiceKey | null => {
  const key = raw.trim();
  if (isServiceKey(key)) return key;
  const aliases: Record<string, ServiceKey> = {
    commerce: 'commerce',
    directory: 'directory',
    catalog: 'catalog',
    reporting: 'reporting',
    groupbuy: 'groupBuy',
  };
  return aliases[key.toLowerCase()] ?? null;
};

const envConfiguredFor = (key: ServiceKey): boolean => {
  const configured = process.env.ENABLED_SERVICES?.trim();
  if (!configured) return true;
  const valid = new Set<string>(SERVICE_TOGGLE_KEYS);
  const keys = configured.split(',')
    .map(value => value.trim())
    .filter((value, index, values) => valid.has(value) && values.indexOf(value) === index);
  return keys.includes(key);
};

const channelAllowsKey = (key: ServiceKey, channel?: ChannelContext): boolean => {
  if (!channel || channel.enabledServices === null) return true;
  return channel.enabledServices.includes(key);
};

const parseStored = (raw: Record<string, unknown> | null): ToggleMap => {
  const next: ToggleMap = {};
  if (!raw) return next;
  for (const key of SERVICE_TOGGLE_KEYS) {
    if (typeof raw[key] === 'boolean') next[key] = raw[key];
  }
  return next;
};

export const getCachedFeatureToggles = (): ToggleMap => cache;

export const isLiveOverrideEnabled = (key: ServiceKey): boolean => cache[key] !== false;

export const resetFeatureToggleCacheForTests = (overrides: ToggleMap = {}): void => {
  cache = { ...overrides };
  cacheLoadedAt = Date.now();
};

export const expireFeatureToggleCacheForTests = (): void => {
  cacheLoadedAt = 0;
};

const cacheIsFresh = (): boolean => cacheLoadedAt > 0 && (Date.now() - cacheLoadedAt) < CACHE_TTL_MS;

export const ensureFeatureTogglesLoaded = async (): Promise<void> => {
  if (cacheIsFresh()) return;
  if (loadInFlight) return loadInFlight;

  loadInFlight = (async () => {
    const stored = await getPlatformConfig<Record<string, unknown>>(FEATURE_TOGGLES_CONFIG_KEY);
    cache = parseStored(stored);
    cacheLoadedAt = Date.now();
  })().finally(() => {
    loadInFlight = null;
  });

  return loadInFlight;
};

export const describeFeatureToggle = (key: ServiceKey, channel?: ChannelContext): FeatureToggleDescription => {
  const envConfigured = envConfiguredFor(key);
  const channelAllows = channelAllowsKey(key, channel);
  const liveOverride = cache[key];
  const envForcedOff = !envConfigured || !channelAllows;
  const effective = !envForcedOff && liveOverride !== false;
  let source: FeatureToggleSource = 'default';
  if (envForcedOff) source = 'env-forced';
  else if (typeof liveOverride === 'boolean') source = 'live-override';
  return { key, effective, source, envConfigured, channelAllows, liveOverride };
};

export const describeAllFeatureToggles = (channel?: ChannelContext): FeatureToggleDescription[] =>
  SERVICE_TOGGLE_KEYS.map(key => describeFeatureToggle(key, channel));

export type SetFeatureToggleResult =
  | { ok: true; description: FeatureToggleDescription }
  | { ok: false; reason: 'env-forced' | 'unknown-key'; description?: FeatureToggleDescription };

const persistCache = async (): Promise<void> => {
  const value: Record<string, unknown> = {};
  for (const key of SERVICE_TOGGLE_KEYS) {
    if (typeof cache[key] === 'boolean') value[key] = cache[key];
  }
  await setPlatformConfig(FEATURE_TOGGLES_CONFIG_KEY, value);
  cacheLoadedAt = Date.now();
};

export const setFeatureToggle = async (
  key: string,
  enabled: boolean,
  channel?: ChannelContext,
): Promise<SetFeatureToggleResult> => {
  const parsed = parseServiceToggleKey(key);
  if (!parsed) return { ok: false, reason: 'unknown-key' };

  await ensureFeatureTogglesLoaded();
  const current = describeFeatureToggle(parsed, channel);
  if (current.source === 'env-forced') {
    return { ok: false, reason: 'env-forced', description: current };
  }

  if (enabled) delete cache[parsed];
  else cache[parsed] = false;
  await persistCache();
  return { ok: true, description: describeFeatureToggle(parsed, channel) };
};

export const replaceFeatureToggles = async (
  patch: Record<string, unknown>,
  channel?: ChannelContext,
): Promise<{ toggles: FeatureToggleDescription[]; refused: ServiceKey[] }> => {
  await ensureFeatureTogglesLoaded();
  const refused: ServiceKey[] = [];
  const next: ToggleMap = { ...cache };

  for (const key of SERVICE_TOGGLE_KEYS) {
    if (typeof patch[key] !== 'boolean') continue;
    const described = describeFeatureToggle(key, channel);
    if (described.source === 'env-forced') {
      refused.push(key);
      continue;
    }
    if (patch[key] === true) delete next[key];
    else next[key] = false;
  }

  cache = next;
  await persistCache();
  return { toggles: describeAllFeatureToggles(channel), refused };
};
