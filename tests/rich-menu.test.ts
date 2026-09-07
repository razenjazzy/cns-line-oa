import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { richMenuIdForLanguage } from '../src/line/rich-menu';

describe('native LINE rich menu layout', () => {
  const layout = JSON.parse(readFileSync('assets/rich-menu/layout.json', 'utf8')) as {
    size: { width: number; height: number };
    chatBarTextEn: string;
    chatBarTextTh: string;
    areas: { action: { text: string }; labelEn: string; labelTh: string; fill?: string }[];
  };

  it('uses a compact 2x3 grid matching the native tray screenshot', () => {
    expect(layout.size).toEqual({ width: 2500, height: 843 });
    expect(layout.areas.map(area => area.action.text)).toEqual([
      'NAV HOME',
      'FORM VERIFY',
      'NAV commerce',
      'FORM ORDER STATUS',
      'GUIDE',
      'LANG',
    ]);
    expect(layout.areas.map(area => area.labelEn)).toEqual([
      'Home',
      'Verify',
      'Products & Quotes',
      'Order Status',
      'Help',
      'Language',
    ]);
    expect(layout.areas[1].fill).toBe('teal');
    expect(layout.areas[5].fill).toBe('goldTint');
  });

  it('uses sentence-case i18n labels', () => {
    expect(layout.chatBarTextEn).toBe('Menu');
    expect(layout.chatBarTextTh).toBe('เมนู');
    expect(layout.areas.map(area => area.labelTh)).toEqual([
      'หน้าหลัก',
      'ยืนยันตัวตน',
      'สินค้าและใบเสนอราคา',
      'สถานะออเดอร์',
      'ช่วยเหลือ',
      'ภาษา',
    ]);
  });
});

describe('rich menu SVG type', () => {
  it('uses compact type and screenshot labels', () => {
    const svg = readFileSync('assets/rich-menu/menu-en.svg', 'utf8');
    expect(svg).toContain('font-size: 48px');
    expect(svg).toContain('>Home<');
    expect(svg).toContain('>Verify<');
    expect(svg).toContain('>Products & Quotes<');
    expect(svg).not.toContain('>HOME<');
    expect(readFileSync('assets/rich-menu/menu-th.svg', 'utf8')).toContain('>หน้าหลัก<');
  });
});

describe('richMenuIdForLanguage', () => {
  it('reads EN and TH ids from env and ignores blanks', () => {
    expect(richMenuIdForLanguage('en', { LINE_RICH_MENU_EN: 'richmenu-en' })).toBe('richmenu-en');
    expect(richMenuIdForLanguage('th', { LINE_RICH_MENU_TH: 'richmenu-th' })).toBe('richmenu-th');
    expect(richMenuIdForLanguage('en', {})).toBeUndefined();
  });
});
