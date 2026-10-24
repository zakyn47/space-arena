interface Bucket {
  readonly tokens: number;
  readonly updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
  ) {}

  tryConsume(key: string, now: number): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs);
    const allowed = tokens >= 1;
    this.buckets.set(key, { tokens: allowed ? tokens - 1 : tokens, updatedAt: now });
    return allowed;
  }
}
