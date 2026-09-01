import type { CommandHandler } from './index';
import { isAuthorizedForAdminRole } from '../../services/admin-authorization';
import { verifyOdooAdminAccess } from '../../services/odoo';
import { recordAuditEvent, setUserRole } from '../../services/firestore';
import { createBotTextFlexMessage } from '../templates';
import type { UserLanguage } from '../../services/firestore';
import { getChannelServiceOverride, resolveChannelConfig, setChannelServiceOverride } from '../channels';
import { SERVICE_CATALOG } from '../../services/service-catalog';
import { runAuditRotationJob } from '../../jobs/audit-rotation';

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

const VALID_SERVICE_KEYS = new Set<string>(SERVICE_CATALOG.map(s => s.key));

const channelUsageReply = (language: UserLanguage, channelId: string) => botText(tr(language,
  `วิธีใช้: ADMIN CHANNEL ${channelId} STATUS หรือ ADMIN CHANNEL ${channelId} SERVICES <${Array.from(VALID_SERVICE_KEYS).join('|')}|ALL>`,
  `Usage: ADMIN CHANNEL ${channelId} STATUS or ADMIN CHANNEL ${channelId} SERVICES <${Array.from(VALID_SERVICE_KEYS).join('|')}|ALL>`,
), language);

// ADMIN CHANNEL <channelId> STATUS — show a channel's effective module list
// ADMIN CHANNEL <channelId> SERVICES <svc1,svc2,...|ALL> — set a runtime override,
// so enabling/disabling a module per LINE OA channel no longer needs a redeploy.
const adminChannelHandler: CommandHandler = {
  name: 'admin-channel',
  match: (u) => u.startsWith('ADMIN CHANNEL '),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel: actingChannel, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const parts = text.trim().replace(/^ADMIN CHANNEL\s*/i, '').trim().split(/\s+/);
    const targetChannelId = parts[0] || '';
    const action = (parts[1] || '').toUpperCase();

    if (!targetChannelId) return [channelUsageReply(userLanguage, '<channelId>')];

    const channelConfig = resolveChannelConfig(targetChannelId);
    if (!channelConfig) {
      return [botText(tr(userLanguage,
        `ไม่พบช่องทาง "${targetChannelId}" หรือยังไม่ได้ตั้งค่า`,
        `Unknown or unconfigured channel "${targetChannelId}".`,
      ), userLanguage)];
    }

    if (action === 'STATUS') {
      const override = await getChannelServiceOverride(targetChannelId);
      const effective = override !== undefined ? override : channelConfig.enabledServices;
      const summary = effective === null
        ? tr(userLanguage, 'ทุกโมดูล (ไม่จำกัด)', 'all modules (unrestricted)')
        : (effective.length ? effective.join(', ') : tr(userLanguage, 'ไม่มีโมดูลเปิดใช้งาน', 'no modules enabled'));
      return [botText(tr(userLanguage,
        `ช่องทาง "${targetChannelId}"\n- โมดูลที่เปิดใช้งาน: ${summary}\n- แหล่งที่มา: ${override !== undefined ? 'ตั้งค่าโดยแอดมิน' : 'ค่าเริ่มต้นจาก ENV'}`,
        `Channel "${targetChannelId}"\n- Enabled modules: ${summary}\n- Source: ${override !== undefined ? 'admin override' : 'env default'}`,
      ), userLanguage)];
    }

    if (action === 'SERVICES') {
      const listRaw = parts.slice(2).join(' ').trim();

      if (listRaw.toUpperCase() === 'ALL') {
        const result = await setChannelServiceOverride(targetChannelId, null);
        if (!result.ok) return [botText(tr(userLanguage, 'บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่', 'Failed to save the override. Please try again.'), userLanguage)];
        recordAuditEvent({ action: 'channel_config_update', outcome: 'success', actorUserId: userId, channelId: actingChannel?.channelId, targetId: targetChannelId, detail: 'ALL' });
        return [botText(tr(userLanguage, `เปิดใช้งานทุกโมดูลสำหรับช่องทาง "${targetChannelId}" แล้ว`, `All modules enabled for channel "${targetChannelId}".`), userLanguage)];
      }

      const requested = listRaw.split(',').map(v => v.trim()).filter(Boolean);
      const invalid = requested.filter(k => !VALID_SERVICE_KEYS.has(k));
      if (!requested.length || invalid.length) {
        return [channelUsageReply(userLanguage, targetChannelId)];
      }

      const result = await setChannelServiceOverride(targetChannelId, requested);
      if (!result.ok) return [botText(tr(userLanguage, 'บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่', 'Failed to save the override. Please try again.'), userLanguage)];
      recordAuditEvent({ action: 'channel_config_update', outcome: 'success', actorUserId: userId, channelId: actingChannel?.channelId, targetId: targetChannelId, detail: requested.join(',') });
      return [botText(tr(userLanguage,
        `อัปเดตโมดูลของช่องทาง "${targetChannelId}" แล้ว: ${requested.join(', ')}`,
        `Updated channel "${targetChannelId}" modules: ${requested.join(', ')}`,
      ), userLanguage)];
    }

    return [channelUsageReply(userLanguage, targetChannelId)];
  },
};

// ADMIN AUDIT ROTATE — manually run the audit-log archive & rotation policy
// (see documents/AUDIT_LOG_POLICY.md). Same job the scheduled
// POST /ops/audit-log/rotate call runs; this just gives an admin a way to
// trigger it from LINE chat without OPS_API_TOKEN/curl access.
const adminAuditRotateHandler: CommandHandler = {
  name: 'admin-audit-rotate',
  match: (u) => u === 'ADMIN AUDIT ROTATE',
  handle: async (ctx) => {
    const { userLanguage, userId, profile } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const result = await runAuditRotationJob(userId);

    if (result.skippedReason === 'no_events_due') {
      return [botText(tr(userLanguage, 'ไม่มีรายการที่ครบกำหนดเก็บถาวร', 'No events are due for archiving yet.'), userLanguage)];
    }
    if (result.skippedReason === 'bigquery_unavailable') {
      return [botText(tr(userLanguage,
        'ยังไม่ได้ตั้งค่า BigQuery สำหรับเก็บถาวร จึงยังไม่ลบข้อมูลใดจาก Firestore',
        'BigQuery archiving isn\'t configured, so nothing was deleted from Firestore.',
      ), userLanguage)];
    }
    if (result.skippedReason === 'archive_disabled') {
      return [botText(tr(userLanguage, 'ปิดใช้งานการหมุนเวียนบันทึกไว้ (AUDIT_ARCHIVE_ENABLED=false)', 'Audit-log rotation is disabled (AUDIT_ARCHIVE_ENABLED=false).'), userLanguage)];
    }
    if (!result.ok) {
      return [botText(tr(userLanguage, `หมุนเวียนบันทึกไม่สำเร็จ: ${result.error}`, `Audit-log rotation failed: ${result.error}`), userLanguage)];
    }

    return [botText(tr(userLanguage,
      `หมุนเวียนบันทึกสำเร็จ: เก็บถาวร ${result.archived} รายการ, ลบ ${result.deleted} รายการ (ก่อน ${result.cutoff})`,
      `Rotation complete: archived ${result.archived}, deleted ${result.deleted} events older than ${result.cutoff}.`,
    ), userLanguage)];
  },
};

export const adminHandlers: CommandHandler[] = [
  adminVerifyHandler,
  adminEnableHandler,
  adminDisableHandler,
  adminAccessHandler,
  adminChannelHandler,
  adminAuditRotateHandler,
];
