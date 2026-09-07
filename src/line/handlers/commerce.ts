import type { CommandHandler } from './index';
import {
  createProductCardFlexMessage,
  createProductPickerFlexMessage,
  createQuotationJourneyFlexMessage,
  createBotTextFlexMessage,
  formatMoney,
} from '../templates';
import { parseDemoQuotePayload } from '../command-validators';
import {
  findPaymentTermByName,
  findProductByQuery,
  getProductById,
  getPartnerByName,
  getPartnerByPhone,
  getSaleOrderById,
  getSaleOrderPortalLink,
  getSaleOrderPdfLink,
  seedOdooSampleSalesData,
} from '../../services/odoo';
import { recordAuditEvent, setLastProductContext } from '../../services/firestore';
import type { UserLanguage } from '../../services/firestore';
import { canManageQuoteLines, isQuoteStaff, quoteJourneyRole } from '../quote-access';
import { getErpAdapter } from '../../erp/registry';
import { getPlatformStatus } from '../../platform/status';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const inferTone = (value: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = value.toLowerCase();
  if (/failed|ไม่สำเร็จ|ไม่พบ/.test(lower)) return 'error';
  if (/success|สำเร็จ/.test(lower)) return 'success';
  return 'info';
};

const botText = (value: string, language: UserLanguage, actions?: { label: string; text: string; style?: 'primary' | 'secondary' }[]) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: inferTone(value),
    actions,
  });

// PRODUCT FIND [query] — lookup product in Odoo; no query → guided form
const demoProductHandler: CommandHandler = {
  name: 'commerce-product-find',
  match: (u) => u === 'PRODUCT FIND' || u.startsWith('PRODUCT FIND '),
  handle: async (ctx) => {
    const { userLanguage, text, userId } = ctx;
    const query = text.trim().replace(/^PRODUCT FIND\s*/i, '').trim();
    if (!query) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM PRODUCT FIND' });
    }
    const products = await getErpAdapter().searchProducts(query, 5);
    if (!products.length) {
      return [botText(tr(userLanguage, `ไม่พบสินค้าที่ตรงกับ "${query}"`, `No product matched "${query}".`), userLanguage, [
        { label: tr(userLanguage, 'ค้นหาอีกครั้ง', 'Search again'), text: 'FORM PRODUCT FIND', style: 'primary' },
      ])];
    }
    if (products.length > 1) {
      return [createProductPickerFlexMessage(products, userLanguage)];
    }
    const product = products[0];
    await setLastProductContext(userId, {
      productId: product.id,
      productName: product.name,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    return [createProductCardFlexMessage(product.name, product.price || 0, product.quantity || 0, userLanguage)];
  },
};

// ORDER STATUS [ref] — check order status; no ref → guided form
const demoOrderHandler: CommandHandler = {
  name: 'commerce-order-status',
  match: (u) => u === 'ORDER STATUS' || u.startsWith('ORDER STATUS '),
  handle: async (ctx) => {
    const { userLanguage, text } = ctx;
    const orderRef = text.trim().replace(/^ORDER STATUS\s*/i, '').trim();
    if (!orderRef) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM ORDER STATUS' });
    }
    const found = await getErpAdapter().getOrderStatus(orderRef);
    if (!found) {
      return [botText(tr(userLanguage, `ไม่พบออเดอร์เลขที่ ${orderRef} กรุณาตรวจสอบเลขที่อ้างอิงอีกครั้งค่ะ`, `We couldn't find an order with reference ${orderRef}. Please double-check the reference number.`), userLanguage)];
    }

    // Re-fetch by id for the full card (line items, invoice status, note) —
    // findOrderByReference only resolves the reference to an id, same as
    // every other "look up then render the rich card" path in this app
    // (quoteStatusHandler etc.) — one consistent card design, not a
    // separate plain-text summary for this one entry point.
    const order = (await getSaleOrderById(found.id)) || {
      id: found.id,
      name: found.name,
      state: found.state,
      amount_total: found.amountTotal || 0,
    };
    const [portalLink, pdfLink] = await Promise.all([
      getSaleOrderPortalLink(order.id).then(v => v || undefined),
      getSaleOrderPdfLink(order.id).then(v => v || undefined),
    ]);
    const role = quoteJourneyRole(ctx.profile);
    return [createQuotationJourneyFlexMessage(order, {
      role,
      salesTier: ctx.profile.salesTier,
      canManageLines: canManageQuoteLines(ctx.profile),
      portalLink,
      pdfLink,
    }, userLanguage)];
  },
};

// QUOTE CREATE [product,qty,customer,phone] — create Odoo quotation; no payload → guided form
const demoQuoteHandler: CommandHandler = {
  name: 'commerce-quote-create',
  match: (u) => u === 'QUOTE CREATE' || (u.startsWith('QUOTE CREATE ') && !u.startsWith('QUOTE CREATE MORE')),
  handle: async (ctx) => {
    const { userLanguage, profile, text, userId, channel, requestId } = ctx;
    const payload = text.trim().replace(/^QUOTE CREATE\s*/i, '').trim();
    const parsed = parseDemoQuotePayload(payload);
    if (!parsed) {
      const { resolveCommandReply } = await import('../command-router');
      return resolveCommandReply({ ...ctx, text: 'FORM QUOTE CREATE' });
    }

    const { productName, qty, customerName, phone, customerReference, discountPercent, validityDate, note, paymentTerm, productId: parsedProductId } = parsed;

    const product = parsedProductId
      ? await getProductById(parsedProductId)
      : await findProductByQuery(productName);
    if (!product) {
      return [botText(tr(userLanguage,
        `ไม่พบสินค้าที่ตรงกับ "${productName}"`,
        `No product matched "${productName}".`,
      ), userLanguage, [
        { label: tr(userLanguage, 'ค้นหาสินค้า', 'Find product'), text: 'FORM PRODUCT FIND', style: 'primary' },
      ])];
    }

    // If an admin is quoting for a phone that's already a real Odoo
    // contact, attach the quote to that exact partner instead of letting
    // createQuotationFromLine's findOrCreatePartner blindly create/match a
    // bystander contact by name+phone. Unverified/new customers (the
    // common case) fall through to today's behavior unchanged.
    const namedPartner = await getPartnerByName(customerName);
    if (namedPartner && phone && namedPartner.phone !== phone) {
      await getErpAdapter().updateCustomer(namedPartner.id, { phone });
    }
    const existingPartner = isQuoteStaff(profile)
      ? (namedPartner || await getPartnerByPhone(phone))
      : null;

    // Optional field, resolved (not just validated) here — a miss never
    // blocks the quote, it just proceeds without a payment term set
    // (Odoo's own default applies, same as leaving it blank in Odoo web).
    let paymentTermId: number | undefined;
    let paymentTermNotFound = false;
    if (paymentTerm) {
      const term = await findPaymentTermByName(paymentTerm);
      if (term) paymentTermId = term.id;
      else paymentTermNotFound = true;
    }

    const quotation = await getErpAdapter().createQuotation(customerName, phone, product.name, qty, {
      partnerId: existingPartner?.id,
      customerRef: customerReference,
      discountPercent,
      validityDate,
      note,
      paymentTermId,
      productId: product.id,
    });
    if (!quotation) {
      // Product genuinely exists, so this is a real failure (partner
      // creation, sale.order create, etc.) — logged server-side by
      // createQuotationFromLine itself; tell the user it's not their input.
      recordAuditEvent({ action: 'quote_create', outcome: 'failure', actorUserId: userId, channelId: channel?.channelId, requestId, detail: `product=${product.id}` });
      return [botText(tr(userLanguage,
        'พบสินค้าแล้ว แต่สร้างใบเสนอราคาไม่สำเร็จเนื่องจากข้อผิดพลาดของระบบ กรุณาลองใหม่ หรือแจ้งแอดมินหากยังไม่สำเร็จ',
        "Found the product, but couldn't create the quote due to a system error. Please try again, or contact an admin if it keeps happening.",
      ), userLanguage)];
    }

    recordAuditEvent({ action: 'quote_create', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, requestId, targetId: quotation.name });

    const order = await getSaleOrderById(quotation.id);
    if (!order) {
      // Created successfully but the immediate re-read failed — extremely
      // unlikely, but don't leave the requester without any confirmation.
      return [botText(tr(userLanguage,
        `สร้างใบเสนอราคา ${quotation.name} สำเร็จแล้ว (${formatMoney(quotation.total, 'th')})`,
        `Created quotation ${quotation.name} (${formatMoney(quotation.total, 'en')}).`,
      ), userLanguage, [
        { label: tr(userLanguage, 'เช็คสถานะ', 'Check status'), text: `QUOTE STATUS ${quotation.id}`, style: 'primary' },
      ])];
    }

    const [portalLink, pdfLink] = await Promise.all([
      getSaleOrderPortalLink(quotation.id).then(v => v || undefined),
      getSaleOrderPdfLink(quotation.id).then(v => v || undefined),
    ]);
    const role = quoteJourneyRole(profile);
    const card = createQuotationJourneyFlexMessage(order, {
      role,
      salesTier: profile.salesTier,
      canManageLines: canManageQuoteLines(profile),
      portalLink,
      pdfLink,
    }, userLanguage);

    if (paymentTermNotFound) {
      return [
        botText(tr(userLanguage,
          `ไม่พบเงื่อนไขการชำระเงิน "${paymentTerm}" สร้างใบเสนอราคาแล้วโดยใช้เงื่อนไขเริ่มต้น`,
          `Payment term "${paymentTerm}" not found — created the quote with Odoo's default payment term instead.`,
        ), userLanguage),
        card,
      ];
    }

    return [card];
  },
};

// SYSTEM STATUS — ping Odoo connectivity
const demoOdooHandler: CommandHandler = {
  name: 'commerce-system-status',
  match: (u) => u === 'SYSTEM STATUS',
  handle: async (ctx) => {
    const { userLanguage } = ctx;
    try {
      const status = await getPlatformStatus();
      const failed = status.checks.filter(check => !check.ok).map(check => `${check.name}=${check.message}`);
      const body = [
        tr(userLanguage, `พร้อมใช้: ${status.ready ? 'ใช่' : 'ไม่'}`, `Ready: ${status.ready ? 'yes' : 'no'}`),
        ...status.checks.filter(check => check.required).map(check => `${check.name}: ${check.message}`),
        failed.length
          ? tr(userLanguage, `ปัญหา: ${failed.join(' | ')}`, `Issues: ${failed.join(' | ')}`)
          : tr(userLanguage, 'ไม่มีปัญหาที่ต้องแก้', 'No blocking issues'),
      ].join('\n');
      return [botText(body, userLanguage)];
    } catch (err) {
      console.error('Platform status error:', err);
      return [botText(tr(userLanguage,
        'ตรวจสอบสถานะไม่สำเร็จ',
        'Platform status check failed.',
      ), userLanguage)];
    }
  },
};

// SEED SAMPLE DATA — seed sample data (admin only)
const demoSeedHandler: CommandHandler = {
  name: 'commerce-seed-sample-data',
  match: (u) => u === 'SEED SAMPLE DATA',
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

const adminOnlyCommerceReply = (language: UserLanguage) =>
  botText(tr(language,
    'คำสั่งนี้สำหรับแอดมินเท่านั้น กรุณาใช้ ADMIN VERIFY และ ADMIN ENABLE ก่อน',
    'This command is admin-only. Run ADMIN VERIFY and ADMIN ENABLE first.',
  ), language);

// DAILY REPORT — trigger daily report (async, non-blocking). Admin-only:
// this was missing its role check (unlike its sibling SEED SAMPLE DATA
// below), which meant any LINE user could force an internal-data report
// generation — closed as a real authorization gap, not a style nit.
const demoReportHandler: CommandHandler = {
  name: 'commerce-daily-report',
  match: (u) => u === 'DAILY REPORT',
  handle: async (ctx) => {
    const { userLanguage, profile, userId, channel, requestId } = ctx;
    if (profile.role !== 'admin') return [adminOnlyCommerceReply(userLanguage)];

    recordAuditEvent({ action: 'daily_report_trigger', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, requestId });
    import('../../jobs/daily-report')
      .then(({ runDailyReport }) => runDailyReport(userLanguage))
      .catch(err => console.error('Demo report error:', err));
    return [botText(tr(userLanguage,
      'กำลังสร้างรายงานจากข้อมูล Odoo และจะส่งไปยังแอดมินทันทีค่ะ',
      'Generating report from Odoo data and sending it to admin now.',
    ), userLanguage)];
  },
};

// SEGMENT CUSTOMERS — trigger segmentation job. Admin-only: same missing
// role-check gap as DAILY REPORT above — this one is higher-stakes since it
// triggers a real bulk marketing multicast to customers, not just an
// internal report.
const demoSegmentHandler: CommandHandler = {
  name: 'commerce-segment-customers',
  match: (u) => u === 'SEGMENT CUSTOMERS',
  handle: async (ctx) => {
    const { userLanguage, profile, userId, channel, requestId } = ctx;
    if (profile.role !== 'admin') return [adminOnlyCommerceReply(userLanguage)];

    const { runSegmentationJob } = await import('../../jobs/segmentation');
    await runSegmentationJob();
    recordAuditEvent({ action: 'segment_customers_trigger', outcome: 'success', actorUserId: userId, channelId: channel?.channelId, requestId });
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
