import { describe, expect, it } from 'vitest';
import {
  BASE_LOADOUT,
  loadoutValue,
  nextTierCost,
  statsFor,
  upgradeCost,
  withUpgrade,
} from '../src/upgrades';

describe('statsFor', () => {
  it('returns spec base stats for the base loadout', () => {
    const stats = statsFor(BASE_LOADOUT);
    expect(stats.maxHull).toBe(100);
    expect(stats.thrust).toBe(200);
    expect(stats.maxSpeed).toBe(400);
    expect(stats.turnRate).toBeCloseTo(Math.PI);
    expect(stats.damage).toBe(10);
    expect(stats.fireRate).toBe(4);
    expect(stats.bulletSpeed).toBe(800);
    expect(stats.maxShield).toBe(100);
    expect(stats.shieldRegen).toBe(15);
    expect(stats.shieldDrain).toBe(30);
    expect(stats.cargoCapacity).toBe(20);
  });

  it('adds 22% per tier', () => {
    expect(statsFor({ ...BASE_LOADOUT, weapon: 2 }).damage).toBeCloseTo(14.4);
  });

  it('adds 10 cargo per cargo tier', () => {
    expect(statsFor({ ...BASE_LOADOUT, cargo: 3 }).cargoCapacity).toBe(50);
  });
});

describe('costs', () => {
  it('doubles per tier', () => {
    expect(upgradeCost('hull', 1)).toBe(200);
    expect(upgradeCost('hull', 3)).toBe(800);
  });

  it('rejects tiers out of range', () => {
    expect(() => upgradeCost('cargo', 4)).toThrow(RangeError);
    expect(() => upgradeCost('hull', 0)).toThrow(RangeError);
  });

  it('returns null at max tier', () => {
    expect(nextTierCost({ ...BASE_LOADOUT, cargo: 3 }, 'cargo')).toBeNull();
    expect(nextTierCost(BASE_LOADOUT, 'weapon')).toBe(250);
  });

  it('sums installed tiers', () => {
    expect(loadoutValue({ ...BASE_LOADOUT, hull: 2, weapon: 1 })).toBe(200 + 400 + 250);
  });

  it('increments one line', () => {
    expect(withUpgrade(BASE_LOADOUT, 'engine')).toEqual({ ...BASE_LOADOUT, engine: 1 });
  });
});
