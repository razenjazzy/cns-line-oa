import type { CommandHandler } from './index';
import {
  createProductCardFlexMessage,
  createOrderSummaryFlexMessage,
  createBotTextFlexMessage,
  formatMoney,
} from '../templates';
import { parseDemoQuotePayload } from '../command-validators';
import {
  createQuotationFromLine,
  findOrderByReference,
  findProductByQuery,
  pingOdoo,
  seedOdooSampleSalesData,
} from '../../services/odoo';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const inferTone = (value: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = value.toLowerCase();
  if (/failed|ไม่สำเร็จ|ไม่พบ/.test(lower)) return 'error';
  if (/success|สำเร็จ/.test(lower)) return 'success';
  return 'info';
};

const botText = (value: string, language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: inferTone(value),
  });

// DEMO PRODUCT [query] — lookup product in Odoo; no query → guided form
const demoProductHandler: CommandHandler = {
  name: 'commerce-demo-product',
  match: (u) => u === 'DEMO PRODUCT' || u.startsWith('DEMO PRODUCT '),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const query = text.trim().replace(/^DEMO PRODUCT\s*/i, '').trim();
    if (!query) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM DEMO PRODUCT' });
    }
    const product = await findProductByQuery(query);
    if (!product) {
      return [botText(tr(userLanguage, `ไม่พบสินค้าที่ตรงกับ "${query}" ลองใช้ชื่อสินค้าอื่นดูนะคะ`, `No product matched "${query}". Try a different product name?`), userLanguage)];
    }
    return [createProductCardFlexMessage(product.name, product.list_price, product.qty_available)];
  },
};

// DEMO ORDER [ref] — check order status; no ref → guided form
const demoOrderHandler: CommandHandler = {
  name: 'commerce-demo-order',
  match: (u) => u === 'DEMO ORDER' || u.startsWith('DEMO ORDER '),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const orderRef = text.trim().replace(/^DEMO ORDER\s*/i, '').trim();
    if (!orderRef) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM DEMO ORDER' });
    }
    const order = await findOrderByReference(orderRef);
    if (!order) {
      return [botText(tr(userLanguage, `ไม่พบออเดอร์เลขที่ ${orderRef} กรุณาตรวจสอบเลขที่อ้างอิงอีกครั้งค่ะ`, `We couldn't find an order with reference ${orderRef}. Please double-check the reference number.`), userLanguage)];
    }
    return [botText(tr(
      userLanguage,
      `สถานะออเดอร์\n- เลขที่: ${order.name}\n- สถานะ: ${order.state}\n- ยอดรวม: ${formatMoney(order.amount_total, 'th')}`,
      `Order status\n- Reference: ${order.name}\n- Status: ${order.state}\n- Total: ${formatMoney(order.amount_total, 'en')}`,
    ), userLanguage)];
  },
};

// DEMO QUOTE [product,qty,customer,phone] — create Odoo quotation; no payload → guided form
const demoQuoteHandler: CommandHandler = {
  name: 'commerce-demo-quote',
  match: (u) => u === 'DEMO QUOTE' || u.startsWith('DEMO QUOTE '),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const payload = text.trim().replace(/^DEMO QUOTE\s*/i, '').trim();
    const parsed = parseDemoQuotePayload(payload);
    if (!parsed) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM DEMO QUOTE' });
    }

    const { productName, qty, customerName, phone } = parsed;

    // createQuotationFromLine collapses every failure (no product match, a
    // genuine Odoo error, anything) into a single null, so a real error was
    // indistinguishable from a simple typo in the product name — both showed
    // the same "check product name" message. Check the product separately
    // first so the two cases get a message that actually points at the
    // right fix.
    const product = await findProductByQuery(productName);
    if (!product) {
      return [botText(tr(userLanguage,
        `ไม่พบสินค้าที่ตรงกับ "${productName}" ลองพิมพ์ DEMO PRODUCT ${productName} เพื่อตรวจสอบชื่อที่ถูกต้องก่อนนะคะ`,
        `No product matched "${productName}". Try DEMO PRODUCT ${productName} first to check the exact name in the catalog.`,
      ), userLanguage)];
    }

    const quotation = await createQuotationFromLine(customerName, phone, productName, qty);
    if (!quotation) {
      // Product genuinely exists, so this is a real failure (partner
      // creation, sale.order create, etc.) — logged server-side by
      // createQuotationFromLine itself; tell the user it's not their input.
      return [botText(tr(userLanguage,
        'พบสินค้าแล้ว แต่สร้างใบเสนอราคาไม่สำเร็จเนื่องจากข้อผิดพลาดของระบบ กรุณาลองใหม่ หรือแจ้งแอดมินหากยังไม่สำเร็จ',
        "Found the product, but couldn't create the quote due to a system error. Please try again, or contact an admin if it keeps happening.",
      ), userLanguage)];
    }
    return [createOrderSummaryFlexMessage(quotation.total)];
  },
};

// DEMO ODOO — ping Odoo connectivity
const demoOdooHandler: CommandHandler = {
  name: 'commerce-demo-odoo',
  match: (u) => u === 'DEMO ODOO',
  handle: async (ctx) => {
    const { userLanguage } = ctx;
    try {
      const status = await pingOdoo();
      return [botText(tr(userLanguage, `สถานะ Odoo: ${status}`, `Odoo status: ${status}`), userLanguage)];
    } catch (err) {
      console.error('Odoo ping error:', err);
      return [botText(tr(userLanguage,
        'ตรวจสอบ Odoo ไม่สำเร็จ กรุณาตรวจค่า ODOO_* และ API key',
        'Odoo check failed. Please verify ODOO_* values and API key.',
      ), userLanguage)];
    }
  },
};

// DEMO SEED ODOO — seed sample data (admin only)
const demoSeedHandler: CommandHandler = {
  name: 'commerce-demo-seed',
  match: (u) => u === 'DEMO SEED ODOO',
  handle: async (ctx) => {
    const { userLanguage, profile } = ctx;
    if (profile.role !== 'admin') {
      return [botText(tr(userLanguage,
        'คำสั่งนี้สำหรับแอดมินเท่านั้น กรุณาใช้ ADMIN VERIFY และ ADMIN ENABLE ก่อน',
        'This command is admin-only. Run ADMIN VERIFY and ADMIN ENABLE first.',
      ), userLanguage)];
    }
    const status = await seedOdooSampleSalesData();
    return [botText(status, userLanguage)];
  },
};

// DEMO REPORT — trigger daily report (async, non-blocking)
const demoReportHandler: CommandHandler = {
  name: 'commerce-demo-report',
  match: (u) => u === 'DEMO REPORT',
  handle: async (ctx) => {
    const { userLanguage } = ctx;
    import('../../jobs/daily-report')
      .then(({ runDailyReport }) => runDailyReport(userLanguage))
      .catch(err => console.error('Demo report error:', err));
    return [botText(tr(userLanguage,
      'กำลังสร้างรายงานจากข้อมูล Odoo และจะส่งไปยังแอดมินทันทีค่ะ',
      'Generating report from Odoo data and sending it to admin now.',
    ), userLanguage)];
  },
};

// DEMO SEGMENT — trigger segmentation job
const demoSegmentHandler: CommandHandler = {
  name: 'commerce-demo-segment',
  match: (u) => u === 'DEMO SEGMENT',
  handle: async (ctx) => {
    const { userLanguage } = ctx;
    const { runSegmentationJob } = await import('../../jobs/segmentation');
    await runSegmentationJob();
    return [botText(tr(userLanguage,
      'จัดกลุ่มลูกค้าเสร็จแล้ว พร้อมส่งข้อความตามเซกเมนต์เรียบร้อยค่ะ',
      'Segmentation complete. Targeted segment messages have been dispatched.',
    ), userLanguage)];
  },
};

export const commerceHandlers: CommandHandler[] = [
  demoProductHandler,
  demoOrderHandler,
  demoQuoteHandler,
  demoOdooHandler,
  demoSeedHandler,
  demoReportHandler,
  demoSegmentHandler,
];
