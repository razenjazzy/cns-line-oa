/**
 * Shared runtime probes.
 *
 * Extracts the duplicate ~120-line runtime health-check block that
 * previously appeared identically in both /ops/workflow-audit and
 * /demo/workflow-audit inside src/index.ts.
 *
 * Usage:
 *   const probes = await runRuntimeProbes(rateStore, timeoutMs);
 *   // probes.firestore, probes.odoo, probes.rateLimiter
 */

import { checkFirestoreReady } from './firestore';
import { pingOdoo } from './odoo';
import { pingMongo } from '../infra/mongo/base-repository';
import { mongoUri } from '../http/env';
import { getRateLimitRuntimeStatus, type RateLimitStore } from './rate-limit-store';

export type ProbeResult = {
  name: string;
  ok: boolean;
  message: string;
};

export type RuntimeProbeResults = {
  firestore: ProbeResult;
  odoo: ProbeResult;
  rateLimiter: ProbeResult;
  mongo: ProbeResult;
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Runs Firestore, Odoo, and rate-limiter health probes in parallel,
 * each capped at `timeoutMs` milliseconds.
 *
 * Never throws — all errors are captured into the result objects so
 * callers can always build a complete status response.
 */
export const runRuntimeProbes = async (
  rateStore: RateLimitStore,
  timeoutMs: number,
): Promise<RuntimeProbeResults> => {
  const [firestore, odoo, rateLimiter, mongo] = await Promise.all([
    // Firestore probe
    withTimeout(checkFirestoreReady(), timeoutMs, 'Firestore check')
      .then((r): ProbeResult => ({ name: 'firestore', ok: r.ok, message: r.message }))
      .catch((e): ProbeResult => ({ name: 'firestore', ok: false, message: String(e) })),

    // Odoo probe
    withTimeout(pingOdoo(), timeoutMs, 'Odoo check')
      .then((msg): ProbeResult => ({
        name: 'odoo',
        ok: /connected successfully/i.test(msg),
        message: msg,
      }))
      .catch((e): ProbeResult => ({ name: 'odoo', ok: false, message: String(e) })),

    // Rate-limiter probe
    withTimeout(rateStore.healthCheck(), timeoutMs, 'Rate limit store check')
      .then((health): ProbeResult => {
        const runtime = getRateLimitRuntimeStatus();
        const degraded =
          runtime.configuredMode === 'redis' && runtime.activeBackend !== 'redis';
        return {
          name: 'rateLimiter',
          ok: health.ok && !degraded,
          message: degraded
            ? `Configured redis but active backend is ${runtime.activeBackend}${runtime.fallbackReason ? ` (${runtime.fallbackReason})` : ''}`
            : health.message,
        };
      })
      .catch((e): ProbeResult => ({ name: 'rateLimiter', ok: false, message: String(e) })),

    withTimeout(pingMongo(), timeoutMs, 'Mongo check')
      .then((r): ProbeResult => ({
        name: 'mongo',
        ok: !mongoUri || r.ok,
        message: r.message,
      }))
      .catch((e): ProbeResult => ({ name: 'mongo', ok: !mongoUri, message: String(e) })),
  ]);

  return { firestore, odoo, rateLimiter, mongo };
};

/**
 * Converts a RuntimeProbeResults into a flat array of failure strings,
 * ready to push into the `failures[]` array used by both audit endpoints.
 */
export const collectProbeFailures = (probes: RuntimeProbeResults): string[] => {
  const failures: string[] = [];
  if (!probes.firestore.ok) failures.push(`Firestore runtime probe failed: ${probes.firestore.message}`);
  if (!probes.odoo.ok) failures.push(`Odoo runtime probe failed: ${probes.odoo.message}`);
  if (!probes.rateLimiter.ok) failures.push(`Rate limiter runtime probe failed: ${probes.rateLimiter.message}`);
  if (mongoUri && !probes.mongo.ok) failures.push(`Mongo runtime probe failed: ${probes.mongo.message}`);
  return failures;
};
