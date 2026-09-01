import type { CommandHandler } from './index';
import { createBotTextFlexMessage } from '../templates';
import { deleteUserProfile, setMarketingOptIn } from '../../services/firestore';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (value: string, language: UserLanguage, tone: 'info' | 'success' | 'warning' | 'error' = 'info', quickReplyActions?: { label: string; text: string }[]) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone,
    quickReplyActions,
  });

// MY DATA / ข้อมูลของฉัน — PDPA data-subject access request
const myDataHandler: CommandHandler = {
  name: 'privacy-my-data',
  match: (u) => u === 'MY DATA' || u === 'ข้อมูลของฉัน',
  handle: async (ctx) => {
    const { userLanguage, profile } = ctx;
    const yes = tr(userLanguage, 'ใช่', 'yes');
    const no = tr(userLanguage, 'ไม่', 'no');
    const lines = [
      `${tr(userLanguage, 'ชื่อที่บันทึกไว้', 'Stored name')}: ${profile.displayName || tr(userLanguage, 'ไม่มี', 'none')}`,
      `${tr(userLanguage, 'เบอร์โทรที่บันทึกไว้', 'Stored phone')}: ${profile.phone || tr(userLanguage, 'ไม่มี', 'none')}`,
      `${tr(userLanguage, 'ยืนยันตัวตน Odoo แล้ว', 'Odoo verified')}: ${profile.odooVerified ? yes : no}`,
      `${tr(userLanguage, 'สิทธิ์ใช้งาน', 'Role')}: ${profile.role}`,
      `${tr(userLanguage, 'ภาษาที่เลือก', 'Language')}: ${profile.language}`,
      `${tr(userLanguage, 'รับข่าวสาร/โปรโมชัน', 'Marketing messages')}: ${profile.marketingOptIn ? tr(userLanguage, 'เปิดรับ', 'subscribed') : tr(userLanguage, 'ไม่รับ', 'not subscribed')}`,
    ];
    return [botText(
      `${tr(userLanguage, 'ข้อมูลของคุณที่เก็บไว้กับเรา', 'Data we have stored about you')}\n${lines.map(l => `- ${l}`).join('\n')}\n\n${tr(userLanguage, 'พิมพ์ DELETE MY DATA เพื่อขอลบข้อมูลทั้งหมด', 'Type DELETE MY DATA to request full erasure.')}`,
      userLanguage,
    )];
  },
};

// DELETE MY DATA — request erasure; requires explicit confirmation since it's
// destructive and hard to reverse (a returning user starts over unverified).
const deleteMyDataHandler: CommandHandler = {
  name: 'privacy-delete-my-data-request',
  match: (u) => u === 'DELETE MY DATA',
  handle: async (ctx) => {
    const { userLanguage } = ctx;
    return [botText(
      tr(userLanguage,
        'ต้องการลบข้อมูลทั้งหมดของคุณอย่างถาวรใช่หรือไม่? การยืนยันตัวตนและข้อมูลที่บันทึกไว้จะถูกลบ และต้องเริ่มใหม่หากกลับมาใช้งานอีกครั้ง',
        'Permanently delete all your stored data? Your verification and saved details will be erased, and you\'ll start fresh if you come back.',
      ),
      userLanguage,
      'warning',
      [
        { label: tr(userLanguage, 'ยืนยันลบ', 'Confirm delete'), text: 'CONFIRM DELETE MY DATA' },
        { label: tr(userLanguage, 'ยกเลิก', 'Cancel'), text: 'CANCEL' },
      ],
    )];
  },
};

const confirmDeleteMyDataHandler: CommandHandler = {
  name: 'privacy-delete-my-data-confirm',
  match: (u) => u === 'CONFIRM DELETE MY DATA',
  handle: async (ctx) => {
    const { userLanguage, userId, agentName } = ctx;
    const result = await deleteUserProfile(userId);
    return [botText(
      result.ok
        ? tr(userLanguage, `${agentName} ลบข้อมูลของคุณเรียบร้อยแล้ว`, `${agentName} has deleted your data.`)
        : tr(userLanguage, `${agentName} ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง`, `${agentName} could not delete your data. Please try again.`),
      userLanguage,
      result.ok ? 'success' : 'error',
    )];
  },
};

// PROMO ON / PROMO OFF — marketing multicast preference (opt-out by default,
// see src/jobs/segmentation.ts).
const promoOnHandler: CommandHandler = {
  name: 'privacy-promo-on',
  match: (u) => u === 'PROMO ON' || u === 'รับโปรโมชัน',
  handle: async (ctx) => {
    const { userLanguage, userId, agentName } = ctx;
    const result = await setMarketingOptIn(userId, true);
    return [botText(
      result.ok
        ? tr(userLanguage, `${agentName} เปิดรับข่าวสารและโปรโมชันให้แล้ว`, `${agentName} has subscribed you to promotions and updates.`)
        : tr(userLanguage, `${agentName} บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่`, `${agentName} could not save that. Please try again.`),
      userLanguage,
      result.ok ? 'success' : 'error',
    )];
  },
};

const promoOffHandler: CommandHandler = {
  name: 'privacy-promo-off',
  match: (u) => u === 'PROMO OFF' || u === 'ไม่รับโปรโมชัน',
  handle: async (ctx) => {
    const { userLanguage, userId, agentName } = ctx;
    const result = await setMarketingOptIn(userId, false);
    return [botText(
      result.ok
        ? tr(userLanguage, `${agentName} ปิดรับข่าวสารและโปรโมชันให้แล้ว`, `${agentName} has unsubscribed you from promotions and updates.`)
        : tr(userLanguage, `${agentName} บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่`, `${agentName} could not save that. Please try again.`),
      userLanguage,
      result.ok ? 'success' : 'error',
    )];
  },
};

export const privacyHandlers: CommandHandler[] = [
  myDataHandler,
  deleteMyDataHandler,
  confirmDeleteMyDataHandler,
  promoOnHandler,
  promoOffHandler,
];
