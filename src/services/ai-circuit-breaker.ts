/**
 * Time-windowed AI circuit breaker.
 *
 * Design adapted from clawframework's _retry_delay() exponential-backoff
 * pattern (clawframework/main.py) — extended with half-open probe state
 * so that a transient Vertex AI 404 / 429 does not permanently disable
 * the AI layer for the lifetime of the process.
 *
 * States:
 *   closed    → normal operation; requests flow through
 *   open      → failure recorded; requests are rejected for backoffMs
 *   half-open → backoff expired; next call is a probe attempt
 *               success → closed, failure → open again (reset timer)
 *
 * Usage:
 *   const circuit = new AiCircuitBreaker({ backoffMs: 5 * 60_000 });
 *   if (circuit.canAttempt()) {
 *     try { ... circuit.recordSuccess(); }
 *     catch { circuit.recordFailure(); }
 *   }
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface AiCircuitBreakerOptions {
  /** How long to stay open after a failure before allowing a probe (ms). Default 5 min. */
  backoffMs?: number;
  /** Minimum interval between consecutive probe attempts in half-open state (ms). Default 60 s. */
  halfOpenProbeIntervalMs?: number;
}

export class AiCircuitBreaker {
  private state: CircuitState = 'closed';
  private failedAt = 0;
  private lastProbeAt = 0;
  private readonly backoffMs: number;
  private readonly halfOpenProbeIntervalMs: number;

  constructor(options: AiCircuitBreakerOptions = {}) {
    this.backoffMs = options.backoffMs ?? 5 * 60_000;
    this.halfOpenProbeIntervalMs = options.halfOpenProbeIntervalMs ?? 60_000;
  }

  get currentState(): CircuitState {
    return this.state;
  }

  /**
   * Returns true if a call attempt is permitted right now.
   * Automatically transitions open → half-open when the backoff window expires.
   */
  canAttempt(): boolean {
    const now = Date.now();

    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      if (now - this.failedAt >= this.backoffMs) {
        this.state = 'half-open';
      } else {
        return false;
      }
    }

    // half-open: rate-limit probes so we don't flood on every message
    if (this.state === 'half-open') {
      if (now - this.lastProbeAt >= this.halfOpenProbeIntervalMs) {
        this.lastProbeAt = now;
        return true;
      }
      return false;
    }

    return false;
  }

  /** Call after a successful API response — resets circuit to closed. */
  recordSuccess(): void {
    this.state = 'closed';
    this.failedAt = 0;
    this.lastProbeAt = 0;
  }

  /**
   * Call after a retriable API failure (404 / 429 / 503).
   * Reopens the circuit and resets the backoff timer.
   */
  recordFailure(): void {
    this.state = 'open';
    this.failedAt = Date.now();
  }

  /** Diagnostic snapshot — safe to include in ops health endpoints. */
  statusSnapshot(): {
    state: CircuitState;
    failedAt: string | null;
    reopensAt: string | null;
  } {
    return {
      state: this.state,
      failedAt: this.failedAt ? new Date(this.failedAt).toISOString() : null,
      reopensAt:
        this.state === 'open'
          ? new Date(this.failedAt + this.backoffMs).toISOString()
          : null,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton instances — one per AI provider tier
// ---------------------------------------------------------------------------

/** Tier-1: Gemini AI Studio + Vertex AI — 5-min backoff window */
export const geminiCircuit = new AiCircuitBreaker({ backoffMs: 5 * 60_000 });

/**
 * Tier-3: ClawFramework bridge (Groq / OpenRouter) — 10-min backoff.
 * This circuit is only ever consulted when CLAWFRAMEWORK_ENABLED=true
 * and NODE_ENV !== 'production'.
 */
export const clawCircuit = new AiCircuitBreaker({ backoffMs: 10 * 60_000 });
