import {
  BOUNTY_BASE,
  BOUNTY_SHARE,
  BULLET_LIFETIME,
  SHIELD_LOCKOUT,
  SHIP_RADIUS,
  WEAPON_SPACING,
  buildValue,
  forward,
  type Build,
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

export function fireWeapons(
  ship: ShipEntity,
  dt: number,
  inSafeZone: boolean,
  time: number,
  nextId: () => number,
): BulletEntity[] {
  const weapons = ship.stats.weapons;
  ship.weaponCooldowns = weapons.map((_, index) => Math.max(0, (ship.weaponCooldowns[index] ?? 0) - dt));
  if (!ship.input.fire || ship.shieldUp || inSafeZone) return [];
  const direction = forward(ship.angle);
  const right = { x: -direction.y, y: direction.x };
  const bullets: BulletEntity[] = [];
  weapons.forEach((weapon, index) => {
    if ((ship.weaponCooldowns[index] ?? 0) > 0) return;
    ship.weaponCooldowns[index] = 1 / weapon.fireRate;
    const offset = (index - (weapons.length - 1) / 2) * WEAPON_SPACING;
    const x = ship.x + direction.x * SHIP_RADIUS + right.x * offset;
    const y = ship.y + direction.y * SHIP_RADIUS + right.y * offset;
    bullets.push({
      kind: 'bullet',
      id: nextId(),
      ownerId: ship.id,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: ship.vx + direction.x * weapon.bulletSpeed,
      vy: ship.vy + direction.y * weapon.bulletSpeed,
      damage: weapon.damage,
      weaponId: weapon.gearId,
      mk: weapon.mk,
      expiresAt: time + BULLET_LIFETIME,
    });
  });
  return bullets;
}

export function applyDamage(ship: ShipEntity, damage: number, attackerId: number, time: number): void {
  if (ship.shieldUp) return;
  ship.hull -= damage;
  ship.lastDamagedAt = time;
  ship.lastHitBy = attackerId;
}

export function bountyFor(build: Build): number {
  return BOUNTY_BASE + Math.floor(buildValue(build) * BOUNTY_SHARE);
}
