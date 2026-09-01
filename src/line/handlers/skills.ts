import type { CommandHandler } from './index';
import { createBotTextFlexMessage } from '../templates';
import { loadSkills, matchSkill, renderSkillReply } from '../../services/skill-loader';

const adminOnlyReply = (language: 'th' | 'en') =>
  createBotTextFlexMessage({
    title: language === 'en' ? 'Cloudnex assistant' : 'ผู้ช่วย Cloudnex',
    body: language === 'en' ? 'This command is admin-only.' : 'คำสั่งนี้สำหรับแอดมินเท่านั้น',
    language,
    tone: 'error',
  });

// SKILLS / LIST SKILLS — enumerate loaded skill commands, so a shop admin
// can see what's available without reading the skills/ directory directly.
export const listSkillsHandler: CommandHandler = {
  name: 'skills-list',
  match: (u) => u === 'SKILLS' || u === 'LIST SKILLS',
  handle: async (ctx) => {
    const visible = loadSkills().filter(skill => !skill.adminOnly || ctx.profile.role === 'admin');
    if (!visible.length) {
      return [createBotTextFlexMessage({
        title: ctx.agentName,
        body: ctx.userLanguage === 'en' ? 'No custom skills are configured.' : 'ยังไม่มีสกิลที่กำหนดเอง',
        language: ctx.userLanguage,
        tone: 'info',
      })];
    }

    const lines = visible.map(skill => `- ${[skill.command, ...skill.aliases].join(' / ')}${skill.adminOnly ? ' (admin)' : ''}`);
    const body = (ctx.userLanguage === 'en' ? 'Available skills:\n' : 'สกิลที่ใช้งานได้:\n') + lines.join('\n');
    return [createBotTextFlexMessage({ title: ctx.agentName, body, language: ctx.userLanguage, tone: 'info' })];
  },
};

/**
 * One catch-all CommandHandler for every markdown skill file, appended at
 * the end of COMMAND_HANDLERS (see handlers/index.ts) — it only sees a
 * message once every built-in TypeScript handler has already declined it,
 * so a skill file can add a command but can never shadow one.
 */
export const skillsHandler: CommandHandler = {
  name: 'skills',
  match: (upperText) => matchSkill(loadSkills(), upperText, upperText) !== null,
  handle: async (ctx) => {
    const matched = matchSkill(loadSkills(), ctx.text.trim().toUpperCase(), ctx.text.trim());
    if (!matched) {
      // Shouldn't happen (match() just confirmed a hit), but fail safe.
      return [];
    }

    if (matched.skill.adminOnly && ctx.profile.role !== 'admin') {
      return [adminOnlyReply(ctx.userLanguage)];
    }

    const body = renderSkillReply(matched.skill, ctx.userLanguage, matched.query);
    return [createBotTextFlexMessage({
      title: ctx.agentName,
      body,
      language: ctx.userLanguage,
      tone: 'info',
    })];
  },
};
