import { describe, expect, it } from 'vitest';
import {
  getAvailableServices,
  getVisibleCommands,
  isServiceEnabledForChannel,
  resolveServiceForCommand,
  SERVICE_CATALOG,
} from '../src/services/service-catalog';

describe('resolveServiceForCommand', () => {
  it('maps mapped command prefixes to their service key', () => {
    expect(resolveServiceForCommand('DEMO PRODUCT App')).toBe('commerce');
    expect(resolveServiceForCommand('DEMO QUOTE App,1,Somchai,0812345678')).toBe('commerce');
    expect(resolveServiceForCommand('USER CREATE Somchai,0812345678')).toBe('directory');
    expect(resolveServiceForCommand('SERVICE LIST')).toBe('catalog');
    expect(resolveServiceForCommand('DEMO REPORT')).toBe('reporting');
    expect(resolveServiceForCommand('START GROUPBUY App,25')).toBe('groupBuy');
  });

  it('returns null for unmapped commands so they remain ungated', () => {
    expect(resolveServiceForCommand('OPTIONS')).toBeNull();
    expect(resolveServiceForCommand('ADMIN ENABLE')).toBeNull();
    expect(resolveServiceForCommand('VERIFY START 0812345678')).toBeNull();
    expect(resolveServiceForCommand('LANG EN')).toBeNull();
  });
});

describe('isServiceEnabledForChannel', () => {
  it('is unrestricted when no channel context is provided', () => {
    expect(isServiceEnabledForChannel('commerce', undefined)).toBe(true);
  });

  it('is unrestricted when the channel has a null enabledServices list', () => {
    expect(isServiceEnabledForChannel('commerce', { channelId: 'default', enabledServices: null })).toBe(true);
  });

  it('respects an explicit enabledServices allowlist', () => {
    const channel = { channelId: 'sales', enabledServices: ['commerce'] };
    expect(isServiceEnabledForChannel('commerce', channel)).toBe(true);
    expect(isServiceEnabledForChannel('directory', channel)).toBe(false);
  });

  it('disables everything for a channel with an empty enabledServices list', () => {
    const channel = { channelId: 'empty', enabledServices: [] };
    expect(isServiceEnabledForChannel('commerce', channel)).toBe(false);
  });
});

describe('getAvailableServices', () => {
  it('returns the full catalog for an admin when unrestricted', () => {
    expect(getAvailableServices(undefined, true)).toHaveLength(SERVICE_CATALOG.length);
  });

  it('drops entirely admin-gated services for a non-admin', () => {
    const available = getAvailableServices(undefined, false);
    expect(available.map(s => s.key)).not.toContain('reporting');
  });

  it('filters to only the channel-enabled services', () => {
    const channel = { channelId: 'sales', enabledServices: ['commerce', 'reporting'] };
    const available = getAvailableServices(channel, true);
    expect(available.map(s => s.key).sort()).toEqual(['commerce', 'reporting']);
  });

  it('combines channel gating and role gating', () => {
    const channel = { channelId: 'sales', enabledServices: ['commerce', 'reporting'] };
    const available = getAvailableServices(channel, false);
    expect(available.map(s => s.key)).toEqual(['commerce']);
  });
});

describe('getVisibleCommands', () => {
  it('hides admin-only commands from non-admins', () => {
    const directory = SERVICE_CATALOG.find(s => s.key === 'directory')!;
    const visible = getVisibleCommands(directory, false);
    expect(visible.every(c => !c.requiresAdmin)).toBe(true);
    expect(visible.length).toBeGreaterThan(0);
  });

  it('shows every command to an admin', () => {
    const directory = SERVICE_CATALOG.find(s => s.key === 'directory')!;
    expect(getVisibleCommands(directory, true)).toEqual(directory.commands);
  });
});
