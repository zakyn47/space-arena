import {
  ASTEROID_MAX_RADIUS,
  PIRATE_EXPERIENCE,
  PLAYER_KILL_EXPERIENCE,
  gainExperience,
  ASTEROID_TARGET_COUNT,
  CRATE_LIFETIME,
  DISCONNECT_LINGER,
  IDLE_INPUT,
  MAX_ACTIVE_MINES,
  MINE_DAMAGE,
  MINE_BLAST_RADIUS,
  ORE_PICKUP_LIFETIME,
  PICKUP_RADIUS,
  SHIP_RADIUS,
  WORLD_SIZE,
  nearestZone,
  stepMotion,
  zoneAt,
  type HitEvent,
  type ShipInput,
  type ShopAction,
} from '@arena/shared';
import type { ShipRecord } from '../db/PlayerRepository';
import { randomAsteroid, scatterOre, type AsteroidFields } from './AsteroidField';
import { applyDamage, bountyFor, fireWeapons, updateShield } from './Combat';
import { toggleDock, type DockOutcome } from './Docking';
import {
  createPirateShip,
  createShip,
  respawnShip,
  type AsteroidEntity,
  type BulletEntity,
  type CrateEntity,
  type OreEntity,
  type Projectile,
  type RocketEntity,
  type ShipEntity,
  type SpaceMineEntity,
  type WorldEntity,
} from './entities';
import { distanceToSegment } from './geometry';
import { playerDeathCrates, takeCrate, type CrateDrop } from './Loot';
import { applyShopAction, type ShopOutcome } from './Shop';
import { canMine, findMiningTarget, mineStep } from './Mining';
import { acquireTarget, launchRocket, steerRocket, tryLaunch } from './Rockets';
import { blastVictims, dropMine, triggeredBy } from './SpaceMines';
import { DEFAULT_PATROLS, PirateDirector, type PatrolSpec, type PirateHost } from './pirates/PirateDirector';
import { SpatialGrid } from './SpatialGrid';

export interface WorldOptions {
  readonly rng?: () => number;
  readonly asteroidTarget?: number;
  readonly pirates?: boolean | readonly PatrolSpec[];
}

export interface DeathEvent {
  readonly ship: ShipEntity;
  readonly killerName: string | null;
}

export interface TickEvents {
  readonly died: DeathEvent[];
  readonly departed: ShipEntity[];
  readonly hits: HitEvent[];
}

const GRID_CELL_SIZE = 512;
const INPUT_QUEUE_LIMIT = 4;
const ASTEROID_SPAWNS_PER_TICK = 20;
const HIT_QUERY_RADIUS = SHIP_RADIUS + ASTEROID_MAX_RADIUS;

function patrolSpecs(option: WorldOptions['pirates']): readonly PatrolSpec[] | null {
  if (option === true) return DEFAULT_PATROLS;
  return option === false || option === undefined ? null : option;
}

function outOfBounds(x: number, y: number): boolean {
  return x < 0 || y < 0 || x > WORLD_SIZE || y > WORLD_SIZE;
}

export class World {
  private readonly ships = new Map<number, ShipEntity>();
  private readonly bullets = new Map<number, BulletEntity>();
  private readonly rockets = new Map<number, RocketEntity>();
  private readonly mines = new Map<number, SpaceMineEntity>();
  private readonly asteroids = new Map<number, AsteroidEntity>();
  private readonly orePickups = new Map<number, OreEntity>();
  private readonly crates = new Map<number, CrateEntity>();
  private readonly grid = new SpatialGrid<WorldEntity>(GRID_CELL_SIZE);
  private readonly rng: () => number;
  private readonly asteroidTarget: number;
  private readonly director: PirateDirector | null;
  private readonly pirateHost: PirateHost = {
    spawnPirate: (tier, x, y) => {
      const ship = createPirateShip(this.allocateId(), tier, x, y);
      this.ships.set(ship.id, ship);
      return ship;
    },
    ship: (id) => this.ships.get(id),
    players: () => this.playerShips(),
  };
  private nextId = 1;
  private elapsed = 0;
  private ticks = 0;

  constructor(options: WorldOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.asteroidTarget = options.asteroidTarget ?? ASTEROID_TARGET_COUNT;
    const patrols = patrolSpecs(options.pirates);
    this.director = patrols && new PirateDirector(this.rng, patrols);
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

  playerShips(): ShipEntity[] {
    return [...this.ships.values()].filter((ship) => ship.npc === null);
  }

  npcShips(): ShipEntity[] {
    return [...this.ships.values()].filter((ship) => ship.npc !== null);
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
    const asteroid: AsteroidEntity = { kind: 'asteroid', id: this.allocateId(), ...fields, ore: fields.ore ?? fields.oreYield * 2 };
    this.asteroids.set(asteroid.id, asteroid);
    return asteroid;
  }

  dock(shipId: number): DockOutcome {
    const ship = this.ships.get(shipId);
    if (!ship) return { ok: false, reason: 'out_of_range' };
    return toggleDock(ship, this.elapsed);
  }

  shop(shipId: number, action: ShopAction): ShopOutcome {
    const ship = this.ships.get(shipId);
    if (!ship) return { ok: false, reason: 'not_docked' };
    return applyShopAction(ship, action);
  }

  entitiesNear(x: number, y: number, radius: number): WorldEntity[] {
    return this.grid.queryRadius(x, y, radius);
  }

  tick(dt: number): TickEvents {
    this.elapsed += dt;
    this.ticks += 1;
    const events: TickEvents = { died: [], departed: [], hits: [] };
    this.director?.step(this.pirateHost, this.elapsed);
    this.stepShips(dt);
    this.stepProjectiles(dt);
    this.rebuildGrid();
    this.resolveProjectileHits(this.bullets, events.hits);
    this.resolveProjectileHits(this.rockets, events.hits);
    this.resolveMines(events.hits);
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
        ship.miningTargetId = null;
        continue;
      }
      const inSafeZone = zoneAt(ship.x, ship.y) !== undefined;
      updateShield(ship, dt, inSafeZone);
      Object.assign(ship, stepMotion(ship, ship.input, ship.stats, dt));
      for (const bullet of fireWeapons(ship, dt, inSafeZone, this.elapsed, () => this.allocateId())) {
        this.bullets.set(bullet.id, bullet);
      }
      if (tryLaunch(ship, dt, inSafeZone)) this.releaseOrdnance(ship);
      this.stepMining(ship, dt, inSafeZone);
    }
  }

  private releaseOrdnance(ship: ShipEntity): void {
    if (ship.ordnance === 'mines') {
      this.layMine(ship);
      return;
    }
    const rocket = launchRocket(ship, this.allocateId(), this.elapsed, acquireTarget(ship, this.ships.values()));
    this.rockets.set(rocket.id, rocket);
  }

  private layMine(ship: ShipEntity): void {
    const mine = dropMine(ship, this.allocateId(), this.elapsed);
    if (zoneAt(mine.x, mine.y)) return;
    this.mines.set(mine.id, mine);
    const owned = [...this.mines.values()].filter((other) => other.ownerId === ship.id);
    for (const oldest of owned.slice(0, Math.max(0, owned.length - MAX_ACTIVE_MINES))) this.mines.delete(oldest.id);
  }

  private resolveMines(hits: HitEvent[]): void {
    for (const mine of this.mines.values()) {
      const nearby = this.grid
        .queryRadius(mine.x, mine.y, MINE_BLAST_RADIUS)
        .filter((entity): entity is ShipEntity => entity.kind === 'ship');
      if (!nearby.some((ship) => triggeredBy(mine, ship, this.elapsed))) continue;
      this.mines.delete(mine.id);
      for (const ship of blastVictims(mine, nearby)) {
        const shield = applyDamage(ship, MINE_DAMAGE, mine.ownerId, this.elapsed);
        hits.push({ shipId: ship.id, angle: Math.atan2(mine.x - ship.x, ship.y - mine.y), shield });
      }
    }
  }

  private stepMining(ship: ShipEntity, dt: number, inSafeZone: boolean): void {
    if (!canMine(ship, inSafeZone)) {
      ship.miningTargetId = null;
      ship.miningProgress = 0;
      return;
    }
    const nearby = this.grid
      .queryRadius(ship.x, ship.y, ship.stats.miningRange + ASTEROID_MAX_RADIUS)
      .filter((entity): entity is AsteroidEntity => entity.kind === 'asteroid' && this.asteroids.has(entity.id));
    const target = findMiningTarget(ship, nearby);
    if (!target) {
      ship.miningTargetId = null;
      ship.miningProgress = 0;
      return;
    }
    mineStep(ship, target, dt);
    if (target.ore <= 0) this.asteroids.delete(target.id);
  }

  private stepProjectiles(dt: number): void {
    for (const bullet of this.bullets.values()) {
      bullet.prevX = bullet.x;
      bullet.prevY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
    }
    for (const rocket of this.rockets.values()) {
      steerRocket(rocket, rocket.targetId === null ? undefined : this.ships.get(rocket.targetId), dt);
    }
    for (const collection of [this.bullets, this.rockets]) {
      for (const projectile of collection.values()) {
        if (this.isExpired(projectile)) collection.delete(projectile.id);
      }
    }
    for (const mine of this.mines.values()) {
      if (mine.expiresAt <= this.elapsed) this.mines.delete(mine.id);
    }
  }

  private isExpired(projectile: Projectile): boolean {
    return (
      projectile.expiresAt <= this.elapsed ||
      outOfBounds(projectile.x, projectile.y) ||
      zoneAt(projectile.x, projectile.y) !== undefined
    );
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const collection of [this.ships, this.bullets, this.rockets, this.mines, this.asteroids, this.orePickups, this.crates]) {
      for (const entity of collection.values()) this.grid.insert(entity);
    }
  }

  private resolveProjectileHits<T extends Projectile>(collection: Map<number, T>, hits: HitEvent[]): void {
    for (const projectile of collection.values()) {
      const travel = Math.hypot(projectile.x - projectile.prevX, projectile.y - projectile.prevY);
      const target = this.grid
        .queryRadius(projectile.x, projectile.y, HIT_QUERY_RADIUS + travel)
        .find((entity) => this.isHit(projectile, entity));
      if (!target) continue;
      collection.delete(projectile.id);
      if (target.kind === 'ship') hits.push(this.hitShip(target, projectile));
      if (target.kind === 'asteroid') this.damageAsteroid(target, projectile.damage);
    }
  }

  private isHit(projectile: Projectile, entity: WorldEntity): boolean {
    switch (entity.kind) {
      case 'ship':
        return entity.id !== projectile.ownerId && !(projectile.fromNpc && entity.npc !== null) && this.sweptDistance(projectile, entity) <= SHIP_RADIUS;
      case 'asteroid':
        return this.asteroids.has(entity.id) && this.sweptDistance(projectile, entity) <= entity.radius;
      default:
        return false;
    }
  }

  private sweptDistance(projectile: Projectile, entity: WorldEntity): number {
    return distanceToSegment(entity.x, entity.y, projectile.prevX, projectile.prevY, projectile.x, projectile.y);
  }

  private hitShip(ship: ShipEntity, projectile: Projectile): HitEvent {
    const shield = applyDamage(ship, projectile.damage, projectile.ownerId, this.elapsed);
    const angle = Math.atan2(projectile.prevX - ship.x, ship.y - projectile.prevY);
    return { shipId: ship.id, angle, shield };
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
      if (ship.npc !== null) continue;
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
    const leftover = takeCrate(ship, crate);
    if (leftover === null) this.crates.delete(crate.id);
    else this.crates.set(crate.id, { ...crate, ...leftover });
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
      if (killer && killer.id !== ship.id && killer.npc === null) {
        const xp = ship.npc === null ? PLAYER_KILL_EXPERIENCE : PIRATE_EXPERIENCE[ship.npc];
        killer.captain = gainExperience(killer.captain, xp);
      }
      if (ship.npc !== null) {
        this.spawnCrate(ship.x, ship.y, this.director?.pirateLoot(ship.npc) ?? { credits: 0, ore: 0, gear: null });
        this.ships.delete(ship.id);
        continue;
      }
      if (killer && killer.npc === null && ship.npc === null) killer.carriedCredits += bountyFor(ship.build);
      this.dropCrate(ship);
      const zone = nearestZone(ship.x, ship.y);
      respawnShip(ship, zone.x, zone.y);
      died.push({ ship, killerName: killer?.name ?? null });
    }
  }

  private dropCrate(ship: ShipEntity): void {
    playerDeathCrates(ship).forEach((drop, index) => this.spawnCrate(ship.x + index * 12, ship.y, drop));
  }

  private spawnCrate(x: number, y: number, drop: CrateDrop): void {
    const crate: CrateEntity = { kind: 'crate', id: this.allocateId(), x, y, ...drop, expiresAt: this.elapsed + CRATE_LIFETIME };
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
