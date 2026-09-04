import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

export type RateWindow = { count: number; resetAt: number };

export type RateLimitBackend = 'memory' | 'redis';

export type RateLimitStoreHealth = {
  backend: RateLimitBackend;
  ok: boolean;
  message: string;
};

export type RateLimitRuntimeStatus = {
  configuredMode: 'memory' | 'redis';
  activeBackend: RateLimitBackend;
  fallbackUsed: boolean;
  fallbackReason?: string;
  initializedAt: string;
};

let runtimeStatus: RateLimitRuntimeStatus = {
  configuredMode: 'memory',
  activeBackend: 'memory',
  fallbackUsed: false,
  initializedAt: new Date().toISOString(),
};

export const getRateLimitRuntimeStatus = (): RateLimitRuntimeStatus => ({ ...runtimeStatus });

export type RateLimitStore = {
  consume(key: string, windowMs: number, now: number): Promise<RateWindow>;
  sweep(now: number): Promise<void>;
  healthCheck(): Promise<RateLimitStoreHealth>;
};

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, RateWindow>();
  private lastSweepAt = 0;

  constructor(
    private readonly maxKeys: number,
    private readonly sweepIntervalMs: number,
  ) {}

  async consume(key: string, windowMs: number, now: number): Promise<RateWindow> {
    const found = this.store.get(key);
    if (!found || found.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.store.set(key, fresh);
      return fresh;
    }

    found.count += 1;
    this.store.set(key, found);
    return found;
  }

  async sweep(now: number): Promise<void> {
    if (now - this.lastSweepAt < this.sweepIntervalMs) return;
    this.lastSweepAt = now;

    for (const [key, value] of this.store.entries()) {
      if (value.resetAt <= now) {
        this.store.delete(key);
      }
    }

    if (this.store.size <= this.maxKeys) return;

    const overflow = this.store.size - this.maxKeys;
    let removed = 0;
    for (const key of this.store.keys()) {
      this.store.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }

  async healthCheck(): Promise<RateLimitStoreHealth> {
    return {
      backend: 'memory',
      ok: true,
      message: 'In-memory rate limit store active.',
    };
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: RedisClient,
    private readonly keyPrefix: string,
  ) {}

  async consume(key: string, windowMs: number, now: number): Promise<RateWindow> {
    const fullKey = `${this.keyPrefix}${key}`;
    const rawResult = await this.client.eval(
      `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`,
      {
        keys: [fullKey],
        arguments: [String(windowMs)],
      },
    );

    const result = rawResult as number[];
    const count = Number(result?.[0] ?? 1);
    const ttlMs = Math.max(1, Number(result?.[1] ?? windowMs));
    return {
      count,
      resetAt: now + ttlMs,
    };
  }

  async sweep(_now: number): Promise<void> {
    // Redis TTL handles key expiry automatically.
  }

  async healthCheck(): Promise<RateLimitStoreHealth> {
    try {
      await this.client.ping();
      return {
        backend: 'redis',
        ok: true,
        message: 'Redis rate limit store reachable.',
      };
    } catch (error) {
      return {
        backend: 'redis',
        ok: false,
        message: `Redis rate limit store unreachable: ${String(error)}`,
      };
    }
  }
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const createRateLimitStoreFromEnv = async (
  fallbackStore: InMemoryRateLimitStore,
): Promise<RateLimitStore> => {
  const mode = (process.env.RATE_LIMIT_STORE || 'memory').trim().toLowerCase();
  if (mode !== 'redis') {
    runtimeStatus = {
      configuredMode: 'memory',
      activeBackend: 'memory',
      fallbackUsed: false,
      initializedAt: new Date().toISOString(),
    };
    return fallbackStore;
  }

  const redisUrl = (process.env.REDIS_URL || '').trim();
  if (!redisUrl) {
    console.warn('RATE_LIMIT_STORE=redis but REDIS_URL is missing. Falling back to in-memory rate limit store.');
    runtimeStatus = {
      configuredMode: 'redis',
      activeBackend: 'memory',
      fallbackUsed: true,
      fallbackReason: 'REDIS_URL missing',
      initializedAt: new Date().toISOString(),
    };
    return fallbackStore;
  }

  const redisPrefix = process.env.RATE_LIMIT_REDIS_PREFIX || 'rl:';
  const connectTimeoutMs = Number(process.env.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS || 3000);
  const client = createClient({ url: redisUrl });

  try {
    client.on('error', (error) => {
      console.warn('Redis rate-limit client error:', String(error));
    });

    await withTimeout(client.connect(), connectTimeoutMs);
    console.log('Redis rate-limit store connected.');
    runtimeStatus = {
      configuredMode: 'redis',
      activeBackend: 'redis',
      fallbackUsed: false,
      initializedAt: new Date().toISOString(),
    };
    return new RedisRateLimitStore(client, redisPrefix);
  } catch (error) {
    console.warn('Failed to initialize Redis rate-limit store, using in-memory fallback:', String(error));
    runtimeStatus = {
      configuredMode: 'redis',
      activeBackend: 'memory',
      fallbackUsed: true,
      fallbackReason: String(error),
      initializedAt: new Date().toISOString(),
    };
    try {
      client.disconnect();
    } catch {
      // ignore best-effort cleanup
    }
    return fallbackStore;
  }
};
