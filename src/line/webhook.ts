import { middleware, messagingApi, webhook } from '@line/bot-sdk';
import express from 'express';
import { classifyIntent } from '../services/vertexai';
import { buildCommandKeywordGuidance, buildStepByStepGuide, isGuideCommand } from './command-guide';
import { getEscalationState, getUserLanguage, getUserProfile, setUserLanguage, setUserOdooPartner, setUserRole, updateUserScore } from '../services/firestore';
import { processChatMessage } from '../services/chat';
import {
  createPartnerFromLine,
  createServiceCatalogItem,
  createQuotationFromLine,
  deletePartnerFromLine,
  deleteServiceCatalogItem,
  findOrderByReference,
  findProductByQuery,
  getPartnerByPhone,
  getServiceByIdentifier,
  listServiceCatalogItems,
  pingOdoo,
  seedOdooSampleSalesData,
  updatePartnerFromLine,
  updateServiceCatalogItem,
  verifyOdooAdminAccess,
} from '../services/odoo';

// Lazy config: read env vars at request time (after dotenv.config() has run)
const getConfig = () => ({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
});

const getClient = () => {
  const config = getConfig();
  if (!config.channelAccessToken) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: config.channelAccessToken });
};

const getAgentName = (): string => process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
const isAiOff = (): boolean => /^(1|true|yes|on)$/i.test(process.env.AI_OFF || '');

type UiLanguage = 'th' | 'en';

const tr = (language: UiLanguage, th: string, en: string): string => language === 'en' ? en : th;

const buildOptionsMessage = (language: UiLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} options\n\nCore:\n- OPTIONS | FEATURES | JOURNEY\n- RUN DEMO JOURNEY\n- NAME\n\nOdoo Commerce:\n- DEMO ODOO\n- DEMO PRODUCT <name>\n- DEMO QUOTE <product>,<qty>,<customer>,<phone>\n- DEMO ORDER <reference>\n- DEMO REPORT\n\nUser CRUD:\n- USER CREATE <name>,<phone>,<email?>\n- USER READ <phone>\n- USER UPDATE <phone>,<name?>,<newPhone?>,<email?>\n- USER DELETE <phone>\n\nService CRUD:\n- SERVICE LIST\n- SERVICE CREATE <name>,<code>,<price>\n- SERVICE READ <code_or_name>\n- SERVICE UPDATE <code_or_name>,<name?>,<price?>,<newCode?>\n- SERVICE DELETE <code_or_name>\n\nAdmin:\n- ADMIN VERIFY\n- ADMIN ENABLE\n- DEMO SEED ODOO\n\nLanguage:\n- LANG EN | LANG TH`;
  }

  return `${agentName} เมนูคำสั่ง\n\nหลัก:\n- OPTIONS | FEATURES | JOURNEY\n- RUN DEMO JOURNEY\n- NAME\n\nOdoo Commerce:\n- DEMO ODOO\n- DEMO PRODUCT <ชื่อสินค้า>\n- DEMO QUOTE <สินค้า>,<จำนวน>,<ชื่อลูกค้า>,<เบอร์โทร>\n- DEMO ORDER <เลขอ้างอิง>\n- DEMO REPORT\n\nCRUD ผู้ใช้:\n- USER CREATE <ชื่อ>,<เบอร์>,<อีเมล?>\n- USER READ <เบอร์>\n- USER UPDATE <เบอร์>,<ชื่อใหม่?>,<เบอร์ใหม่?>,<อีเมล?>\n- USER DELETE <เบอร์>\n\nCRUD บริการ Odoo:\n- SERVICE LIST\n- SERVICE CREATE <ชื่อ>,<รหัส>,<ราคา>\n- SERVICE READ <รหัสหรือชื่อ>\n- SERVICE UPDATE <รหัสหรือชื่อ>,<ชื่อใหม่?>,<ราคาใหม่?>,<รหัสใหม่?>\n- SERVICE DELETE <รหัสหรือชื่อ>\n\nแอดมิน:\n- ADMIN VERIFY\n- ADMIN ENABLE\n- DEMO SEED ODOO\n\nภาษา:\n- LANG EN | LANG TH`;
};

const buildFeaturesMessage = (language: UiLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} features\n1) Real-time Odoo product lookup\n2) Quotation creation from LINE chat\n3) Order status tracking from Odoo\n4) Daily report from real Odoo sales/inventory\n5) Thai/English language switching\n6) Named assistant identity for presentation demos`;
  }

  return `${agentName} ความสามารถหลัก\n1) ค้นหาสินค้าจาก Odoo แบบเรียลไทม์\n2) สร้างใบเสนอราคาจาก LINE chat\n3) เช็กสถานะออเดอร์จาก Odoo\n4) รายงานประจำวันจากยอดขาย/สต็อกจริงใน Odoo\n5) สลับภาษา ไทย/อังกฤษ\n6) กำหนดชื่อผู้ช่วยสำหรับงานเดโมได้`;
};

const buildJourneyMessage = (language: UiLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} end-to-end demo journey\nStep 1: ADMIN VERIFY\nStep 2: ADMIN ENABLE\nStep 3: DEMO SEED ODOO\nStep 4: USER CREATE Somchai,0812345678,somchai@example.com\nStep 5: DEMO PRODUCT App\nStep 6: DEMO QUOTE App Premium Plan,1,Somchai,0812345678\nStep 7: DEMO ORDER <reference>\nStep 8: DEMO REPORT\nStep 9: USER UPDATE 0812345678,Somchai CEO,0812345678,somchai.ceo@example.com\nStep 10: USER DELETE 0812345678`;
  }

  return `${agentName} เส้นทางเดโมครบวงจร\nขั้นที่ 1: ADMIN VERIFY\nขั้นที่ 2: ADMIN ENABLE\nขั้นที่ 3: DEMO SEED ODOO\nขั้นที่ 4: USER CREATE สมชาย,0812345678,somchai@example.com\nขั้นที่ 5: DEMO PRODUCT App\nขั้นที่ 6: DEMO QUOTE App Premium Plan,1,สมชาย,0812345678\nขั้นที่ 7: DEMO ORDER <เลขอ้างอิง>\nขั้นที่ 8: DEMO REPORT\nขั้นที่ 9: USER UPDATE 0812345678,สมชาย ซีอีโอ,0812345678,somchai.ceo@example.com\nขั้นที่ 10: USER DELETE 0812345678`;
};

const parseCsv = (raw: string): string[] => raw.split(',').map(v => v.trim());

export const handleWebhook = [
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const config = getConfig();
    if (!config.channelAccessToken || !config.channelSecret) {
      console.warn('LINE credentials not configured. Webhook disabled.');
      return res.status(200).send('Webhook disabled due to missing config');
    }
    next();
  },
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
      middleware(getConfig())(req, res, next);
  },
  async (req: express.Request, res: express.Response) => {
    const client = getClient();
    if (!client) return res.status(500).end();
    
    try {
      const events: webhook.Event[] = req.body.events;
      const results = await Promise.all(
        events.map(async (event) => {
          if (event.type !== 'message' || event.message.type !== 'text') {
            return null;
          }
          const textMessage = event.message as { type: 'text', text: string };
          const replyToken = (event as any).replyToken as string;
          const source = (event as any).source as { userId?: string; groupId?: string; roomId?: string; type?: string };
          
          if (!replyToken) return null;

          const conversationId = source?.userId || source?.groupId || source?.roomId;
          if (!conversationId) {
            console.warn('Webhook event missing source identity; skipping event.');
            return null;
          }

          const userLanguage = await getUserLanguage(conversationId);
          const profile = await getUserProfile(conversationId);

          // Log user ID to help find ADMIN_USER_ID for .env
          console.log(`📩 Message from source=${source?.type || 'unknown'}:${conversationId} | text: "${textMessage.text}"`);
          // Asynchronously score the user based on intent without blocking the reply
            if (!isAiOff()) {
            classifyIntent(textMessage.text).then((classification) => {
              updateUserScore(conversationId, classification.intent).catch(err => {
                console.error('Failed to update user score:', err);
              });
            }).catch(err => console.error('Intent classification failed:', err));
            }

          // Check escalation state
          const isEscalated = await getEscalationState(conversationId);
          if (isEscalated) {
              return client!.replyMessage({
                  replyToken,
                messages: [{ type: 'text', text: tr(userLanguage, `ตอนนี้คุณกำลังคุยกับแอดมินแล้วค่ะ - ${getAgentName()}`, `You are currently connected with a human agent - ${getAgentName()}`) }]
              });
          }

          // ── WORKSHOP DEMO TRIGGERS ──────────────────────────────
          const upperText = textMessage.text.trim().toUpperCase();
          const agentName = getAgentName();

            if (upperText === 'LANG TH' || upperText === 'THAI' || upperText === 'ภาษาไทย') {
              await setUserLanguage(conversationId, 'th');
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: `${agentName} เปลี่ยนภาษาเป็นไทยแล้วค่ะ` }]
              });
            }

            if (upperText === 'LANG EN' || upperText === 'ENGLISH') {
              await setUserLanguage(conversationId, 'en');
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: `${agentName} switched language to English.` }]
              });
            }

            if (upperText === 'ADMIN VERIFY') {
              try {
                const result = await verifyOdooAdminAccess();
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, `ผลตรวจสิทธิ์แอดมิน: ${result.message}`, `Admin verification: ${result.message}`) }]
                });
              } catch (err) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'ตรวจสิทธิ์แอดมินล้มเหลว', 'Admin verification failed.') }]
                });
              }
            }

            if (upperText === 'ADMIN ENABLE') {
              const result = await verifyOdooAdminAccess();
              if (!result.ok) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, `เปิดสิทธิ์แอดมินไม่ได้: ${result.message}`, `Cannot enable admin: ${result.message}`) }]
                });
              }

              await setUserRole(conversationId, 'admin');
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: tr(userLanguage, 'เปิดสิทธิ์แอดมินแล้ว สามารถใช้คำสั่งแอดมินได้', 'Admin role enabled. You can now run admin commands.') }]
              });
            }

            if (upperText === 'NAME' || upperText === 'BOT NAME' || upperText === 'WHAT IS YOUR NAME' || upperText === 'ชื่ออะไร') {
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: userLanguage === 'en' ? `My name is ${agentName}.` : `ฉันชื่อ ${agentName} ค่ะ` }]
              });
            }

            if (upperText === 'เริ่มต้น' || upperText === 'START' || upperText === 'HELP' || upperText === 'OPTIONS' || upperText === 'MENU') {
              return client!.replyMessage({
                replyToken,
                messages: [{
                  type: 'text',
                  text: buildOptionsMessage(userLanguage, agentName)
                }]
              });
            }

            if (upperText === 'FEATURES' || upperText === 'ฟีเจอร์') {
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: buildFeaturesMessage(userLanguage, agentName) }]
              });
            }

            if (upperText === 'JOURNEY' || upperText === 'DEMO JOURNEY') {
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: buildJourneyMessage(userLanguage, agentName) }]
              });
            }

            if (isGuideCommand(textMessage.text)) {
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: buildStepByStepGuide(userLanguage, agentName) }]
              });
            }

            if (upperText === 'RUN DEMO JOURNEY') {
              const odooStatus = await pingOdoo();
              const seedStatus = await seedOdooSampleSalesData();
              const intro = userLanguage === 'en'
                ? `${agentName} prepared your demo environment.`
                : `${agentName} เตรียมสภาพแวดล้อมเดโมให้แล้วค่ะ`;

              return client!.replyMessage({
                replyToken,
                messages: [{
                  type: 'text',
                  text: `${intro}\n\n${userLanguage === 'en' ? 'Odoo:' : 'สถานะ Odoo:'} ${odooStatus}\n${userLanguage === 'en' ? 'Seed:' : 'ผลการสร้างข้อมูลตัวอย่าง:'} ${seedStatus}\n\n${buildJourneyMessage(userLanguage, agentName)}`
                }]
              });
            }

            if (upperText.startsWith('USER CREATE')) {
              const payload = textMessage.text.replace(/^USER CREATE\s*/i, '').trim();
              const [name, phone, email] = parseCsv(payload);
              if (!name || !phone) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: USER CREATE <ชื่อ>,<เบอร์>,<อีเมล?>', 'Usage: USER CREATE <name>,<phone>,<email?>') }]
                });
              }

              const partner = await createPartnerFromLine(name, phone, email);
              if (!partner) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'สร้างผู้ใช้ใน Odoo ไม่สำเร็จ', 'Failed to create user in Odoo.') }]
                });
              }

              await setUserOdooPartner(conversationId, partner.id, partner.name, partner.phone);
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: tr(userLanguage, `สร้างผู้ใช้ Odoo สำเร็จ\n- ID: ${partner.id}\n- ชื่อ: ${partner.name}\n- เบอร์: ${partner.phone || '-'}`, `Odoo user created\n- ID: ${partner.id}\n- Name: ${partner.name}\n- Phone: ${partner.phone || '-'}`) }]
              });
            }

            if (upperText.startsWith('USER READ')) {
              const phone = textMessage.text.replace(/^USER READ\s*/i, '').trim();
              if (!phone) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: USER READ <เบอร์>', 'Usage: USER READ <phone>') }]
                });
              }

              const partner = await getPartnerByPhone(phone);
              if (!partner) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`) }]
                });
              }

              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: tr(userLanguage, `ข้อมูลผู้ใช้ Odoo\n- ID: ${partner.id}\n- ชื่อ: ${partner.name}\n- เบอร์: ${partner.phone || '-'}\n- อีเมล: ${partner.email || '-'}`, `Odoo user profile\n- ID: ${partner.id}\n- Name: ${partner.name}\n- Phone: ${partner.phone || '-'}\n- Email: ${partner.email || '-'}`) }]
              });
            }

            if (upperText.startsWith('USER UPDATE')) {
              const payload = textMessage.text.replace(/^USER UPDATE\s*/i, '').trim();
              const [phone, name, newPhone, email] = parseCsv(payload);
              if (!phone) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: USER UPDATE <เบอร์>,<ชื่อใหม่?>,<เบอร์ใหม่?>,<อีเมล?>', 'Usage: USER UPDATE <phone>,<name?>,<newPhone?>,<email?>') }]
                });
              }

              const existing = await getPartnerByPhone(phone);
              if (!existing) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`) }]
                });
              }

              const updated = await updatePartnerFromLine(existing.id, name, newPhone, email);
              if (!updated) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'อัปเดตผู้ใช้ Odoo ไม่สำเร็จ', 'Failed to update Odoo user.') }]
                });
              }

              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: tr(userLanguage, `อัปเดตผู้ใช้ Odoo สำเร็จ\n- ID: ${updated.id}\n- ชื่อ: ${updated.name}\n- เบอร์: ${updated.phone || '-'}\n- อีเมล: ${updated.email || '-'}`, `Odoo user updated\n- ID: ${updated.id}\n- Name: ${updated.name}\n- Phone: ${updated.phone || '-'}\n- Email: ${updated.email || '-'}`) }]
              });
            }

            if (upperText.startsWith('USER DELETE')) {
              if (profile.role !== 'admin') {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.') }]
                });
              }

              const phone = textMessage.text.replace(/^USER DELETE\s*/i, '').trim();
              if (!phone) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: USER DELETE <เบอร์>', 'Usage: USER DELETE <phone>') }]
                });
              }

              const existing = await getPartnerByPhone(phone);
              if (!existing) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`) }]
                });
              }

              const ok = await deletePartnerFromLine(existing.id);
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: ok
                  ? tr(userLanguage, `ลบผู้ใช้ Odoo สำเร็จ (ID ${existing.id})`, `Odoo user deleted (ID ${existing.id})`)
                  : tr(userLanguage, 'ลบผู้ใช้ Odoo ไม่สำเร็จ', 'Failed to delete Odoo user.') }]
              });
            }

            if (upperText === 'SERVICE LIST') {
              const services = await listServiceCatalogItems(10);
              if (!services.length) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'ยังไม่มีบริการใน Odoo', 'No service catalog items found in Odoo.') }]
                });
              }

              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: tr(
                  userLanguage,
                  `รายการบริการ Odoo\n${services.map(s => `- ${s.default_code || '-'} | ${s.name} | ${s.list_price} บาท`).join('\n')}`,
                  `Odoo service catalog\n${services.map(s => `- ${s.default_code || '-'} | ${s.name} | ${s.list_price} THB`).join('\n')}`
                ) }]
              });
            }

            if (upperText.startsWith('SERVICE READ')) {
              const identifier = textMessage.text.replace(/^SERVICE READ\s*/i, '').trim();
              if (!identifier) {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: SERVICE READ <รหัสหรือชื่อ>', 'Usage: SERVICE READ <code_or_name>') }] });
              }

              const item = await getServiceByIdentifier(identifier);
              if (!item) {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, `ไม่พบบริการ ${identifier}`, `Service ${identifier} not found.`) }] });
              }

              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: tr(userLanguage, `บริการ Odoo\n- ID: ${item.id}\n- รหัส: ${item.default_code || '-'}\n- ชื่อ: ${item.name}\n- ราคา: ${item.list_price} บาท`, `Odoo service\n- ID: ${item.id}\n- Code: ${item.default_code || '-'}\n- Name: ${item.name}\n- Price: ${item.list_price} THB`) }]
              });
            }

            if (upperText.startsWith('SERVICE CREATE')) {
              if (profile.role !== 'admin') {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.') }] });
              }

              const payload = textMessage.text.replace(/^SERVICE CREATE\s*/i, '').trim();
              const [name, code, priceRaw] = parseCsv(payload);
              const price = Number(priceRaw || '0');
              if (!name || !code || Number.isNaN(price) || price <= 0) {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: SERVICE CREATE <ชื่อ>,<รหัส>,<ราคา>', 'Usage: SERVICE CREATE <name>,<code>,<price>') }] });
              }

              const created = await createServiceCatalogItem(name, code, price);
              if (!created) {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'สร้างบริการ Odoo ไม่สำเร็จ', 'Failed to create Odoo service item.') }] });
              }

              return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, `สร้างบริการสำเร็จ\n- รหัส: ${created.default_code || '-'}\n- ชื่อ: ${created.name}\n- ราคา: ${created.list_price} บาท`, `Service created\n- Code: ${created.default_code || '-'}\n- Name: ${created.name}\n- Price: ${created.list_price} THB`) }] });
            }

            if (upperText.startsWith('SERVICE UPDATE')) {
              if (profile.role !== 'admin') {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.') }] });
              }

              const payload = textMessage.text.replace(/^SERVICE UPDATE\s*/i, '').trim();
              const [identifier, name, priceRaw, newCode] = parseCsv(payload);
              const parsedPrice = priceRaw ? Number(priceRaw) : undefined;

              if (!identifier) {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: SERVICE UPDATE <รหัสหรือชื่อ>,<ชื่อใหม่?>,<ราคาใหม่?>,<รหัสใหม่?>', 'Usage: SERVICE UPDATE <code_or_name>,<name?>,<price?>,<newCode?>') }] });
              }

              const updated = await updateServiceCatalogItem(identifier, { name: name || undefined, price: parsedPrice, code: newCode || undefined });
              if (!updated) {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'อัปเดตบริการ Odoo ไม่สำเร็จ', 'Failed to update Odoo service item.') }] });
              }

              return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, `อัปเดตบริการสำเร็จ\n- รหัส: ${updated.default_code || '-'}\n- ชื่อ: ${updated.name}\n- ราคา: ${updated.list_price} บาท`, `Service updated\n- Code: ${updated.default_code || '-'}\n- Name: ${updated.name}\n- Price: ${updated.list_price} THB`) }] });
            }

            if (upperText.startsWith('SERVICE DELETE')) {
              if (profile.role !== 'admin') {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.') }] });
              }

              const identifier = textMessage.text.replace(/^SERVICE DELETE\s*/i, '').trim();
              if (!identifier) {
                return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: SERVICE DELETE <รหัสหรือชื่อ>', 'Usage: SERVICE DELETE <code_or_name>') }] });
              }

              const ok = await deleteServiceCatalogItem(identifier);
              return client!.replyMessage({ replyToken, messages: [{ type: 'text', text: ok ? tr(userLanguage, `ลบบริการ ${identifier} สำเร็จ`, `Deleted service ${identifier}`) : tr(userLanguage, `ลบบริการ ${identifier} ไม่สำเร็จ`, `Failed to delete service ${identifier}`) }] });
            }

            if (upperText === 'DEMO SEED ODOO') {
              if (profile.role !== 'admin') {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น กรุณาใช้ ADMIN VERIFY และ ADMIN ENABLE ก่อน', 'This command is admin-only. Run ADMIN VERIFY and ADMIN ENABLE first.') }]
                });
              }

              const status = await seedOdooSampleSalesData();
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: status }]
              });
            }

          // Demo 1: Reporting Agent – type "DEMO REPORT" in LINE
          if (upperText === 'DEMO REPORT') {
              import('../jobs/daily-report')
                .then(({ runDailyReport }) => runDailyReport(userLanguage))
              .catch(err => console.error('Demo report error:', err));

              return client!.replyMessage({
                replyToken,
                messages: [{
                type: 'text',
                text: tr(userLanguage, 'กำลังสร้างรายงานจากข้อมูล Odoo และจะส่งไปยังแอดมินทันทีค่ะ', 'Generating report from Odoo data and sending it to admin now.')
                }]
              });
          }

          // Demo 2: Segmentation Job – type "DEMO SEGMENT" in LINE
          if (upperText === 'DEMO SEGMENT') {
              const { runSegmentationJob } = await import('../jobs/segmentation');
              await runSegmentationJob();
              return client!.replyMessage({
                  replyToken,
                messages: [{ type: 'text', text: tr(userLanguage, 'จัดกลุ่มลูกค้าเสร็จแล้ว พร้อมส่งข้อความตามเซกเมนต์เรียบร้อยค่ะ', 'Segmentation complete. Targeted segment messages have been dispatched.') }]
              });
          }

            // Demo 3: Odoo connectivity check – type "DEMO ODOO"
            if (upperText === 'DEMO ODOO') {
              try {
                const status = await pingOdoo();
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, `สถานะ Odoo: ${status}`, `Odoo status: ${status}`) }]
                });
              } catch (err) {
                console.error('Odoo ping error:', err);
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'ตรวจสอบ Odoo ไม่สำเร็จ กรุณาตรวจค่า ODOO_* และ API key', 'Odoo check failed. Please verify ODOO_* values and API key.') }]
                });
              }
            }

            // Demo 4: Product from Odoo – "DEMO PRODUCT <name>"
            if (upperText === 'DEMO PRODUCT' || upperText.startsWith('DEMO PRODUCT ')) {
              const query = textMessage.text.replace(/^DEMO PRODUCT\s*/i, '').trim();
              if (!query) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: DEMO PRODUCT <ชื่อสินค้า>', 'Usage: DEMO PRODUCT <product_name>') }]
                });
              }

              const product = await findProductByQuery(query);
              if (!product) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, `ไม่พบสินค้าใน Odoo สำหรับ "${query}"`, `No product found in Odoo for "${query}"`) }]
                });
              }

              return client!.replyMessage({
                replyToken,
                messages: [{
                  type: 'text',
                  text: tr(
                    userLanguage,
                    `สินค้า Odoo\n- ชื่อ: ${product.name}\n- ราคา: ${product.list_price} บาท\n- คงเหลือ: ${product.qty_available}`,
                    `Odoo Product\n- Name: ${product.name}\n- Price: ${product.list_price} THB\n- Stock: ${product.qty_available}`
                  )
                }]
              });
            }

            // Demo 5: Order status from Odoo – "DEMO ORDER <SO0001>"
            if (upperText === 'DEMO ORDER' || upperText.startsWith('DEMO ORDER ')) {
              const orderRef = textMessage.text.replace(/^DEMO ORDER\s*/i, '').trim();
              if (!orderRef) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: DEMO ORDER <เลขออเดอร์>', 'Usage: DEMO ORDER <order_reference>') }]
                });
              }

              const order = await findOrderByReference(orderRef);
              if (!order) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, `ไม่พบออเดอร์ Odoo เลขที่ ${orderRef}`, `No Odoo order found for ${orderRef}`) }]
                });
              }

              return client!.replyMessage({
                replyToken,
                messages: [{
                  type: 'text',
                  text: tr(
                    userLanguage,
                    `สถานะออเดอร์ Odoo\n- เลขที่: ${order.name}\n- สถานะ: ${order.state}\n- ยอดรวม: ${order.amount_total} บาท`,
                    `Odoo Order Status\n- Reference: ${order.name}\n- State: ${order.state}\n- Total: ${order.amount_total} THB`
                  )
                }]
              });
            }

            // Demo 6: Create quotation in Odoo – "DEMO QUOTE <product>,<qty>,<customer>,<phone>"
            if (upperText === 'DEMO QUOTE' || upperText.startsWith('DEMO QUOTE ')) {
              const payload = textMessage.text.replace(/^DEMO QUOTE\s*/i, '').trim();
              const [productName, qtyRaw, customerName, phone] = payload.split(',').map(v => v?.trim() || '');
              const qty = Number(qtyRaw || '1');

              if (!productName || !customerName || !phone || Number.isNaN(qty) || qty <= 0) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'วิธีใช้: DEMO QUOTE <สินค้า>,<จำนวน>,<ชื่อลูกค้า>,<เบอร์โทร>', 'Usage: DEMO QUOTE <product>,<qty>,<customer>,<phone>') }]
                });
              }

              const quotation = await createQuotationFromLine(customerName, phone, productName, qty);
              if (!quotation) {
                return client!.replyMessage({
                  replyToken,
                  messages: [{ type: 'text', text: tr(userLanguage, 'สร้างใบเสนอราคา Odoo ไม่สำเร็จ กรุณาตรวจชื่อสินค้าและการตั้งค่า Odoo', 'Failed to create Odoo quotation. Please check product name and Odoo configuration.') }]
                });
              }

              return client!.replyMessage({
                replyToken,
                messages: [{
                  type: 'text',
                  text: tr(
                    userLanguage,
                    `สร้างใบเสนอราคาใน Odoo เรียบร้อย\n- เลขที่: ${quotation.orderName}\n- ยอดรวม: ${quotation.total} บาท`,
                    `Odoo quotation created successfully\n- Reference: ${quotation.orderName}\n- Total: ${quotation.total} THB`
                  )
                }]
              });
            }

          const guidance = buildCommandKeywordGuidance(textMessage.text, userLanguage, agentName);
          if (guidance) {
            return client!.replyMessage({
              replyToken,
              messages: [{ type: 'text', text: guidance }]
            });
          }

          // ── NORMAL CHAT COMMERCE AGENT ──────────────────────────
          // Process message with Gemini Chat Engine
          const botMessages = await processChatMessage(conversationId, textMessage.text, userLanguage);

          return client!.replyMessage({
            replyToken: replyToken,
            messages: botMessages
          });
        })
      );
      res.json(results);
    } catch (err) {
      console.error('Error in LINE webhook:', err);
      res.status(500).end();
    }
  },
];
