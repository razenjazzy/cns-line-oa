import { describe, expect, it } from 'vitest';
import { createServiceActionFlexMessage, createServiceHomeFlexMessage } from '../src/line/templates';
import { BRAND } from '../src/line/templates/shared';

describe('NAV HOME rounded boxes', () => {
  it('keeps the committed tap-row box at lg without bold', () => {
    const message = createServiceHomeFlexMessage([{ key: 'commerce', label: 'Products & Quotes' }], 'en', 'Sora');
    const bubble = message.contents as { body?: { contents?: Array<Record<string, unknown>> } };
    const row = bubble.body?.contents?.[0];
    expect(row?.type).toBe('box');
    expect(row?.cornerRadius).toBe(BRAND.radius);
    expect(row?.backgroundColor).toBe(BRAND.teal);
    expect(row?.style).toBeUndefined();
    const contents = row?.contents as Array<{ text?: string; size?: string; weight?: string }>;
    expect(contents[0]?.text).toBe('🛍️ Products & Quotes');
    expect(contents[0]?.size).toBe('lg');
    expect(contents[0]?.weight).toBeUndefined();
  });

  it('uses the same tap-row box on service action lists', () => {
    const message = createServiceActionFlexMessage('Commerce', [{ text: 'QUOTE LIST', label: 'Quotes' }], 'en');
    const bubble = message.contents as { body?: { contents?: Array<{ type?: string; cornerRadius?: string; contents?: Array<{ size?: string; weight?: string }> }> } };
    const row = bubble.body?.contents?.[0];
    expect(row?.type).toBe('box');
    expect(row?.cornerRadius).toBe(BRAND.radius);
    expect(row?.contents?.[0]?.size).toBe('lg');
    expect(row?.contents?.[0]?.weight).toBeUndefined();
  });

  it('golds Verify only when the sales session is on', () => {
    const on = createServiceHomeFlexMessage(
      [{ key: 'VERIFY', label: 'Verify account' }, { key: 'commerce', label: 'Products & Quotes' }],
      'en',
      'Sora',
      true,
    );
    const off = createServiceHomeFlexMessage(
      [{ key: 'VERIFY', label: 'Verify account' }, { key: 'commerce', label: 'Products & Quotes' }],
      'en',
      'Sora',
      false,
    );
    const onBody = on.contents as { body?: { contents?: Array<Record<string, unknown>> }; footer?: { contents?: Array<Record<string, unknown>> } };
    const offBody = off.contents as { body?: { contents?: Array<Record<string, unknown>> } };
    expect(onBody.body?.contents?.[0]?.backgroundColor).toBe(BRAND.gold);
    expect(onBody.body?.contents?.[1]?.backgroundColor).toBe(BRAND.teal);
    expect(offBody.body?.contents?.[0]?.backgroundColor).toBe(BRAND.tealTint);
    expect(offBody.body?.contents?.[1]?.backgroundColor).toBe(BRAND.teal);
    expect(onBody.footer?.contents?.[0]?.backgroundColor).toBe(BRAND.gold);
  });

  it('uses regular Language fill on the Thai home footer', () => {
    const message = createServiceHomeFlexMessage([{ key: 'commerce', label: 'สินค้าและใบเสนอราคา' }], 'th', 'โซระ');
    const bubble = message.contents as { footer?: { contents?: Array<Record<string, unknown>> } };
    expect(bubble.footer?.contents?.[0]?.backgroundColor).toBe(BRAND.tealTint);
  });

  it('puts Language and Guide in the same tap-row type as the service list', () => {
    const message = createServiceHomeFlexMessage([{ key: 'commerce', label: 'Products & Quotes' }], 'en', 'Sora');
    const bubble = message.contents as { footer?: { layout?: string; contents?: Array<Record<string, unknown>> } };
    expect(bubble.footer?.layout).toBe('horizontal');
    const tiles = bubble.footer?.contents || [];
    expect(tiles).toHaveLength(2);
    expect(tiles.every(tile => tile.type === 'box' && tile.cornerRadius === BRAND.radius && tile.style === undefined)).toBe(true);
    const first = tiles[0]?.contents as Array<{ text?: string; size?: string; weight?: string }>;
    expect(first[0]?.text).toBe('🌐 Language');
    expect(first[0]?.size).toBe('lg');
    expect(first[0]?.weight).toBeUndefined();
  });
});
