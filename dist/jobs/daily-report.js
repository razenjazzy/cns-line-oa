"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyReport = void 0;
const bot_sdk_1 = require("@line/bot-sdk");
const vertexai_1 = require("../services/vertexai");
const templates_1 = require("../line/templates");
const firestore_1 = require("../services/firestore");
const odoo_1 = require("../services/odoo");
// Lazy: read env vars at call time so dotenv.config() has already run
const getClient = () => {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token)
        return null;
    return new bot_sdk_1.messagingApi.MessagingApiClient({ channelAccessToken: token });
};
const isValidLineUserId = (value) => /^U[a-f0-9]{32}$/i.test(value);
const runDailyReport = async (language) => {
    console.log('Starting daily report job...');
    if (!(0, odoo_1.isOdooConfigured)()) {
        throw new Error('Odoo is not configured. Please set ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY.');
    }
    const snapshot = await (0, odoo_1.getDailySalesSnapshot)();
    if (!snapshot.length) {
        throw new Error('No sales data was found in Odoo for the selected time windows.');
    }
    const data = JSON.stringify(snapshot);
    const hasSales = snapshot.some(row => row.salesYesterday > 0 || row.revenueYesterday > 0);
    if (hasSales) {
        console.log(`Loaded ${snapshot.length} sales rows from Odoo.`);
    }
    else {
        console.log(`Loaded ${snapshot.length} Odoo inventory rows (no recent sales found).`);
    }
    const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '';
    const resolvedLanguage = language || (ADMIN_USER_ID ? await (0, firestore_1.getUserLanguage)(ADMIN_USER_ID) : 'th');
    const insights = await (0, vertexai_1.generateInsights)(data, resolvedLanguage);
    const client = getClient();
    if (!client) {
        console.log('LINE credentials not provided. Skipping LINE message.');
    }
    else if (!ADMIN_USER_ID || !isValidLineUserId(ADMIN_USER_ID)) {
        console.log('ADMIN_USER_ID is missing or invalid. Skipping LINE push.');
    }
    else {
        const message = (0, templates_1.createDailyReportFlexMessage)(data, insights, resolvedLanguage);
        try {
            await client.pushMessage({ to: ADMIN_USER_ID, messages: [message] });
            console.log('Report sent to LINE');
        }
        catch (error) {
            // Do not fail the whole job for push errors; keep report generation resilient.
            console.error('Failed to push report to LINE:', error);
        }
    }
    await (0, firestore_1.saveReportLog)(new Date().toISOString().split('T')[0], { insights });
    console.log('Daily report job complete.');
};
exports.runDailyReport = runDailyReport;
