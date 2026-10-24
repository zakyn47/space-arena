import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/auth/RateLimiter';

describe('RateLimiter', () => {
  it('allows a burst up to capacity then blocks', () => {
    const limiter = new RateLimiter(2, 0.001);
    expect(limiter.tryConsume('ip', 0)).toBe(true);
    expect(limiter.tryConsume('ip', 0)).toBe(true);
    expect(limiter.tryConsume('ip', 0)).toBe(false);
  });

  it('refills over time', () => {
    const limiter = new RateLimiter(1, 0.001);
    expect(limiter.tryConsume('ip', 0)).toBe(true);
    expect(limiter.tryConsume('ip', 500)).toBe(false);
    expect(limiter.tryConsume('ip', 1_500)).toBe(true);
  });

  it('tracks keys separately', () => {
    const limiter = new RateLimiter(1, 0.001);
    expect(limiter.tryConsume('a', 0)).toBe(true);
    expect(limiter.tryConsume('b', 0)).toBe(true);
  });
});
