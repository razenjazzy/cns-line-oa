"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrderSummaryFlexMessage = exports.createServiceActionFlexMessage = exports.createServiceHomeFlexMessage = exports.createProductCardFlexMessage = exports.createDailyReportFlexMessage = void 0;
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
const createDailyReportFlexMessage = (reportData, insights, language = 'th') => {
    const agentName = process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
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
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: language === 'en' ? `Daily report by ${agentName}` : `รายงานประจำวันโดย ${agentName}`, weight: 'bold', size: 'md', color: BRAND.teal, wrap: true },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: insights, wrap: true, size: 'sm' },
                    ...(rows.length ? [{ type: 'separator', margin: 'md' }] : []),
                    ...rows.flatMap(row => ([
                        { type: 'text', text: row.product || '-', weight: 'bold', size: 'sm', margin: 'md', wrap: true },
                        { type: 'text', text: language === 'en'
                                ? `Sales ${Number(row.salesYesterday || 0).toFixed(0)} | Revenue ${Number(row.revenueYesterday || 0).toFixed(2)} THB | Stock ${Number(row.stock || 0).toFixed(0)}`
                                : `ขาย ${Number(row.salesYesterday || 0).toFixed(0)} | รายได้ ${Number(row.revenueYesterday || 0).toFixed(2)} บาท | คงเหลือ ${Number(row.stock || 0).toFixed(0)}`,
                            size: 'xs', color: '#666666', wrap: true },
                    ])),
                ],
            },
        },
    };
};
exports.createDailyReportFlexMessage = createDailyReportFlexMessage;
const createProductCardFlexMessage = (productName, price, stock) => {
    const language = (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';
    return {
        type: 'flex',
        altText: language === 'en' ? `Product: ${productName}` : `สินค้า: ${productName}`,
        contents: {
            type: 'bubble',
            styles: {
                header: { backgroundColor: BRAND.teal },
                body: { backgroundColor: BRAND.surface },
                footer: { backgroundColor: BRAND.surface }
            },
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: language === 'en' ? 'Product Detail' : 'รายละเอียดสินค้า', color: '#FFFFFF', weight: 'bold', size: 'sm' }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: productName, weight: 'bold', size: 'xl', color: BRAND.ink, wrap: true },
                    { type: 'text', text: language === 'en' ? `Price: ${price} THB` : `ราคา: ${price} บาท`, size: 'md', margin: 'md', color: BRAND.tealStrong, weight: 'bold' },
                    { type: 'text', text: language === 'en' ? `Stock: ${stock}` : `คงเหลือ: ${stock}`, size: 'sm', color: BRAND.inkSoft, margin: 'sm' },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: BRAND.teal,
                        action: { type: 'message', label: language === 'en' ? 'Create Quote' : 'สร้างใบเสนอราคา', text: `DEMO QUOTE ${productName},1,LINE Customer,0900000000` }
                    }
                ]
            }
        }
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
            type: 'carousel',
            contents: services.slice(0, 10).map(service => ({
                type: 'bubble',
                size: 'kilo',
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
                        { type: 'text', text: SERVICE_ICON[service.key] || '⭐', size: 'xl' },
                    ],
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        { type: 'text', text: service.label, weight: 'bold', size: 'md', color: BRAND.ink, wrap: true },
                    ],
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'button',
                            style: 'primary',
                            color: BRAND.gold,
                            action: { type: 'message', label: language === 'en' ? 'Open' : 'เปิด', text: `NAV ${service.key}` },
                        },
                    ],
                },
            })),
        },
    };
};
exports.createServiceHomeFlexMessage = createServiceHomeFlexMessage;
const createServiceActionFlexMessage = (serviceLabel, actions, language) => {
    return {
        type: 'flex',
        altText: serviceLabel,
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
                contents: [
                    { type: 'text', text: serviceLabel, weight: 'bold', size: 'md', wrap: true, color: '#FFFFFF' },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: actions.slice(0, 10).map(action => ({
                    type: 'button',
                    style: 'secondary',
                    color: BRAND.tealStrong,
                    action: { type: 'message', label: action.label, text: action.text },
                })),
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: BRAND.gold,
                        action: { type: 'message', label: language === 'en' ? 'Home' : 'หน้าหลัก', text: 'NAV HOME' },
                    },
                ],
            },
        },
    };
};
exports.createServiceActionFlexMessage = createServiceActionFlexMessage;
const createOrderSummaryFlexMessage = (total) => {
    const language = (process.env.DEFAULT_UI_LANGUAGE || 'th').toLowerCase() === 'en' ? 'en' : 'th';
    return {
        type: 'flex',
        altText: language === 'en' ? 'Order summary' : 'สรุปคำสั่งซื้อ',
        contents: {
            type: 'bubble',
            styles: {
                body: { backgroundColor: BRAND.tealTint }
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: language === 'en' ? 'Quotation Created' : 'สร้างคำสั่งซื้อแล้ว', weight: 'bold', size: 'lg', color: BRAND.tealStrong },
                    { type: 'text', text: language === 'en' ? `Total: ${total} THB` : `ยอดรวม: ${total} บาท`, size: 'md', margin: 'md', color: BRAND.ink, weight: 'bold' },
                    { type: 'text', text: language === 'en' ? 'Please follow your payment workflow.' : 'กรุณาชำระเงินตามขั้นตอนที่ร้านกำหนด', size: 'sm', wrap: true, margin: 'sm', color: BRAND.inkSoft },
                ]
            }
        }
    };
};
exports.createOrderSummaryFlexMessage = createOrderSummaryFlexMessage;
