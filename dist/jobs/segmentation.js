"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSegmentationJob = void 0;
const bigquery_1 = require("../services/bigquery");
const messaging_1 = require("../line/messaging");
const firestore_1 = require("../services/firestore");
// This is a placeholder. In reality, we'd use Gemini 3.1 Pro to generate personalized copy
// based on the specific segments that the user falls into.
// Bilingual to match the rest of the product — a marketing message is the
// one place this bot previously broke TH/EN parity.
const generateMessageForSegment = (segment, language) => {
    const th = {
        VIP: 'ขอบคุณที่อุดหนุนเราอย่างต่อเนื่องค่ะ รับส่วนลด 20% สำหรับสินค้าเข้าใหม่ก่อนใคร',
        CART_ABANDONER: 'ลืมอะไรไว้หรือเปล่าคะ? กดสั่งซื้อตอนนี้รับส่วนลด 10%',
        DORMANT: 'คิดถึงนะคะ มาดูสินค้าที่คัดมาเพื่อคุณโดยเฉพาะกันเถอะ',
        GENERAL: 'มาดูสินค้าใหม่ล่าสุดของเรากันค่ะ',
    };
    const en = {
        VIP: 'Thank you for your continued support! Here is a 20% discount on early access items.',
        CART_ABANDONER: 'Did you forget something? Complete your purchase now for 10% off.',
        DORMANT: 'We miss you! Check out these curated picks just for you.',
        GENERAL: 'Check out our latest arrivals!',
    };
    const table = language === 'th' ? th : en;
    return table[segment] || table.GENERAL;
};
const runSegmentationJob = async () => {
    console.log('Starting nightly segmentation job...');
    // 1. Fetch cohort data from BigQuery
    const cohorts = await (0, bigquery_1.getCohortData)();
    if (!cohorts.length) {
        console.log('No real cohort data found. Segmentation job skipped.');
        return;
    }
    // 2. Process and map to segments
    const segments = {
        VIP: [],
        CART_ABANDONER: [],
        DORMANT: [],
        GENERAL: []
    };
    cohorts.forEach(user => {
        if (user.totalPurchases >= 5) {
            segments.VIP.push(user.userId);
        }
        else if (user.lastActiveDaysAgo >= 30) {
            segments.DORMANT.push(user.userId);
        }
        else if (user.browsePurchaseRatio > 0.5) {
            segments.CART_ABANDONER.push(user.userId);
        }
        else {
            segments.GENERAL.push(user.userId);
        }
    });
    // 3. Send targeted messages via LINE multicast — only to users who have
    // explicitly opted in (marketingOptIn defaults to false; PROMO ON/OFF in
    // src/line/handlers/privacy.ts), and in each user's own preferred language.
    for (const [segment, candidateUserIds] of Object.entries(segments)) {
        if (!candidateUserIds.length)
            continue;
        const optedInUserIds = await (0, firestore_1.filterMarketingOptedInUserIds)(candidateUserIds);
        if (!optedInUserIds.length) {
            console.log(`Segment ${segment}: 0/${candidateUserIds.length} users opted in to marketing messages. Skipping.`);
            continue;
        }
        const byLanguage = { th: [], en: [] };
        for (const userId of optedInUserIds) {
            const language = await (0, firestore_1.getUserLanguage)(userId);
            byLanguage[language].push(userId);
        }
        for (const language of ['th', 'en']) {
            const userIds = byLanguage[language];
            if (!userIds.length)
                continue;
            const messageText = generateMessageForSegment(segment, language);
            console.log(`Sending to ${userIds.length} opted-in ${language} users in segment ${segment} (of ${candidateUserIds.length} candidates)`);
            await (0, messaging_1.sendTargetedMessage)(userIds, messageText);
        }
    }
    console.log('Segmentation job complete.');
};
exports.runSegmentationJob = runSegmentationJob;
