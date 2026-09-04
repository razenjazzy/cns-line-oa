import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultLanguage, parseAppLanguage } from '../src/services/app-config';
import { createLogger } from '../src/services/logger';
import { getAvailableServices, getConfiguredServiceKeys, isServiceConfigured, isServiceEnabledForChannel } from '../src/services/service-catalog';

describe('application configuration', () => {
  const originalLanguage = process.env.DEFAULT_LANGUAGE;
  const originalServices = process.env.ENABLED_SERVICES;

  afterEach(() => {
    if (originalLanguage === undefined) delete process.env.DEFAULT_LANGUAGE;
    else process.env.DEFAULT_LANGUAGE = originalLanguage;
    if (originalServices === undefined) delete process.env.ENABLED_SERVICES;
    else process.env.ENABLED_SERVICES = originalServices;
  });

  it('supports Thai and English and falls back to Thai', () => {
    expect(parseAppLanguage('en')).toBe('en');
    expect(parseAppLanguage('TH')).toBe('th');
    expect(parseAppLanguage('fr')).toBe('th');
    process.env.DEFAULT_LANGUAGE = 'en';
    expect(getDefaultLanguage()).toBe('en');
  });

  it('treats an absent service allowlist as unrestricted', () => {
    delete process.env.ENABLED_SERVICES;
    expect(getConfiguredServiceKeys()).toBeNull();
    expect(isServiceConfigured('commerce')).toBe(true);
  });

  it('filters global services before existing role and channel gates', () => {
    process.env.ENABLED_SERVICES = 'commerce, reporting, invalid, commerce';
    expect(getConfiguredServiceKeys()).toEqual(['commerce', 'reporting']);
    expect(getAvailableServices(undefined, false).map(service => service.key)).toEqual(['commerce']);
    expect(getAvailableServices({ channelId: 'sales', enabledServices: ['reporting'] }, true).map(service => service.key)).toEqual(['reporting']);
  });

  it('uses the same global service decision for typed command execution', () => {
    process.env.ENABLED_SERVICES = 'catalog';
    expect(isServiceConfigured('commerce')).toBe(false);
    expect(isServiceEnabledForChannel('commerce', undefined)).toBe(true);
    expect(isServiceConfigured('catalog')).toBe(true);
  });
});

describe('application logger', () => {
  it('writes structured JSON and redacts sensitive fields', () => {
    const write = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    createLogger('test').info('request completed', {
      requestId: 'req-1',
      authorization: 'Bearer secret',
      nested: { apiKey: 'hidden', count: 1 },
    });

    const entry = JSON.parse(String(write.mock.calls[0][0]));
    expect(entry).toMatchObject({ level: 'info', scope: 'test', message: 'request completed', requestId: 'req-1' });
    expect(entry.authorization).toBe('[REDACTED]');
    expect(entry.nested.apiKey).toBe('[REDACTED]');
    write.mockRestore();
  });
});