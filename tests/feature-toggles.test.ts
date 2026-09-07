import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlatformConfig, setPlatformConfig } from '../src/services/firestore';
import { resolveServiceForCommand } from '../src/services/service-catalog';
import {
  describeFeatureToggle,
  ensureFeatureTogglesLoaded,
  expireFeatureToggleCacheForTests,
  FEATURE_TOGGLES_CONFIG_KEY,
  getCachedFeatureToggles,
  resetFeatureToggleCacheForTests,
  setFeatureToggle,
} from '../src/services/feature-toggles';

vi.mock('../src/services/firestore', () => ({
  getPlatformConfig: vi.fn(),
  setPlatformConfig: vi.fn(),
}));

const mockedGetPlatformConfig = vi.mocked(getPlatformConfig);
const mockedSetPlatformConfig = vi.mocked(setPlatformConfig);

describe('sales feature toggles', () => {
  const originalEnabled = process.env.ENABLED_SERVICES;

  beforeEach(() => {
    delete process.env.ENABLED_SERVICES;
    resetFeatureToggleCacheForTests();
    mockedGetPlatformConfig.mockReset();
    mockedSetPlatformConfig.mockReset();
    mockedSetPlatformConfig.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.ENABLED_SERVICES;
    else process.env.ENABLED_SERVICES = originalEnabled;
  });

  it('defaults a key on when no live override is stored', () => {
    const described = describeFeatureToggle('catalog');
    expect(described.effective).toBe(true);
    expect(described.source).toBe('default');
  });

  it('turns a key off via live override', async () => {
    const result = await setFeatureToggle('catalog', false);
    expect(result.ok).toBe(true);
    expect(getCachedFeatureToggles().catalog).toBe(false);
    expect(describeFeatureToggle('catalog')).toMatchObject({
      effective: false,
      source: 'live-override',
    });
    expect(mockedSetPlatformConfig).toHaveBeenCalledWith(
      FEATURE_TOGGLES_CONFIG_KEY,
      expect.objectContaining({ catalog: false }),
    );
  });

  it('refuses ON when env omits the key', async () => {
    process.env.ENABLED_SERVICES = 'commerce,directory';
    const described = describeFeatureToggle('catalog');
    expect(described.effective).toBe(false);
    expect(described.source).toBe('env-forced');

    const result = await setFeatureToggle('catalog', true);
    expect(result).toMatchObject({ ok: false, reason: 'env-forced' });
    expect(mockedSetPlatformConfig).not.toHaveBeenCalled();
  });

  it('invalidates cache on write so the hot path sees the new value', async () => {
    mockedGetPlatformConfig.mockResolvedValue({ catalog: false });
    expireFeatureToggleCacheForTests();
    await ensureFeatureTogglesLoaded();
    expect(getCachedFeatureToggles().catalog).toBe(false);

    await setFeatureToggle('catalog', true);
    expect(getCachedFeatureToggles().catalog).toBeUndefined();
    expect(describeFeatureToggle('catalog').effective).toBe(true);
  });

  it('does not map SALES FEATURES onto a service key', () => {
    expect(resolveServiceForCommand('SALES FEATURES')).toBeNull();
    expect(resolveServiceForCommand('SALES FEATURE catalog OFF')).toBeNull();
  });
});
