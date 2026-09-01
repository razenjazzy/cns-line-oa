"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createQuotationJourneyFlexMessage = exports.createFormPromptFlexMessage = exports.createOrderSummaryFlexMessage = exports.createServiceActionFlexMessage = exports.createServiceHomeFlexMessage = exports.createProductCardFlexMessage = exports.createDailyReportFlexMessage = exports.createBotTextFlexMessage = exports.formatMoney = void 0;
const channels_1 = require("./channels");
const i18n_1 = require("../services/i18n");
// Cloudnex brand palette — kept consistent across every Flex message.
const BRAND = {
    teal: '#0B6E6A',
    tealStrong: '#063F3D',
    tealTint: '#E3F0EE',
    gold: '#A97A2B',
    goldTint: '#F4E9D4',
    ink: '#10201E',
    inkSoft: '#5B6C69',
    surface: '#FFFFFF',
    paper: '#F1F4F2',
};
/**
 * Fallback only for callers that genuinely have no per-user language to pass
 * (there are none left in this codebase as of this fix — every call site
 * now threads the actual UserLanguage through). Two Flex builders used to
 * read this env var directly instead of taking a `language` parameter at
 * all, so a user's LANG EN/LANG TH choice was silently ignored for product
 * cards and order summaries no matter what they'd set.
 */
const defaultUiLanguage = () => (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';
const buttonLabel = (label) => {
    const cleaned = label.trim();
    const chars = Array.from(cleaned);
    return chars.length > 20 ? `${chars.slice(0, 17).join('')}...` : cleaned;
};
/**
 * Single source of truth for money formatting — a proper Intl.NumberFormat
 * (locale-correct thousands separators, consistent decimals) plus the
 * currency suffix, in one call. Previously several call sites string-
 * concatenated `${value} บาท`/`${value} THB` directly with no formatting
 * at all, which read fine for small numbers but showed raw floats
 * (e.g. "1234567.891 บาท") for anything with cents or six figures.
 */
const formatMoney = (value, language) => {
    const formatted = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'th-TH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);
    return language === 'en' ? `${formatted} THB` : `${formatted} บาท`;
};
exports.formatMoney = formatMoney;
const createMessageActionButton = (label, actionText, style = 'primary', color = BRAND.teal) => ({
    type: 'button',
    style,
    height: 'sm',
    color,
    action: { type: 'message', label: buttonLabel(label), text: actionText },
});
/**
 * A `uri` action opens a real link when tapped — unlike plain text inside a
 * Flex bubble, which LINE never auto-linkifies or makes selectable. Used
 * for one-tap links (e.g. the Odoo verification link) that would otherwise
 * be inert, uncopyable text.
 */
const createUriActionButton = (label, uri, style = 'primary', color = BRAND.teal) => ({
    type: 'button',
    style,
    height: 'sm',
    color,
    action: { type: 'uri', label: buttonLabel(label), uri },
});
const truncate = (value, maxLength) => {
    const chars = Array.from(value.trim());
    return chars.length > maxLength ? `${chars.slice(0, maxLength - 3).join('')}...` : value.trim();
};
const createBotTextFlexMessage = (params) => {
    const tone = params.tone || 'info';
    const toneColor = tone === 'error'
        ? '#B42318'
        : tone === 'warning'
            ? BRAND.gold
            : tone === 'success'
                ? BRAND.teal
                : BRAND.tealStrong;
    const titlePrefix = tone === 'error'
        ? (params.language === 'en' ? 'Needs attention' : 'ต้องตรวจสอบ')
        : tone === 'warning'
            ? (params.language === 'en' ? 'Notice' : 'แจ้งเตือน')
            : tone === 'success'
                ? (params.language === 'en' ? 'Done' : 'สำเร็จ')
                : params.title;
    return {
        type: 'flex',
        altText: truncate(`${params.title}: ${params.body}`, 380),
        ...(params.quickReplyActions?.length ? {
            quickReply: {
                items: params.quickReplyActions.slice(0, 13).map(action => ({
                    type: 'action',
                    action: { type: 'message', label: action.label, text: action.text },
                })),
            },
        } : {}),
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.teal },
                body: { backgroundColor: BRAND.surface },
                footer: { backgroundColor: BRAND.surface },
            },
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                contents: [
                    { type: 'text', text: titlePrefix, color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true },
                    { type: 'text', text: params.title, color: '#DDEBE9', size: 'xs', margin: 'xs', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: tone === 'warning' ? BRAND.goldTint : BRAND.tealTint,
                        paddingAll: 'md',
                        contents: [
                            { type: 'text', text: params.body, color: tone === 'error' ? '#7A271A' : BRAND.ink, size: 'sm', wrap: true },
                        ],
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'sm',
                        contents: [
                            { type: 'box', layout: 'vertical', width: '8px', backgroundColor: toneColor, contents: [{ type: 'filler' }] },
                            { type: 'text', text: params.language === 'en' ? 'Use the buttons below for the next step.' : 'ใช้ปุ่มด้านล่างเพื่อไปขั้นตอนถัดไป', size: 'xs', color: BRAND.inkSoft, wrap: true },
                        ],
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    ...(params.linkAction ? [createUriActionButton(params.linkAction.label, params.linkAction.uri, 'primary', BRAND.teal)] : []),
                    createMessageActionButton(params.primaryAction?.label || (params.language === 'en' ? 'Home' : 'หน้าหลัก'), params.primaryAction?.text || 'NAV HOME', params.linkAction ? 'secondary' : 'primary', params.linkAction ? BRAND.goldTint : BRAND.teal),
                    ...(params.secondaryAction ? [createMessageActionButton(params.secondaryAction.label, params.secondaryAction.text, 'secondary', BRAND.goldTint)] : []),
                ],
            },
        },
    };
};
exports.createBotTextFlexMessage = createBotTextFlexMessage;
const createDailyReportFlexMessage = (reportData, insights, language = 'th') => {
    const agentName = (0, channels_1.getAgentName)();
    const rows = (() => {
        try {
            const parsed = JSON.parse(String(reportData));
            return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
        }
        catch {
            return [];
        }
    })();
    return {
        type: 'flex',
        altText: language === 'en' ? 'Daily sales and inventory report' : 'สรุปรายงานยอดขายและสต็อกประจำวัน',
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.tealStrong },
                body: { backgroundColor: BRAND.surface },
            },
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: language === 'en' ? `Daily report by ${agentName}` : `รายงานประจำวันโดย ${agentName}`, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: insights, wrap: true, size: 'sm', color: BRAND.ink },
                    ...(rows.length ? [{ type: 'separator', margin: 'md' }] : []),
                    ...rows.flatMap(row => ([
                        { type: 'text', text: row.product || '-', weight: 'bold', size: 'sm', margin: 'md', wrap: true, color: BRAND.tealStrong },
                        { type: 'text', text: language === 'en'
                                ? `Sales ${Number(row.salesYesterday || 0).toFixed(0)} | Revenue ${(0, exports.formatMoney)(row.revenueYesterday || 0, language)} | Stock ${Number(row.stock || 0).toFixed(0)}`
                                : `ขาย ${Number(row.salesYesterday || 0).toFixed(0)} | รายได้ ${(0, exports.formatMoney)(row.revenueYesterday || 0, language)} | คงเหลือ ${Number(row.stock || 0).toFixed(0)}`,
                            size: 'xs', color: BRAND.inkSoft, wrap: true },
                    ])),
                ],
            },
        },
    };
};
exports.createDailyReportFlexMessage = createDailyReportFlexMessage;
const createProductCardFlexMessage = (productName, price, stock, language = defaultUiLanguage()) => {
    return {
        type: 'flex',
        altText: truncate(language === 'en' ? `Product: ${productName}` : `สินค้า: ${productName}`, 390),
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.teal },
                body: { backgroundColor: BRAND.surface },
                footer: { backgroundColor: BRAND.surface },
            },
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                contents: [
                    { type: 'text', text: language === 'en' ? 'Product detail' : 'รายละเอียดสินค้า', color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true },
                    { type: 'text', text: language === 'en' ? 'Review and choose the next action' : 'ตรวจสอบข้อมูลแล้วเลือกขั้นตอนต่อไป', color: '#DDEBE9', size: 'xs', margin: 'xs', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    { type: 'text', text: productName, weight: 'bold', size: 'xl', color: BRAND.ink, wrap: true },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'sm',
                        contents: [
                            {
                                type: 'box',
                                layout: 'vertical',
                                backgroundColor: BRAND.tealTint,
                                paddingAll: 'sm',
                                contents: [
                                    { type: 'text', text: language === 'en' ? 'Price' : 'ราคา', size: 'xs', color: BRAND.inkSoft },
                                    { type: 'text', text: (0, exports.formatMoney)(price, language), size: 'sm', color: BRAND.tealStrong, weight: 'bold', wrap: true },
                                ],
                            },
                            {
                                type: 'box',
                                layout: 'vertical',
                                backgroundColor: BRAND.goldTint,
                                paddingAll: 'sm',
                                contents: [
                                    { type: 'text', text: language === 'en' ? 'Stock' : 'คงเหลือ', size: 'xs', color: BRAND.inkSoft },
                                    { type: 'text', text: String(stock), size: 'sm', color: BRAND.ink, weight: 'bold', wrap: true },
                                ],
                            },
                        ],
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    createMessageActionButton(language === 'en' ? 'Create quote' : 'สร้างใบเสนอราคา', 'FORM DEMO QUOTE', 'primary', BRAND.teal),
                    createMessageActionButton(language === 'en' ? 'Search again' : 'ค้นหาอีกครั้ง', 'FORM DEMO PRODUCT', 'secondary', BRAND.tealTint),
                    createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint),
                ],
            },
        },
    };
};
exports.createProductCardFlexMessage = createProductCardFlexMessage;
const SERVICE_ICON = {
    VERIFY: '🔐',
    commerce: '🛍️',
    directory: '👥',
    catalog: '📦',
    reporting: '📊',
    groupBuy: '🤝',
};
const createServiceHomeFlexMessage = (services, language, agentName) => {
    return {
        type: 'flex',
        altText: language === 'en' ? `${agentName} services menu` : `เมนูบริการของ ${agentName}`,
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.teal },
                body: { backgroundColor: BRAND.surface },
                footer: { backgroundColor: BRAND.surface },
            },
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                contents: [
                    { type: 'text', text: language === 'en' ? `${agentName} menu` : `เมนู ${agentName}`, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
                    { type: 'text', text: language === 'en' ? 'Tap a service to continue' : 'เลือกบริการเพื่อเริ่มใช้งาน', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: services.slice(0, 10).map(service => ({
                    type: 'button',
                    style: 'primary',
                    height: 'sm',
                    color: BRAND.teal,
                    action: {
                        type: 'message',
                        label: buttonLabel(`${SERVICE_ICON[service.key] || ''} ${service.label}`.trim()),
                        text: `NAV ${service.key}`,
                    },
                })),
            },
            footer: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: [
                    {
                        type: 'button',
                        style: 'secondary',
                        height: 'sm',
                        color: BRAND.tealTint,
                        action: { type: 'message', label: language === 'en' ? 'Language' : 'ภาษา', text: language === 'en' ? 'LANG TH' : 'LANG EN' },
                    },
                    {
                        type: 'button',
                        style: 'secondary',
                        height: 'sm',
                        color: BRAND.tealTint,
                        action: { type: 'message', label: language === 'en' ? 'Guide' : 'คู่มือ', text: 'GUIDE' },
                    },
                ],
            },
        },
    };
};
exports.createServiceHomeFlexMessage = createServiceHomeFlexMessage;
const createServiceActionFlexMessage = (serviceLabel, actions, language) => {
    return {
        type: 'flex',
        altText: truncate(serviceLabel, 390),
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.teal },
                body: { backgroundColor: BRAND.surface },
                footer: { backgroundColor: BRAND.surface },
            },
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                contents: [
                    { type: 'text', text: serviceLabel, weight: 'bold', size: 'md', wrap: true, color: '#FFFFFF' },
                    { type: 'text', text: language === 'en' ? 'Choose one action' : 'เลือกสิ่งที่ต้องการทำ', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: actions.slice(0, 10).map(action => ({
                    ...createMessageActionButton(action.label, action.text, 'primary', BRAND.teal),
                })),
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        ...createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'primary', BRAND.gold),
                    },
                ],
            },
        },
    };
};
exports.createServiceActionFlexMessage = createServiceActionFlexMessage;
const createOrderSummaryFlexMessage = (total, language = defaultUiLanguage()) => {
    return {
        type: 'flex',
        altText: language === 'en' ? 'Order summary' : 'สรุปคำสั่งซื้อ',
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.teal },
                body: { backgroundColor: BRAND.surface },
                footer: { backgroundColor: BRAND.surface },
            },
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                contents: [
                    { type: 'text', text: language === 'en' ? 'Quotation created' : 'สร้างใบเสนอราคาแล้ว', weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
                    { type: 'text', text: language === 'en' ? 'Summary and next steps' : 'สรุปและขั้นตอนถัดไป', size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: BRAND.tealTint,
                        paddingAll: 'md',
                        contents: [
                            { type: 'text', text: language === 'en' ? 'Total' : 'ยอดรวม', size: 'xs', color: BRAND.inkSoft },
                            { type: 'text', text: (0, exports.formatMoney)(total, language), size: 'xl', color: BRAND.tealStrong, weight: 'bold', wrap: true },
                        ],
                    },
                    { type: 'text', text: language === 'en' ? 'Please follow your payment workflow.' : 'กรุณาชำระเงินตามขั้นตอนที่ร้านกำหนด', size: 'sm', wrap: true, color: BRAND.inkSoft },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    createMessageActionButton(language === 'en' ? 'Check order' : 'เช็คออเดอร์', 'FORM DEMO ORDER', 'primary', BRAND.teal),
                    createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint),
                ],
            },
        },
    };
};
exports.createOrderSummaryFlexMessage = createOrderSummaryFlexMessage;
const createFormPromptFlexMessage = (params) => {
    const actions = [
        ...(params.optional ? [{ label: params.language === 'en' ? 'Skip' : 'ข้าม', text: 'SKIP' }] : []),
        { label: params.language === 'en' ? 'Cancel' : 'ยกเลิก', text: 'CANCEL' },
    ];
    return {
        type: 'flex',
        altText: truncate(params.prompt, 390),
        quickReply: {
            items: actions.map(action => ({
                type: 'action',
                action: { type: 'message', label: action.label, text: action.text },
            })),
        },
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.teal },
                body: { backgroundColor: BRAND.surface },
                footer: { backgroundColor: BRAND.surface },
            },
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                contents: [
                    { type: 'text', text: params.title, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
                    { type: 'text', text: params.language === 'en' ? `Step ${params.stepIndex + 1} of ${params.totalSteps}` : `ขั้นตอน ${params.stepIndex + 1} จาก ${params.totalSteps}`, size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: BRAND.tealTint,
                        paddingAll: 'md',
                        contents: [
                            { type: 'text', text: params.language === 'en' ? 'Please type your answer in the chat box.' : 'กรุณาพิมพ์คำตอบในช่องแชท', size: 'xs', color: BRAND.inkSoft, wrap: true },
                            { type: 'text', text: params.prompt, size: 'md', color: BRAND.ink, weight: 'bold', margin: 'sm', wrap: true },
                        ],
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: params.optional ? 'horizontal' : 'vertical',
                spacing: 'sm',
                contents: actions.map(action => createMessageActionButton(action.label, action.text, action.text === 'CANCEL' ? 'secondary' : 'primary', action.text === 'CANCEL' ? BRAND.goldTint : BRAND.teal)),
            },
        },
    };
};
exports.createFormPromptFlexMessage = createFormPromptFlexMessage;
const QUOTATION_STATE_SEQUENCE = ['draft', 'sent', 'sale'];
/**
 * Mirrors the real Odoo Sales record's status bar (Quotation -> Quotation
 * Sent -> Sales Order) plus the actions relevant to who's looking at it.
 * `role` controls the action set — an admin can drive the order forward
 * (Confirm/Send); a customer can only Approve their own order or view it.
 * See quotation.ts for the authorization check that keeps that split real
 * (a customer's Approve tap is rejected server-side if the order isn't
 * theirs, regardless of what buttons this card happens to render).
 */
const createQuotationJourneyFlexMessage = (order, options, language) => {
    const customerName = order.partner_id?.[1] || '-';
    const isCancelled = order.state === 'cancel';
    const currentIndex = isCancelled ? -1 : QUOTATION_STATE_SEQUENCE.indexOf(order.state);
    const lines = order.lines || [];
    const visibleLines = lines.slice(0, 4);
    const extraCount = lines.length - visibleLines.length;
    const statusRow = isCancelled
        ? {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8D7DA',
            cornerRadius: 'md',
            paddingAll: 'sm',
            contents: [
                { type: 'text', text: (0, i18n_1.stateLabel)('cancel', language), align: 'center', weight: 'bold', size: 'sm', color: '#7A271A' },
            ],
        }
        : {
            type: 'box',
            layout: 'horizontal',
            spacing: 'xs',
            contents: QUOTATION_STATE_SEQUENCE.map((state, index) => ({
                type: 'box',
                layout: 'vertical',
                flex: 1,
                cornerRadius: 'md',
                paddingAll: 'xs',
                backgroundColor: index === currentIndex ? BRAND.teal : BRAND.tealTint,
                contents: [
                    {
                        type: 'text',
                        text: (0, i18n_1.stateLabel)(state, language),
                        size: 'xxs',
                        align: 'center',
                        wrap: true,
                        color: index === currentIndex ? '#FFFFFF' : BRAND.tealStrong,
                        weight: index === currentIndex ? 'bold' : 'regular',
                    },
                ],
            })),
        };
    const footerButtons = [];
    const canStillAct = !isCancelled && order.state !== 'sale';
    if (options.role === 'admin') {
        if (canStillAct) {
            footerButtons.push(createMessageActionButton((0, i18n_1.t)('confirm', language), `QUOTE CONFIRM ${order.id}`, 'primary', BRAND.teal));
            footerButtons.push(createMessageActionButton((0, i18n_1.t)('sendToCustomer', language), `QUOTE SEND ${order.id}`, 'secondary', BRAND.tealTint));
        }
        if (options.portalLink) {
            footerButtons.push(createUriActionButton((0, i18n_1.t)('preview', language), options.portalLink, 'secondary', BRAND.goldTint));
        }
    }
    else {
        if (canStillAct) {
            footerButtons.push(createMessageActionButton((0, i18n_1.t)('approve', language), `QUOTE APPROVE ${order.id}`, 'primary', BRAND.teal));
        }
        if (options.portalLink) {
            footerButtons.push(createUriActionButton((0, i18n_1.t)('viewFullQuotation', language), options.portalLink, 'secondary', BRAND.tealTint));
        }
    }
    footerButtons.push(createMessageActionButton(language === 'en' ? 'Home' : 'หน้าหลัก', 'NAV HOME', 'secondary', BRAND.goldTint));
    return {
        type: 'flex',
        altText: truncate(`${(0, i18n_1.t)('quotation', language)} ${order.name} — ${customerName} — ${(0, exports.formatMoney)(order.amount_total, language)}`, 390),
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.teal },
                body: { backgroundColor: BRAND.surface },
                footer: { backgroundColor: BRAND.surface },
            },
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                contents: [
                    { type: 'text', text: order.name, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true },
                    { type: 'text', text: `${(0, i18n_1.t)('customer', language)}: ${customerName}`, size: 'xs', color: '#DDEBE9', margin: 'xs', wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    statusRow,
                    ...(visibleLines.length ? [{
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'xs',
                            contents: [
                                { type: 'text', text: (0, i18n_1.t)('items', language), size: 'xs', color: BRAND.inkSoft },
                                ...visibleLines.map(line => ({
                                    type: 'text',
                                    text: `${line.productName} × ${line.qty}`,
                                    size: 'sm',
                                    color: BRAND.ink,
                                    wrap: true,
                                })),
                                ...(extraCount > 0 ? [{ type: 'text', text: `+${extraCount} ${(0, i18n_1.t)('moreItems', language)}`, size: 'xs', color: BRAND.inkSoft }] : []),
                            ],
                        }] : []),
                    {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: BRAND.tealTint,
                        paddingAll: 'md',
                        contents: [
                            { type: 'text', text: (0, i18n_1.t)('total', language), size: 'xs', color: BRAND.inkSoft },
                            { type: 'text', text: (0, exports.formatMoney)(order.amount_total, language), size: 'xl', color: BRAND.tealStrong, weight: 'bold', wrap: true },
                        ],
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: footerButtons,
            },
        },
    };
};
exports.createQuotationJourneyFlexMessage = createQuotationJourneyFlexMessage;
