import { ASTEROID_MAX_RADIUS, ASTEROID_MIN_RADIUS, WORLD_SIZE, distanceToNearestZone } from '@arena/shared';
import type { AsteroidEntity } from './entities';

export type AsteroidFields = Omit<AsteroidEntity, 'kind' | 'id'>;

const ZONE_CLEARANCE = 300;
const RICHNESS_DISTANCE = 8_000;
const MIN_YIELD = 2;
const BONUS_YIELD = 6;
const VARIANTS = 4;

export function oreYieldAt(clearance: number): number {
  return MIN_YIELD + Math.floor(BONUS_YIELD * Math.min(1, Math.max(0, clearance) / RICHNESS_DISTANCE));
}

export function randomAsteroid(rng: () => number): AsteroidFields {
  for (;;) {
    const x = rng() * WORLD_SIZE;
    const y = rng() * WORLD_SIZE;
    const clearance = distanceToNearestZone(x, y);
    if (clearance < ZONE_CLEARANCE) continue;
    const radius = ASTEROID_MIN_RADIUS + rng() * (ASTEROID_MAX_RADIUS - ASTEROID_MIN_RADIUS);
    return {
      x,
      y,
      radius,
      hp: Math.round(radius * 2),
      oreYield: oreYieldAt(clearance),
      variant: 1 + Math.min(VARIANTS - 1, Math.floor(rng() * VARIANTS)),
    };
  }
}

export function scatterOre(asteroid: AsteroidFields, rng: () => number): { x: number; y: number }[] {
  return Array.from({ length: asteroid.oreYield }, () => {
    const angle = rng() * Math.PI * 2;
    const distance = rng() * asteroid.radius;
    return { x: asteroid.x + Math.cos(angle) * distance, y: asteroid.y + Math.sin(angle) * distance };
  });
}
