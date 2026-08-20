import type { CommandHandler } from './index';
import { setUserLanguage } from '../../services/firestore';
import { createBotTextFlexMessage } from '../templates';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (value: string, language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: 'success',
  });

// LANG TH / THAI / ภาษาไทย
const langThHandler: CommandHandler = {
  name: 'lang-th',
  match: (u) => u === 'LANG TH' || u === 'THAI' || u === 'ภาษาไทย',
  handle: async (ctx) => {
    const { userId, userLanguage, agentName } = ctx;
    const result = await setUserLanguage(userId, 'th');
    if (!result.ok) {
      return [createBotTextFlexMessage({
        title: tr(userLanguage, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
        body: tr(userLanguage, 'บันทึกภาษาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'Unable to save language preference. Please try again.'),
        language: userLanguage,
        tone: 'error',
      })];
    }
    return [botText(`${agentName} เปลี่ยนภาษาเป็นไทยแล้วค่ะ`, 'th')];
  },
};

// LANG EN / ENGLISH
const langEnHandler: CommandHandler = {
  name: 'lang-en',
  match: (u) => u === 'LANG EN' || u === 'ENGLISH',
  handle: async (ctx) => {
    const { userId, userLanguage, agentName } = ctx;
    const result = await setUserLanguage(userId, 'en');
    if (!result.ok) {
      return [createBotTextFlexMessage({
        title: 'Cloudnex assistant',
        body: tr(userLanguage, 'บันทึกภาษาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'Unable to save language preference. Please try again.'),
        language: userLanguage,
        tone: 'error',
      })];
    }
    return [botText(`${agentName} switched language to English.`, 'en')];
  },
};

export const languageHandlers: CommandHandler[] = [langThHandler, langEnHandler];
