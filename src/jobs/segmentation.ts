import { getCohortData, UserCohortData } from '../services/bigquery';
import { sendTargetedMessage } from '../line/messaging';

// This is a placeholder. In reality, we'd use Gemini 3.1 Pro to generate personalized copy
// based on the specific segments that the user falls into.
const generateMessageForSegment = (segment: string): string => {
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
}

export const runSegmentationJob = async () => {
    console.log('Starting nightly segmentation job...');
    
    // 1. Fetch cohort data from BigQuery
    const cohorts = await getCohortData();
    if (!cohorts.length) {
        console.log('No real cohort data found. Segmentation job skipped.');
        return;
    }
    
    // 2. Process and map to segments
    const segments: Record<string, string[]> = {
        VIP: [],
        CART_ABANDONER: [],
        DORMANT: [],
        GENERAL: []
    };

    cohorts.forEach(user => {
        if (user.totalPurchases >= 5) {
            segments.VIP.push(user.userId);
        } else if (user.lastActiveDaysAgo >= 30) {
            segments.DORMANT.push(user.userId);
        } else if (user.browsePurchaseRatio > 0.5) {
            segments.CART_ABANDONER.push(user.userId);
        } else {
            segments.GENERAL.push(user.userId);
        }
    });

    // 3. Send targeted messages via LINE multicast
    for (const [segment, userIds] of Object.entries(segments)) {
        if (userIds.length > 0) {
            const messageText = generateMessageForSegment(segment);
            console.log(`Sending to ${userIds.length} users in segment ${segment}`);
            await sendTargetedMessage(userIds, messageText);
        }
    }

    console.log('Segmentation job complete.');
};
