import { messagingApi } from '@line/bot-sdk';
import { isGroupBuyCommand, isGroupBuyEnabledForUser } from '../services/feature-flags';
import { handleGroupBuyCommand } from '../services/group-buy';
import { recordGroupBuyGate } from '../services/kpi';
import { startOdooUserVerification, verifyOdooUserByOtp } from '../services/user-verification';
import {
  parseDemoQuotePayload,
  parseServiceCreatePayload,
  parseServiceUpdatePayload,
  parseUserCreatePayload,
  parseUserUpdatePayload,
} from './command-validators';
import { buildCommandKeywordGuidance, buildStepByStepGuide, isGuideCommand } from './command-guide';
import { setUserLanguage, setUserOdooPartner, setUserRole, UserLanguage, UserProfile } from '../services/firestore';
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

export type CommandReplyContext = {
  text: string;
  userId: string;
  userLanguage: UserLanguage;
  profile: UserProfile;
  agentName: string;
  baseUrl: string;
};

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);
const text = (value: string): messagingApi.Message => ({ type: 'text', text: value });

const buildOptionsMessage = (language: UserLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} options\n\nCore:\n- OPTIONS | FEATURES | JOURNEY\n- RUN DEMO JOURNEY\n- NAME\n\nOdoo Commerce:\n- DEMO ODOO\n- DEMO PRODUCT <name>\n- DEMO QUOTE <product>,<qty>,<customer>,<phone>\n- DEMO ORDER <reference>\n- DEMO REPORT\n\nUser CRUD (admin):\n- USER CREATE <name>,<phone>,<email?>\n- USER READ <phone>\n- USER UPDATE <phone>,<name?>,<newPhone?>,<email?>\n- USER DELETE <phone>\n\nService CRUD (admin):\n- SERVICE LIST\n- SERVICE CREATE <name>,<code>,<price>\n- SERVICE READ <code_or_name>\n- SERVICE UPDATE <code_or_name>,<name?>,<price?>,<newCode?>\n- SERVICE DELETE <code_or_name>\n\nAdmin:\n- ADMIN VERIFY\n- ADMIN ENABLE\n- DEMO SEED ODOO\n\nLanguage:\n- LANG EN | LANG TH`;
  }

  return `${agentName} เมนูคำสั่ง\n\nหลัก:\n- OPTIONS | FEATURES | JOURNEY\n- RUN DEMO JOURNEY\n- NAME\n\nOdoo Commerce:\n- DEMO ODOO\n- DEMO PRODUCT <ชื่อสินค้า>\n- DEMO QUOTE <สินค้า>,<จำนวน>,<ชื่อลูกค้า>,<เบอร์โทร>\n- DEMO ORDER <เลขอ้างอิง>\n- DEMO REPORT\n\nCRUD ผู้ใช้ (แอดมิน):\n- USER CREATE <ชื่อ>,<เบอร์>,<อีเมล?>\n- USER READ <เบอร์>\n- USER UPDATE <เบอร์>,<ชื่อใหม่?>,<เบอร์ใหม่?>,<อีเมล?>\n- USER DELETE <เบอร์>\n\nCRUD บริการ Odoo (แอดมิน):\n- SERVICE LIST\n- SERVICE CREATE <ชื่อ>,<รหัส>,<ราคา>\n- SERVICE READ <รหัสหรือชื่อ>\n- SERVICE UPDATE <รหัสหรือชื่อ>,<ชื่อใหม่?>,<ราคาใหม่?>,<รหัสใหม่?>\n- SERVICE DELETE <รหัสหรือชื่อ>\n\nแอดมิน:\n- ADMIN VERIFY\n- ADMIN ENABLE\n- DEMO SEED ODOO\n\nภาษา:\n- LANG EN | LANG TH`;
};

const buildFeaturesMessage = (language: UserLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} features\n1) Real-time Odoo product lookup\n2) Quotation creation from LINE chat\n3) Order status tracking from Odoo\n4) Daily report from real Odoo sales/inventory\n5) Thai/English language switching\n6) Named assistant identity for presentation demos`;
  }

  return `${agentName} ความสามารถหลัก\n1) ค้นหาสินค้าจาก Odoo แบบเรียลไทม์\n2) สร้างใบเสนอราคาจาก LINE chat\n3) เช็กสถานะออเดอร์จาก Odoo\n4) รายงานประจำวันจากยอดขาย/สต็อกจริงใน Odoo\n5) สลับภาษา ไทย/อังกฤษ\n6) กำหนดชื่อผู้ช่วยสำหรับงานเดโมได้`;
};

const buildJourneyMessage = (language: UserLanguage, agentName: string): string => {
  if (language === 'en') {
    return `${agentName} end-to-end demo journey\nStep 1: ADMIN VERIFY\nStep 2: ADMIN ENABLE\nStep 3: DEMO SEED ODOO\nStep 4: USER CREATE Somchai,0812345678,somchai@example.com\nStep 5: DEMO PRODUCT App\nStep 6: DEMO QUOTE App Premium Plan,1,Somchai,0812345678\nStep 7: DEMO ORDER <reference>\nStep 8: DEMO REPORT\nStep 9: USER UPDATE 0812345678,Somchai CEO,0812345678,somchai.ceo@example.com\nStep 10: USER DELETE 0812345678`;
  }

  return `${agentName} เส้นทางเดโมครบวงจร\nขั้นที่ 1: ADMIN VERIFY\nขั้นที่ 2: ADMIN ENABLE\nขั้นที่ 3: DEMO SEED ODOO\nขั้นที่ 4: USER CREATE สมชาย,0812345678,somchai@example.com\nขั้นที่ 5: DEMO PRODUCT App\nขั้นที่ 6: DEMO QUOTE App Premium Plan,1,สมชาย,0812345678\nขั้นที่ 7: DEMO ORDER <เลขอ้างอิง>\nขั้นที่ 8: DEMO REPORT\nขั้นที่ 9: USER UPDATE 0812345678,สมชาย ซีอีโอ,0812345678,somchai.ceo@example.com\nขั้นที่ 10: USER DELETE 0812345678`;
};

const adminOnlyReply = (language: UserLanguage): messagingApi.Message =>
  text(tr(language, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.'));

/**
 * Single source of truth for LINE command routing. Shared by the real LINE
 * webhook (src/line/webhook.ts) and the signature-free /webhook-test harness
 * (src/index.ts) so the two surfaces cannot drift out of sync with each other.
 */
export const resolveCommandReply = async (ctx: CommandReplyContext): Promise<messagingApi.Message[]> => {
  const { profile, agentName } = ctx;
  const userLanguage = ctx.userLanguage;
  const trimmed = ctx.text.trim();
  const upperText = trimmed.toUpperCase();

  if (upperText.startsWith('VERIFY START')) {
    const phone = trimmed.replace(/^VERIFY START\s*/i, '').trim();
    const message = await startOdooUserVerification({
      userId: ctx.userId,
      rawPhone: phone,
      language: userLanguage,
      agentName,
      fallbackBaseUrl: ctx.baseUrl,
    });
    return [text(message)];
  }

  if (upperText.startsWith('VERIFY OTP')) {
    const otpCode = trimmed.replace(/^VERIFY OTP\s*/i, '').trim();
    const message = await verifyOdooUserByOtp({ userId: ctx.userId, otpCode, language: userLanguage, agentName });
    return [text(message)];
  }

  if (upperText === 'VERIFY STATUS') {
    return [text(tr(
      userLanguage,
      profile.odooVerified
        ? `${agentName} บัญชี Odoo ของคุณยืนยันแล้ว${profile.odooVerifiedAt ? ` เมื่อ ${profile.odooVerifiedAt}` : ''}`
        : `${agentName} บัญชี Odoo ของคุณยังไม่ยืนยัน\nเริ่มด้วย: VERIFY START <เบอร์โทร>`,
      profile.odooVerified
        ? `${agentName} your Odoo account is verified${profile.odooVerifiedAt ? ` at ${profile.odooVerifiedAt}` : ''}`
        : `${agentName} your Odoo account is not verified yet\nStart with: VERIFY START <phone>`
    ))];
  }

  if (isGroupBuyCommand(trimmed)) {
    const gate = isGroupBuyEnabledForUser(ctx.userId);
    recordGroupBuyGate(gate.enabled, gate.reason);
    if (!gate.enabled) {
      return [text(tr(userLanguage, `${agentName} ฟีเจอร์ Group-Buy ยังไม่เปิดใช้งานสำหรับบัญชีนี้`, `${agentName} Group-Buy is not enabled for this account yet.`))];
    }

    const message = await handleGroupBuyCommand({
      text: trimmed,
      userId: ctx.userId,
      userLanguage,
      isAdmin: profile.role === 'admin',
      agentName,
    });
    return [text(message)];
  }

  if (upperText === 'LANG TH' || upperText === 'THAI' || upperText === 'ภาษาไทย') {
    const result = await setUserLanguage(ctx.userId, 'th');
    if (!result.ok) {
      return [text(tr(userLanguage, 'บันทึกภาษาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'Unable to save language preference right now. Please try again.'))];
    }
    return [text(`${agentName} เปลี่ยนภาษาเป็นไทยแล้วค่ะ`)];
  }

  if (upperText === 'LANG EN' || upperText === 'ENGLISH') {
    const result = await setUserLanguage(ctx.userId, 'en');
    if (!result.ok) {
      return [text(tr(userLanguage, 'บันทึกภาษาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'Unable to save language preference right now. Please try again.'))];
    }
    return [text(`${agentName} switched language to English.`)];
  }

  if (upperText === 'ADMIN VERIFY') {
    try {
      const result = await verifyOdooAdminAccess();
      return [text(tr(userLanguage, `ผลตรวจสิทธิ์แอดมิน: ${result.message}`, `Admin verification: ${result.message}`))];
    } catch (_err) {
      return [text(tr(userLanguage, 'ตรวจสิทธิ์แอดมินล้มเหลว', 'Admin verification failed.'))];
    }
  }

  if (upperText === 'ADMIN ENABLE') {
    const result = await verifyOdooAdminAccess();
    if (!result.ok) {
      return [text(tr(userLanguage, `เปิดสิทธิ์แอดมินไม่ได้: ${result.message}`, `Cannot enable admin: ${result.message}`))];
    }

    const roleResult = await setUserRole(ctx.userId, 'admin');
    if (!roleResult.ok) {
      return [text(tr(userLanguage, 'เปิดสิทธิ์แอดมินไม่สำเร็จจากระบบข้อมูล กรุณาลองอีกครั้ง', 'Admin enable failed due to data-store issue. Please try again.'))];
    }
    return [text(tr(userLanguage, 'เปิดสิทธิ์แอดมินแล้ว สามารถใช้คำสั่งแอดมินได้', 'Admin role enabled. You can now run admin commands.'))];
  }

  if (upperText === 'NAME' || upperText === 'BOT NAME' || upperText === 'WHAT IS YOUR NAME' || upperText === 'ชื่ออะไร') {
    return [text(tr(userLanguage, `ฉันชื่อ ${agentName} ค่ะ`, `My name is ${agentName}.`))];
  }

  if (upperText === 'เริ่มต้น' || upperText === 'START' || upperText === 'HELP' || upperText === 'OPTIONS' || upperText === 'MENU') {
    return [text(buildOptionsMessage(userLanguage, agentName))];
  }

  if (upperText === 'FEATURES' || upperText === 'ฟีเจอร์') {
    return [text(buildFeaturesMessage(userLanguage, agentName))];
  }

  if (upperText === 'JOURNEY' || upperText === 'DEMO JOURNEY') {
    return [text(buildJourneyMessage(userLanguage, agentName))];
  }

  if (isGuideCommand(trimmed)) {
    return [text(buildStepByStepGuide(userLanguage, agentName))];
  }

  if (upperText === 'RUN DEMO JOURNEY') {
    const odooStatus = await pingOdoo();
    const seedStatus = await seedOdooSampleSalesData();
    const intro = tr(userLanguage, `${agentName} เตรียมสภาพแวดล้อมเดโมให้แล้วค่ะ`, `${agentName} prepared your demo environment.`);
    return [text(`${intro}\n\n${tr(userLanguage, 'สถานะ Odoo:', 'Odoo:')} ${odooStatus}\n${tr(userLanguage, 'ผลการสร้างข้อมูลตัวอย่าง:', 'Seed:')} ${seedStatus}\n\n${buildJourneyMessage(userLanguage, agentName)}`)];
  }

  if (upperText.startsWith('USER CREATE')) {
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const payload = trimmed.replace(/^USER CREATE\s*/i, '').trim();
    const parsed = parseUserCreatePayload(payload);
    if (!parsed) {
      return [text(tr(userLanguage, 'วิธีใช้: USER CREATE <ชื่อ>,<เบอร์>,<อีเมล?>', 'Usage: USER CREATE <name>,<phone>,<email?>'))];
    }

    const { name, phone, email } = parsed;
    const partner = await createPartnerFromLine(name, phone, email);
    if (!partner) {
      return [text(tr(userLanguage, 'สร้างผู้ใช้ใน Odoo ไม่สำเร็จ', 'Failed to create user in Odoo.'))];
    }

    const partnerResult = await setUserOdooPartner(ctx.userId, partner.id, partner.name, partner.phone);
    if (!partnerResult.ok) {
      return [text(tr(userLanguage, 'สร้างผู้ใช้ใน Odoo สำเร็จ แต่บันทึกสถานะผู้ใช้ในระบบไม่สำเร็จ กรุณาลองใหม่', 'Created Odoo user, but failed to persist user state. Please try again.'))];
    }
    return [text(tr(userLanguage, `สร้างผู้ใช้ Odoo สำเร็จ\n- ID: ${partner.id}\n- ชื่อ: ${partner.name}\n- เบอร์: ${partner.phone || '-'}`, `Odoo user created\n- ID: ${partner.id}\n- Name: ${partner.name}\n- Phone: ${partner.phone || '-'}`))];
  }

  if (upperText.startsWith('USER READ')) {
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const phone = trimmed.replace(/^USER READ\s*/i, '').trim();
    if (!phone) {
      return [text(tr(userLanguage, 'วิธีใช้: USER READ <เบอร์>', 'Usage: USER READ <phone>'))];
    }

    const partner = await getPartnerByPhone(phone);
    if (!partner) {
      return [text(tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`))];
    }

    return [text(tr(userLanguage, `ข้อมูลผู้ใช้ Odoo\n- ID: ${partner.id}\n- ชื่อ: ${partner.name}\n- เบอร์: ${partner.phone || '-'}\n- อีเมล: ${partner.email || '-'}`, `Odoo user profile\n- ID: ${partner.id}\n- Name: ${partner.name}\n- Phone: ${partner.phone || '-'}\n- Email: ${partner.email || '-'}`))];
  }

  if (upperText.startsWith('USER UPDATE')) {
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const payload = trimmed.replace(/^USER UPDATE\s*/i, '').trim();
    const parsed = parseUserUpdatePayload(payload);
    if (!parsed) {
      return [text(tr(userLanguage, 'วิธีใช้: USER UPDATE <เบอร์>,<ชื่อใหม่?>,<เบอร์ใหม่?>,<อีเมล?>', 'Usage: USER UPDATE <phone>,<name?>,<newPhone?>,<email?>'))];
    }

    const { phone, name, newPhone, email } = parsed;
    const existing = await getPartnerByPhone(phone);
    if (!existing) {
      return [text(tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`))];
    }

    const updated = await updatePartnerFromLine(existing.id, name, newPhone, email);
    if (!updated) {
      return [text(tr(userLanguage, 'อัปเดตผู้ใช้ Odoo ไม่สำเร็จ', 'Failed to update Odoo user.'))];
    }

    return [text(tr(userLanguage, `อัปเดตผู้ใช้ Odoo สำเร็จ\n- ID: ${updated.id}\n- ชื่อ: ${updated.name}\n- เบอร์: ${updated.phone || '-'}\n- อีเมล: ${updated.email || '-'}`, `Odoo user updated\n- ID: ${updated.id}\n- Name: ${updated.name}\n- Phone: ${updated.phone || '-'}\n- Email: ${updated.email || '-'}`))];
  }

  if (upperText.startsWith('USER DELETE')) {
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const phone = trimmed.replace(/^USER DELETE\s*/i, '').trim();
    if (!phone) {
      return [text(tr(userLanguage, 'วิธีใช้: USER DELETE <เบอร์>', 'Usage: USER DELETE <phone>'))];
    }

    const existing = await getPartnerByPhone(phone);
    if (!existing) {
      return [text(tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`))];
    }

    const ok = await deletePartnerFromLine(existing.id);
    return [text(ok
      ? tr(userLanguage, `ลบผู้ใช้ Odoo สำเร็จ (ID ${existing.id})`, `Odoo user deleted (ID ${existing.id})`)
      : tr(userLanguage, 'ลบผู้ใช้ Odoo ไม่สำเร็จ', 'Failed to delete Odoo user.'))];
  }

  if (upperText === 'SERVICE LIST') {
    const services = await listServiceCatalogItems(10);
    if (!services.length) {
      return [text(tr(userLanguage, 'ยังไม่มีบริการใน Odoo', 'No service catalog items found in Odoo.'))];
    }

    return [text(tr(
      userLanguage,
      `รายการบริการ Odoo\n${services.map(s => `- ${s.default_code || '-'} | ${s.name} | ${s.list_price} บาท`).join('\n')}`,
      `Odoo service catalog\n${services.map(s => `- ${s.default_code || '-'} | ${s.name} | ${s.list_price} THB`).join('\n')}`
    ))];
  }

  if (upperText.startsWith('SERVICE READ')) {
    const identifier = trimmed.replace(/^SERVICE READ\s*/i, '').trim();
    if (!identifier) {
      return [text(tr(userLanguage, 'วิธีใช้: SERVICE READ <รหัสหรือชื่อ>', 'Usage: SERVICE READ <code_or_name>'))];
    }

    const item = await getServiceByIdentifier(identifier);
    if (!item) {
      return [text(tr(userLanguage, `ไม่พบบริการ ${identifier}`, `Service ${identifier} not found.`))];
    }

    return [text(tr(userLanguage, `บริการ Odoo\n- ID: ${item.id}\n- รหัส: ${item.default_code || '-'}\n- ชื่อ: ${item.name}\n- ราคา: ${item.list_price} บาท`, `Odoo service\n- ID: ${item.id}\n- Code: ${item.default_code || '-'}\n- Name: ${item.name}\n- Price: ${item.list_price} THB`))];
  }

  if (upperText.startsWith('SERVICE CREATE')) {
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const payload = trimmed.replace(/^SERVICE CREATE\s*/i, '').trim();
    const parsed = parseServiceCreatePayload(payload);
    if (!parsed) {
      return [text(tr(userLanguage, 'วิธีใช้: SERVICE CREATE <ชื่อ>,<รหัส>,<ราคา>', 'Usage: SERVICE CREATE <name>,<code>,<price>'))];
    }

    const { name, code, price } = parsed;
    const created = await createServiceCatalogItem(name, code, price);
    if (!created) {
      return [text(tr(userLanguage, 'สร้างบริการ Odoo ไม่สำเร็จ', 'Failed to create Odoo service item.'))];
    }

    return [text(tr(userLanguage, `สร้างบริการสำเร็จ\n- รหัส: ${created.default_code || '-'}\n- ชื่อ: ${created.name}\n- ราคา: ${created.list_price} บาท`, `Service created\n- Code: ${created.default_code || '-'}\n- Name: ${created.name}\n- Price: ${created.list_price} THB`))];
  }

  if (upperText.startsWith('SERVICE UPDATE')) {
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const payload = trimmed.replace(/^SERVICE UPDATE\s*/i, '').trim();
    const parsed = parseServiceUpdatePayload(payload);
    if (!parsed) {
      return [text(tr(userLanguage, 'วิธีใช้: SERVICE UPDATE <รหัสหรือชื่อ>,<ชื่อใหม่?>,<ราคาใหม่?>,<รหัสใหม่?>', 'Usage: SERVICE UPDATE <code_or_name>,<name?>,<price?>,<newCode?>'))];
    }

    const { identifier, name, price, newCode } = parsed;
    const updated = await updateServiceCatalogItem(identifier, { name, price, code: newCode });
    if (!updated) {
      return [text(tr(userLanguage, 'อัปเดตบริการ Odoo ไม่สำเร็จ', 'Failed to update Odoo service item.'))];
    }

    return [text(tr(userLanguage, `อัปเดตบริการสำเร็จ\n- รหัส: ${updated.default_code || '-'}\n- ชื่อ: ${updated.name}\n- ราคา: ${updated.list_price} บาท`, `Service updated\n- Code: ${updated.default_code || '-'}\n- Name: ${updated.name}\n- Price: ${updated.list_price} THB`))];
  }

  if (upperText.startsWith('SERVICE DELETE')) {
    if (profile.role !== 'admin') return [adminOnlyReply(userLanguage)];

    const identifier = trimmed.replace(/^SERVICE DELETE\s*/i, '').trim();
    if (!identifier) {
      return [text(tr(userLanguage, 'วิธีใช้: SERVICE DELETE <รหัสหรือชื่อ>', 'Usage: SERVICE DELETE <code_or_name>'))];
    }

    const ok = await deleteServiceCatalogItem(identifier);
    return [text(ok
      ? tr(userLanguage, `ลบบริการ ${identifier} สำเร็จ`, `Deleted service ${identifier}`)
      : tr(userLanguage, `ลบบริการ ${identifier} ไม่สำเร็จ`, `Failed to delete service ${identifier}`))];
  }

  if (upperText === 'DEMO SEED ODOO') {
    if (profile.role !== 'admin') {
      return [text(tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น กรุณาใช้ ADMIN VERIFY และ ADMIN ENABLE ก่อน', 'This command is admin-only. Run ADMIN VERIFY and ADMIN ENABLE first.'))];
    }

    const status = await seedOdooSampleSalesData();
    return [text(status)];
  }

  if (upperText === 'DEMO REPORT') {
    import('../jobs/daily-report')
      .then(({ runDailyReport }) => runDailyReport(userLanguage))
      .catch(err => console.error('Demo report error:', err));

    return [text(tr(userLanguage, 'กำลังสร้างรายงานจากข้อมูล Odoo และจะส่งไปยังแอดมินทันทีค่ะ', 'Generating report from Odoo data and sending it to admin now.'))];
  }

  if (upperText === 'DEMO SEGMENT') {
    const { runSegmentationJob } = await import('../jobs/segmentation');
    await runSegmentationJob();
    return [text(tr(userLanguage, 'จัดกลุ่มลูกค้าเสร็จแล้ว พร้อมส่งข้อความตามเซกเมนต์เรียบร้อยค่ะ', 'Segmentation complete. Targeted segment messages have been dispatched.'))];
  }

  if (upperText === 'DEMO ODOO') {
    try {
      const status = await pingOdoo();
      return [text(tr(userLanguage, `สถานะ Odoo: ${status}`, `Odoo status: ${status}`))];
    } catch (err) {
      console.error('Odoo ping error:', err);
      return [text(tr(userLanguage, 'ตรวจสอบ Odoo ไม่สำเร็จ กรุณาตรวจค่า ODOO_* และ API key', 'Odoo check failed. Please verify ODOO_* values and API key.'))];
    }
  }

  if (upperText === 'DEMO PRODUCT' || upperText.startsWith('DEMO PRODUCT ')) {
    const query = trimmed.replace(/^DEMO PRODUCT\s*/i, '').trim();
    if (!query) {
      return [text(tr(userLanguage, 'วิธีใช้: DEMO PRODUCT <ชื่อสินค้า>', 'Usage: DEMO PRODUCT <product_name>'))];
    }
    const product = await findProductByQuery(query);
    if (!product) {
      return [text(tr(userLanguage, `ไม่พบสินค้าใน Odoo สำหรับ "${query}"`, `No product found in Odoo for "${query}"`))];
    }
    return [text(tr(userLanguage, `สินค้า Odoo\n- ชื่อ: ${product.name}\n- ราคา: ${product.list_price} บาท\n- คงเหลือ: ${product.qty_available}`, `Odoo Product\n- Name: ${product.name}\n- Price: ${product.list_price} THB\n- Stock: ${product.qty_available}`))];
  }

  if (upperText === 'DEMO ORDER' || upperText.startsWith('DEMO ORDER ')) {
    const orderRef = trimmed.replace(/^DEMO ORDER\s*/i, '').trim();
    if (!orderRef) {
      return [text(tr(userLanguage, 'วิธีใช้: DEMO ORDER <เลขออเดอร์>', 'Usage: DEMO ORDER <order_reference>'))];
    }
    const order = await findOrderByReference(orderRef);
    if (!order) {
      return [text(tr(userLanguage, `ไม่พบออเดอร์ Odoo เลขที่ ${orderRef}`, `No Odoo order found for ${orderRef}`))];
    }
    return [text(tr(userLanguage, `สถานะออเดอร์ Odoo\n- เลขที่: ${order.name}\n- สถานะ: ${order.state}\n- ยอดรวม: ${order.amount_total} บาท`, `Odoo Order Status\n- Reference: ${order.name}\n- State: ${order.state}\n- Total: ${order.amount_total} THB`))];
  }

  if (upperText === 'DEMO QUOTE' || upperText.startsWith('DEMO QUOTE ')) {
    const payload = trimmed.replace(/^DEMO QUOTE\s*/i, '').trim();
    const parsed = parseDemoQuotePayload(payload);
    if (!parsed) {
      return [text(tr(userLanguage, 'วิธีใช้: DEMO QUOTE <สินค้า>,<จำนวน>,<ชื่อลูกค้า>,<เบอร์โทร>', 'Usage: DEMO QUOTE <product>,<qty>,<customer>,<phone>'))];
    }

    const { productName, qty, customerName, phone } = parsed;
    const quotation = await createQuotationFromLine(customerName, phone, productName, qty);
    if (!quotation) {
      return [text(tr(userLanguage, 'สร้างใบเสนอราคา Odoo ไม่สำเร็จ กรุณาตรวจชื่อสินค้าและการตั้งค่า Odoo', 'Failed to create Odoo quotation. Please check product name and Odoo configuration.'))];
    }

    return [text(tr(userLanguage, `สร้างใบเสนอราคาใน Odoo เรียบร้อย\n- เลขที่: ${quotation.orderName}\n- ยอดรวม: ${quotation.total} บาท`, `Odoo quotation created successfully\n- Reference: ${quotation.orderName}\n- Total: ${quotation.total} THB`))];
  }

  const guidance = buildCommandKeywordGuidance(trimmed, userLanguage, agentName);
  if (guidance) {
    return [text(guidance)];
  }

  return processChatMessage(ctx.userId, trimmed, userLanguage);
};
