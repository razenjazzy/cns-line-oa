"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSegmentationJob = void 0;
const bigquery_1 = require("../services/bigquery");
const messaging_1 = require("../line/messaging");
// This is a placeholder. In reality, we'd use Gemini 3.1 Pro to generate personalized copy
// based on the specific segments that the user falls into.
const generateMessageForSegment = (segment) => {
    switch (segment) {
        case 'VIP':
            return 'Thank you for your continued support! Here is a 20% discount on early access items.';
        case 'CART_ABANDONER':
            return 'Did you forget something? Complete your purchase now for 10% off.';
        case 'DORMANT':
            return 'We miss you! Check out these curated picks just for you.';
        default:
            return 'Check out our latest arrivals!';
    }
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
    // 3. Send targeted messages via LINE multicast
    for (const [segment, userIds] of Object.entries(segments)) {
        if (userIds.length > 0) {
            const messageText = generateMessageForSegment(segment);
            console.log(`Sending to ${userIds.length} users in segment ${segment}`);
            await (0, messaging_1.sendTargetedMessage)(userIds, messageText);
        }
    }
    console.log('Segmentation job complete.');
};
exports.runSegmentationJob = runSegmentationJob;
