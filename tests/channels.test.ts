import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CHANNEL_ID, resolveChannelConfig } from '../src/line/channels';

const ENV_KEYS = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_DEFAULT_SERVICES',
  'LINE_CHANNEL_SALES_SECRET',
  'LINE_CHANNEL_SALES_ACCESS_TOKEN',
  'LINE_CHANNEL_SALES_SERVICES',
];

describe('resolveChannelConfig', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('returns null for the default channel when flat env vars are missing', () => {
    expect(resolveChannelConfig(DEFAULT_CHANNEL_ID)).toBeNull();
  });

  it('resolves the default channel from the existing flat env vars', () => {
    process.env.LINE_CHANNEL_SECRET = 'secret-default';
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'token-default';

    const config = resolveChannelConfig(DEFAULT_CHANNEL_ID);
    expect(config).toEqual({
      channelId: DEFAULT_CHANNEL_ID,
      channelSecret: 'secret-default',
      channelAccessToken: 'token-default',
      enabledServices: null,
    });
  });

  it('parses enabledServices for the default channel when configured', () => {
    process.env.LINE_CHANNEL_SECRET = 'secret-default';
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'token-default';
    process.env.LINE_CHANNEL_DEFAULT_SERVICES = 'commerce, reporting ,, directory';

    const config = resolveChannelConfig(DEFAULT_CHANNEL_ID);
    expect(config?.enabledServices).toEqual(['commerce', 'reporting', 'directory']);
  });

  it('resolves a named channel from namespaced env vars', () => {
    process.env.LINE_CHANNEL_SALES_SECRET = 'secret-sales';
    process.env.LINE_CHANNEL_SALES_ACCESS_TOKEN = 'token-sales';
    process.env.LINE_CHANNEL_SALES_SERVICES = 'commerce';

    const config = resolveChannelConfig('sales');
    expect(config).toEqual({
      channelId: 'sales',
      channelSecret: 'secret-sales',
      channelAccessToken: 'token-sales',
      enabledServices: ['commerce'],
    });
  });

  it('returns null for an unconfigured named channel', () => {
    expect(resolveChannelConfig('sales')).toBeNull();
  });

  it('returns null for an empty channelId', () => {
    expect(resolveChannelConfig('   ')).toBeNull();
  });
});
