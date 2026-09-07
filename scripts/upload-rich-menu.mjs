#!/usr/bin/env node
/**
 * Creates EN + TH LINE rich menus from assets/rich-menu, uploads PNGs,
 * sets the English menu as the channel default. Prints IDs to put in
 * LINE_RICH_MENU_EN / LINE_RICH_MENU_TH (LANG then links the matching PNG).
 * Previous menus are not deleted.
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

const publish = async (language) => {
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: layout.size,
      selected: true,
      name: `${layout.name} ${language.toUpperCase()}`,
      chatBarText: language === 'th' ? layout.chatBarTextTh : layout.chatBarTextEn,
      areas,
    }),
  });
  if (!createRes.ok) {
    console.error('createRichMenu failed', language, createRes.status, await createRes.text());
    process.exit(1);
  }
  const { richMenuId } = await createRes.json();
  const png = readFileSync(join(root, `assets/rich-menu/menu-${language}.png`));
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/png' },
    body: png,
  });
  if (!uploadRes.ok) {
    console.error('upload rich menu image failed', language, uploadRes.status, await uploadRes.text());
    process.exit(1);
  }
  return richMenuId;
};

const enId = await publish('en');
const thId = await publish('th');

const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${enId}`, {
  method: 'POST',
  headers,
});
if (!defaultRes.ok) {
  console.error('setDefaultRichMenu failed', defaultRes.status, await defaultRes.text());
  process.exit(1);
}

console.log(`Published default EN ${enId}`);
console.log(`Published TH ${thId} (linked per user on LANG)`);
console.log(`Set LINE_RICH_MENU_EN=${enId}`);
console.log(`Set LINE_RICH_MENU_TH=${thId}`);
