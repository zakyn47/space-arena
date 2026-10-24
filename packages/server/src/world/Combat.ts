import {
  BOUNTY_BASE,
  BOUNTY_SHARE,
  BULLET_LIFETIME,
  SHIELD_LOCKOUT,
  SHIP_RADIUS,
  forward,
  loadoutValue,
  type Loadout,
} from '@arena/shared';
import type { BulletEntity, ShipEntity } from './entities';

export function updateShield(ship: ShipEntity, dt: number, inSafeZone: boolean): void {
  ship.shieldLockout = Math.max(0, ship.shieldLockout - dt);
  const raising = ship.input.shield && !inSafeZone && ship.shieldLockout === 0 && ship.shieldEnergy > 0;
  if (!raising) {
    ship.shieldUp = false;
    ship.shieldEnergy = Math.min(ship.stats.maxShield, ship.shieldEnergy + ship.stats.shieldRegen * dt);
    return;
  }
  ship.shieldUp = true;
  ship.shieldEnergy -= ship.stats.shieldDrain * dt;
  if (ship.shieldEnergy > 0) return;
  ship.shieldEnergy = 0;
  ship.shieldUp = false;
  ship.shieldLockout = SHIELD_LOCKOUT;
}

export function tryFire(
  ship: ShipEntity,
  dt: number,
  inSafeZone: boolean,
  time: number,
  nextId: () => number,
): BulletEntity | null {
  ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
  if (!ship.input.fire || ship.shieldUp || inSafeZone || ship.fireCooldown > 0) return null;
  ship.fireCooldown = 1 / ship.stats.fireRate;
  const direction = forward(ship.angle);
  const x = ship.x + direction.x * SHIP_RADIUS;
  const y = ship.y + direction.y * SHIP_RADIUS;
  return {
    kind: 'bullet',
    id: nextId(),
    ownerId: ship.id,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: ship.vx + direction.x * ship.stats.bulletSpeed,
    vy: ship.vy + direction.y * ship.stats.bulletSpeed,
    damage: ship.stats.damage,
    tier: ship.loadout.weapon,
    expiresAt: time + BULLET_LIFETIME,
  };
}

export function applyHit(ship: ShipEntity, bullet: BulletEntity, time: number): void {
  if (ship.shieldUp) return;
  ship.hull -= bullet.damage;
  ship.lastDamagedAt = time;
  ship.lastHitBy = bullet.ownerId;
}

export function bountyFor(loadout: Loadout): number {
  return BOUNTY_BASE + Math.floor(loadoutValue(loadout) * BOUNTY_SHARE);
}
