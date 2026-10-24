import { MINING_CONE } from '@arena/shared';
import type { AsteroidEntity, ShipEntity } from './entities';

function headingTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toX - fromX, fromY - toY);
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function canMine(ship: ShipEntity, inSafeZone: boolean): boolean {
  return (
    ship.input.mine &&
    ship.stats.miningRate > 0 &&
    !ship.input.fire &&
    !ship.shieldUp &&
    !ship.docked &&
    !inSafeZone &&
    ship.ore < ship.stats.cargoCapacity
  );
}

export function findMiningTarget(ship: ShipEntity, candidates: Iterable<AsteroidEntity>): AsteroidEntity | null {
  let best: AsteroidEntity | null = null;
  let bestGap = ship.stats.miningRange;
  for (const asteroid of candidates) {
    const gap = Math.hypot(asteroid.x - ship.x, asteroid.y - ship.y) - asteroid.radius;
    if (gap > bestGap) continue;
    const bearing = angleDelta(ship.angle, headingTo(ship.x, ship.y, asteroid.x, asteroid.y));
    if (Math.abs(bearing) > MINING_CONE) continue;
    best = asteroid;
    bestGap = gap;
  }
  return best;
}

export function mineStep(ship: ShipEntity, asteroid: AsteroidEntity, dt: number): void {
  if (ship.miningTargetId !== asteroid.id) {
    ship.miningTargetId = asteroid.id;
    ship.miningProgress = 0;
  }
  ship.miningProgress += ship.stats.miningRate * dt;
  while (ship.miningProgress >= 1 && asteroid.ore > 0 && ship.ore < ship.stats.cargoCapacity) {
    ship.miningProgress -= 1;
    asteroid.ore -= 1;
    ship.ore += 1;
  }
}
