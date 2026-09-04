import type { CommandHandler } from './index';
import { createBotTextFlexMessage, formatMoney } from '../templates';
import { parseServiceCreatePayload, parseServiceUpdatePayload } from '../command-validators';
import { getErpAdapter } from '../../erp/registry';
import { recordAuditEvent } from '../../services/firestore';
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

// SERVICE LIST — list up to 10 catalog items
const serviceListHandler: CommandHandler = {
  name: 'catalog-list',
  match: (u) => u === 'SERVICE LIST',
  handle: async (ctx) => {
    const { userLanguage } = ctx;
    const services = await getErpAdapter().listServices(10);
    if (!services.length) {
      return [botText(tr(userLanguage, 'ยังไม่มีบริการเปิดให้บริการตอนนี้ค่ะ', 'No services are available yet.'), userLanguage)];
    }
    return [botText(tr(userLanguage,
      `รายการบริการ\n${services.map(s => `- ${s.name} (${s.sku || '-'}) — ${formatMoney(s.price, 'th')}`).join('\n')}`,
      `Our services\n${services.map(s => `- ${s.name} (${s.sku || '-'}) — ${formatMoney(s.price, 'en')}`).join('\n')}`,
    ), userLanguage)];
  },
};

// SERVICE READ [identifier]
const serviceReadHandler: CommandHandler = {
  name: 'catalog-read',
  match: (u) => u.startsWith('SERVICE READ'),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const identifier = text.trim().replace(/^SERVICE READ\s*/i, '').trim();
    if (!identifier) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM SERVICE READ' });
    }
    const item = await getErpAdapter().lookupService(identifier);
    if (!item) {
      return [botText(tr(userLanguage, `ไม่พบบริการ ${identifier}`, `Service ${identifier} not found.`), userLanguage)];
    }
    return [botText(tr(userLanguage,
      `${item.name}\n- รหัส: ${item.sku || '-'}\n- ราคา: ${formatMoney(item.price, 'th')}`,
      `${item.name}\n- Code: ${item.sku || '-'}\n- Price: ${formatMoney(item.price, 'en')}`,
    ), userLanguage)];
  },
};

// SERVICE CREATE <name>,<code>,<price> (admin only)
const serviceCreateHandler: CommandHandler = {
  name: 'catalog-create',
  match: (u) => u.startsWith('SERVICE CREATE'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, requestId, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const payload = text.trim().replace(/^SERVICE CREATE\s*/i, '').trim();
    const parsed = parseServiceCreatePayload(payload);
    if (!parsed) {
      return [botText(tr(userLanguage, 'วิธีใช้: SERVICE CREATE <ชื่อ>,<รหัส>,<ราคา>', 'Usage: SERVICE CREATE <name>,<code>,<price>'), userLanguage)];
    }

    const { name, code, price } = parsed;
    const created = await getErpAdapter().createService(name, code, price);
    if (!created) {
      recordAuditEvent({ action: 'service_create', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, detail: `code=${code}` });
      return [botText(tr(userLanguage, 'สร้างบริการ Odoo ไม่สำเร็จ', 'Failed to create Odoo service item.'), userLanguage)];
    }
    recordAuditEvent({ action: 'service_create', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(created.id) });
    return [botText(tr(userLanguage,
      `สร้างบริการสำเร็จ\n- รหัส: ${created.sku || '-'}\n- ชื่อ: ${created.name}\n- ราคา: ${created.price} บาท`,
      `Service created\n- Code: ${created.sku || '-'}\n- Name: ${created.name}\n- Price: ${created.price} THB`,
    ), userLanguage)];
  },
};

// SERVICE UPDATE <identifier>,<name?>,<price?>,<newCode?> (admin only)
const serviceUpdateHandler: CommandHandler = {
  name: 'catalog-update',
  match: (u) => u.startsWith('SERVICE UPDATE'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, requestId, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const payload = text.trim().replace(/^SERVICE UPDATE\s*/i, '').trim();
    if (!payload) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM SERVICE UPDATE' });
    }
    const parsed = parseServiceUpdatePayload(payload);
    if (!parsed) {
      return [botText(tr(userLanguage,
        'วิธีใช้: SERVICE UPDATE <รหัสหรือชื่อ>,<ชื่อใหม่?>,<ราคาใหม่?>,<รหัสใหม่?>',
        'Usage: SERVICE UPDATE <code_or_name>,<name?>,<price?>,<newCode?>',
      ), userLanguage)];
    }

    const { identifier, name, price, newCode } = parsed;
    const updated = await getErpAdapter().updateService(identifier, { name, price, sku: newCode });
    if (!updated) {
      recordAuditEvent({ action: 'service_update', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: identifier });
      return [botText(tr(userLanguage, 'อัปเดตบริการ Odoo ไม่สำเร็จ', 'Failed to update Odoo service item.'), userLanguage)];
    }
    recordAuditEvent({ action: 'service_update', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: String(updated.id) });
    return [botText(tr(userLanguage,
      `อัปเดตบริการสำเร็จ\n- รหัส: ${updated.sku || '-'}\n- ชื่อ: ${updated.name}\n- ราคา: ${updated.price} บาท`,
      `Service updated\n- Code: ${updated.sku || '-'}\n- Name: ${updated.name}\n- Price: ${updated.price} THB`,
    ), userLanguage)];
  },
};

// SERVICE DELETE <identifier> (admin only)
const serviceDeleteHandler: CommandHandler = {
  name: 'catalog-delete',
  match: (u) => u.startsWith('SERVICE DELETE'),
  handle: async (ctx) => {
    const { userLanguage, userId, profile, channel, requestId, text } = ctx;
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const identifier = text.trim().replace(/^SERVICE DELETE\s*/i, '').trim();
    if (!identifier) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM SERVICE DELETE' });
    }

    const ok = await getErpAdapter().deleteService(identifier);
    recordAuditEvent({ action: 'service_delete', outcome: ok ? 'success' : 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: identifier });
    return [botText(ok
      ? tr(userLanguage, `ลบบริการ ${identifier} สำเร็จ`, `Deleted service ${identifier}`)
      : tr(userLanguage, `ลบบริการ ${identifier} ไม่สำเร็จ`, `Failed to delete service ${identifier}`),
      userLanguage)];
  },
};

export const serviceCatalogHandlers: CommandHandler[] = [
  serviceListHandler,
  serviceReadHandler,
  serviceCreateHandler,
  serviceUpdateHandler,
  serviceDeleteHandler,
];
