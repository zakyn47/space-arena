import {
  LEVIATHAN_AGGRO_RANGE,
  LEVIATHAN_CREDITS,
  LEVIATHAN_FIRE_INTERVAL,
  LEVIATHAN_ORE,
  LEVIATHAN_PATROL_RADIUS,
  LEVIATHAN_REGEN,
  LEVIATHAN_REGEN_CLEAR_RANGE,
  LEVIATHAN_RESPAWN,
  LEVIATHAN_SPREAD,
  WORLD_SIZE,
} from '@arena/shared';
import type { ShipEntity } from '../entities';
import { randomGear, type CrateDrop } from '../Loot';
import { isValidTarget, steerToward, type Point } from '../pirates/PirateBrain';

export const ARENA_CENTER: Point = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };

const WAYPOINT_REACHED = 150;
const PATROL_SPEED_SHARE = 0.7;

export interface BossHost {
  spawnLeviathan(x: number, y: number): ShipEntity;
  ship(id: number): ShipEntity | undefined;
  players(): Iterable<ShipEntity>;
  fireOrb(from: ShipEntity, angle: number): void;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function headingTo(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, from.y - to.y);
}

function clampToPatrol(point: Point): Point {
  const gap = distance(point, ARENA_CENTER);
  if (gap <= LEVIATHAN_PATROL_RADIUS) return point;
  const scale = LEVIATHAN_PATROL_RADIUS / gap;
  return { x: ARENA_CENTER.x + (point.x - ARENA_CENTER.x) * scale, y: ARENA_CENTER.y + (point.y - ARENA_CENTER.y) * scale };
}

export class BossDirector {
  private bossId: number | null = null;
  private respawnAt = 0;
  private fireCooldown = LEVIATHAN_FIRE_INTERVAL;
  private waypoint: Point = ARENA_CENTER;
  goal: Point = ARENA_CENTER;

  constructor(private readonly rng: () => number) {}

  step(host: BossHost, time: number, dt: number): void {
    const boss = this.bossId === null ? undefined : host.ship(this.bossId);
    if (!boss) {
      this.handleMissing(host, time);
      return;
    }
    const target = this.nearestTarget(host, boss);
    this.regenerate(host, boss, dt);
    this.goal = target ? clampToPatrol(target) : this.patrolGoal(boss);
    boss.input = steerToward(boss, this.goal, target ? boss.stats.maxSpeed : boss.stats.maxSpeed * PATROL_SPEED_SHARE);
    this.fire(host, boss, target, dt);
  }

  loot(): CrateDrop {
    return { credits: LEVIATHAN_CREDITS, ore: LEVIATHAN_ORE, gear: randomGear(this.rng, [3]) };
  }

  private handleMissing(host: BossHost, time: number): void {
    if (this.bossId !== null) {
      this.bossId = null;
      this.respawnAt = time + LEVIATHAN_RESPAWN;
    }
    if (time < this.respawnAt) return;
    this.bossId = host.spawnLeviathan(ARENA_CENTER.x, ARENA_CENTER.y).id;
    this.fireCooldown = LEVIATHAN_FIRE_INTERVAL;
    this.waypoint = ARENA_CENTER;
  }

  private nearestTarget(host: BossHost, boss: ShipEntity): ShipEntity | null {
    let best: ShipEntity | null = null;
    let bestDistance = LEVIATHAN_AGGRO_RANGE;
    for (const player of host.players()) {
      if (!isValidTarget(player)) continue;
      const gap = distance(boss, player);
      if (gap > bestDistance) continue;
      best = player;
      bestDistance = gap;
    }
    return best;
  }

  private regenerate(host: BossHost, boss: ShipEntity, dt: number): void {
    for (const player of host.players()) {
      if (distance(boss, player) <= LEVIATHAN_REGEN_CLEAR_RANGE) return;
    }
    boss.hull = Math.min(boss.stats.maxHull, boss.hull + LEVIATHAN_REGEN * dt);
  }

  private patrolGoal(boss: ShipEntity): Point {
    if (distance(boss, this.waypoint) > WAYPOINT_REACHED) return this.waypoint;
    const angle = this.rng() * Math.PI * 2;
    const radius = Math.sqrt(this.rng()) * LEVIATHAN_PATROL_RADIUS;
    this.waypoint = { x: ARENA_CENTER.x + Math.cos(angle) * radius, y: ARENA_CENTER.y + Math.sin(angle) * radius };
    return this.waypoint;
  }

  private fire(host: BossHost, boss: ShipEntity, target: ShipEntity | null, dt: number): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (!target || this.fireCooldown > 0) return;
    this.fireCooldown = LEVIATHAN_FIRE_INTERVAL;
    const bearing = headingTo(boss, target);
    for (const offset of [-LEVIATHAN_SPREAD / 2, 0, LEVIATHAN_SPREAD / 2]) host.fireOrb(boss, bearing + offset);
  }
}
