#!/usr/bin/env node
/**
 * Publishes default EN/TH trays plus per-cell active variants.
 * Prints LINE_RICH_MENU_EN / _TH and LINE_RICH_MENU_JSON for Railway.
 *
 *   node scripts/upload-rich-menu.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_DEFAULT_ACCESS_TOKEN || '').trim();
if (!token) {
  console.error('Set LINE_CHANNEL_ACCESS_TOKEN before publishing the rich menu.');
  process.exit(1);
}

const layout = JSON.parse(readFileSync(join(root, 'assets/rich-menu/layout.json'), 'utf8'));
const headers = { Authorization: `Bearer ${token}` };
const areas = layout.areas.map(({ bounds, action }) => ({ bounds, action }));
const variants = ['default', ...layout.areas.map(area => area.id)];

const publish = async (language, variant) => {
  const pngName = variant === 'default' ? `menu-${language}.png` : `menu-${language}-${variant}.png`;
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: layout.size,
      selected: true,
      name: `${layout.name} ${language.toUpperCase()} ${variant}`,
      chatBarText: language === 'th' ? layout.chatBarTextTh : layout.chatBarTextEn,
      areas,
    }),
  });
  if (!createRes.ok) {
    console.error('createRichMenu failed', language, variant, createRes.status, await createRes.text());
    process.exit(1);
  }
  const { richMenuId } = await createRes.json();
  const png = readFileSync(join(root, 'assets/rich-menu', pngName));
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/png' },
    body: png,
  });
  if (!uploadRes.ok) {
    console.error('upload rich menu image failed', language, variant, uploadRes.status, await uploadRes.text());
    process.exit(1);
  }
  return richMenuId;
};

const ids = { en: {}, th: {} };
for (const language of ['en', 'th']) {
  for (const variant of variants) {
    ids[language][variant] = await publish(language, variant);
  }
}

const defaultEn = ids.en.default;
const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${defaultEn}`, {
  method: 'POST',
  headers,
});
if (!defaultRes.ok) {
  console.error('setDefaultRichMenu failed', defaultRes.status, await defaultRes.text());
  process.exit(1);
}

console.log(`Published default EN ${defaultEn}`);
console.log(`Published default TH ${ids.th.default}`);
console.log(`Set LINE_RICH_MENU_EN=${defaultEn}`);
console.log(`Set LINE_RICH_MENU_TH=${ids.th.default}`);
console.log(`Set LINE_RICH_MENU_JSON=${JSON.stringify(ids)}`);
