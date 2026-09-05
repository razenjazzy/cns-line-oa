import type { CommandHandler } from './index';
import { buildHomeMenuMessage } from '../command-router';
import { buildCommandKeywordGuidance, isGuideCommand, parseGuideCategoryKey } from '../command-guide';
import { createBotTextFlexMessage, createGuideCategoriesFlexMessage, createGuideCategoryFlexMessage } from '../templates';
import { pingOdoo, seedOdooSampleSalesData } from '../../services/odoo';
import { setEscalationState } from '../../services/firestore';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (value: string, language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: 'info',
  });

const buildFeaturesMessage = (language: UserLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} features\n1) Real-time Odoo product lookup\n2) Quotation creation from LINE chat\n3) Order status tracking from Odoo\n4) Daily report from real Odoo sales/inventory\n5) Thai/English language switching\n6) Named assistant identity for presentation demos`;
  }
  return `${agentName} ความสามารถหลัก\n1) ค้นหาสินค้าจาก Odoo แบบเรียลไทม์\n2) สร้างใบเสนอราคาจาก LINE chat\n3) เช็กสถานะออเดอร์จาก Odoo\n4) รายงานประจำวันจากยอดขาย/สต็อกจริงใน Odoo\n5) สลับภาษา ไทย/อังกฤษ\n6) กำหนดชื่อผู้ช่วยสำหรับงานเดโมได้`;
};

const buildJourneyMessage = (language: UserLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} end-to-end demo journey\nStep 1: ADMIN VERIFY\nStep 2: ADMIN ENABLE\nStep 3: SEED SAMPLE DATA\nStep 4: USER CREATE Somchai,0812345678,somchai@example.com\nStep 5: PRODUCT FIND App\nStep 6: QUOTE CREATE App Premium Plan,1,Somchai,0812345678\nStep 7: ORDER STATUS <reference>\nStep 8: DAILY REPORT\nStep 9: USER UPDATE 0812345678,Somchai CEO,0812345678,somchai.ceo@example.com\nStep 10: USER DELETE 0812345678`;
  }
  return `${agentName} เส้นทางเดโมครบวงจร\nขั้นที่ 1: ADMIN VERIFY\nขั้นที่ 2: ADMIN ENABLE\nขั้นที่ 3: SEED SAMPLE DATA\nขั้นที่ 4: USER CREATE สมชาย,0812345678,somchai@example.com\nขั้นที่ 5: PRODUCT FIND App\nขั้นที่ 6: QUOTE CREATE App Premium Plan,1,สมชาย,0812345678\nขั้นที่ 7: ORDER STATUS <เลขอ้างอิง>\nขั้นที่ 8: DAILY REPORT\nขั้นที่ 9: USER UPDATE 0812345678,สมชาย ซีอีโอ,0812345678,somchai.ceo@example.com\nขั้นที่ 10: USER DELETE 0812345678`;
};

// START / HELP / OPTIONS / MENU / เริ่มต้น — show home menu
const homeMenuHandler: CommandHandler = {
  name: 'help-home',
  match: (u) => ['เริ่มต้น', 'START', 'HELP', 'OPTIONS', 'MENU'].includes(u),
  handle: async (ctx) =>
    [buildHomeMenuMessage(ctx.userLanguage, ctx.agentName, ctx.channel, ctx.profile.role === 'admin')],
};

// FEATURES — list bot capabilities
const featuresHandler: CommandHandler = {
  name: 'help-features',
  match: (u) => u === 'FEATURES' || u === 'ฟีเจอร์',
  handle: async (ctx) =>
    [botText(buildFeaturesMessage(ctx.userLanguage, ctx.agentName), ctx.userLanguage)],
};

// JOURNEY / DEMO JOURNEY — show demo journey steps
const journeyHandler: CommandHandler = {
  name: 'help-journey',
  match: (u) => u === 'JOURNEY' || u === 'DEMO JOURNEY',
  handle: async (ctx) =>
    [botText(buildJourneyMessage(ctx.userLanguage, ctx.agentName), ctx.userLanguage)],
};

// NAME / BOT NAME / WHAT IS YOUR NAME / ชื่ออะไร
const nameHandler: CommandHandler = {
  name: 'help-name',
  match: (u) => ['NAME', 'BOT NAME', 'WHAT IS YOUR NAME', 'ชื่ออะไร'].includes(u),
  handle: async (ctx) =>
    [botText(tr(ctx.userLanguage, `ฉันชื่อ ${ctx.agentName} ค่ะ`, `My name is ${ctx.agentName}.`), ctx.userLanguage)],
};

// RUN DEMO JOURNEY — seed + print journey (admin convenience)
const runDemoJourneyHandler: CommandHandler = {
  name: 'help-run-demo-journey',
  match: (u) => u === 'RUN DEMO JOURNEY',
  handle: async (ctx) => {
    const { userLanguage, agentName } = ctx;
    const odooStatus = await pingOdoo();
    const seedStatus = await seedOdooSampleSalesData();
    const intro = tr(userLanguage, `${agentName} เตรียมสภาพแวดล้อมเดโมให้แล้วค่ะ`, `${agentName} prepared your demo environment.`);
    return [botText(
      `${intro}\n\n${tr(userLanguage, 'สถานะ Odoo:', 'Odoo:')} ${odooStatus}\n${tr(userLanguage, 'ผลการสร้างข้อมูลตัวอย่าง:', 'Seed:')} ${seedStatus}\n\n${buildJourneyMessage(userLanguage, agentName)}`,
      userLanguage,
    )];
  },
};

// HUMAN / AGENT / ติดต่อแอดมิน / คุยกับแอดมิน — guaranteed escalation to a
// human agent. Deterministic path: does not depend on the AI fallback
// deciding to call escalateToHuman (src/services/chat.ts), which only fires
// on its own judgment and is never listed anywhere as a command a user can
// rely on.
const humanHandoffHandler: CommandHandler = {
  name: 'help-human-handoff',
  match: (u) => ['HUMAN', 'AGENT', 'ติดต่อแอดมิน', 'คุยกับแอดมิน', 'คุยกับเจ้าหน้าที่'].includes(u),
  handle: async (ctx) => {
    const { userLanguage, userId, agentName } = ctx;
    const result = await setEscalationState(userId, true);
    const message = result.ok
      ? tr(userLanguage, `${agentName} โอนเคสให้แอดมินแล้วนะคะ เดี๋ยวเจ้าหน้าที่จะดูแลต่อทันที`, `${agentName} has escalated this chat to a human agent. Someone will follow up shortly.`)
      : tr(userLanguage, `${agentName} ยังไม่สามารถโอนเคสให้แอดมินได้ กรุณาลองใหม่อีกครั้ง`, `${agentName} could not escalate right now. Please try again.`);
    return [botText(message, userLanguage)];
  },
};

// GUIDE / GUIDE <category> — categorized, tappable command guide ("smart
// IVR"-style: pick a topic, then pick a command) instead of one long
// plain-text wall. Category buttons send `GUIDE <category>` themselves, so
// this same handler renders either level depending on what's in the text.
const guideHandler: CommandHandler = {
  name: 'help-guide',
  match: (_u, ctx) => isGuideCommand(ctx.text.trim()),
  handle: async (ctx) => {
    const category = parseGuideCategoryKey(ctx.text.trim());
    if (category) {
      return [createGuideCategoryFlexMessage(category, ctx.userLanguage, ctx.agentName)];
    }
    return [createGuideCategoriesFlexMessage(ctx.userLanguage, ctx.agentName)];
  },
};

/**
 * Keyword proximity guidance — fuzzy suggestions when the user types
 * something that almost matches a known command.
 * This is NOT a catch-all; command-router calls it explicitly before the
 * AI fallback so mis-typed commands get helpful correction.
 */
export const buildKeywordGuidanceMessages = (
  ctx: { text: string; userLanguage: UserLanguage; agentName: string; channel: any; profile: any },
) => {
  const guidance = buildCommandKeywordGuidance(ctx.text.trim(), ctx.userLanguage, ctx.agentName);
  if (!guidance) return null;
  return [
    botText(guidance, ctx.userLanguage),
    buildHomeMenuMessage(ctx.userLanguage, ctx.agentName, ctx.channel, ctx.profile.role === 'admin'),
  ];
};

export const helpHandlers: CommandHandler[] = [
  homeMenuHandler,
  featuresHandler,
  journeyHandler,
  nameHandler,
  runDemoJourneyHandler,
  humanHandoffHandler,
  guideHandler,
];
