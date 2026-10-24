# Void Leviathan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one slow, high-HP alien world boss that patrols the arena center, fires dodgeable plasma orbs and drops rich loot.

**Architecture:** The Leviathan is a server-flown `ShipEntity` (like pirates) with `npc: 'leviathan'`, a per-ship hit `radius` and fixed stats. A new `BossDirector` drives it each tick through a small host interface; plasma orbs are a third projectile collection that reuses the existing hit pipeline. The client renders it with an animated monster sprite, a label and a health bar.

**Tech Stack:** TypeScript (strict), Node 22, Vitest, PixiJS 8, zod. pnpm workspace: `packages/shared`, `packages/server`, `packages/client`.

**Spec:** `docs/superpowers/specs/2026-10-25-void-leviathan-design.md`

## Global Constraints

- Read `AGENTS.md`. TypeScript strict, no `any`, avoid `as` casts outside tests. No comments that restate code; comment only *why*.
- Tests live in `packages/*/test/`. Server tests build `World` with `asteroidTarget: 0` and without `pirates`/`boss` unless the test is about them. Use `seeded(n)` from `packages/server/test/support/fixtures.ts` for randomness.
- Every task ends with `pnpm typecheck && pnpm test && pnpm lint` green. Add `pnpm build` when client code changes and `pnpm assets:check` when assets change.
- Commit to the `dev` branch with Conventional Commit messages. **Never add `Co-Authored-By` or any AI attribution.**
- Values (copy exactly): hull 3 000, no shield, max speed 60 px/s, hit radius 90 px, patrol circle radius 2 000 px around (`WORLD_SIZE / 2`, `WORLD_SIZE / 2`), aggro 1 400 px, regen 5 HP/s when no player within 1 500 px, volley every 2.5 s of 3 orbs in a 20° spread, orb speed 220 px/s, orb lifetime 6 s, orb damage 40, respawn 600 s, loot 1 500 cr + 15 ore + random Mk3 gear, killing-blow XP 500.
- No database change: the Leviathan is never persisted.
- Assets (`leviathan`, `plasma_orb`, `leviathan_death`) are produced by Codex in parallel; their manifest entries already exist. Code must work while the PNGs are missing (placeholders).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/catalog/leviathan.ts` (new) | `NpcKind`, `NPC_NAMES`, Leviathan and orb constants |
| `packages/shared/src/captain.ts` | `NPC_EXPERIENCE` covering every `NpcKind` |
| `packages/shared/src/protocol.ts` | `ShipState.npc: NpcKind`, optional `health`, `OrbState`, radar `boss` kind |
| `packages/server/src/world/entities.ts` | `radius` on ships, `OrbEntity`, `createLeviathan` |
| `packages/server/src/world/SpaceMines.ts` | mine trigger/blast use the ship's radius |
| `packages/server/src/world/boss/BossDirector.ts` (new) | spawn, patrol, target, fire, regen, respawn, loot |
| `packages/server/src/world/pirates/PirateBrain.ts` | export a reusable `steerToward` |
| `packages/server/src/world/World.ts` | radius-aware hits, orb collection, boss host and death branch |
| `packages/server/src/app.ts` | enable the boss in the real app |
| `packages/server/src/net/snapshot.ts`, `net/radar.ts` | `health`, orb state, `boss` blip |
| `packages/client/src/render/spriteIds.ts`, `Renderer.ts`, `Effects.ts` | monster sprite, orb sprite, label, health bar, death effect, hit offset |
| `packages/client/src/ui/Hud.ts` | purple, larger `boss` minimap dot |
| `packages/client/index.html`, `controls.md` | rules text |

---

### Task 1: Shared NPC kinds, Leviathan constants and protocol

**Files:**
- Create: `packages/shared/src/catalog/leviathan.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/captain.ts`, `packages/shared/src/protocol.ts`
- Test: `packages/shared/test/captain.test.ts`

**Interfaces:**
- Produces: `type NpcKind = PirateTier | 'leviathan'`, `NPC_NAMES: Record<NpcKind, string>`, `NPC_EXPERIENCE: Record<NpcKind, number>`, constants `LEVIATHAN_RADIUS`, `LEVIATHAN_MAX_HULL`, `LEVIATHAN_MAX_SPEED`, `LEVIATHAN_THRUST`, `LEVIATHAN_TURN_RATE`, `LEVIATHAN_PATROL_RADIUS`, `LEVIATHAN_AGGRO_RANGE`, `LEVIATHAN_REGEN`, `LEVIATHAN_REGEN_CLEAR_RANGE`, `LEVIATHAN_FIRE_INTERVAL`, `LEVIATHAN_SPREAD`, `LEVIATHAN_RESPAWN`, `LEVIATHAN_CREDITS`, `LEVIATHAN_ORE`, `ORB_SPEED`, `ORB_LIFETIME`, `ORB_DAMAGE`; `OrbState`; `ShipState.health?: number`; `RadarBlip['kind']` includes `'boss'`.

- [ ] **Step 1: Write the failing test** — append to `packages/shared/test/captain.test.ts`:

```ts
describe('NPC_EXPERIENCE', () => {
  it('rewards every npc kind, the leviathan most', () => {
    expect(NPC_EXPERIENCE).toEqual({ raider: 50, marauder: 100, warlord: 250, leviathan: 500 });
  });
});
```

and add `NPC_EXPERIENCE` to that file's import from `../src/captain`.

- [ ] **Step 2: Run** `pnpm vitest run packages/shared/test/captain.test.ts` — expect FAIL (`NPC_EXPERIENCE` undefined).

- [ ] **Step 3: Implement.** Create `packages/shared/src/catalog/leviathan.ts`:

```ts
import { PIRATE_NAMES, type PirateTier } from './pirates';

export type NpcKind = PirateTier | 'leviathan';

export const NPC_NAMES: Readonly<Record<NpcKind, string>> = { ...PIRATE_NAMES, leviathan: 'Void Leviathan' };

export const LEVIATHAN_RADIUS = 90;
export const LEVIATHAN_MAX_HULL = 3_000;
export const LEVIATHAN_MAX_SPEED = 60;
export const LEVIATHAN_THRUST = 40;
export const LEVIATHAN_TURN_RATE = 0.6;
export const LEVIATHAN_PATROL_RADIUS = 2_000;
export const LEVIATHAN_AGGRO_RANGE = 1_400;
export const LEVIATHAN_REGEN = 5;
export const LEVIATHAN_REGEN_CLEAR_RANGE = 1_500;
export const LEVIATHAN_FIRE_INTERVAL = 2.5;
export const LEVIATHAN_SPREAD = (20 * Math.PI) / 180;
export const LEVIATHAN_RESPAWN = 600;
export const LEVIATHAN_CREDITS = 1_500;
export const LEVIATHAN_ORE = 15;
export const ORB_SPEED = 220;
export const ORB_LIFETIME = 6;
export const ORB_DAMAGE = 40;
```

Export it from `packages/shared/src/index.ts` (`export * from './catalog/leviathan';` after the pirates export).

In `packages/shared/src/captain.ts`, below `PIRATE_EXPERIENCE`, add:

```ts
export const NPC_EXPERIENCE: Readonly<Record<NpcKind, number>> = { ...PIRATE_EXPERIENCE, leviathan: 500 };
```

with `import type { NpcKind } from './catalog/leviathan';`.

In `packages/shared/src/protocol.ts`:
- replace `import type { PirateTier } from './catalog/pirates';` with `import type { NpcKind } from './catalog/leviathan';`
- in `ShipState`, change `readonly npc: PirateTier | null;` to `readonly npc: NpcKind | null;` and add `readonly health?: number;` after `miningTargetId`
- add before `SpaceMineState`:

```ts
export interface OrbState {
  readonly kind: 'orb';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}
```

- add `OrbState` to the `EntityState` union
- change `RadarBlip.kind` to `'player' | 'pirate' | 'boss'`.

- [ ] **Step 4: Run** `pnpm vitest run packages/shared` — PASS. Then `pnpm typecheck` — server and client will fail on exhaustive switches over `EntityState['kind']` (`toEntityState`, `spriteIdFor`, `LAYER_FOR`) and on `RADAR_COLORS`. Add the minimum to compile:
  - `packages/server/src/net/snapshot.ts` needs nothing yet (server has no orb entity).
  - `packages/client/src/render/spriteIds.ts`: `case 'orb': return 'plasma_orb';`
  - `packages/client/src/render/Renderer.ts`: `orb: 'bullets',` in `LAYER_FOR`; `PIRATE_NAMES` → `NPC_NAMES` in the import and `createLabel`.
  - `packages/client/src/ui/Hud.ts`: `RADAR_COLORS` gains `boss: '#c04bff'`.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm test && pnpm lint` — all green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/client packages/server
git commit -m "feat(shared): add npc kinds, leviathan constants and orb protocol"
```

---

### Task 2: Per-ship hit radius and the Leviathan entity

**Files:**
- Modify: `packages/server/src/world/entities.ts`, `packages/server/src/world/SpaceMines.ts`, `packages/server/src/world/World.ts`
- Test: `packages/server/test/World.leviathan.test.ts` (new), `packages/server/test/SpaceMines.test.ts`

**Interfaces:**
- Consumes: Task 1 constants and `NpcKind`.
- Produces: `ShipEntity.radius: number`, `ShipEntity.npc: NpcKind | null`, `createLeviathan(id: number, x: number, y: number): ShipEntity`, `World.addLeviathan(x: number, y: number): ShipEntity` (used by tests and by Task 4's host).

- [ ] **Step 1: Write the failing tests.** Create `packages/server/test/World.leviathan.test.ts`:

```ts
import { IDLE_INPUT, LEVIATHAN_MAX_HULL, LEVIATHAN_RADIUS, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createLeviathan } from '../src/world/entities';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function fireFor(world: World, shipId: number, seconds: number): void {
  world.setInput(shipId, 1, { ...IDLE_INPUT, fire: true });
  for (let i = 0; i < Math.ceil(seconds / TICK_DT); i += 1) world.tick(TICK_DT);
}

describe('Leviathan entity', () => {
  it('has fixed boss stats and a large hit radius', () => {
    const boss = createLeviathan(5, 100, 200);
    expect(boss).toMatchObject({ npc: 'leviathan', name: 'Void Leviathan', radius: LEVIATHAN_RADIUS, hull: LEVIATHAN_MAX_HULL, shieldEnergy: 0 });
    expect(boss.stats.maxShield).toBe(0);
    expect(boss.stats.weapons).toEqual([]);
  });

  it('is hit by bullets passing 80 px from its center, unlike a normal ship', () => {
    const world = new World({ asteroidTarget: 0 });
    const shooter = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const boss = world.addLeviathan(OPEN_SPACE.x + 80, OPEN_SPACE.y - 400);
    fireFor(world, shooter.id, 1);
    expect(boss.hull).toBeLessThan(LEVIATHAN_MAX_HULL);
    expect(boss.lastHitBy).toBe(shooter.id);
  });

  it('a normal ship 80 px off the line of fire is not hit', () => {
    const world = new World({ asteroidTarget: 0 });
    const shooter = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bystander = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x + 80, OPEN_SPACE.y - 400, 2));
    fireFor(world, shooter.id, 1);
    expect(bystander.hull).toBe(bystander.stats.maxHull);
  });
});
```

In `packages/server/test/SpaceMines.test.ts` add:

```ts
describe('large ships', () => {
  it('trigger and take blasts by their edge, not their center', () => {
    const mine = dropMine(at(1, 1_000, 1_000), 50, 0);
    const boss = createLeviathan(9, mine.x + MINE_TRIGGER_RADIUS + 50, mine.y);
    expect(triggeredBy(mine, boss, MINE_ARM_TIME)).toBe(true);
    const farBoss = createLeviathan(10, mine.x + MINE_BLAST_RADIUS + 50, mine.y);
    expect(blastVictims(mine, [farBoss])).toEqual([farBoss]);
  });
});
```

importing `createLeviathan` from `../src/world/entities` (both mines' distances are within `LEVIATHAN_RADIUS - SHIP_RADIUS = 66` of the normal thresholds).

- [ ] **Step 2: Run** `pnpm vitest run packages/server/test/World.leviathan.test.ts packages/server/test/SpaceMines.test.ts` — FAIL (`createLeviathan`/`addLeviathan` missing).

- [ ] **Step 3: Implement.**

`entities.ts`:
- import `LEVIATHAN_*`, `NPC_NAMES`, `SHIP_RADIUS`, `type NpcKind` from `@arena/shared`; change `npc: PirateTier | null;` to `npc: NpcKind | null;`; add `radius: number;` after `npc`.
- in `createShip` set `radius: SHIP_RADIUS,` after `npc: null,`.
- add:

```ts
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
```

`SpaceMines.ts`: replace `distance` with an edge distance so large ships count by their hull edge:

```ts
// Thresholds are tuned for a normal ship's center; larger ships are measured from their hull edge.
function reach(mine: SpaceMineEntity, ship: ShipEntity): number {
  return Math.hypot(ship.x - mine.x, ship.y - mine.y) - (ship.radius - SHIP_RADIUS);
}
```

and use `reach` in `triggeredBy` and `blastVictims`.

`World.ts`:
- import `LEVIATHAN_RADIUS`; change `const HIT_QUERY_RADIUS = SHIP_RADIUS + ASTEROID_MAX_RADIUS;` to `const HIT_QUERY_RADIUS = Math.max(LEVIATHAN_RADIUS, SHIP_RADIUS + ASTEROID_MAX_RADIUS);`
- in `isHit`, ship case: `this.sweptDistance(projectile, entity) <= entity.radius` instead of `SHIP_RADIUS`.
- in `resolveMines`, query radius `MINE_BLAST_RADIUS + LEVIATHAN_RADIUS - SHIP_RADIUS`.
- add public method:

```ts
  addLeviathan(x: number, y: number): ShipEntity {
    const ship = createLeviathan(this.allocateId(), x, y);
    this.ships.set(ship.id, ship);
    return ship;
  }
```

- `resolveDeaths` uses `PIRATE_EXPERIENCE[ship.npc]` and `this.director?.pirateLoot(ship.npc)`; switch XP to `NPC_EXPERIENCE[ship.npc]` now. Leave loot for Task 4 but make it compile: `ship.npc === 'leviathan' ? { credits: 0, ore: 0, gear: null } : this.director?.pirateLoot(ship.npc) ?? { credits: 0, ore: 0, gear: null }` (Task 4 replaces the leviathan branch).
- `PirateDirector.pirateLoot(tier: PirateTier)` keeps its type.

- [ ] **Step 4: Run** `pnpm vitest run packages/server` — PASS.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm test && pnpm lint` — green.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): add per-ship hit radius and the leviathan entity"
```

---

### Task 3: Plasma orbs

**Files:**
- Modify: `packages/server/src/world/entities.ts`, `packages/server/src/world/World.ts`, `packages/server/src/net/snapshot.ts`
- Test: `packages/server/test/World.leviathan.test.ts`, `packages/server/test/snapshot.test.ts`

**Interfaces:**
- Consumes: Task 2 `addLeviathan`, Task 1 `ORB_*`.
- Produces: `OrbEntity { kind: 'orb'; id; ownerId; x; y; prevX; prevY; vx; vy; damage; fromNpc: true; expiresAt }` in the `Projectile` and `WorldEntity` unions; `World.fireOrb(from: ShipEntity, angle: number): void`.

- [ ] **Step 1: Write the failing tests.** Append to `World.leviathan.test.ts`:

```ts
describe('plasma orbs', () => {
  function orbsNear(world: World): number {
    return world.entitiesNear(OPEN_SPACE.x, OPEN_SPACE.y, 3_000).filter((entity) => entity.kind === 'orb').length;
  }

  it('fly slowly and deal 40 damage', () => {
    const world = new World({ asteroidTarget: 0 });
    const boss = world.addLeviathan(OPEN_SPACE.x, OPEN_SPACE.y);
    const target = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 400, 1));
    world.fireOrb(boss, 0);
    const events = Array.from({ length: Math.ceil(2 / TICK_DT) }, () => world.tick(TICK_DT));
    expect(target.hull).toBe(target.stats.maxHull - ORB_DAMAGE);
    expect(target.lastHitBy).toBe(boss.id);
    expect(events.flatMap((tick) => tick.hits)).toContainEqual(expect.objectContaining({ shipId: target.id, shield: false }));
  });

  it('are blocked by a raised shield', () => {
    const world = new World({ asteroidTarget: 0 });
    const boss = world.addLeviathan(OPEN_SPACE.x, OPEN_SPACE.y);
    const target = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 400, 1));
    world.setInput(target.id, 1, { ...IDLE_INPUT, shield: true });
    world.fireOrb(boss, 0);
    for (let i = 0; i < Math.ceil(2 / TICK_DT); i += 1) world.tick(TICK_DT);
    expect(target.hull).toBe(target.stats.maxHull);
  });

  it('pass through pirates and expire after their lifetime', () => {
    const world = new World({ asteroidTarget: 0, rng: seeded(3), pirates: [{ band: 'raider', composition: () => ['raider'] }] });
    world.tick(TICK_DT);
    const pirate = world.npcShips().find((ship) => ship.npc === 'raider');
    if (!pirate) throw new Error('no pirate');
    Object.assign(pirate, { x: OPEN_SPACE.x, y: OPEN_SPACE.y - 400, vx: 0, vy: 0, input: IDLE_INPUT });
    const boss = world.addLeviathan(OPEN_SPACE.x, OPEN_SPACE.y);
    world.fireOrb(boss, 0);
    world.tick(TICK_DT);
    expect(orbsNear(world)).toBe(1);
    for (let i = 0; i < Math.ceil(ORB_LIFETIME / TICK_DT); i += 1) world.tick(TICK_DT);
    expect(pirate.hull).toBe(pirate.stats.maxHull);
    expect(orbsNear(world)).toBe(0);
  });
});
```

Add `ORB_DAMAGE, ORB_LIFETIME` to the shared import and `seeded` to the fixtures import. The pirate director may steer the pirate; the orb must not damage it either way.

In `snapshot.test.ts`, extend the first test's entity list with an orb:

```ts
    const orb: WorldEntity = { kind: 'orb', id: 6, ownerId: 2, x: 9, y: 10, prevX: 9, prevY: 10, vx: 0, vy: -220, damage: 40, fromNpc: true, expiresAt: 9 };
```

pass it to `buildSnapshot` and expect `{ kind: 'orb', id: 6, x: 9, y: 10, vx: 0, vy: -220 }` at the end of `entities`.

- [ ] **Step 2: Run** the two test files — FAIL.

- [ ] **Step 3: Implement.**

`entities.ts`:

```ts
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
```

Change `export type Projectile = BulletEntity | RocketEntity;` to `BulletEntity | RocketEntity | OrbEntity;` and add `OrbEntity` to `WorldEntity`.

`World.ts`:
- field `private readonly orbs = new Map<number, OrbEntity>();`
- public method:

```ts
  fireOrb(from: ShipEntity, angle: number): void {
    const direction = forward(angle);
    const x = from.x + direction.x * from.radius;
    const y = from.y + direction.y * from.radius;
    const orb: OrbEntity = {
      kind: 'orb',
      id: this.allocateId(),
      ownerId: from.id,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: direction.x * ORB_SPEED,
      vy: direction.y * ORB_SPEED,
      damage: ORB_DAMAGE,
      fromNpc: true,
      expiresAt: this.elapsed + ORB_LIFETIME,
    };
    this.orbs.set(orb.id, orb);
  }
```

- `stepProjectiles`: move orbs exactly like bullets (loop `for (const projectile of [...this.bullets.values(), ...this.orbs.values()])` updating `prevX/prevY/x/y`), and add `this.orbs` to the expiry loop collections.
- `tick`: add `this.resolveProjectileHits(this.orbs, events.hits);` after rockets.
- `rebuildGrid`: add `this.orbs` to the collection list.
- imports: `forward`, `ORB_DAMAGE`, `ORB_LIFETIME`, `ORB_SPEED`, `type OrbEntity`.

`snapshot.ts` `toEntityState`: add

```ts
    case 'orb':
      return { kind: 'orb', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy };
```

- [ ] **Step 4: Run** `pnpm vitest run packages/server` — PASS.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm test && pnpm lint` — green.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): add plasma orb projectiles"
```

---

### Task 4: BossDirector — patrol, target, fire, regenerate, respawn, loot

**Files:**
- Create: `packages/server/src/world/boss/BossDirector.ts`
- Modify: `packages/server/src/world/pirates/PirateBrain.ts`, `packages/server/src/world/World.ts`, `packages/server/src/app.ts`
- Test: `packages/server/test/BossDirector.test.ts` (new), `packages/server/test/World.leviathan.test.ts`

**Interfaces:**
- Consumes: `World.addLeviathan`, `World.fireOrb`, `isValidTarget` from `PirateBrain`, `randomGear(rng, mks)` and `CrateDrop` from `Loot`.
- Produces:

```ts
export interface BossHost {
  spawnLeviathan(x: number, y: number): ShipEntity;
  ship(id: number): ShipEntity | undefined;
  players(): Iterable<ShipEntity>;
  fireOrb(from: ShipEntity, angle: number): void;
}
export const ARENA_CENTER: Point;
export class BossDirector {
  constructor(rng: () => number);
  step(host: BossHost, time: number, dt: number): void;
  loot(): CrateDrop;
}
export function steerToward(ship: ShipEntity, goal: Point, desiredSpeed: number): ShipInput; // PirateBrain.ts
```

- `WorldOptions.boss?: boolean` (default off); `AppConfig.boss?: boolean` (default on in `createApp`).

- [ ] **Step 1: Write the failing tests.** Create `packages/server/test/BossDirector.test.ts`:

```ts
import {
  LEVIATHAN_AGGRO_RANGE,
  LEVIATHAN_FIRE_INTERVAL,
  LEVIATHAN_MAX_HULL,
  LEVIATHAN_PATROL_RADIUS,
  LEVIATHAN_RESPAWN,
  LEVIATHAN_SPREAD,
  TICK_DT,
} from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { ARENA_CENTER, BossDirector, type BossHost } from '../src/world/boss/BossDirector';
import { createLeviathan, createShip, type ShipEntity } from '../src/world/entities';
import { seeded, shipRecord } from './support/fixtures';

function fakeHost() {
  const ships = new Map<number, ShipEntity>();
  const shots: number[] = [];
  let nextId = 100;
  const host: BossHost = {
    spawnLeviathan: (x, y) => {
      const boss = createLeviathan((nextId += 1), x, y);
      ships.set(boss.id, boss);
      return boss;
    },
    ship: (id) => ships.get(id),
    players: () => [...ships.values()].filter((ship) => ship.npc === null),
    fireOrb: (_from, angle) => void shots.push(angle),
  };
  const addPlayer = (x: number, y: number): ShipEntity => {
    const player = createShip((nextId += 1), nextId, 'p', shipRecord(x, y, nextId));
    ships.set(player.id, player);
    return player;
  };
  const boss = (): ShipEntity | undefined => [...ships.values()].find((ship) => ship.npc === 'leviathan');
  return { host, ships, shots, addPlayer, boss };
}

function run(director: BossDirector, host: BossHost, from: number, seconds: number): number {
  let time = from;
  for (let i = 0; i < Math.ceil(seconds / TICK_DT); i += 1) {
    time += TICK_DT;
    director.step(host, time, TICK_DT);
  }
  return time;
}

describe('BossDirector', () => {
  it('spawns the leviathan at the arena center on the first step', () => {
    const { host, boss } = fakeHost();
    new BossDirector(seeded(1)).step(host, 0, TICK_DT);
    expect(boss()).toMatchObject({ x: ARENA_CENTER.x, y: ARENA_CENTER.y });
  });

  it('patrols with goals inside the patrol circle', () => {
    const { host, boss } = fakeHost();
    const director = new BossDirector(seeded(2));
    director.step(host, 0, TICK_DT);
    const leviathan = boss();
    if (!leviathan) throw new Error('no boss');
    for (let i = 0; i < 400; i += 1) {
      director.step(host, i * TICK_DT, TICK_DT);
      Object.assign(leviathan, { x: leviathan.x + leviathan.vx * TICK_DT, y: leviathan.y + leviathan.vy * TICK_DT });
      expect(Math.hypot(director.goal.x - ARENA_CENTER.x, director.goal.y - ARENA_CENTER.y)).toBeLessThanOrEqual(LEVIATHAN_PATROL_RADIUS);
    }
  });

  it('fires a three-orb spread at the nearest player in range every interval', () => {
    const { host, shots, addPlayer } = fakeHost();
    const director = new BossDirector(seeded(3));
    director.step(host, 0, TICK_DT);
    addPlayer(ARENA_CENTER.x, ARENA_CENTER.y - 600);
    run(director, host, 0, LEVIATHAN_FIRE_INTERVAL * 2 - TICK_DT);
    expect(shots).toHaveLength(6);
    expect(shots[1]).toBeCloseTo(0);
    expect((shots[2] ?? 0) - (shots[0] ?? 0)).toBeCloseTo(LEVIATHAN_SPREAD);
  });

  it('does not fire without a player in range', () => {
    const { host, shots, addPlayer } = fakeHost();
    const director = new BossDirector(seeded(4));
    director.step(host, 0, TICK_DT);
    addPlayer(ARENA_CENTER.x, ARENA_CENTER.y - LEVIATHAN_AGGRO_RANGE - 100);
    run(director, host, 0, LEVIATHAN_FIRE_INTERVAL * 3);
    expect(shots).toHaveLength(0);
  });

  it('regenerates only when no player is near', () => {
    const { host, boss, addPlayer } = fakeHost();
    const director = new BossDirector(seeded(5));
    director.step(host, 0, TICK_DT);
    const leviathan = boss();
    if (!leviathan) throw new Error('no boss');
    leviathan.hull = 1_000;
    run(director, host, 0, 2);
    expect(leviathan.hull).toBeCloseTo(1_010, 0);
    addPlayer(leviathan.x, leviathan.y - 500);
    run(director, host, 2, 2);
    expect(leviathan.hull).toBeCloseTo(1_010, 0);
  });

  it('respawns at full health after the respawn delay', () => {
    const { host, ships, boss } = fakeHost();
    const director = new BossDirector(seeded(6));
    director.step(host, 0, TICK_DT);
    const first = boss();
    if (!first) throw new Error('no boss');
    ships.delete(first.id);
    director.step(host, 10, TICK_DT);
    expect(boss()).toBeUndefined();
    director.step(host, 10 + LEVIATHAN_RESPAWN - 1, TICK_DT);
    expect(boss()).toBeUndefined();
    director.step(host, 10 + LEVIATHAN_RESPAWN, TICK_DT);
    expect(boss()?.hull).toBe(LEVIATHAN_MAX_HULL);
  });

  it('drops a rich crate with a Mk3 item', () => {
    const drop = new BossDirector(seeded(7)).loot();
    expect(drop).toMatchObject({ credits: 1_500, ore: 15 });
    expect(drop.gear?.mk).toBe(3);
  });
});
```

Append to `World.leviathan.test.ts`:

```ts
describe('Leviathan in the world', () => {
  it('spawns at the center when the boss is enabled', () => {
    const world = new World({ asteroidTarget: 0, boss: true });
    world.tick(TICK_DT);
    expect(world.npcShips().filter((ship) => ship.npc === 'leviathan')).toHaveLength(1);
  });

  it('drops loot and grants XP on death without a died event or pvp kill', () => {
    const world = new World({ asteroidTarget: 0, boss: true, rng: seeded(8) });
    world.tick(TICK_DT);
    const boss = world.npcShips().find((ship) => ship.npc === 'leviathan');
    if (!boss) throw new Error('no boss');
    const hunter = world.addShip(1, 'alice', shipRecord(boss.x, boss.y + 300, 1));
    boss.hull = 1;
    boss.lastHitBy = hunter.id;
    const events = world.tick(TICK_DT);
    expect(events.died).toEqual([]);
    expect(hunter.pvpKills).toBe(0);
    expect(hunter.captain.xp).toBe(500);
    world.tick(TICK_DT);
    expect(world.entitiesNear(boss.x, boss.y, 200).some((entity) => entity.kind === 'crate' && entity.credits === 1_500)).toBe(true);
  });
});
```

(import `seeded` if not already.)

- [ ] **Step 2: Run** both files — FAIL (module missing).

- [ ] **Step 3: Implement.**

`PirateBrain.ts` — export a steering helper reused by the boss (no behavior change for pirates):

```ts
export function steerToward(ship: ShipEntity, goal: Point, desiredSpeed: number): ShipInput {
  return movement(steer(ship, goal, desiredSpeed));
}
```

Create `packages/server/src/world/boss/BossDirector.ts`:

```ts
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
```

Note the regen test: with no players, `run(…, 2)` adds `5 × 2 = 10` hull; the second run has a player 500 px away, so no regen.

Note the fire test: the first volley comes after one interval (2.5 s, cooldown starts full), the second after two intervals, so `2 × interval - TICK_DT` seconds of steps after the spawn step yields exactly 6 shots. `shots[1]` is the center orb aimed straight up (`0` rad) because the player is directly above.

`World.ts`:
- `WorldOptions` gains `readonly boss?: boolean;`
- field `private readonly boss: BossDirector | null;` set in the constructor: `this.boss = options.boss ? new BossDirector(this.rng) : null;`
- host:

```ts
  private readonly bossHost: BossHost = {
    spawnLeviathan: (x, y) => this.addLeviathan(x, y),
    ship: (id) => this.ships.get(id),
    players: () => this.playerShips(),
    fireOrb: (from, angle) => this.fireOrb(from, angle),
  };
```

- `tick(dt)`: after `this.director?.step(...)` add `this.boss?.step(this.bossHost, this.elapsed, dt);`
- `resolveDeaths` npc branch:

```ts
      if (ship.npc !== null) {
        this.spawnCrate(ship.x, ship.y, this.npcLoot(ship.npc));
        this.ships.delete(ship.id);
        continue;
      }
```

with

```ts
  private npcLoot(kind: NpcKind): CrateDrop {
    const empty: CrateDrop = { credits: 0, ore: 0, gear: null };
    if (kind === 'leviathan') return this.boss?.loot() ?? empty;
    return this.director?.pirateLoot(kind) ?? empty;
  }
```

`app.ts`: `AppConfig` gains `readonly boss?: boolean;`; pass `boss: config.boss ?? true` to `new World(...)`.

Also set `boss: false` in `packages/server/test/integration.test.ts`'s main `createApp` call (and the pirate app's) so existing integration tests stay deterministic.

- [ ] **Step 4: Run** `pnpm vitest run packages/server` — PASS.

- [ ] **Step 5: Run** `pnpm typecheck && pnpm test && pnpm lint` — green.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): add the void leviathan boss director"
```

---

### Task 5: Snapshot health and boss radar blip

**Files:**
- Modify: `packages/server/src/net/snapshot.ts`, `packages/server/src/net/radar.ts`
- Test: `packages/server/test/snapshot.test.ts`, `packages/server/test/radar.test.ts`

**Interfaces:**
- Consumes: `createLeviathan`.
- Produces: `ShipState.health` (0–1, two decimals) only for `npc === 'leviathan'`; radar kind `'boss'`.

- [ ] **Step 1: Write the failing tests.** In `snapshot.test.ts`:

```ts
  it('sends health only for the leviathan', () => {
    const boss = createLeviathan(3, 50, 60);
    boss.hull = 1_000;
    expect(toEntityState(boss)).toMatchObject({ npc: 'leviathan', health: 0.33 });
    expect(toEntityState(createShip(2, 2, 'bob', shipRecord(30, 40, 2)))).not.toHaveProperty('health');
  });
```

In `radar.test.ts` (follow the existing test style there):

```ts
  it('marks the leviathan as a boss blip', () => {
    const self = createShip(1, 1, 'alice', shipRecord(0, 0, 1));
    const boss = createLeviathan(2, 10_000, 10_000);
    expect(buildRadar(self, [self, boss])).toEqual([{ x: 10_000, y: 10_000, kind: 'boss' }]);
  });
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement.** In `toEntityState`, ship case: spread `...(entity.npc === 'leviathan' ? { health: Math.round((entity.hull / entity.stats.maxHull) * 100) / 100 } : {})` at the end of the object. In `radar.ts`:

```ts
function blipKind(ship: ShipEntity): RadarBlip['kind'] {
  if (ship.npc === null) return 'player';
  return ship.npc === 'leviathan' ? 'boss' : 'pirate';
}
```

and use `kind: blipKind(ship)`.

- [ ] **Step 4: Run** `pnpm vitest run packages/server` — PASS; then `pnpm typecheck && pnpm test && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): send leviathan health and boss radar blips"
```

---

### Task 6: Client rendering

**Files:**
- Modify: `packages/client/src/render/spriteIds.ts`, `packages/client/src/render/Renderer.ts`, `packages/client/src/render/Effects.ts`, `packages/client/src/ui/Hud.ts`
- Test: `packages/client/test/spriteIds.test.ts`, `packages/client/test/hud.test.ts`

**Interfaces:**
- Consumes: `ShipState.health`, `OrbState`, radar `'boss'`, `NPC_NAMES`.
- Produces: `spriteIdFor` returns `'leviathan'` and `'plasma_orb'`; `vanishEffectFor('leviathan') === 'leviathan_death'`; `MinimapDot` gains `size`; `HitEffect` gains `offset`.

- [ ] **Step 1: Write the failing tests.** `spriteIds.test.ts`:

```ts
  it('maps the leviathan, orbs and their death effect', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'Void Leviathan', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout', npc: 'leviathan', miningTargetId: null, health: 1 })).toBe('leviathan');
    expect(spriteIdFor({ kind: 'orb', id: 2, x: 0, y: 0, vx: 0, vy: 0 })).toBe('plasma_orb');
    expect(vanishEffectFor('leviathan')).toBe('leviathan_death');
  });
```

`hud.test.ts` — update the `minimapDots` expectation to include `size: 2` on both dots, and add:

```ts
  it('draws the boss larger and purple', () => {
    expect(minimapDots([{ x: 10_000, y: 10_000, kind: 'boss' }], 160 / 20_000)).toEqual([{ x: 80, y: 80, color: '#c04bff', size: 6 }]);
  });
```

- [ ] **Step 2: Run** `pnpm vitest run packages/client` — FAIL.

- [ ] **Step 3: Implement.**

`spriteIds.ts`:

```ts
    case 'ship':
      if (entity.npc === 'leviathan') return 'leviathan';
      return entity.npc ? `pirate_${entity.npc}` : `ship_${entity.hullId}`;
```

and in `vanishEffectFor`: `if (spriteId === 'leviathan') return 'leviathan_death';` before the ship check.

`Hud.ts`:

```ts
const RADAR_DOT_SIZES: Readonly<Record<RadarBlip['kind'], number>> = { player: 2, pirate: 2, boss: 6 };
```

`MinimapDot` gains `readonly size: number;`, `minimapDots` sets `size: RADAR_DOT_SIZES[blip.kind]`, and `drawMinimap` draws `fillRect(dot.x - dot.size / 2, dot.y - dot.size / 2, dot.size, dot.size)`. Remove the now-unused `RADAR_DOT` constant.

`Effects.ts`: `HitEffect` gains `readonly offset: number;`; replace the `HULL_HIT_OFFSET` constant use with `offset` (keep `0` for shield hits): `const offset = shield ? 0 : hit.offset;` (destructure `offset` in the parameter).

`Renderer.ts`:
- `const ANIMATIONS: Readonly<Record<string, number>> = { space_mine: 0.8, leviathan: 1.6, plasma_orb: 0.3 };` replacing `MINE_BLINK_SECONDS`; body creation:

```ts
    const loop = ANIMATIONS[spriteId];
    const body = loop === undefined ? this.sprites.create(spriteId) : this.sprites.animate(spriteId, loop, true);
```

- `EntityView` gains `health: Graphics | null` and `labelOffset: number`.
- `createLabel`: text `NPC_NAMES[entity.npc]`, fill `entity.npc === 'leviathan' ? 0xc04bff : 0xff5a4f`.
- in `replaceView`, for `entity.kind === 'ship' && entity.npc === 'leviathan'` create `const health = new Graphics(); this.layers.labels.addChild(health);`, else `null`; `labelOffset = -(this.sprites.size(spriteId).height / 2 + 14)` for the leviathan, `LABEL_OFFSET_Y` otherwise; the leviathan gets no `shield_bubble`.
- in `syncEntity`, after positioning the label:

```ts
    if (view.health && entity.kind === 'ship') this.drawHealth(view.health, entity.x, entity.y + view.labelOffset + 12, entity.health ?? 1);
```

with

```ts
  private drawHealth(bar: Graphics, x: number, y: number, health: number): void {
    const width = 120;
    bar.clear().rect(x - width / 2, y, width, 6).fill({ color: 0x1d1030, alpha: 0.85 }).rect(x - width / 2, y, width * health, 6).fill(0xc04bff);
  }
```

- `destroyView` also destroys `view.health`.
- `showHits`: pass `offset: view.spriteId === 'leviathan' ? 70 : 18`.

- [ ] **Step 4: Run** `pnpm vitest run packages/client` — PASS; then `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): render the void leviathan, plasma orbs and boss radar"
```

---

### Task 7: Rules text, integration test and art check

**Files:**
- Modify: `packages/client/index.html`, `controls.md`, `packages/server/test/integration.test.ts`
- Assets: `assets/world/leviathan.png`, `assets/bullets/plasma_orb.png`, `assets/fx/leviathan_death.png` (from Codex)

- [ ] **Step 1: Write the integration test** inside the `describe('server integration', …)` block of `integration.test.ts`. The shared test app runs with `boss: false`, so the test places the Leviathan and fires one orb through the public `World` methods:

```ts
  it('sends the leviathan and its orbs to a nearby player', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const ship = app.world.shipById((await pump(alice, 'welcome')).shipId);
    if (!ship) throw new Error('ship missing');
    Object.assign(ship, { x: OPEN_SPACE.x, y: OPEN_SPACE.y + 600, vx: 0, vy: 0 });
    const boss = app.world.addLeviathan(OPEN_SPACE.x, OPEN_SPACE.y);
    app.world.fireOrb(boss, Math.PI);
    alice.clear();
    const seen = await pump(alice, 'snapshot', (s) => s.entities.some((e) => e.kind === 'orb'));
    const leviathan = seen.entities.find((e) => e.kind === 'ship' && e.npc === 'leviathan');
    expect(leviathan).toMatchObject({ health: 1 });
  });
```

- [ ] **Step 2: Run** `pnpm vitest run packages/server/test/integration.test.ts` — PASS (the behavior comes from Tasks 2–5). If it fails, fix the cause; do not loosen the assertion.

- [ ] **Step 3: Rules text.** In `packages/client/index.html`, in the Rules list after the Pirates item:

```html
            <li><b>Void Leviathan.</b> A huge alien monster drifts around the center of the arena. Its slow plasma orbs hit for 40; dodge them or raise your shield. It drops 1 500 credits, ore and a Mk3 item, and returns 10 minutes after it dies.</li>
```

In `controls.md`, after the Pirates bullet:

```md
- **Void Leviathan:** a huge alien monster patrols the center of the map (purple dot on the minimap). It fires slow plasma orbs (40 damage each, blocked by shields) at pilots within ~1 400 px, has 3 000 hull and regenerates when nobody is near. It drops a crate with 1 500 cr, 15 ore and a Mk3 item, and respawns 10 minutes later.
```

- [ ] **Step 4: Art check.** Wait for Codex's three PNGs, preview them (render each sheet on `#05060D`), then run `pnpm assets:check` → `assets ok`.

- [ ] **Step 5: Full verification:** `pnpm typecheck && pnpm test && pnpm lint && pnpm assets:check && pnpm build`.

- [ ] **Step 6: Commit**

```bash
git add packages controls.md assets
git commit -m "feat: document the void leviathan and add its art"
```
