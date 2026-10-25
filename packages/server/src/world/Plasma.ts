import { PLASMA_DAMAGE, PLASMA_LIFETIME, PLASMA_SPEED, forward } from '@arena/shared';
import type { PlasmaEntity, ShipEntity } from './entities';

export function firePlasma(ship: ShipEntity, id: number, time: number): PlasmaEntity {
  const direction = forward(ship.angle);
  const x = ship.x + direction.x * ship.radius;
  const y = ship.y + direction.y * ship.radius;
  return {
    kind: 'plasma',
    id,
    ownerId: ship.id,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: direction.x * PLASMA_SPEED,
    vy: direction.y * PLASMA_SPEED,
    angle: ship.angle,
    damage: PLASMA_DAMAGE,
    fromNpc: ship.npc !== null,
    expiresAt: time + PLASMA_LIFETIME,
  };
}
