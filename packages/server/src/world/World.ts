import {
  ASTEROID_MAX_RADIUS,
  ASTEROID_TARGET_COUNT,
  CRATE_LIFETIME,
  DISCONNECT_LINGER,
  IDLE_INPUT,
  LOOT_CREDIT_SHARE,
  ORE_PICKUP_LIFETIME,
  PICKUP_RADIUS,
  SHIP_RADIUS,
  WORLD_SIZE,
  nearestZone,
  stepMotion,
  zoneAt,
  type ShipInput,
} from '@arena/shared';
import type { ShipRecord } from '../db/PlayerRepository';
import { randomAsteroid, scatterOre, type AsteroidFields } from './AsteroidField';
import { applyDamage, bountyFor, fireWeapons, updateShield } from './Combat';
import { toggleDock, type DockOutcome } from './Docking';
import {
  createShip,
  respawnShip,
  type AsteroidEntity,
  type BulletEntity,
  type CrateEntity,
  type OreEntity,
  type ShipEntity,
  type WorldEntity,
} from './entities';
import { distanceToSegment } from './geometry';
import { SpatialGrid } from './SpatialGrid';

export interface WorldOptions {
  readonly rng?: () => number;
  readonly asteroidTarget?: number;
}

export interface DeathEvent {
  readonly ship: ShipEntity;
  readonly killerName: string | null;
}

export interface TickEvents {
  readonly died: DeathEvent[];
  readonly departed: ShipEntity[];
}

const GRID_CELL_SIZE = 512;
const INPUT_QUEUE_LIMIT = 4;
const ASTEROID_SPAWNS_PER_TICK = 20;
const HIT_QUERY_RADIUS = SHIP_RADIUS + ASTEROID_MAX_RADIUS;

function outOfBounds(x: number, y: number): boolean {
  return x < 0 || y < 0 || x > WORLD_SIZE || y > WORLD_SIZE;
}

export class World {
  private readonly ships = new Map<number, ShipEntity>();
  private readonly bullets = new Map<number, BulletEntity>();
  private readonly asteroids = new Map<number, AsteroidEntity>();
  private readonly orePickups = new Map<number, OreEntity>();
  private readonly crates = new Map<number, CrateEntity>();
  private readonly grid = new SpatialGrid<WorldEntity>(GRID_CELL_SIZE);
  private readonly rng: () => number;
  private readonly asteroidTarget: number;
  private nextId = 1;
  private elapsed = 0;
  private ticks = 0;

  constructor(options: WorldOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.asteroidTarget = options.asteroidTarget ?? ASTEROID_TARGET_COUNT;
    while (this.asteroids.size < this.asteroidTarget) this.addAsteroid(randomAsteroid(this.rng));
  }

  get time(): number {
    return this.elapsed;
  }

  get tickCount(): number {
    return this.ticks;
  }

  addShip(accountId: number, name: string, record: ShipRecord): ShipEntity {
    const ship = createShip(this.allocateId(), accountId, name, record);
    this.ships.set(ship.id, ship);
    return ship;
  }

  shipById(id: number): ShipEntity | undefined {
    return this.ships.get(id);
  }

  shipByAccount(accountId: number): ShipEntity | undefined {
    for (const ship of this.ships.values()) {
      if (ship.accountId === accountId) return ship;
    }
    return undefined;
  }

  allShips(): ShipEntity[] {
    return [...this.ships.values()];
  }

  setInput(shipId: number, seq: number, input: ShipInput): void {
    const ship = this.ships.get(shipId);
    if (!ship) return;
    const latestSeq = ship.inputQueue.at(-1)?.seq ?? ship.lastSeq;
    if (seq <= latestSeq) return;
    ship.inputQueue.push({ seq, input });
    if (ship.inputQueue.length > INPUT_QUEUE_LIMIT) ship.inputQueue.shift();
  }

  disconnect(shipId: number): ShipEntity | undefined {
    const ship = this.ships.get(shipId);
    if (!ship) return undefined;
    ship.input = IDLE_INPUT;
    ship.inputQueue = [];
    if (zoneAt(ship.x, ship.y)) {
      this.ships.delete(shipId);
      return ship;
    }
    ship.lingerUntil = this.elapsed + DISCONNECT_LINGER;
    return undefined;
  }

  reconnect(shipId: number): void {
    const ship = this.ships.get(shipId);
    if (ship) ship.lingerUntil = null;
  }

  addAsteroid(fields: AsteroidFields): AsteroidEntity {
    const asteroid: AsteroidEntity = { kind: 'asteroid', id: this.allocateId(), ...fields };
    this.asteroids.set(asteroid.id, asteroid);
    return asteroid;
  }

  dock(shipId: number): DockOutcome {
    const ship = this.ships.get(shipId);
    if (!ship) return { ok: false, reason: 'out_of_range' };
    return toggleDock(ship, this.elapsed);
  }

  entitiesNear(x: number, y: number, radius: number): WorldEntity[] {
    return this.grid.queryRadius(x, y, radius);
  }

  tick(dt: number): TickEvents {
    this.elapsed += dt;
    this.ticks += 1;
    const events: TickEvents = { died: [], departed: [] };
    this.stepShips(dt);
    this.stepBullets(dt);
    this.rebuildGrid();
    this.resolveBulletHits();
    this.collectPickups();
    this.resolveDeaths(events.died);
    this.expirePickups();
    this.maintainAsteroids();
    this.expireLingering(events.departed);
    return events;
  }

  private allocateId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  private stepShips(dt: number): void {
    for (const ship of this.ships.values()) {
      const next = ship.inputQueue.shift();
      if (next) {
        ship.input = next.input;
        ship.lastSeq = next.seq;
      }
      if (ship.docked) {
        ship.vx = 0;
        ship.vy = 0;
        ship.shieldUp = false;
        continue;
      }
      const inSafeZone = zoneAt(ship.x, ship.y) !== undefined;
      updateShield(ship, dt, inSafeZone);
      Object.assign(ship, stepMotion(ship, ship.input, ship.stats, dt));
      for (const bullet of fireWeapons(ship, dt, inSafeZone, this.elapsed, () => this.allocateId())) {
        this.bullets.set(bullet.id, bullet);
      }
    }
  }

  private stepBullets(dt: number): void {
    for (const bullet of this.bullets.values()) {
      bullet.prevX = bullet.x;
      bullet.prevY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      const expired =
        bullet.expiresAt <= this.elapsed || outOfBounds(bullet.x, bullet.y) || zoneAt(bullet.x, bullet.y) !== undefined;
      if (expired) this.bullets.delete(bullet.id);
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const collection of [this.ships, this.bullets, this.asteroids, this.orePickups, this.crates]) {
      for (const entity of collection.values()) this.grid.insert(entity);
    }
  }

  private resolveBulletHits(): void {
    for (const bullet of this.bullets.values()) {
      const travel = Math.hypot(bullet.x - bullet.prevX, bullet.y - bullet.prevY);
      const target = this.grid
        .queryRadius(bullet.x, bullet.y, HIT_QUERY_RADIUS + travel)
        .find((entity) => this.isHit(bullet, entity));
      if (!target) continue;
      this.bullets.delete(bullet.id);
      this.applyBulletTo(target, bullet);
    }
  }

  private isHit(bullet: BulletEntity, entity: WorldEntity): boolean {
    switch (entity.kind) {
      case 'ship':
        return entity.id !== bullet.ownerId && this.sweptDistance(bullet, entity) <= SHIP_RADIUS;
      case 'asteroid':
        return this.asteroids.has(entity.id) && this.sweptDistance(bullet, entity) <= entity.radius;
      default:
        return false;
    }
  }

  private sweptDistance(bullet: BulletEntity, entity: WorldEntity): number {
    return distanceToSegment(entity.x, entity.y, bullet.prevX, bullet.prevY, bullet.x, bullet.y);
  }

  private applyBulletTo(entity: WorldEntity, bullet: BulletEntity): void {
    if (entity.kind === 'ship') applyDamage(entity, bullet.damage, bullet.ownerId, this.elapsed);
    if (entity.kind === 'asteroid') this.damageAsteroid(entity, bullet.damage);
  }

  private damageAsteroid(asteroid: AsteroidEntity, damage: number): void {
    asteroid.hp -= damage;
    if (asteroid.hp > 0) return;
    this.asteroids.delete(asteroid.id);
    for (const point of scatterOre(asteroid, this.rng)) {
      const ore: OreEntity = { kind: 'ore', id: this.allocateId(), ...point, expiresAt: this.elapsed + ORE_PICKUP_LIFETIME };
      this.orePickups.set(ore.id, ore);
    }
  }

  private collectPickups(): void {
    for (const ship of this.ships.values()) {
      for (const entity of this.grid.queryRadius(ship.x, ship.y, PICKUP_RADIUS)) {
        if (entity.kind === 'ore') this.collectOre(ship, entity);
        if (entity.kind === 'crate') this.collectCrate(ship, entity);
      }
    }
  }

  private collectOre(ship: ShipEntity, ore: OreEntity): void {
    if (!this.orePickups.has(ore.id) || ship.ore >= ship.stats.cargoCapacity) return;
    ship.ore += 1;
    this.orePickups.delete(ore.id);
  }

  private collectCrate(ship: ShipEntity, crate: CrateEntity): void {
    if (!this.crates.has(crate.id)) return;
    ship.carriedCredits += crate.credits;
    ship.ore = Math.min(ship.stats.cargoCapacity, ship.ore + crate.ore);
    this.crates.delete(crate.id);
  }

  private expirePickups(): void {
    for (const collection of [this.orePickups, this.crates]) {
      for (const pickup of collection.values()) {
        if (pickup.expiresAt <= this.elapsed) collection.delete(pickup.id);
      }
    }
  }

  private maintainAsteroids(): void {
    for (let i = 0; i < ASTEROID_SPAWNS_PER_TICK && this.asteroids.size < this.asteroidTarget; i += 1) {
      this.addAsteroid(randomAsteroid(this.rng));
    }
  }

  private resolveDeaths(died: DeathEvent[]): void {
    for (const ship of this.ships.values()) {
      if (ship.hull > 0) continue;
      const killer = ship.lastHitBy === null ? undefined : this.ships.get(ship.lastHitBy);
      if (killer) killer.carriedCredits += bountyFor(ship.build);
      this.dropCrate(ship);
      const zone = nearestZone(ship.x, ship.y);
      respawnShip(ship, zone.x, zone.y);
      died.push({ ship, killerName: killer?.name ?? null });
    }
  }

  private dropCrate(ship: ShipEntity): void {
    const credits = Math.floor(ship.carriedCredits * LOOT_CREDIT_SHARE);
    if (ship.ore === 0 && credits === 0) return;
    const crate: CrateEntity = {
      kind: 'crate',
      id: this.allocateId(),
      x: ship.x,
      y: ship.y,
      ore: ship.ore,
      credits,
      expiresAt: this.elapsed + CRATE_LIFETIME,
    };
    this.crates.set(crate.id, crate);
  }

  private expireLingering(departed: ShipEntity[]): void {
    for (const ship of this.ships.values()) {
      if (ship.lingerUntil === null || ship.lingerUntil > this.elapsed) continue;
      this.ships.delete(ship.id);
      departed.push(ship);
    }
  }
}
