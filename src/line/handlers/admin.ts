import type { CommandHandler } from './index';
import { isAuthorizedForAdminRole } from '../../services/admin-authorization';
import { verifyOdooAdminAccess } from '../../services/odoo';
import { recordAuditEvent, setUserRole } from '../../services/firestore';
import { createBotTextFlexMessage } from '../templates';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const inferTone = (value: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = value.toLowerCase();
  if (/failed|fail|error|unauthorized|invalid|ไม่สำเร็จ|ไม่ได้/.test(lower)) return 'error';
  if (/success|created|enabled|สำเร็จ|แล้ว/.test(lower)) return 'success';
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

// ADMIN VERIFY — check Odoo admin connectivity
const adminVerifyHandler: CommandHandler = {
  name: 'admin-verify',
  match: (u) => u === 'ADMIN VERIFY',
  handle: async (ctx) => {
    const { userLanguage } = ctx;
    try {
      const result = await verifyOdooAdminAccess();
      return [botText(tr(userLanguage, `ผลตรวจสิทธิ์แอดมิน: ${result.message}`, `Admin verification: ${result.message}`), userLanguage)];
    } catch {
      return [botText(tr(userLanguage, 'ตรวจสิทธิ์แอดมินล้มเหลว', 'Admin verification failed.'), userLanguage)];
    }
  },
};

// ADMIN ENABLE — elevate requesting user to admin role
const adminEnableHandler: CommandHandler = {
  name: 'admin-enable',
  match: (u) => u === 'ADMIN ENABLE',
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel } = ctx;
    const authorization = isAuthorizedForAdminRole(userId, profile);
    if (!authorization.ok) return [adminOnlyReply(userLanguage)];

    const result = await verifyOdooAdminAccess();
    if (!result.ok) {
      return [botText(tr(userLanguage, `เปิดสิทธิ์แอดมินไม่ได้: ${result.message}`, `Cannot enable admin: ${result.message}`), userLanguage)];
    }

    const roleResult = await setUserRole(userId, 'admin');
    if (!roleResult.ok) {
      return [botText(tr(userLanguage, 'เปิดสิทธิ์แอดมินไม่สำเร็จจากระบบข้อมูล กรุณาลองอีกครั้ง', 'Admin enable failed due to data-store issue. Please try again.'), userLanguage)];
    }

    recordAuditEvent({ action: 'role_grant', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, targetId: userId });
    return [botText(tr(userLanguage, 'เปิดสิทธิ์แอดมินแล้ว สามารถใช้คำสั่งแอดมินได้', 'Admin role enabled. You can now run admin commands.'), userLanguage)];
  },
};

// ADMIN DISABLE / ADMIN REVOKE — revoke admin role
const adminDisableHandler: CommandHandler = {
  name: 'admin-disable',
  match: (u) => u === 'ADMIN DISABLE' || u === 'ADMIN REVOKE',
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const roleResult = await setUserRole(userId, 'user');
    if (!roleResult.ok) {
      return [botText(tr(userLanguage, 'ปิดสิทธิ์แอดมินไม่สำเร็จจากระบบข้อมูล กรุณาลองอีกครั้ง', 'Admin disable failed due to a data-store issue. Please try again.'), userLanguage)];
    }

    recordAuditEvent({ action: 'role_revoke', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, targetId: userId });
    return [botText(tr(userLanguage, 'ปิดสิทธิ์แอดมินสำหรับบัญชีนี้แล้ว', 'Admin role disabled for this account.'), userLanguage)];
  },
};

// ADMIN ACCESS — show current admin status
const adminAccessHandler: CommandHandler = {
  name: 'admin-access',
  match: (u) => u === 'ADMIN ACCESS',
  handle: async (ctx) => {
    const { userLanguage, profile, agentName } = ctx;
    const isAdmin = profile.role === 'admin';
    return [botText(tr(
      userLanguage,
      isAdmin ? `${agentName} สิทธิ์ปัจจุบัน: แอดมิน` : `${agentName} สิทธิ์ปัจจุบัน: ผู้ใช้ทั่วไป`,
      isAdmin ? `${agentName} current role: admin` : `${agentName} current role: standard user`,
    ), userLanguage)];
  },
};

export const adminHandlers: CommandHandler[] = [
  adminVerifyHandler,
  adminEnableHandler,
  adminDisableHandler,
  adminAccessHandler,
];
