import { describe, expect, it } from 'vitest';
import { createServiceActionFlexMessage, createServiceHomeFlexMessage } from '../src/line/templates';
import { BRAND } from '../src/line/templates/shared';

describe('NAV HOME rounded boxes', () => {
  it('keeps the committed tap-row box and only uses md (not lg+bold)', () => {
    const message = createServiceHomeFlexMessage([{ key: 'commerce', label: 'Products & Quotes' }], 'en', 'Sora');
    const bubble = message.contents as { body?: { contents?: Array<Record<string, unknown>> } };
    const row = bubble.body?.contents?.[0];
    expect(row?.type).toBe('box');
    expect(row?.cornerRadius).toBe(BRAND.radius);
    expect(row?.backgroundColor).toBe(BRAND.teal);
    expect(row?.style).toBeUndefined();
    const contents = row?.contents as Array<{ text?: string; size?: string; weight?: string }>;
    expect(contents[0]?.text).toBe('🛍️ Products & Quotes');
    expect(contents[0]?.size).toBe('md');
    expect(contents[0]?.weight).toBeUndefined();
  });

  it('uses the same tap-row box on service action lists', () => {
    const message = createServiceActionFlexMessage('Commerce', [{ text: 'QUOTE LIST', label: 'Quotes' }], 'en');
    const bubble = message.contents as { body?: { contents?: Array<{ type?: string; cornerRadius?: string; contents?: Array<{ size?: string; weight?: string }> }> } };
    const row = bubble.body?.contents?.[0];
    expect(row?.type).toBe('box');
    expect(row?.cornerRadius).toBe(BRAND.radius);
    expect(row?.contents?.[0]?.size).toBe('md');
    expect(row?.contents?.[0]?.weight).toBeUndefined();
  });
});
