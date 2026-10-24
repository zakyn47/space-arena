import {
  MINE_COOLDOWN,
  ROCKET_ACCELERATION,
  ROCKET_COOLDOWN,
  ROCKET_DAMAGE,
  ROCKET_LAUNCH_SPEED,
  ROCKET_LIFETIME,
  ROCKET_LOCK_CONE,
  ROCKET_LOCK_RANGE,
  ROCKET_MAX_SPEED,
  ROCKET_TURN_RATE,
  SHIP_RADIUS,
  forward,
  type Ordnance,
} from '@arena/shared';
import type { RocketEntity, ShipEntity } from './entities';

const COOLDOWN: Readonly<Record<Ordnance, number>> = { rockets: ROCKET_COOLDOWN, mines: MINE_COOLDOWN };

function headingTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toX - fromX, fromY - toY);
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function tryLaunch(ship: ShipEntity, dt: number, inSafeZone: boolean): boolean {
  ship.rocketCooldown = Math.max(0, ship.rocketCooldown - dt);
  if (!ship.input.rocket || ship.rockets <= 0 || ship.shieldUp || inSafeZone || ship.rocketCooldown > 0) return false;
  ship.rockets -= 1;
  ship.rocketCooldown = COOLDOWN[ship.ordnance];
  return true;
}

export function acquireTarget(shooter: ShipEntity, candidates: Iterable<ShipEntity>): ShipEntity | null {
  let best: ShipEntity | null = null;
  let bestDistance = ROCKET_LOCK_RANGE;
  for (const ship of candidates) {
    if (ship.id === shooter.id || ship.docked) continue;
    if (shooter.npc !== null && ship.npc !== null) continue;
    const distance = Math.hypot(ship.x - shooter.x, ship.y - shooter.y);
    if (distance > bestDistance) continue;
    const bearing = angleDelta(shooter.angle, headingTo(shooter.x, shooter.y, ship.x, ship.y));
    if (Math.abs(bearing) > ROCKET_LOCK_CONE) continue;
    best = ship;
    bestDistance = distance;
  }
  return best;
}

export function launchRocket(ship: ShipEntity, id: number, time: number, target: ShipEntity | null): RocketEntity {
  const direction = forward(ship.angle);
  const carried = Math.max(0, ship.vx * direction.x + ship.vy * direction.y);
  const speed = Math.min(ROCKET_MAX_SPEED, ROCKET_LAUNCH_SPEED + carried);
  const x = ship.x + direction.x * SHIP_RADIUS;
  const y = ship.y + direction.y * SHIP_RADIUS;
  return {
    kind: 'rocket',
    id,
    ownerId: ship.id,
    targetId: target?.id ?? null,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: direction.x * speed,
    vy: direction.y * speed,
    angle: ship.angle,
    speed,
    damage: ROCKET_DAMAGE,
    fromNpc: ship.npc !== null,
    expiresAt: time + ROCKET_LIFETIME,
  };
}

export function steerRocket(
  rocket: RocketEntity,
  target: { readonly x: number; readonly y: number } | undefined,
  dt: number,
): void {
  if (target) {
    const turn = angleDelta(rocket.angle, headingTo(rocket.x, rocket.y, target.x, target.y));
    const limit = ROCKET_TURN_RATE * dt;
    rocket.angle += Math.max(-limit, Math.min(limit, turn));
  }
  rocket.speed = Math.min(ROCKET_MAX_SPEED, rocket.speed + ROCKET_ACCELERATION * dt);
  const direction = forward(rocket.angle);
  rocket.vx = direction.x * rocket.speed;
  rocket.vy = direction.y * rocket.speed;
  rocket.prevX = rocket.x;
  rocket.prevY = rocket.y;
  rocket.x += rocket.vx * dt;
  rocket.y += rocket.vy * dt;
}
