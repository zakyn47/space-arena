import {
  IDLE_INPUT,
  LEVIATHAN_MAX_HULL,
  LEVIATHAN_MAX_SPEED,
  LEVIATHAN_RADIUS,
  LEVIATHAN_THRUST,
  LEVIATHAN_TURN_RATE,
  NEW_CAPTAIN,
  NPC_NAMES,
  SHIP_RADIUS,
  type NpcKind,
  type Captain,
  STARTER_BUILD,
  statsFor,
  type Build,
  type GearId,
  type Mk,
  PIRATE_NAMES,
  type InstalledGear,
  type Ordnance,
  type PirateTier,
  type ShipInput,
  type ShipStats,
} from '@arena/shared';
import type { ShipRecord } from '../db/PlayerRepository';
import { PIRATE_SPECS } from './pirates/tiers';

export interface QueuedInput {
  readonly seq: number;
  readonly input: ShipInput;
}

export interface ShipEntity {
  readonly kind: 'ship';
  readonly id: number;
  readonly accountId: number;
  readonly name: string;
  npc: NpcKind | null;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  build: Build;
  captain: Captain;
  stats: ShipStats;
  hull: number;
  shieldEnergy: number;
  shieldUp: boolean;
  shieldLockout: number;
  weaponCooldowns: number[];
  ore: number;
  carriedCredits: number;
  bankedCredits: number;
  ordnance: Ordnance;
  rockets: number;
  rocketCooldown: number;
  pvpKills: number;
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

export interface OrbEntity {
  readonly kind: 'orb';
  readonly id: number;
  readonly ownerId: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly fromNpc: true;
  readonly expiresAt: number;
}

export type Projectile = BulletEntity | RocketEntity | OrbEntity;

export interface SpaceMineEntity {
  readonly kind: 'spaceMine';
  readonly id: number;
  readonly ownerId: number;
  readonly x: number;
  readonly y: number;
  readonly armedAt: number;
  readonly expiresAt: number;
}

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
  readonly gear: InstalledGear | null;
  readonly expiresAt: number;
}

export type WorldEntity = ShipEntity | BulletEntity | RocketEntity | OrbEntity | SpaceMineEntity | AsteroidEntity | OreEntity | CrateEntity;

export function createShip(id: number, accountId: number, name: string, record: ShipRecord): ShipEntity {
  const stats = statsFor(record.build, record.captain);
  return {
    kind: 'ship',
    id,
    accountId,
    name,
    npc: null,
    radius: SHIP_RADIUS,
    x: record.x,
    y: record.y,
    vx: 0,
    vy: 0,
    angle: 0,
    build: record.build,
    captain: record.captain,
    stats,
    hull: stats.maxHull,
    shieldEnergy: stats.maxShield,
    shieldUp: false,
    shieldLockout: 0,
    weaponCooldowns: stats.weapons.map(() => 0),
    ore: 0,
    carriedCredits: 0,
    bankedCredits: record.bankedCredits,
    ordnance: record.ordnance,
    rockets: record.rockets,
    rocketCooldown: 0,
    pvpKills: record.pvpKills,
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

export function createPirateShip(id: number, tier: PirateTier, x: number, y: number): ShipEntity {
  const spec = PIRATE_SPECS[tier];
  const ship = createShip(id, -id, PIRATE_NAMES[tier], {
    accountId: -id,
    bankedCredits: 0,
    build: spec.build,
    captain: NEW_CAPTAIN,
    ordnance: 'rockets',
    rockets: spec.rockets,
    pvpKills: 0,
    salvage: [],
    x,
    y,
  });
  // Pirates share the player hull catalog but not the player hull bonus.
  const stats = statsFor(spec.build, NEW_CAPTAIN, 0);
  Object.assign(ship, { npc: tier, stats, hull: stats.maxHull } satisfies Partial<ShipEntity>);
  return ship;
}

export function respawnShip(ship: ShipEntity, x: number, y: number): void {
  const stats = statsFor(STARTER_BUILD, ship.captain);
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
    ordnance: 'rockets',
    rockets: 0,
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
    captain: ship.captain,
    ordnance: ship.ordnance,
    rockets: ship.rockets,
    pvpKills: ship.pvpKills,
    salvage: ship.salvage,
    x: ship.x,
    y: ship.y,
  };
}

const LEVIATHAN_STATS: ShipStats = {
  maxHull: LEVIATHAN_MAX_HULL,
  thrust: LEVIATHAN_THRUST,
  maxSpeed: LEVIATHAN_MAX_SPEED,
  turnRate: LEVIATHAN_TURN_RATE,
  maxShield: 0,
  shieldRegen: 0,
  shieldDrain: 0,
  cargoCapacity: 0,
  maxRockets: 0,
  miningRate: 0,
  miningRange: 0,
  weapons: [],
};

export function createLeviathan(id: number, x: number, y: number): ShipEntity {
  const ship = createShip(id, -id, NPC_NAMES.leviathan, {
    accountId: -id,
    bankedCredits: 0,
    build: STARTER_BUILD,
    captain: NEW_CAPTAIN,
    ordnance: 'rockets',
    rockets: 0,
    pvpKills: 0,
    salvage: [],
    x,
    y,
  });
  Object.assign(ship, {
    npc: 'leviathan',
    radius: LEVIATHAN_RADIUS,
    stats: LEVIATHAN_STATS,
    hull: LEVIATHAN_MAX_HULL,
    shieldEnergy: 0,
    weaponCooldowns: [],
  } satisfies Partial<ShipEntity>);
  return ship;
}
