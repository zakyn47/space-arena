import {
  IDLE_INPUT,
  RESPAWN_ROCKETS,
  STARTER_BUILD,
  statsFor,
  type Build,
  type GearId,
  type Mk,
  type InstalledGear,
  type PirateTier,
  type ShipInput,
  type ShipStats,
} from '@arena/shared';
import type { ShipRecord } from '../db/PlayerRepository';

export interface QueuedInput {
  readonly seq: number;
  readonly input: ShipInput;
}

export interface ShipEntity {
  readonly kind: 'ship';
  readonly id: number;
  readonly accountId: number;
  readonly name: string;
  npc: PirateTier | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  build: Build;
  stats: ShipStats;
  hull: number;
  shieldEnergy: number;
  shieldUp: boolean;
  shieldLockout: number;
  weaponCooldowns: number[];
  ore: number;
  carriedCredits: number;
  bankedCredits: number;
  rockets: number;
  rocketCooldown: number;
  dockCooldownUntil: number;
  lastDamagedAt: number;
  lastHitBy: number | null;
  input: ShipInput;
  inputQueue: QueuedInput[];
  lastSeq: number;
  docked: boolean;
  lingerUntil: number | null;
  salvage: InstalledGear[];
  miningProgress: number;
  miningTargetId: number | null;
}

export interface BulletEntity {
  readonly kind: 'bullet';
  readonly id: number;
  readonly ownerId: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly weaponId: GearId;
  readonly mk: Mk;
  readonly fromNpc: boolean;
  readonly expiresAt: number;
}

export interface RocketEntity {
  readonly kind: 'rocket';
  readonly id: number;
  readonly ownerId: number;
  readonly targetId: number | null;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  readonly damage: number;
  readonly fromNpc: boolean;
  readonly expiresAt: number;
}

export type Projectile = BulletEntity | RocketEntity;

export interface AsteroidEntity {
  readonly kind: 'asteroid';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  hp: number;
  readonly oreYield: number;
  ore: number;
  readonly variant: number;
}

export interface OreEntity {
  readonly kind: 'ore';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly expiresAt: number;
}

export interface CrateEntity {
  readonly kind: 'crate';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly ore: number;
  readonly credits: number;
  readonly expiresAt: number;
}

export type WorldEntity = ShipEntity | BulletEntity | RocketEntity | AsteroidEntity | OreEntity | CrateEntity;

export function createShip(id: number, accountId: number, name: string, record: ShipRecord): ShipEntity {
  const stats = statsFor(record.build);
  return {
    kind: 'ship',
    id,
    accountId,
    name,
    npc: null,
    x: record.x,
    y: record.y,
    vx: 0,
    vy: 0,
    angle: 0,
    build: record.build,
    stats,
    hull: stats.maxHull,
    shieldEnergy: stats.maxShield,
    shieldUp: false,
    shieldLockout: 0,
    weaponCooldowns: stats.weapons.map(() => 0),
    ore: 0,
    carriedCredits: 0,
    bankedCredits: record.bankedCredits,
    rockets: record.rockets,
    rocketCooldown: 0,
    dockCooldownUntil: -Infinity,
    lastDamagedAt: -Infinity,
    lastHitBy: null,
    input: IDLE_INPUT,
    inputQueue: [],
    lastSeq: 0,
    docked: false,
    lingerUntil: null,
    salvage: [...record.salvage],
    miningProgress: 0,
    miningTargetId: null,
  };
}

export function respawnShip(ship: ShipEntity, x: number, y: number): void {
  const stats = statsFor(STARTER_BUILD);
  Object.assign(ship, {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    build: STARTER_BUILD,
    stats,
    hull: stats.maxHull,
    shieldEnergy: stats.maxShield,
    shieldUp: false,
    shieldLockout: 0,
    weaponCooldowns: stats.weapons.map(() => 0),
    ore: 0,
    carriedCredits: 0,
    rockets: RESPAWN_ROCKETS,
    rocketCooldown: 0,
    dockCooldownUntil: -Infinity,
    lastDamagedAt: -Infinity,
    lastHitBy: null,
    docked: false,
    salvage: [],
    miningProgress: 0,
    miningTargetId: null,
  } satisfies Partial<ShipEntity>);
}

export function toShipRecord(ship: ShipEntity): ShipRecord {
  return {
    accountId: ship.accountId,
    bankedCredits: ship.bankedCredits,
    build: ship.build,
    rockets: ship.rockets,
    salvage: ship.salvage,
    x: ship.x,
    y: ship.y,
  };
}
