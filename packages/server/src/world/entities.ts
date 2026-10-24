import { BASE_LOADOUT, IDLE_INPUT, statsFor, type Loadout, type ShipInput, type ShipStats } from '@arena/shared';
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
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  loadout: Loadout;
  stats: ShipStats;
  hull: number;
  shieldEnergy: number;
  shieldUp: boolean;
  shieldLockout: number;
  fireCooldown: number;
  ore: number;
  carriedCredits: number;
  bankedCredits: number;
  lastDamagedAt: number;
  lastHitBy: number | null;
  input: ShipInput;
  inputQueue: QueuedInput[];
  lastSeq: number;
  docked: boolean;
  lingerUntil: number | null;
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
  readonly tier: number;
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

export type WorldEntity = ShipEntity | BulletEntity | AsteroidEntity | OreEntity | CrateEntity;

export function createShip(id: number, accountId: number, name: string, record: ShipRecord): ShipEntity {
  const stats = statsFor(record.loadout);
  return {
    kind: 'ship',
    id,
    accountId,
    name,
    x: record.x,
    y: record.y,
    vx: 0,
    vy: 0,
    angle: 0,
    loadout: record.loadout,
    stats,
    hull: stats.maxHull,
    shieldEnergy: stats.maxShield,
    shieldUp: false,
    shieldLockout: 0,
    fireCooldown: 0,
    ore: 0,
    carriedCredits: 0,
    bankedCredits: record.bankedCredits,
    lastDamagedAt: -Infinity,
    lastHitBy: null,
    input: IDLE_INPUT,
    inputQueue: [],
    lastSeq: 0,
    docked: false,
    lingerUntil: null,
  };
}

export function respawnShip(ship: ShipEntity, x: number, y: number): void {
  const stats = statsFor(BASE_LOADOUT);
  Object.assign(ship, {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    loadout: BASE_LOADOUT,
    stats,
    hull: stats.maxHull,
    shieldEnergy: stats.maxShield,
    shieldUp: false,
    shieldLockout: 0,
    fireCooldown: 0,
    ore: 0,
    carriedCredits: 0,
    lastDamagedAt: -Infinity,
    lastHitBy: null,
    docked: false,
  } satisfies Partial<ShipEntity>);
}

export function toShipRecord(ship: ShipEntity): ShipRecord {
  return { accountId: ship.accountId, bankedCredits: ship.bankedCredits, loadout: ship.loadout, x: ship.x, y: ship.y };
}
