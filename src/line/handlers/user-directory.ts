import type { CommandHandler } from './index';
import { createBotTextFlexMessage } from '../templates';
import { parseUserCreatePayload, parseUserUpdatePayload } from '../command-validators';
import {
  createPartnerFromLine,
  deletePartnerFromLine,
  getPartnerByPhone,
  updatePartnerFromLine,
} from '../../services/odoo';
import { recordAuditEvent, setUserOdooPartner } from '../../services/firestore';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const inferTone = (value: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = value.toLowerCase();
  if (/failed|ไม่สำเร็จ|ไม่พบ/.test(lower)) return 'error';
  if (/success|created|updated|deleted|สำเร็จ/.test(lower)) return 'success';
  return 'info';
};

const botText = (value: string, language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: inferTone(value),
  });

const adminOnlyReply = (language: UserLanguage) =>
  botText(tr(language, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.'), language);

// USER CREATE <name>,<phone>[,<email>]
const userCreateHandler: CommandHandler = {
  name: 'user-create',
  match: (u) => u.startsWith('USER CREATE'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const payload = text.trim().replace(/^USER CREATE\s*/i, '').trim();
    const parsed = parseUserCreatePayload(payload);
    if (!parsed) {
      return [botText(tr(userLanguage, 'วิธีใช้: USER CREATE <ชื่อ>,<เบอร์>,<อีเมล?>', 'Usage: USER CREATE <name>,<phone>,<email?>'), userLanguage)];
    }

    const { name, phone, email } = parsed;
    const partner = await createPartnerFromLine(name, phone, email);
    if (!partner) {
      recordAuditEvent({ action: 'user_create', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, detail: `phone=${phone}` });
      return [botText(tr(userLanguage, 'สร้างผู้ใช้ใน Odoo ไม่สำเร็จ', 'Failed to create user in Odoo.'), userLanguage)];
    }

    const partnerResult = await setUserOdooPartner(userId, partner.id, partner.name, partner.phone);
    recordAuditEvent({ action: 'user_create', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, targetId: String(partner.id) });
    if (!partnerResult.ok) {
      return [botText(tr(userLanguage, 'สร้างผู้ใช้ใน Odoo สำเร็จ แต่บันทึกสถานะผู้ใช้ในระบบไม่สำเร็จ กรุณาลองใหม่', 'Created Odoo user, but failed to persist user state. Please try again.'), userLanguage)];
    }
    return [botText(tr(userLanguage,
      `สร้างผู้ใช้ Odoo สำเร็จ\n- ID: ${partner.id}\n- ชื่อ: ${partner.name}\n- เบอร์: ${partner.phone || '-'}`,
      `Odoo user created\n- ID: ${partner.id}\n- Name: ${partner.name}\n- Phone: ${partner.phone || '-'}`,
    ), userLanguage)];
  },
};

// USER READ <phone>
const userReadHandler: CommandHandler = {
  name: 'user-read',
  match: (u) => u.startsWith('USER READ'),
  handle: async (ctx) => {
    const { userLanguage, profile, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const phone = text.trim().replace(/^USER READ\s*/i, '').trim();
    if (!phone) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM USER READ' });
    }

    const partner = await getPartnerByPhone(phone);
    if (!partner) {
      return [botText(tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`), userLanguage)];
    }
    return [botText(tr(userLanguage,
      `ข้อมูลผู้ใช้ Odoo\n- ID: ${partner.id}\n- ชื่อ: ${partner.name}\n- เบอร์: ${partner.phone || '-'}\n- อีเมล: ${partner.email || '-'}`,
      `Odoo user profile\n- ID: ${partner.id}\n- Name: ${partner.name}\n- Phone: ${partner.phone || '-'}\n- Email: ${partner.email || '-'}`,
    ), userLanguage)];
  },
};

// USER UPDATE <phone>,<name?>,<newPhone?>,<email?>
const userUpdateHandler: CommandHandler = {
  name: 'user-update',
  match: (u) => u.startsWith('USER UPDATE'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const payload = text.trim().replace(/^USER UPDATE\s*/i, '').trim();
    const parsed = parseUserUpdatePayload(payload);
    if (!parsed) {
      return [botText(tr(userLanguage, 'วิธีใช้: USER UPDATE <เบอร์>,<ชื่อใหม่?>,<เบอร์ใหม่?>,<อีเมล?>', 'Usage: USER UPDATE <phone>,<name?>,<newPhone?>,<email?>'), userLanguage)];
    }

    const { phone, name, newPhone, email } = parsed;
    const existing = await getPartnerByPhone(phone);
    if (!existing) {
      return [botText(tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`), userLanguage)];
    }

    const updated = await updatePartnerFromLine(existing.id, name, newPhone, email);
    if (!updated) {
      recordAuditEvent({ action: 'user_update', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: String(existing.id) });
      return [botText(tr(userLanguage, 'อัปเดตผู้ใช้ Odoo ไม่สำเร็จ', 'Failed to update Odoo user.'), userLanguage)];
    }
    recordAuditEvent({ action: 'user_update', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, targetId: String(existing.id) });
    return [botText(tr(userLanguage,
      `อัปเดตผู้ใช้ Odoo สำเร็จ\n- ID: ${updated.id}\n- ชื่อ: ${updated.name}\n- เบอร์: ${updated.phone || '-'}\n- อีเมล: ${updated.email || '-'}`,
      `Odoo user updated\n- ID: ${updated.id}\n- Name: ${updated.name}\n- Phone: ${updated.phone || '-'}\n- Email: ${updated.email || '-'}`,
    ), userLanguage)];
  },
};

// USER DELETE <phone>
const userDeleteHandler: CommandHandler = {
  name: 'user-delete',
  match: (u) => u.startsWith('USER DELETE'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const phone = text.trim().replace(/^USER DELETE\s*/i, '').trim();
    if (!phone) {
      return [botText(tr(userLanguage, 'วิธีใช้: USER DELETE <เบอร์>', 'Usage: USER DELETE <phone>'), userLanguage)];
    }

    const existing = await getPartnerByPhone(phone);
    if (!existing) {
      return [botText(tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`), userLanguage)];
    }

    const ok = await deletePartnerFromLine(existing.id);
    recordAuditEvent({ action: 'user_delete', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, targetId: String(existing.id) });
    return [botText(ok
      ? tr(userLanguage, `ลบผู้ใช้ Odoo สำเร็จ (ID ${existing.id})`, `Odoo user deleted (ID ${existing.id})`)
      : tr(userLanguage, 'ลบผู้ใช้ Odoo ไม่สำเร็จ', 'Failed to delete Odoo user.'),
      userLanguage)];
  },
};

export const userDirectoryHandlers: CommandHandler[] = [
  userCreateHandler,
  userReadHandler,
  userUpdateHandler,
  userDeleteHandler,
];
