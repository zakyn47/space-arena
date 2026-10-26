import { describe, expect, it } from 'vitest';
import { skinUnlocked } from '../src';

describe('skinUnlocked', () => {
  it('always allows the standard look', () => {
    expect(skinUnlocked('standard', 0)).toBe(true);
  });

  it('unlocks chrome at 100 PvP kills and stealth at 1000', () => {
    expect(skinUnlocked('chrome', 99)).toBe(false);
    expect(skinUnlocked('chrome', 100)).toBe(true);
    expect(skinUnlocked('stealth', 999)).toBe(false);
    expect(skinUnlocked('stealth', 1_000)).toBe(true);
  });
});
