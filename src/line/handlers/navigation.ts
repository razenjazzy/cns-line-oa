import { messagingApi } from '@line/bot-sdk';
import type { CommandHandler } from './index';
import { buildHomeMenuMessage } from '../command-router';
import { getServiceDefinition, getVisibleCommands, isServiceEnabledForChannel } from '../../services/service-catalog';
import { createServiceActionFlexMessage } from '../templates';

const tr = (language: string, th: string, en: string): string => (language === 'en' ? en : th);

// NAV HOME / NAV / BACK — go back to service home menu
const navHomeHandler: CommandHandler = {
  name: 'nav-home',
  match: (u) => u === 'NAV HOME' || u === 'NAV' || u === 'BACK',
  handle: async (ctx) => [buildHomeMenuMessage(ctx.userLanguage, ctx.agentName, ctx.channel, ctx.profile.role === 'admin')],
};

// NAV <serviceKey> — show service-specific action panel
const navServiceHandler: CommandHandler = {
  name: 'nav-service',
  match: (u) => u.startsWith('NAV ') && u !== 'NAV HOME',
  handle: async (ctx) => {
    const { userLanguage, agentName, channel, profile } = ctx;
    const key = ctx.text.trim().replace(/^NAV\s*/i, '').trim();

    if (key.toUpperCase() === 'VERIFY') {
      // Redirect to guided verify form
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM VERIFY' });
    }

    const serviceDef = getServiceDefinition(key);
    const isAdmin = profile.role === 'admin';
    const visibleCommands = serviceDef ? getVisibleCommands(serviceDef, isAdmin) : [];

    if (!serviceDef || !isServiceEnabledForChannel(serviceDef.key, channel) || !visibleCommands.length) {
      return [{ type: 'text', text: tr(userLanguage, `${agentName} ไม่พบบริการนี้`, `${agentName} service not found.`) } as messagingApi.TextMessage];
    }

    return [createServiceActionFlexMessage(
      userLanguage === 'en' ? serviceDef.labelEn : serviceDef.labelTh,
      visibleCommands.map(c => ({ text: c.text, label: userLanguage === 'en' ? c.labelEn : c.labelTh })),
      userLanguage,
    )];
  },
};

export const navigationHandlers: CommandHandler[] = [navHomeHandler, navServiceHandler];
