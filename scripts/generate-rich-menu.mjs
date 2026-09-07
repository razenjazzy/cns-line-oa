#!/usr/bin/env node
/**
 * Builds LINE native rich-menu art from assets/rich-menu/layout.json.
 * Default PNGs have every tile equal. Per-cell "active" (dark teal) variants
 * are menu-{lang}-{id}.png for linkUserRichMenu after a tray tap.
 *
 *   node scripts/generate-rich-menu.mjs
 */
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEAL = '#0B6E6A';
const TEAL_STRONG = '#063F3D';
const TEAL_TINT = '#E3F0EE';
const GOLD = '#A97A2B';
const GOLD_TINT = '#F4E9D4';
const fills = { teal: TEAL, tealTint: TEAL_TINT, goldTint: GOLD_TINT };
const inks = { teal: '#FFFFFF', tealTint: TEAL_STRONG, goldTint: GOLD };

const tileFill = (area, activeId, lang) => {
  if (area.id === 'language') return lang === 'th' ? 'teal' : 'goldTint';
  if (area.id === activeId) return 'teal';
  return 'tealTint';
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'rich-menu');
mkdirSync(outDir, { recursive: true });
const layout = JSON.parse(readFileSync(join(outDir, 'layout.json'), 'utf8'));
const WIDTH = layout.size.width;
const HEIGHT = layout.size.height;
const PAD = 20;
const RADIUS = 28;
const FONT_SIZE = 48;
const STROKE = 10;

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const withFills = (activeId, lang) => ({
  ...layout,
  areas: layout.areas.map(area => ({
    ...area,
    fill: tileFill(area, activeId, lang),
  })),
});

const iconSvg = (icon, cx, cy, color) => {
  const stroke = `fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
  if (icon === 'home') {
    return `<path ${stroke} d="M ${cx - 36} ${cy + 4} L ${cx} ${cy - 36} L ${cx + 36} ${cy + 4} V ${cy + 36} H ${cx + 12} V ${cy + 10} H ${cx - 12} V ${cy + 36} H ${cx - 36} Z"/>`;
  }
  if (icon === 'verify') {
    return `<circle ${stroke} cx="${cx}" cy="${cy}" r="38"/>
    <path ${stroke} d="M ${cx - 16} ${cy + 2} L ${cx - 4} ${cy + 16} L ${cx + 20} ${cy - 14}"/>`;
  }
  if (icon === 'bag') {
    return `<path ${stroke} d="M ${cx - 32} ${cy - 8} H ${cx + 32} L ${cx + 24} ${cy + 36} H ${cx - 24} Z M ${cx - 14} ${cy - 8} V ${cy - 22} A 14 14 0 0 1 ${cx + 14} ${cy - 22} V ${cy - 8}"/>`;
  }
  if (icon === 'grid') {
    return `<rect ${stroke} x="${cx - 34}" y="${cy - 34}" width="30" height="30" rx="5"/>
    <rect ${stroke} x="${cx + 4}" y="${cy - 34}" width="30" height="30" rx="5"/>
    <rect ${stroke} x="${cx - 34}" y="${cy + 4}" width="30" height="30" rx="5"/>
    <rect ${stroke} x="${cx + 4}" y="${cy + 4}" width="30" height="30" rx="5"/>`;
  }
  if (icon === 'help') {
    return `<circle ${stroke} cx="${cx}" cy="${cy}" r="38"/>
    <path ${stroke} d="M ${cx - 12} ${cy - 12} A 14 14 0 1 1 ${cx} ${cy + 6} V ${cy + 14}"/>
    <circle fill="${color}" cx="${cx}" cy="${cy + 26}" r="4"/>`;
  }
  return `<circle ${stroke} cx="${cx}" cy="${cy}" r="36"/>
    <ellipse ${stroke} cx="${cx}" cy="${cy}" rx="14" ry="36"/>
    <path ${stroke} d="M ${cx - 36} ${cy} h 72"/>`;
};

const buildSvg = (lang, spec) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="100%" height="100%" fill="#F3F5F4"/>
  <style>
    .label {
      font-family: -apple-system, "SF Pro Text", "Helvetica Neue", Thonburi, sans-serif;
      font-size: ${FONT_SIZE}px;
      font-weight: 700;
      text-anchor: middle;
    }
  </style>
  ${spec.areas.map(area => {
    const { x, y, width: w, height: h } = area.bounds;
    const fillKey = area.fill || 'tealTint';
    const fill = fills[fillKey] || TEAL_TINT;
    const ink = inks[fillKey] || TEAL_STRONG;
    const tileX = x + PAD;
    const tileY = y + PAD;
    const tileW = w - PAD * 2;
    const tileH = h - PAD * 2;
    const cx = x + w / 2;
    const iconY = y + h * 0.42;
    const label = escapeXml(lang === 'th' ? area.labelTh : area.labelEn);
    return `<rect x="${tileX}" y="${tileY}" width="${tileW}" height="${tileH}" rx="${RADIUS}" fill="${fill}"/>
    ${iconSvg(area.icon, cx, iconY, ink)}
    <text class="label" fill="${ink}" x="${cx}" y="${y + h * 0.78}">${label}</text>`;
  }).join('\n  ')}
</svg>
`;

const swift = join(root, 'scripts', 'render-rich-menu.swift');
const render = (spec, lang, pngName) => {
  const tmp = join(outDir, `.layout-${lang}-${pngName}.json`);
  writeFileSync(tmp, JSON.stringify(spec));
  const png = join(outDir, pngName);
  const result = spawnSync('swift', [swift, tmp, lang, png], { encoding: 'utf8' });
  unlinkSync(tmp);
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || 'swift render failed');
    process.exit(result.status || 1);
  }
  process.stdout.write(result.stdout || '');
};

for (const lang of ['en', 'th']) {
  const defaultSpec = withFills(null, lang);
  writeFileSync(join(outDir, `menu-${lang}.svg`), buildSvg(lang, defaultSpec));
  render(defaultSpec, lang, `menu-${lang}.png`);
  for (const area of layout.areas) {
    render(withFills(area.id, lang), lang, `menu-${lang}-${area.id}.png`);
  }
}

console.log(`svg + png written (${FONT_SIZE}px, radius ${RADIUS}, pad ${PAD}, active variants)`);
