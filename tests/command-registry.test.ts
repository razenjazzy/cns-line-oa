import { describe, expect, it } from 'vitest';
import { commandRegistry, resolveCommandById } from '../src/ux/command-registry';

describe('commandRegistry', () => {
  it('returns only enabled customer commands for LINE', () => {
    const visible = commandRegistry.getVisible({ isAdmin: false, channel: 'line' });

    expect(visible.map(command => command.id)).toEqual([
      'PRODUCT_FIND',
      'QUOTE_CREATE',
      'QUOTE_CANCEL',
      'ORDER_CONFIRM',
    ]);
    expect(visible.every(command => command.channels?.includes('line'))).toBe(true);
  });

  it('keeps admin and operations commands out of LINE', () => {
    const visible = commandRegistry.getVisible({ isAdmin: true, channel: 'line' });

    expect(visible.map(command => command.id)).not.toContain('USER_CREATE');
    expect(visible.map(command => command.id)).not.toContain('SERVICE_CREATE');
    expect(visible.map(command => command.id)).not.toContain('DAILY_REPORT');
  });

  it('exposes operations commands only to an admin on the operations channel', () => {
    const visible = commandRegistry.getVisible({ isAdmin: true, channel: 'ops' });

    expect(visible.map(command => command.id)).toEqual(['USER_CREATE', 'SERVICE_CREATE']);
  });

  it('resolves command metadata by stable id', () => {
    expect(resolveCommandById('QUOTE_CREATE')).toMatchObject({
      commandText: 'QUOTE CREATE',
      handlerName: 'commerce-quote-create',
      action: 'quote.create',
    });
    expect(resolveCommandById('MISSING_COMMAND')).toBeUndefined();
  });
});