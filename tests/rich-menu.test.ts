import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { richMenuIdForLanguage, trayVariantForCommand } from '../src/line/rich-menu';

describe('native LINE rich menu layout', () => {
  const layout = JSON.parse(readFileSync('assets/rich-menu/layout.json', 'utf8')) as {
    size: { width: number; height: number };
    chatBarTextEn: string;
    chatBarTextTh: string;
    areas: { id?: string; action: { text: string }; labelEn: string; labelTh: string; fill?: string }[];
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
    expect(layout.areas.every(area => !area.fill)).toBe(true);
    expect(layout.areas.map(area => area.id)).toEqual(['home', 'verify', 'commerce', 'orders', 'help', 'language']);
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
    expect(svg).toContain('>Products &amp; Quotes<');
    expect(svg).toContain('stroke-width="10"');
    expect(svg).toContain('#F4E9D4');
    const th = readFileSync('assets/rich-menu/menu-th.svg', 'utf8');
    expect(th).toContain('>หน้าหลัก<');
    expect(th).toContain('#0B6E6A');
  });
});

describe('richMenuIdForLanguage', () => {
  it('reads EN and TH ids from env and ignores blanks', () => {
    expect(richMenuIdForLanguage('en', { LINE_RICH_MENU_EN: 'richmenu-en' })).toBe('richmenu-en');
    expect(richMenuIdForLanguage('th', { LINE_RICH_MENU_TH: 'richmenu-th' })).toBe('richmenu-th');
    expect(richMenuIdForLanguage('en', {})).toBeUndefined();
  });

  it('prefers LINE_RICH_MENU_JSON variants for the active tray cell', () => {
    const env = {
      LINE_RICH_MENU_EN: 'richmenu-en-default',
      LINE_RICH_MENU_JSON: JSON.stringify({
        en: { default: 'richmenu-en-default', verify: 'richmenu-en-verify' },
        th: { default: 'richmenu-th-default', language: 'richmenu-th-language' },
      }),
    };
    expect(richMenuIdForLanguage('en', env, 'verify')).toBe('richmenu-en-verify');
    expect(richMenuIdForLanguage('en', env, 'home')).toBe('richmenu-en-default');
    expect(richMenuIdForLanguage('th', env, 'language')).toBe('richmenu-th-language');
  });
});

describe('trayVariantForCommand', () => {
  it('maps tray taps to the active cell', () => {
    expect(trayVariantForCommand('NAV HOME')).toBe('home');
    expect(trayVariantForCommand('FORM VERIFY')).toBe('verify');
    expect(trayVariantForCommand('NAV commerce')).toBe('commerce');
    expect(trayVariantForCommand('FORM ORDER STATUS')).toBe('orders');
    expect(trayVariantForCommand('GUIDE')).toBe('help');
    expect(trayVariantForCommand('LANG')).toBe('language');
    expect(trayVariantForCommand('QUOTE CREATE x')).toBeUndefined();
  });
});
