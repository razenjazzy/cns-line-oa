"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const page_1 = require("./demo/page");
const command_guide_1 = require("./line/command-guide");
const webhook_1 = require("./line/webhook");
const daily_report_1 = require("./jobs/daily-report");
const odoo_1 = require("./services/odoo");
const demo_1 = require("./services/demo");
const chat_1 = require("./services/chat");
const firestore_1 = require("./services/firestore");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';
const isWebhookTestEnabled = !isProduction || /^(1|true|yes|on)$/i.test(process.env.ENABLE_WEBHOOK_TEST || '');
const webhookTestToken = process.env.WEBHOOK_TEST_TOKEN?.trim() || '';
const tr = (language, th, en) => language === 'en' ? en : th;
const parseCsv = (raw) => raw.split(',').map(v => v.trim());
app.get('/healthz', (_req, res) => {
    res.status(200).json({
        ok: true,
        service: 'cns-line-oa',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
    });
});
app.get('/readyz', (_req, res) => {
    res.status(200).json({
        ready: true,
        uptimeSeconds: Number(process.uptime().toFixed(0)),
        timestamp: new Date().toISOString(),
    });
});
// LINE Webhook endpoint
app.post('/webhook', webhook_1.handleWebhook);
// Trigger daily report manually
app.post('/jobs/daily-report', express_1.default.json(), async (req, res) => {
    try {
        await (0, daily_report_1.runDailyReport)();
        res.status(200).send('Daily report triggered successfully');
    }
    catch (error) {
        console.error('Error triggering daily report:', error);
        res.status(500).send('Failed to trigger daily report');
    }
});
// Trigger segmentation job manually
app.post('/jobs/segmentation', express_1.default.json(), async (req, res) => {
    try {
        const { runSegmentationJob } = await Promise.resolve().then(() => __importStar(require('./jobs/segmentation')));
        await runSegmentationJob();
        res.status(200).send('Segmentation job triggered successfully');
    }
    catch (error) {
        console.error('Error triggering segmentation job:', error);
        res.status(500).send('Failed to trigger segmentation job');
    }
});
app.get('/demo', (_req, res) => {
    res.type('html').send((0, page_1.buildDemoPage)());
});
app.get('/demo/connections', async (req, res) => {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const overview = await (0, demo_1.getDemoOverview)(baseUrl);
        res.json(overview);
    }
    catch (error) {
        console.error('Error loading demo connections:', error);
        res.status(500).json({ error: String(error) });
    }
});
app.post('/demo/journey', express_1.default.json(), async (req, res) => {
    try {
        const result = await (0, demo_1.runDemoJourney)(req.body || {});
        res.status(result.ok ? 200 : 400).json(result);
    }
    catch (error) {
        console.error('Error running demo journey:', error);
        res.status(500).json({ error: String(error) });
    }
});
// Seed Odoo sample data manually
app.post('/jobs/seed-odoo', express_1.default.json(), async (req, res) => {
    try {
        const status = await (0, odoo_1.seedOdooSampleSalesData)();
        res.status(200).send(status);
    }
    catch (error) {
        console.error('Error seeding Odoo sample data:', error);
        res.status(500).send('Failed to seed Odoo sample data');
    }
});
// Local test endpoint — bypasses LINE signature validation
// Remove this before deploying to production
app.post('/webhook-test', express_1.default.json(), async (req, res) => {
    try {
        if (!isWebhookTestEnabled) {
            return res.status(404).json({
                error: 'webhook-test is disabled in production. Set ENABLE_WEBHOOK_TEST=true to enable it.',
            });
        }
        if (webhookTestToken) {
            const incomingToken = req.get('x-webhook-test-token') || '';
            if (incomingToken !== webhookTestToken) {
                return res.status(401).json({ error: 'Invalid webhook test token' });
            }
        }
        const userId = req.body.userId || 'test_user';
        const text = req.body.text || 'hello';
        console.log(`[TEST] userId=${userId} text="${text}"`);
        const upperText = text.trim().toUpperCase();
        const agentName = process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
        let userLanguage = await (0, firestore_1.getUserLanguage)(userId);
        const profile = await (0, firestore_1.getUserProfile)(userId);
        if (upperText === 'LANG TH' || upperText === 'THAI' || upperText === 'ภาษาไทย') {
            await (0, firestore_1.setUserLanguage)(userId, 'th');
            return res.json([{ type: 'text', text: `${agentName} เปลี่ยนภาษาเป็นไทยแล้วค่ะ` }]);
        }
        if (upperText === 'LANG EN' || upperText === 'ENGLISH') {
            await (0, firestore_1.setUserLanguage)(userId, 'en');
            return res.json([{ type: 'text', text: `${agentName} switched language to English.` }]);
        }
        if (upperText === 'เริ่มต้น' || upperText === 'START' || upperText === 'HELP' || upperText === 'OPTIONS' || upperText === 'MENU') {
            return res.json([{ type: 'text', text: tr(userLanguage, `${agentName} เมนูคำสั่ง\n\n- FEATURES\n- JOURNEY\n- RUN DEMO JOURNEY\n- DEMO ODOO\n- DEMO SEED ODOO\n- DEMO PRODUCT <ชื่อสินค้า>\n- DEMO QUOTE <สินค้า>,<จำนวน>,<ชื่อลูกค้า>,<เบอร์โทร>\n- DEMO ORDER <เลขอ้างอิง>\n- DEMO REPORT\n- USER CREATE <ชื่อ>,<เบอร์>,<อีเมล?>\n- USER READ <เบอร์>\n- USER UPDATE <เบอร์>,<ชื่อใหม่?>,<เบอร์ใหม่?>,<อีเมล?>\n- USER DELETE <เบอร์>\n- SERVICE LIST\n- SERVICE CREATE <ชื่อ>,<รหัส>,<ราคา>\n- SERVICE READ <รหัสหรือชื่อ>\n- SERVICE UPDATE <รหัสหรือชื่อ>,<ชื่อใหม่?>,<ราคาใหม่?>,<รหัสใหม่?>\n- SERVICE DELETE <รหัสหรือชื่อ>\n- ADMIN VERIFY\n- ADMIN ENABLE\n- LANG EN / LANG TH\n- NAME`, `${agentName} command menu\n\n- FEATURES\n- JOURNEY\n- RUN DEMO JOURNEY\n- DEMO ODOO\n- DEMO SEED ODOO\n- DEMO PRODUCT <product_name>\n- DEMO QUOTE <product>,<qty>,<customer>,<phone>\n- DEMO ORDER <reference>\n- DEMO REPORT\n- USER CREATE <name>,<phone>,<email?>\n- USER READ <phone>\n- USER UPDATE <phone>,<name?>,<newPhone?>,<email?>\n- USER DELETE <phone>\n- SERVICE LIST\n- SERVICE CREATE <name>,<code>,<price>\n- SERVICE READ <code_or_name>\n- SERVICE UPDATE <code_or_name>,<name?>,<price?>,<newCode?>\n- SERVICE DELETE <code_or_name>\n- ADMIN VERIFY\n- ADMIN ENABLE\n- LANG EN / LANG TH\n- NAME`) }]);
        }
        if (upperText === 'FEATURES') {
            return res.json([{ type: 'text', text: tr(userLanguage, `${agentName} ความสามารถหลัก\n1) ค้นหาสินค้าจาก Odoo\n2) สร้างใบเสนอราคาใน Odoo\n3) เช็กสถานะออเดอร์\n4) รายงานยอดขายจาก Odoo\n5) สลับภาษาไทย/อังกฤษ\n6) โหมดเดโมครบวงจร`, `${agentName} features\n1) Odoo product lookup\n2) Odoo quotation creation\n3) Odoo order tracking\n4) Daily report from Odoo\n5) Thai/English switching\n6) Full demo journey`) }]);
        }
        if (upperText === 'JOURNEY' || upperText === 'DEMO JOURNEY') {
            return res.json([{ type: 'text', text: tr(userLanguage, `${agentName} เส้นทางเดโมครบวงจร\n1) DEMO ODOO\n2) DEMO SEED ODOO\n3) DEMO PRODUCT App\n4) DEMO QUOTE App Premium Plan,1,สมชาย,0812345678\n5) DEMO ORDER <เลขที่จากข้อ 4>\n6) DEMO REPORT`, `${agentName} end-to-end journey\n1) DEMO ODOO\n2) DEMO SEED ODOO\n3) DEMO PRODUCT App\n4) DEMO QUOTE App Premium Plan,1,Somchai,0812345678\n5) DEMO ORDER <reference from step 4>\n6) DEMO REPORT`) }]);
        }
        if ((0, command_guide_1.isGuideCommand)(text)) {
            return res.json([{ type: 'text', text: (0, command_guide_1.buildStepByStepGuide)(userLanguage, agentName) }]);
        }
        if (upperText === 'RUN DEMO JOURNEY') {
            const status = await (0, odoo_1.pingOdoo)();
            const seed = await (0, odoo_1.seedOdooSampleSalesData)();
            return res.json([{ type: 'text', text: tr(userLanguage, `${agentName} เตรียมเดโมแล้ว\nสถานะ Odoo: ${status}\nผลการสร้างข้อมูลตัวอย่าง: ${seed}`, `${agentName} prepared the demo\nOdoo status: ${status}\nSeed result: ${seed}`) }]);
        }
        if (upperText === 'ADMIN VERIFY') {
            const result = await (0, odoo_1.verifyOdooAdminAccess)();
            return res.json([{ type: 'text', text: tr(userLanguage, `ผลตรวจสิทธิ์แอดมิน: ${result.message}`, `Admin verification: ${result.message}`) }]);
        }
        if (upperText === 'ADMIN ENABLE') {
            const result = await (0, odoo_1.verifyOdooAdminAccess)();
            if (!result.ok) {
                return res.json([{ type: 'text', text: tr(userLanguage, `เปิดสิทธิ์แอดมินไม่ได้: ${result.message}`, `Cannot enable admin: ${result.message}`) }]);
            }
            await (0, firestore_1.setUserRole)(userId, 'admin');
            return res.json([{ type: 'text', text: tr(userLanguage, 'เปิดสิทธิ์แอดมินแล้ว สามารถใช้คำสั่งแอดมินได้', 'Admin role enabled. You can now run admin commands.') }]);
        }
        if (upperText === 'NAME' || upperText === 'BOT NAME' || upperText === 'WHAT IS YOUR NAME' || upperText === 'ชื่ออะไร') {
            return res.json([{ type: 'text', text: tr(userLanguage, `ฉันชื่อ ${agentName} ค่ะ`, `My name is ${agentName}.`) }]);
        }
        if (upperText === 'DEMO SEED ODOO') {
            if (profile.role !== 'admin') {
                return res.json([{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น กรุณาใช้ ADMIN VERIFY และ ADMIN ENABLE ก่อน', 'This command is admin-only. Run ADMIN VERIFY and ADMIN ENABLE first.') }]);
            }
            const status = await (0, odoo_1.seedOdooSampleSalesData)();
            return res.json([{ type: 'text', text: status }]);
        }
        if (upperText.startsWith('USER CREATE')) {
            const payload = text.replace(/^USER CREATE\s*/i, '').trim();
            const [name, phone, email] = parseCsv(payload);
            if (!name || !phone) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: USER CREATE <ชื่อ>,<เบอร์>,<อีเมล?>', 'Usage: USER CREATE <name>,<phone>,<email?>') }]);
            }
            const partner = await (0, odoo_1.createPartnerFromLine)(name, phone, email);
            if (!partner) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'สร้างผู้ใช้ใน Odoo ไม่สำเร็จ', 'Failed to create user in Odoo.') }]);
            }
            await (0, firestore_1.setUserOdooPartner)(userId, partner.id, partner.name, partner.phone);
            return res.json([{ type: 'text', text: tr(userLanguage, `สร้างผู้ใช้ Odoo สำเร็จ\n- ID: ${partner.id}\n- ชื่อ: ${partner.name}\n- เบอร์: ${partner.phone || '-'}`, `Odoo user created\n- ID: ${partner.id}\n- Name: ${partner.name}\n- Phone: ${partner.phone || '-'}`) }]);
        }
        if (upperText.startsWith('USER READ')) {
            const phone = text.replace(/^USER READ\s*/i, '').trim();
            if (!phone) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: USER READ <เบอร์>', 'Usage: USER READ <phone>') }]);
            }
            const partner = await (0, odoo_1.getPartnerByPhone)(phone);
            if (!partner) {
                return res.json([{ type: 'text', text: tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`) }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `ข้อมูลผู้ใช้ Odoo\n- ID: ${partner.id}\n- ชื่อ: ${partner.name}\n- เบอร์: ${partner.phone || '-'}\n- อีเมล: ${partner.email || '-'}`, `Odoo user profile\n- ID: ${partner.id}\n- Name: ${partner.name}\n- Phone: ${partner.phone || '-'}\n- Email: ${partner.email || '-'}`) }]);
        }
        if (upperText.startsWith('USER UPDATE')) {
            const payload = text.replace(/^USER UPDATE\s*/i, '').trim();
            const [phone, name, newPhone, email] = parseCsv(payload);
            if (!phone) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: USER UPDATE <เบอร์>,<ชื่อใหม่?>,<เบอร์ใหม่?>,<อีเมล?>', 'Usage: USER UPDATE <phone>,<name?>,<newPhone?>,<email?>') }]);
            }
            const existing = await (0, odoo_1.getPartnerByPhone)(phone);
            if (!existing) {
                return res.json([{ type: 'text', text: tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`) }]);
            }
            const updated = await (0, odoo_1.updatePartnerFromLine)(existing.id, name, newPhone, email);
            if (!updated) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'อัปเดตผู้ใช้ Odoo ไม่สำเร็จ', 'Failed to update Odoo user.') }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `อัปเดตผู้ใช้ Odoo สำเร็จ\n- ID: ${updated.id}\n- ชื่อ: ${updated.name}\n- เบอร์: ${updated.phone || '-'}\n- อีเมล: ${updated.email || '-'}`, `Odoo user updated\n- ID: ${updated.id}\n- Name: ${updated.name}\n- Phone: ${updated.phone || '-'}\n- Email: ${updated.email || '-'}`) }]);
        }
        if (upperText.startsWith('USER DELETE')) {
            if (profile.role !== 'admin') {
                return res.json([{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.') }]);
            }
            const phone = text.replace(/^USER DELETE\s*/i, '').trim();
            if (!phone) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: USER DELETE <เบอร์>', 'Usage: USER DELETE <phone>') }]);
            }
            const existing = await (0, odoo_1.getPartnerByPhone)(phone);
            if (!existing) {
                return res.json([{ type: 'text', text: tr(userLanguage, `ไม่พบผู้ใช้ Odoo ที่เบอร์ ${phone}`, `No Odoo user found with phone ${phone}`) }]);
            }
            const ok = await (0, odoo_1.deletePartnerFromLine)(existing.id);
            return res.json([{ type: 'text', text: ok ? tr(userLanguage, `ลบผู้ใช้ Odoo สำเร็จ (ID ${existing.id})`, `Odoo user deleted (ID ${existing.id})`) : tr(userLanguage, 'ลบผู้ใช้ Odoo ไม่สำเร็จ', 'Failed to delete Odoo user.') }]);
        }
        if (upperText === 'SERVICE LIST') {
            const services = await (0, odoo_1.listServiceCatalogItems)(10);
            if (!services.length) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'ยังไม่มีบริการใน Odoo', 'No service catalog items found in Odoo.') }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `รายการบริการ Odoo\n${services.map(s => `- ${s.default_code || '-'} | ${s.name} | ${s.list_price} บาท`).join('\n')}`, `Odoo service catalog\n${services.map(s => `- ${s.default_code || '-'} | ${s.name} | ${s.list_price} THB`).join('\n')}`) }]);
        }
        if (upperText.startsWith('SERVICE READ')) {
            const identifier = text.replace(/^SERVICE READ\s*/i, '').trim();
            if (!identifier) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: SERVICE READ <รหัสหรือชื่อ>', 'Usage: SERVICE READ <code_or_name>') }]);
            }
            const item = await (0, odoo_1.getServiceByIdentifier)(identifier);
            if (!item) {
                return res.json([{ type: 'text', text: tr(userLanguage, `ไม่พบบริการ ${identifier}`, `Service ${identifier} not found.`) }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `บริการ Odoo\n- ID: ${item.id}\n- รหัส: ${item.default_code || '-'}\n- ชื่อ: ${item.name}\n- ราคา: ${item.list_price} บาท`, `Odoo service\n- ID: ${item.id}\n- Code: ${item.default_code || '-'}\n- Name: ${item.name}\n- Price: ${item.list_price} THB`) }]);
        }
        if (upperText.startsWith('SERVICE CREATE')) {
            if (profile.role !== 'admin') {
                return res.json([{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.') }]);
            }
            const payload = text.replace(/^SERVICE CREATE\s*/i, '').trim();
            const [name, code, priceRaw] = parseCsv(payload);
            const price = Number(priceRaw || '0');
            if (!name || !code || Number.isNaN(price) || price <= 0) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: SERVICE CREATE <ชื่อ>,<รหัส>,<ราคา>', 'Usage: SERVICE CREATE <name>,<code>,<price>') }]);
            }
            const created = await (0, odoo_1.createServiceCatalogItem)(name, code, price);
            if (!created) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'สร้างบริการ Odoo ไม่สำเร็จ', 'Failed to create Odoo service item.') }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `สร้างบริการสำเร็จ\n- รหัส: ${created.default_code || '-'}\n- ชื่อ: ${created.name}\n- ราคา: ${created.list_price} บาท`, `Service created\n- Code: ${created.default_code || '-'}\n- Name: ${created.name}\n- Price: ${created.list_price} THB`) }]);
        }
        if (upperText.startsWith('SERVICE UPDATE')) {
            if (profile.role !== 'admin') {
                return res.json([{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.') }]);
            }
            const payload = text.replace(/^SERVICE UPDATE\s*/i, '').trim();
            const [identifier, name, priceRaw, newCode] = parseCsv(payload);
            const parsedPrice = priceRaw ? Number(priceRaw) : undefined;
            if (!identifier) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: SERVICE UPDATE <รหัสหรือชื่อ>,<ชื่อใหม่?>,<ราคาใหม่?>,<รหัสใหม่?>', 'Usage: SERVICE UPDATE <code_or_name>,<name?>,<price?>,<newCode?>') }]);
            }
            const updated = await (0, odoo_1.updateServiceCatalogItem)(identifier, { name: name || undefined, price: parsedPrice, code: newCode || undefined });
            if (!updated) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'อัปเดตบริการ Odoo ไม่สำเร็จ', 'Failed to update Odoo service item.') }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `อัปเดตบริการสำเร็จ\n- รหัส: ${updated.default_code || '-'}\n- ชื่อ: ${updated.name}\n- ราคา: ${updated.list_price} บาท`, `Service updated\n- Code: ${updated.default_code || '-'}\n- Name: ${updated.name}\n- Price: ${updated.list_price} THB`) }]);
        }
        if (upperText.startsWith('SERVICE DELETE')) {
            if (profile.role !== 'admin') {
                return res.json([{ type: 'text', text: tr(userLanguage, 'คำสั่งนี้สำหรับแอดมินเท่านั้น', 'This command is admin-only.') }]);
            }
            const identifier = text.replace(/^SERVICE DELETE\s*/i, '').trim();
            if (!identifier) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: SERVICE DELETE <รหัสหรือชื่อ>', 'Usage: SERVICE DELETE <code_or_name>') }]);
            }
            const ok = await (0, odoo_1.deleteServiceCatalogItem)(identifier);
            return res.json([{ type: 'text', text: ok ? tr(userLanguage, `ลบบริการ ${identifier} สำเร็จ`, `Deleted service ${identifier}`) : tr(userLanguage, `ลบบริการ ${identifier} ไม่สำเร็จ`, `Failed to delete service ${identifier}`) }]);
        }
        if (upperText === 'DEMO ODOO') {
            const status = await (0, odoo_1.pingOdoo)();
            return res.json([{ type: 'text', text: tr(userLanguage, `สถานะ Odoo: ${status}`, `Odoo status: ${status}`) }]);
        }
        if (upperText === 'DEMO REPORT') {
            (0, daily_report_1.runDailyReport)(userLanguage).catch(error => {
                console.error('Demo report error:', error);
            });
            return res.json([{ type: 'text', text: tr(userLanguage, 'กำลังสร้างรายงานจากข้อมูล Odoo และจะส่งไปยังแอดมินทันทีค่ะ', 'Generating report from Odoo data and sending it to admin now.') }]);
        }
        if (upperText === 'DEMO PRODUCT' || upperText.startsWith('DEMO PRODUCT ')) {
            const query = text.replace(/^DEMO PRODUCT\s*/i, '').trim();
            if (!query) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: DEMO PRODUCT <ชื่อสินค้า>', 'Usage: DEMO PRODUCT <product_name>') }]);
            }
            const product = await (0, odoo_1.findProductByQuery)(query);
            if (!product) {
                return res.json([{ type: 'text', text: tr(userLanguage, `ไม่พบสินค้าใน Odoo สำหรับ "${query}"`, `No product found in Odoo for "${query}"`) }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `สินค้า Odoo\n- ชื่อ: ${product.name}\n- ราคา: ${product.list_price} บาท\n- คงเหลือ: ${product.qty_available}`, `Odoo Product\n- Name: ${product.name}\n- Price: ${product.list_price} THB\n- Stock: ${product.qty_available}`) }]);
        }
        if (upperText === 'DEMO ORDER' || upperText.startsWith('DEMO ORDER ')) {
            const orderRef = text.replace(/^DEMO ORDER\s*/i, '').trim();
            if (!orderRef) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: DEMO ORDER <เลขออเดอร์>', 'Usage: DEMO ORDER <order_reference>') }]);
            }
            const order = await (0, odoo_1.findOrderByReference)(orderRef);
            if (!order) {
                return res.json([{ type: 'text', text: tr(userLanguage, `ไม่พบออเดอร์ Odoo เลขที่ ${orderRef}`, `No Odoo order found for ${orderRef}`) }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `สถานะออเดอร์ Odoo\n- เลขที่: ${order.name}\n- สถานะ: ${order.state}\n- ยอดรวม: ${order.amount_total} บาท`, `Odoo Order Status\n- Reference: ${order.name}\n- State: ${order.state}\n- Total: ${order.amount_total} THB`) }]);
        }
        if (upperText === 'DEMO QUOTE' || upperText.startsWith('DEMO QUOTE ')) {
            const payload = text.replace(/^DEMO QUOTE\s*/i, '').trim();
            const [productName, qtyRaw, customerName, phone] = payload.split(',').map(v => v?.trim() || '');
            const qty = Number(qtyRaw || '1');
            if (!productName || !customerName || !phone || Number.isNaN(qty) || qty <= 0) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'วิธีใช้: DEMO QUOTE <สินค้า>,<จำนวน>,<ชื่อลูกค้า>,<เบอร์โทร>', 'Usage: DEMO QUOTE <product>,<qty>,<customer>,<phone>') }]);
            }
            const quotation = await (0, odoo_1.createQuotationFromLine)(customerName, phone, productName, qty);
            if (!quotation) {
                return res.json([{ type: 'text', text: tr(userLanguage, 'สร้างใบเสนอราคา Odoo ไม่สำเร็จ กรุณาตรวจชื่อสินค้าและการตั้งค่า Odoo', 'Failed to create Odoo quotation. Please check product name and Odoo configuration.') }]);
            }
            return res.json([{ type: 'text', text: tr(userLanguage, `สร้างใบเสนอราคาใน Odoo เรียบร้อย\n- เลขที่: ${quotation.orderName}\n- ยอดรวม: ${quotation.total} บาท`, `Odoo quotation created successfully\n- Reference: ${quotation.orderName}\n- Total: ${quotation.total} THB`) }]);
        }
        const guidance = (0, command_guide_1.buildCommandKeywordGuidance)(text, userLanguage, agentName);
        if (guidance) {
            return res.json([{ type: 'text', text: guidance }]);
        }
        userLanguage = await (0, firestore_1.getUserLanguage)(userId);
        const botMessages = await (0, chat_1.processChatMessage)(userId, text, userLanguage);
        return res.json(botMessages);
    }
    catch (error) {
        console.error('Error in webhook-test:', error);
        res.status(500).json({ error: String(error) });
    }
});
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
