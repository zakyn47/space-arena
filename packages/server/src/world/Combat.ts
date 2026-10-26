import {
  BOUNTY_BASE,
  BOUNTY_SHARE,
  BULLET_LIFETIME,
  SHIELD_DISRUPTION,
  SHIELD_LOCKOUT,
  SHIP_RADIUS,
  WEAPON_SPACING,
  buildValue,
  forward,
  type Build,
  type HitBlock,
  type NpcKind,
} from '@arena/shared';
import type { BulletEntity, ShipEntity } from './entities';

export const PIRATE_DAMAGE_SCALE = 0.7;

const DAMAGE_SCALE: Readonly<Record<NpcKind, number>> = {
  raider: PIRATE_DAMAGE_SCALE,
  marauder: PIRATE_DAMAGE_SCALE,
  warlord: PIRATE_DAMAGE_SCALE,
  leviathan: 1,
};

export function scaledDamage(ship: ShipEntity, damage: number): number {
  return ship.npc === null ? damage : damage * DAMAGE_SCALE[ship.npc];
}

export function disruptShield(ship: ShipEntity, time: number): void {
  ship.shieldUp = false;
  ship.shieldDisruptedUntil = time + SHIELD_DISRUPTION;
}

export function updateShield(ship: ShipEntity, dt: number, inSafeZone: boolean, time: number): void {
  ship.shieldLockout = Math.max(0, ship.shieldLockout - dt);
  const disrupted = time < ship.shieldDisruptedUntil;
  const raising = ship.input.shield && !inSafeZone && !disrupted && ship.shieldLockout === 0 && ship.shieldEnergy > 0;
  if (!raising) {
    ship.shieldUp = false;
    if (!disrupted) ship.shieldEnergy = Math.min(ship.stats.maxShield, ship.shieldEnergy + ship.stats.shieldRegen * dt);
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
      damage: scaledDamage(ship, weapon.damage),
      weaponId: weapon.gearId,
      mk: weapon.mk,
      fromNpc: ship.npc !== null,
      expiresAt: time + BULLET_LIFETIME,
    });
  });
  return bullets;
}

export function applyDamage(ship: ShipEntity, damage: number, attackerId: number, time: number): HitBlock {
  if (ship.shieldUp) return 'shield';
  ship.lastDamagedAt = time;
  ship.lastHitBy = attackerId;
  if (ship.darkMatter > 0) {
    ship.darkMatter = Math.max(0, ship.darkMatter - damage);
    return 'dark_matter';
  }
  ship.hull -= damage;
  return 'hull';
}

export function bountyFor(build: Build): number {
  return BOUNTY_BASE + Math.floor(buildValue(build) * BOUNTY_SHARE);
}
