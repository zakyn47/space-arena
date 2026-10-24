import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../src/constants';
import { clampToWorld, distanceToNearestZone, nearestZone, zoneAt } from '../src/world';

describe('zoneAt', () => {
  it('finds the zone containing a point', () => {
    expect(zoneAt(4_000, 4_100)?.id).toBe('alpha');
  });

  it('returns undefined in open space', () => {
    expect(zoneAt(8_000, 8_000)).toBeUndefined();
  });
});

describe('nearestZone', () => {
  it('picks the closest zone', () => {
    expect(nearestZone(15_000, 6_000).id).toBe('beta');
  });
});

describe('distanceToNearestZone', () => {
  it('measures to the zone edge', () => {
    expect(distanceToNearestZone(4_000, 5_800)).toBeCloseTo(1_000);
  });

  it('is negative inside a zone', () => {
    expect(distanceToNearestZone(4_000, 4_000)).toBeCloseTo(-800);
  });
});

describe('clampToWorld', () => {
  it('clamps into world bounds', () => {
    expect(clampToWorld(-5)).toBe(0);
    expect(clampToWorld(WORLD_SIZE + 5)).toBe(WORLD_SIZE);
    expect(clampToWorld(123)).toBe(123);
  });
});
