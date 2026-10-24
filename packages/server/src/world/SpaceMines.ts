import { MINE_ARM_TIME, MINE_BLAST_RADIUS, MINE_LIFETIME, MINE_TRIGGER_RADIUS, SHIP_RADIUS, forward } from '@arena/shared';
import type { ShipEntity, SpaceMineEntity } from './entities';

const DROP_GAP = 12;

// Thresholds are tuned for a normal ship's center; larger ships are measured from their hull edge.
function reach(mine: SpaceMineEntity, ship: ShipEntity): number {
  return Math.hypot(ship.x - mine.x, ship.y - mine.y) - (ship.radius - SHIP_RADIUS);
}

function canBeHit(mine: SpaceMineEntity, ship: ShipEntity): boolean {
  return ship.id !== mine.ownerId && !ship.docked;
}

export function dropMine(ship: ShipEntity, id: number, time: number): SpaceMineEntity {
  const direction = forward(ship.angle);
  const behind = SHIP_RADIUS + DROP_GAP;
  return {
    kind: 'spaceMine',
    id,
    ownerId: ship.id,
    x: ship.x - direction.x * behind,
    y: ship.y - direction.y * behind,
    armedAt: time + MINE_ARM_TIME,
    expiresAt: time + MINE_LIFETIME,
  };
}

export function triggeredBy(mine: SpaceMineEntity, ship: ShipEntity, time: number): boolean {
  return time >= mine.armedAt && canBeHit(mine, ship) && reach(mine, ship) <= MINE_TRIGGER_RADIUS;
}

export function blastVictims(mine: SpaceMineEntity, ships: Iterable<ShipEntity>): ShipEntity[] {
  return [...ships].filter((ship) => canBeHit(mine, ship) && reach(mine, ship) <= MINE_BLAST_RADIUS);
}
