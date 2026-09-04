import { describe, expect, it, vi } from 'vitest';
import { getPlatformConfig, setPlatformConfig } from '../src/services/firestore';
import {
  getChannelServiceOverride,
  resolveEffectiveChannelContext,
  setChannelServiceOverride,
  type ChannelConfig,
} from '../src/line/channels';

vi.mock('../src/services/firestore', () => ({
  getPlatformConfig: vi.fn(),
  setPlatformConfig: vi.fn(),
}));

const mockedGetPlatformConfig = vi.mocked(getPlatformConfig);
const mockedSetPlatformConfig = vi.mocked(setPlatformConfig);

const channelConfig: ChannelConfig = {
  channelId: 'sales',
  channelSecret: 'secret',
  channelAccessToken: 'token',
  enabledServices: ['commerce', 'reporting'],
};

describe('channel service overrides', () => {
  it('returns undefined when no persisted override exists', async () => {
    mockedGetPlatformConfig.mockResolvedValue(undefined);

    await expect(getChannelServiceOverride('sales')).resolves.toBeUndefined();
    expect(mockedGetPlatformConfig).toHaveBeenCalledWith('channelServices:sales');
  });

  it('persists a service override under the channel-specific platform key', async () => {
    mockedSetPlatformConfig.mockResolvedValue({ ok: true });

    await expect(setChannelServiceOverride('sales', ['catalog'])).resolves.toEqual({ ok: true });
    expect(mockedSetPlatformConfig).toHaveBeenCalledWith('channelServices:sales', { services: ['catalog'] });
  });

  it('lets an explicit unrestricted override replace the env default', async () => {
    mockedGetPlatformConfig.mockResolvedValue({ services: null });

    await expect(resolveEffectiveChannelContext(channelConfig)).resolves.toEqual({
      channelId: 'sales',
      enabledServices: null,
    });
  });
});
