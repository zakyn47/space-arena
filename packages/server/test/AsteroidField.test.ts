import { ASTEROID_MAX_RADIUS, ASTEROID_MIN_RADIUS, distanceToNearestZone } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { oreYieldAt, randomAsteroid, scatterOre } from '../src/world/AsteroidField';
import { seeded } from './support/fixtures';

describe('randomAsteroid', () => {
  it('stays clear of safe zones and within size bounds', () => {
    const rng = seeded(42);
    for (let i = 0; i < 1_000; i += 1) {
      const asteroid = randomAsteroid(rng);
      expect(distanceToNearestZone(asteroid.x, asteroid.y)).toBeGreaterThanOrEqual(300);
      expect(asteroid.radius).toBeGreaterThanOrEqual(ASTEROID_MIN_RADIUS);
      expect(asteroid.radius).toBeLessThanOrEqual(ASTEROID_MAX_RADIUS);
      expect(asteroid.variant).toBeGreaterThanOrEqual(1);
      expect(asteroid.variant).toBeLessThanOrEqual(4);
    }
  });
});

describe('oreYieldAt', () => {
  it('grows with distance from zones and caps', () => {
    expect(oreYieldAt(0)).toBe(2);
    expect(oreYieldAt(4_000)).toBe(5);
    expect(oreYieldAt(8_000)).toBe(8);
    expect(oreYieldAt(20_000)).toBe(8);
  });
});

describe('scatterOre', () => {
  it('places one pickup per yield inside the asteroid', () => {
    const asteroid = { x: 100, y: 100, radius: 40, hp: 1, oreYield: 3, variant: 1 };
    const points = scatterOre(asteroid, seeded(1));
    expect(points).toHaveLength(3);
    for (const point of points) expect(Math.hypot(point.x - 100, point.y - 100)).toBeLessThanOrEqual(40);
  });
});
