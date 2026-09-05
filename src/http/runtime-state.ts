import { InMemoryRateLimitStore, type RateLimitStore } from '../services/rate-limit-store';

const RATE_STORE_MAX_KEYS = Number(process.env.RATE_STORE_MAX_KEYS || 50000);

// Module-scope singleton — same pattern as the pre-split src/index.ts had
// (a mutable `let` reassigned once by startServer() after the async
// createRateLimitStoreFromEnv() resolves). Every route module reads the
// *current* store via getRateStore(), never a value captured at import
// time, so the post-startup reassignment is visible everywhere.
export const fallbackRateStore = new InMemoryRateLimitStore(RATE_STORE_MAX_KEYS, 60_000);
let rateStore: RateLimitStore = fallbackRateStore;

export const getRateStore = (): RateLimitStore => rateStore;
export const setRateStore = (store: RateLimitStore): void => {
    rateStore = store;
};
