export interface RateLimitOptions {
  /** Maximum allowed requests within the time window. Default: 5. */
  readonly maxRequests?: number;
  /** Sliding window duration in milliseconds. Default: 60,000 ms (1 minute). */
  readonly windowMs?: number;
}

export interface RateLimitStatus {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAfterMs: number;
}

/**
 * In-Memory Sliding-Window Rate Limiter.
 * Scoped strictly per student ID on interactive inspection routes (/check).
 */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly requestsByStudent = new Map<string, number[]>();

  constructor(options?: RateLimitOptions) {
    this.maxRequests = options?.maxRequests ?? 5;
    this.windowMs = options?.windowMs ?? 60_000;
  }

  /**
   * Consume a rate limit token for a given student ID.
   * Returns rate limit status and remaining quota.
   */
  public consume(studentId: string, now = Date.now()): RateLimitStatus {
    const windowStart = now - this.windowMs;
    const history = this.requestsByStudent.get(studentId) ?? [];

    // Filter out timestamps outside the active sliding window
    const recent = history.filter((t) => t > windowStart);

    if (recent.length >= this.maxRequests) {
      const oldest = recent[0]!;
      const resetAfterMs = Math.max(0, oldest + this.windowMs - now);
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetAfterMs,
      };
    }

    recent.push(now);
    this.requestsByStudent.set(studentId, recent);

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - recent.length,
      resetAfterMs: this.windowMs,
    };
  }

  /**
   * Clear rate limit history (useful for test isolation).
   */
  public reset(studentId?: string): void {
    if (studentId) {
      this.requestsByStudent.delete(studentId);
    } else {
      this.requestsByStudent.clear();
    }
  }
}
