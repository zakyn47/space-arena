import { BOOSTER_REPAIR_SHARE, SPEED_BOOST_DURATION, WORLD_SIZE, zoneAt, type BoosterKind } from '@arena/shared';
import type { ShipEntity } from './entities';

export function randomBoosterSpot(rng: () => number): { readonly x: number; readonly y: number } {
  for (;;) {
    const spot = { x: rng() * WORLD_SIZE, y: rng() * WORLD_SIZE };
    if (!zoneAt(spot.x, spot.y)) return spot;
  }
}

export function randomBoosterKind(rng: () => number): BoosterKind {
  return rng() < 0.5 ? 'repair' : 'speed';
}

// A repair booster is left in place for someone who needs it when the ship is already at full hull.
export function applyBooster(ship: ShipEntity, kind: BoosterKind, time: number): boolean {
  if (kind === 'speed') {
    ship.speedBoostUntil = time + SPEED_BOOST_DURATION;
    return true;
  }
  if (ship.hull >= ship.stats.maxHull) return false;
  ship.hull = Math.min(ship.stats.maxHull, ship.hull + ship.stats.maxHull * BOOSTER_REPAIR_SHARE);
  return true;
}
