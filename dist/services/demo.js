"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDemoJourney = exports.getDemoOverview = void 0;
const firestore_1 = require("./firestore");
const channels_1 = require("../line/channels");
const odoo_1 = require("./odoo");
const isLineConfigured = () => {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || '';
    const secret = process.env.LINE_CHANNEL_SECRET?.trim() || '';
    return Boolean(accessToken && secret);
};
const isFirestoreConfigured = () => Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim());
const isOdooConfigured = () => {
    const url = process.env.ODOO_URL?.trim() || '';
    const db = process.env.ODOO_DB?.trim() || '';
    const username = process.env.ODOO_USERNAME?.trim() || '';
    const apiKey = process.env.ODOO_API_KEY?.trim() || '';
    return Boolean(url && db && username && apiKey);
};
const isProduction = process.env.NODE_ENV === 'production';
const isDemoControlEnabled = !isProduction || /^(1|true|yes|on)$/i.test(process.env.ENABLE_DEMO_CONTROL_PANEL || '');
const normalizeBaseUrl = (baseUrl) => {
    const fallbackPort = process.env.PORT || '8080';
    return (baseUrl || `http://localhost:${fallbackPort}`).replace(/\/$/, '');
};
const safePingOdoo = async () => {
    try {
        return await (0, odoo_1.pingOdoo)();
    }
    catch (error) {
        return `Odoo connectivity check failed: ${String(error)}`;
    }
};
const safeSeedOdoo = async () => {
    try {
        return await (0, odoo_1.seedOdooSampleSalesData)();
    }
    catch (error) {
        return `Odoo seed failed: ${String(error)}`;
    }
};
const getDemoOverview = async (baseUrl) => {
    const resolvedBaseUrl = normalizeBaseUrl(baseUrl);
    const odooStatus = await safePingOdoo();
    return {
        generatedAt: new Date().toISOString(),
        app: {
            status: 'ready',
            environment: process.env.NODE_ENV?.trim() || 'development',
            endpoints: {
                demoPage: `${resolvedBaseUrl}/demo`,
                connections: `${resolvedBaseUrl}/demo/connections`,
                journey: `${resolvedBaseUrl}/demo/journey`,
                pricingModel: `${resolvedBaseUrl}/demo/pricing-model`,
                pricingSimulation: `${resolvedBaseUrl}/demo/pricing-simulation`,
                workflowAudit: `${resolvedBaseUrl}/demo/workflow-audit`,
                simulatedLineWebhook: `${resolvedBaseUrl}/webhook-test`,
                lineWebhook: `${resolvedBaseUrl}/webhook`,
            },
        },
        connections: {
            lineOA: {
                configured: isLineConfigured(),
                agentName: (0, channels_1.getAgentName)(),
                webhookReady: isLineConfigured(),
            },
            odoo: {
                configured: isOdooConfigured(),
                status: odooStatus,
            },
            firestore: {
                configured: isFirestoreConfigured(),
                projectId: process.env.GOOGLE_CLOUD_PROJECT?.trim() || null,
            },
        },
        demo: {
            accessControl: {
                enabled: isDemoControlEnabled,
                productionProtected: !isProduction || Boolean((process.env.DEMO_CONTROL_TOKEN || process.env.OPS_API_TOKEN || '').trim()),
            },
            recommendedJourney: [
                'Open /demo to inspect connectivity and run the guided flow.',
                'If production-gated, provide demo token in panel before loading secured API actions.',
                'Load pricing model, tune markups/cost assumptions, and run simulation for target margin.',
                'Use POST /webhook-test or the demo console to simulate a LINE user message.',
                'Run the demo journey to seed Odoo, create or reuse a partner, create a quotation, and read it back.',
            ],
            sampleLinePayload: {
                userId: 'demo_line_user',
                text: 'DEMO PRODUCT App',
            },
        },
    };
};
exports.getDemoOverview = getDemoOverview;
const runDemoJourney = async (input) => {
    const userId = input.userId?.trim() || 'demo_line_user';
    const language = input.language === 'en' ? 'en' : 'th';
    const productQuery = input.productQuery?.trim() || 'App Premium Plan';
    const qty = typeof input.qty === 'number' && input.qty > 0 ? input.qty : 1;
    const customerName = input.customerName?.trim() || 'LINE Demo Customer';
    const customerPhone = input.customerPhone?.trim() || '0990000000';
    const customerEmail = input.customerEmail?.trim() || 'line.demo@example.com';
    const steps = [];
    await (0, firestore_1.setUserLanguage)(userId, language);
    steps.push({
        key: 'app-user-context',
        status: 'success',
        detail: `Application user context prepared for ${userId} (${language}).`,
        data: { userId, language },
    });
    const odooStatus = await safePingOdoo();
    const odooOk = /connected successfully/i.test(odooStatus);
    steps.push({
        key: 'odoo-connection',
        status: odooOk ? 'success' : 'error',
        detail: odooStatus,
    });
    if (!odooOk) {
        return {
            ok: false,
            steps,
            sampleLineCommands: [
                'DEMO ODOO',
                `DEMO PRODUCT ${productQuery}`,
            ],
        };
    }
    if (input.seedOdoo !== false) {
        const seedStatus = await safeSeedOdoo();
        steps.push({
            key: 'odoo-seed',
            status: /sample data ready/i.test(seedStatus) ? 'success' : 'warning',
            detail: seedStatus,
        });
    }
    let partner = await (0, odoo_1.getPartnerByPhone)(customerPhone);
    if (!partner) {
        partner = await (0, odoo_1.createPartnerFromLine)(customerName, customerPhone, customerEmail);
        if (!partner) {
            steps.push({
                key: 'odoo-partner',
                status: 'error',
                detail: 'Failed to create or locate the Odoo partner for the demo customer.',
            });
            return {
                ok: false,
                steps,
                sampleLineCommands: [
                    `USER CREATE ${customerName},${customerPhone},${customerEmail}`,
                ],
            };
        }
    }
    await (0, firestore_1.setUserOdooPartner)(userId, partner.id, partner.name, partner.phone);
    steps.push({
        key: 'odoo-partner',
        status: 'success',
        detail: `Application user ${userId} is mapped to Odoo partner ${partner.name}.`,
        data: partner,
    });
    const product = await (0, odoo_1.findProductByQuery)(productQuery);
    if (!product) {
        steps.push({
            key: 'odoo-product',
            status: 'error',
            detail: `No Odoo product found for query "${productQuery}".`,
        });
        return {
            ok: false,
            steps,
            sampleLineCommands: [
                `DEMO PRODUCT ${productQuery}`,
                'DEMO SEED ODOO',
            ],
        };
    }
    steps.push({
        key: 'odoo-product',
        status: 'success',
        detail: `Resolved Odoo product ${product.name}.`,
        data: product,
    });
    const quotation = await (0, odoo_1.createQuotationFromLine)(customerName, customerPhone, product.name, qty);
    if (!quotation) {
        steps.push({
            key: 'odoo-quotation',
            status: 'error',
            detail: 'Failed to create the Odoo quotation from the simulated LINE request.',
        });
        return {
            ok: false,
            steps,
            sampleLineCommands: [
                `DEMO QUOTE ${product.name},${qty},${customerName},${customerPhone}`,
            ],
        };
    }
    steps.push({
        key: 'odoo-quotation',
        status: 'success',
        detail: `Created Odoo quotation ${quotation.orderName}.`,
        data: quotation,
    });
    const order = await (0, odoo_1.findOrderByReference)(quotation.orderName);
    steps.push({
        key: 'odoo-order-readback',
        status: order ? 'success' : 'warning',
        detail: order
            ? `Read back quotation ${order.name} from Odoo with state ${order.state}.`
            : `Quotation ${quotation.orderName} was created but could not be read back immediately.`,
        data: order || undefined,
    });
    const profile = await (0, firestore_1.getUserProfile)(userId);
    return {
        ok: true,
        summary: {
            userId,
            language,
            product: product.name,
            quotationReference: quotation.orderName,
        },
        steps,
        applicationUser: profile,
        sampleLineCommands: [
            `USER READ ${customerPhone}`,
            `DEMO PRODUCT ${product.name}`,
            `DEMO QUOTE ${product.name},${qty},${customerName},${customerPhone}`,
            `DEMO ORDER ${quotation.orderName}`,
        ],
    };
};
exports.runDemoJourney = runDemoJourney;
