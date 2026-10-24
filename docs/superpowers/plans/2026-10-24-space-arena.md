# Space Arena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. When run under Orca orchestration, follow the DAG in "Orchestration" below.

**Goal:** Build a 2D multiplayer browser space-combat game with persistent accounts, an authoritative server, PvP, asteroid mining, safe-zone banking and ship upgrades.

**Architecture:** pnpm TypeScript monorepo. `shared` holds protocol, constants, upgrade tables and the deterministic physics step used by both sides. `server` is a single Node process: HTTP auth endpoints, WebSocket gateway, 30 Hz authoritative world simulation with a spatial grid, SQLite persistence. `client` is Vite + PixiJS with client-side prediction for the own ship and interpolation for everything else.

**Tech Stack:** TypeScript 5.6 (strict), pnpm 9 workspaces, Node 22, `ws` 8, `better-sqlite3` 11, `argon2`, `zod` 3, PixiJS 8, Vite 5, Vitest 2, ESLint 9 + typescript-eslint 8, `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-24-space-arena-design.md`

## Global Constraints

- TypeScript `strict: true`; never use `any`; no `as` casts except the two places this plan shows explicitly (test helpers parsing trusted server output).
- No comments that describe *what* code does. Comment only *why* for non-obvious rules.
- Small focused functions, early returns over nested conditionals.
- Do not add `Co-Authored-By` or any Claude attribution to commits (user rule).
- Work happens on `master`. Each task ends in exactly one commit.
- Gates before every commit: `pnpm typecheck`, `pnpm test`, `pnpm lint` all pass.
- Controls: W thrust, S reverse/brake, A/D rotate, Space fire, Shift shield.
- Tick 30 Hz, snapshots 20 Hz, world 20 000 × 20 000 px, 3 safe zones of radius 800.
- Death: lose installed upgrades, carried ore, unbanked credits; banked credits survive; crate drops ore + 50% unbanked credits.
- Docking: inside zone, speed ≤ 60 px/s, no damage in last 5 s. Docking sells ore (10 credits each), banks credits, repairs hull.
- Disconnect outside a safe zone lingers 10 s.
- Passwords: argon2id. Usernames `^[a-zA-Z0-9_]{3,16}$`, passwords 8–128 chars. Session token 32 random bytes, stored as SHA-256, 7-day expiry.
- Inbound client messages validated with zod; invalid message closes the socket. Input rate cap 40/s.
- Missing sprites render as placeholders; code never waits on art.

## Orchestration (Orca)

Coordinator: **Opus** (owns spec + plan, dispatches tasks, reviews each result against spec and plan, merges to `master` in DAG order). Code workers: **Sonnet**, one worktree per task. Art worker: **Codex**.

| Task | Worker | Depends on |
|---|---|---|
| 1 Monorepo scaffold + world geometry | Sonnet | — |
| 2 Upgrade tables | Sonnet | 1 |
| 3 Physics step | Sonnet | 2 |
| 4 Protocol | Sonnet | 3 |
| 5 Asset contract + validator | Sonnet | 4 |
| 6 PlayerRepository | Sonnet | 2 |
| 7 Auth + HTTP | Sonnet | 6 |
| 8 SpatialGrid + geometry | Sonnet | 1 |
| 9 World core: ships, bullets, combat, death | Sonnet | 4, 6, 8 |
| 10 Asteroids + pickups | Sonnet | 9 |
| 11 Economy + docking | Sonnet | 10 |
| 12 Snapshots | Sonnet | 9 |
| 13 Gateway, GameLoop, app, main | Sonnet | 7, 11, 12 |
| 14 Server integration test | Sonnet | 13 |
| 15 Generate sprites | Codex | 5 |
| 16 Client scaffold, API, connection, login | Sonnet | 4 |
| 17 Rendering + interpolation | Sonnet | 5, 16 |
| 18 Input + prediction | Sonnet | 16 |
| 19 HUD, shop, game session wiring | Sonnet | 17, 18 |
| 20 Build + playtest | Opus (coordinator) | 14, 15, 19 |

Tasks 1→2→3→4→5 are a chain because each appends an export to `packages/shared/src/index.ts`. Task 1 declares every dependency of every package so later tasks never touch `pnpm-lock.yaml`.

## File Map

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, vitest.config.ts, eslint.config.js, .gitignore
packages/shared/src/  constants.ts world.ts upgrades.ts physics.ts protocol.ts assets.ts index.ts
packages/shared/test/ world.test.ts upgrades.test.ts physics.test.ts protocol.test.ts assets.test.ts
packages/server/src/
  db/PlayerRepository.ts
  auth/passwords.ts auth/RateLimiter.ts auth/AuthService.ts
  http/HttpServer.ts
  world/SpatialGrid.ts world/geometry.ts world/entities.ts world/Combat.ts world/AsteroidField.ts world/Economy.ts world/World.ts
  net/snapshot.ts net/Gateway.ts
  GameLoop.ts app.ts main.ts
packages/server/test/ (one file per src unit) + support/seeded.ts + integration.test.ts
packages/client/
  index.html vite.config.ts
  src/ main.ts style.css api.ts net/Connection.ts ui/LoginScreen.ts
       render/SpriteFactory.ts render/spriteIds.ts render/Effects.ts render/Renderer.ts
       sim/Interpolator.ts sim/Predictor.ts input/InputSampler.ts
       ui/Hud.ts ui/ShopPanel.ts ui/Toast.ts game/GameSession.ts
  test/ api.test.ts connection.test.ts spriteIds.test.ts interpolator.test.ts predictor.test.ts input.test.ts hud.test.ts shop.test.ts
scripts/ package.json tsconfig.json assetCheck.ts validate-assets.ts assetCheck.test.ts
assets/ manifest.json STYLE.md + generated PNGs
```

---

### Task 1: Monorepo scaffold + world geometry

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/constants.ts`, `packages/shared/src/world.ts`, `packages/shared/src/index.ts`
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/src/main.ts` (stub)
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`, `packages/client/src/main.ts` (stub)
- Create: `scripts/package.json`, `scripts/tsconfig.json`, `scripts/validate-assets.ts` (stub)
- Test: `packages/shared/test/world.test.ts`

**Interfaces:**
- Produces: all constants below; `SafeZone`, `SAFE_ZONES`, `zoneAt(x, y): SafeZone | undefined`, `nearestZone(x, y): SafeZone`, `distanceToNearestZone(x, y): number` (distance to zone edge, negative inside), `clampToWorld(v): number`.

- [ ] **Step 1: Root config files**

`package.json`:
```json
{
  "name": "space-arena",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev:server": "tsx watch packages/server/src/main.ts",
    "dev:client": "pnpm --filter @arena/client dev",
    "build": "pnpm --filter @arena/client build",
    "start": "tsx packages/server/src/main.ts",
    "test": "vitest run",
    "typecheck": "tsc -p packages/shared && tsc -p packages/server && tsc -p packages/client && tsc -p scripts",
    "lint": "eslint .",
    "assets:check": "tsx scripts/validate-assets.ts"
  },
  "devDependencies": {
    "@eslint/js": "^9.12.0",
    "@types/node": "^22.7.0",
    "eslint": "^9.12.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.8.0",
    "vitest": "^2.1.0"
  },
  "pnpm": { "onlyBuiltDependencies": ["argon2", "better-sqlite3", "esbuild"] }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - scripts
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts'],
    passWithNoTests: true,
  },
});
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
```

`.gitignore`:
```
node_modules/
dist/
*.db
*.db-wal
*.db-shm
```

- [ ] **Step 2: Package manifests and tsconfigs**

`packages/shared/package.json`:
```json
{
  "name": "@arena/shared",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": { "zod": "^3.23.8" }
}
```
`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

`packages/server/package.json`:
```json
{
  "name": "@arena/server",
  "private": true,
  "type": "module",
  "dependencies": {
    "@arena/shared": "workspace:*",
    "argon2": "^0.41.1",
    "better-sqlite3": "^11.3.0",
    "ws": "^8.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/ws": "^8.5.12"
  }
}
```
`packages/server/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src", "test"] }
```
`packages/server/src/main.ts`:
```ts
export {};
```

`packages/client/package.json`:
```json
{
  "name": "@arena/client",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": {
    "@arena/shared": "workspace:*",
    "pixi.js": "^8.5.0",
    "zod": "^3.23.8"
  },
  "devDependencies": { "vite": "^5.4.0" }
}
```
`packages/client/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"] }, "include": ["src", "test"] }
```
`packages/client/src/main.ts`:
```ts
export {};
```

`scripts/package.json`:
```json
{
  "name": "@arena/scripts",
  "private": true,
  "type": "module",
  "dependencies": { "@arena/shared": "workspace:*", "zod": "^3.23.8" }
}
```
`scripts/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["*.ts"] }
```
`scripts/validate-assets.ts`:
```ts
export {};
```

Run: `pnpm install`
Expected: lockfile created, no errors, native builds of `argon2` and `better-sqlite3` succeed.

- [ ] **Step 3: Write the failing test** — `packages/shared/test/world.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../src/constants';
import { clampToWorld, distanceToNearestZone, nearestZone, zoneAt } from '../src/world';

describe('zoneAt', () => {
  it('finds the zone containing a point', () => {
    expect(zoneAt(4_000, 4_100)?.id).toBe('alpha');
  });

  it('returns undefined in open space', () => {
    expect(zoneAt(8_000, 8_000)).toBeUndefined();
  });
});

describe('nearestZone', () => {
  it('picks the closest zone', () => {
    expect(nearestZone(15_000, 6_000).id).toBe('beta');
  });
});

describe('distanceToNearestZone', () => {
  it('measures to the zone edge', () => {
    expect(distanceToNearestZone(4_000, 5_800)).toBeCloseTo(1_000);
  });

  it('is negative inside a zone', () => {
    expect(distanceToNearestZone(4_000, 4_000)).toBeCloseTo(-800);
  });
});

describe('clampToWorld', () => {
  it('clamps into world bounds', () => {
    expect(clampToWorld(-5)).toBe(0);
    expect(clampToWorld(WORLD_SIZE + 5)).toBe(WORLD_SIZE);
    expect(clampToWorld(123)).toBe(123);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test packages/shared/test/world.test.ts`
Expected: FAIL — cannot resolve `../src/constants`.

- [ ] **Step 5: Implement**

`packages/shared/src/constants.ts`:
```ts
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 20;
export const WORLD_SIZE = 20_000;
export const VIEW_RADIUS = 1_600;
export const SHIP_RADIUS = 24;
export const BULLET_LIFETIME = 1.5;
export const SHIELD_LOCKOUT = 1;
export const REVERSE_THRUST_FACTOR = 0.5;
export const DOCK_MAX_SPEED = 60;
export const DOCK_COMBAT_COOLDOWN = 5;
export const DISCONNECT_LINGER = 10;
export const MAX_INPUTS_PER_SECOND = 40;
export const ORE_PRICE = 10;
export const BOUNTY_BASE = 100;
export const BOUNTY_SHARE = 0.25;
export const LOOT_CREDIT_SHARE = 0.5;
export const PICKUP_RADIUS = 40;
export const ORE_PICKUP_LIFETIME = 60;
export const CRATE_LIFETIME = 120;
export const ASTEROID_TARGET_COUNT = 600;
export const ASTEROID_MIN_RADIUS = 30;
export const ASTEROID_MAX_RADIUS = 70;
```

`packages/shared/src/world.ts`:
```ts
import { WORLD_SIZE } from './constants';

export interface SafeZone {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export const SAFE_ZONES: readonly SafeZone[] = [
  { id: 'alpha', x: 4_000, y: 4_000, radius: 800 },
  { id: 'beta', x: 16_000, y: 5_000, radius: 800 },
  { id: 'gamma', x: 10_000, y: 16_000, radius: 800 },
];

function centerDistance(zone: SafeZone, x: number, y: number): number {
  return Math.hypot(x - zone.x, y - zone.y);
}

export function zoneAt(x: number, y: number): SafeZone | undefined {
  return SAFE_ZONES.find((zone) => centerDistance(zone, x, y) <= zone.radius);
}

export function nearestZone(x: number, y: number): SafeZone {
  return SAFE_ZONES.reduce((best, zone) =>
    centerDistance(zone, x, y) < centerDistance(best, x, y) ? zone : best,
  );
}

export function distanceToNearestZone(x: number, y: number): number {
  const zone = nearestZone(x, y);
  return centerDistance(zone, x, y) - zone.radius;
}

export function clampToWorld(value: number): number {
  return Math.min(WORLD_SIZE, Math.max(0, value));
}
```

`packages/shared/src/index.ts`:
```ts
export * from './constants';
export * from './world';
```

- [ ] **Step 6: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 6 tests PASS, typecheck and lint clean.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: scaffold monorepo and shared world geometry"
```

---

### Task 2: Upgrade tables

**Files:**
- Create: `packages/shared/src/upgrades.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/upgrades.test.ts`

**Interfaces:**
- Produces: `UPGRADE_LINES`, `UpgradeLine`, `Loadout`, `BASE_LOADOUT`, `MAX_TIER`, `ShipStats`, `statsFor(loadout): ShipStats`, `upgradeCost(line, tier): number`, `nextTierCost(loadout, line): number | null`, `loadoutValue(loadout): number`, `withUpgrade(loadout, line): Loadout`.

- [ ] **Step 1: Write the failing test** — `packages/shared/test/upgrades.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  BASE_LOADOUT,
  loadoutValue,
  nextTierCost,
  statsFor,
  upgradeCost,
  withUpgrade,
} from '../src/upgrades';

describe('statsFor', () => {
  it('returns spec base stats for the base loadout', () => {
    const stats = statsFor(BASE_LOADOUT);
    expect(stats.maxHull).toBe(100);
    expect(stats.thrust).toBe(200);
    expect(stats.maxSpeed).toBe(400);
    expect(stats.turnRate).toBeCloseTo(Math.PI);
    expect(stats.damage).toBe(10);
    expect(stats.fireRate).toBe(4);
    expect(stats.bulletSpeed).toBe(800);
    expect(stats.maxShield).toBe(100);
    expect(stats.shieldRegen).toBe(15);
    expect(stats.shieldDrain).toBe(30);
    expect(stats.cargoCapacity).toBe(20);
  });

  it('adds 22% per tier', () => {
    expect(statsFor({ ...BASE_LOADOUT, weapon: 2 }).damage).toBeCloseTo(14.4);
  });

  it('adds 10 cargo per cargo tier', () => {
    expect(statsFor({ ...BASE_LOADOUT, cargo: 3 }).cargoCapacity).toBe(50);
  });
});

describe('costs', () => {
  it('doubles per tier', () => {
    expect(upgradeCost('hull', 1)).toBe(200);
    expect(upgradeCost('hull', 3)).toBe(800);
  });

  it('rejects tiers out of range', () => {
    expect(() => upgradeCost('cargo', 4)).toThrow(RangeError);
    expect(() => upgradeCost('hull', 0)).toThrow(RangeError);
  });

  it('returns null at max tier', () => {
    expect(nextTierCost({ ...BASE_LOADOUT, cargo: 3 }, 'cargo')).toBeNull();
    expect(nextTierCost(BASE_LOADOUT, 'weapon')).toBe(250);
  });

  it('sums installed tiers', () => {
    expect(loadoutValue({ ...BASE_LOADOUT, hull: 2, weapon: 1 })).toBe(200 + 400 + 250);
  });

  it('increments one line', () => {
    expect(withUpgrade(BASE_LOADOUT, 'engine')).toEqual({ ...BASE_LOADOUT, engine: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/shared/test/upgrades.test.ts`
Expected: FAIL — cannot resolve `../src/upgrades`.

- [ ] **Step 3: Implement** — `packages/shared/src/upgrades.ts`

```ts
export const UPGRADE_LINES = ['hull', 'engine', 'weapon', 'shield', 'cargo'] as const;

export type UpgradeLine = (typeof UPGRADE_LINES)[number];

export type Loadout = Readonly<Record<UpgradeLine, number>>;

export const BASE_LOADOUT: Loadout = { hull: 0, engine: 0, weapon: 0, shield: 0, cargo: 0 };

export const MAX_TIER: Loadout = { hull: 5, engine: 5, weapon: 5, shield: 5, cargo: 3 };

const BASE_COST: Loadout = { hull: 200, engine: 200, weapon: 250, shield: 200, cargo: 150 };

const TIER_STEP = 0.22;

export interface ShipStats {
  readonly maxHull: number;
  readonly thrust: number;
  readonly maxSpeed: number;
  readonly turnRate: number;
  readonly damage: number;
  readonly fireRate: number;
  readonly bulletSpeed: number;
  readonly maxShield: number;
  readonly shieldRegen: number;
  readonly shieldDrain: number;
  readonly cargoCapacity: number;
}

function scale(base: number, tier: number): number {
  return base * (1 + TIER_STEP * tier);
}

export function statsFor(loadout: Loadout): ShipStats {
  return {
    maxHull: scale(100, loadout.hull),
    thrust: scale(200, loadout.engine),
    maxSpeed: scale(400, loadout.engine),
    turnRate: scale(Math.PI, loadout.engine),
    damage: scale(10, loadout.weapon),
    fireRate: scale(4, loadout.weapon),
    bulletSpeed: scale(800, loadout.weapon),
    maxShield: scale(100, loadout.shield),
    shieldRegen: scale(15, loadout.shield),
    shieldDrain: 30,
    cargoCapacity: 20 + 10 * loadout.cargo,
  };
}

export function upgradeCost(line: UpgradeLine, tier: number): number {
  if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER[line]) {
    throw new RangeError(`${line} has no tier ${tier}`);
  }
  return BASE_COST[line] * 2 ** (tier - 1);
}

export function nextTierCost(loadout: Loadout, line: UpgradeLine): number | null {
  const next = loadout[line] + 1;
  return next > MAX_TIER[line] ? null : upgradeCost(line, next);
}

export function loadoutValue(loadout: Loadout): number {
  let total = 0;
  for (const line of UPGRADE_LINES) {
    for (let tier = 1; tier <= loadout[line]; tier += 1) total += upgradeCost(line, tier);
  }
  return total;
}

export function withUpgrade(loadout: Loadout, line: UpgradeLine): Loadout {
  return { ...loadout, [line]: loadout[line] + 1 };
}
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './upgrades';
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add upgrade tables and ship stats"
```

---

### Task 3: Physics step

**Files:**
- Create: `packages/shared/src/physics.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/physics.test.ts`

**Interfaces:**
- Consumes: `ShipStats` (Task 2), `clampToWorld` (Task 1), `REVERSE_THRUST_FACTOR`.
- Produces: `ShipInput`, `IDLE_INPUT`, `ShipMotion`, `forward(angle): { x: number; y: number }`, `stepMotion(motion, input, stats, dt): ShipMotion`. Angle 0 = nose up (−y), positive angle = clockwise on screen.

- [ ] **Step 1: Write the failing test** — `packages/shared/test/physics.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, stepMotion, type ShipMotion } from '../src/physics';
import { BASE_LOADOUT, statsFor } from '../src/upgrades';

const stats = statsFor(BASE_LOADOUT);
const at = (x = 1_000, y = 1_000): ShipMotion => ({ x, y, vx: 0, vy: 0, angle: 0 });

describe('stepMotion', () => {
  it('thrusts toward the nose, which points up at angle 0', () => {
    const next = stepMotion(at(), { ...IDLE_INPUT, thrust: true }, stats, 0.1);
    expect(next.vx).toBeCloseTo(0);
    expect(next.vy).toBeCloseTo(-20);
    expect(next.y).toBeCloseTo(998);
  });

  it('reverse thrust pushes backward at half strength', () => {
    const next = stepMotion(at(), { ...IDLE_INPUT, reverse: true }, stats, 0.1);
    expect(next.vy).toBeCloseTo(10);
  });

  it('rotates clockwise with D', () => {
    const next = stepMotion(at(), { ...IDLE_INPUT, right: true }, stats, 0.1);
    expect(next.angle).toBeCloseTo(Math.PI * 0.1);
  });

  it('rotates counter-clockwise with A', () => {
    const next = stepMotion(at(), { ...IDLE_INPUT, left: true }, stats, 0.1);
    expect(next.angle).toBeCloseTo(-Math.PI * 0.1);
  });

  it('keeps drifting without input', () => {
    const next = stepMotion({ ...at(), vx: 50 }, IDLE_INPUT, stats, 0.1);
    expect(next.vx).toBe(50);
    expect(next.x).toBeCloseTo(1_005);
  });

  it('clamps speed to maxSpeed', () => {
    const next = stepMotion({ ...at(), vy: -400 }, { ...IDLE_INPUT, thrust: true }, stats, 1);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(400);
  });

  it('stops at world walls', () => {
    const next = stepMotion({ ...at(5, 1_000), vx: -100 }, IDLE_INPUT, stats, 0.1);
    expect(next.x).toBe(0);
    expect(next.vx).toBe(0);
  });

  it('is deterministic', () => {
    const input = { ...IDLE_INPUT, thrust: true, right: true };
    expect(stepMotion(at(), input, stats, 1 / 30)).toEqual(stepMotion(at(), input, stats, 1 / 30));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/shared/test/physics.test.ts`
Expected: FAIL — cannot resolve `../src/physics`.

- [ ] **Step 3: Implement** — `packages/shared/src/physics.ts`

```ts
import { REVERSE_THRUST_FACTOR } from './constants';
import type { ShipStats } from './upgrades';
import { clampToWorld } from './world';

export interface ShipInput {
  readonly thrust: boolean;
  readonly reverse: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly fire: boolean;
  readonly shield: boolean;
}

export const IDLE_INPUT: ShipInput = {
  thrust: false,
  reverse: false,
  left: false,
  right: false,
  fire: false,
  shield: false,
};

export interface ShipMotion {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
}

export function forward(angle: number): { readonly x: number; readonly y: number } {
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

function acceleration(input: ShipInput, stats: ShipStats): number {
  const push = input.thrust ? stats.thrust : 0;
  const pull = input.reverse ? stats.thrust * REVERSE_THRUST_FACTOR : 0;
  return push - pull;
}

function limitSpeed(vx: number, vy: number, maxSpeed: number): [number, number] {
  const speed = Math.hypot(vx, vy);
  if (speed <= maxSpeed) return [vx, vy];
  const factor = maxSpeed / speed;
  return [vx * factor, vy * factor];
}

export function stepMotion(
  motion: ShipMotion,
  input: ShipInput,
  stats: ShipStats,
  dt: number,
): ShipMotion {
  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const angle = motion.angle + turn * stats.turnRate * dt;
  const direction = forward(angle);
  const accel = acceleration(input, stats);
  const [vx, vy] = limitSpeed(
    motion.vx + direction.x * accel * dt,
    motion.vy + direction.y * accel * dt,
    stats.maxSpeed,
  );
  const rawX = motion.x + vx * dt;
  const rawY = motion.y + vy * dt;
  const x = clampToWorld(rawX);
  const y = clampToWorld(rawY);
  return { x, y, vx: x === rawX ? vx : 0, vy: y === rawY ? vy : 0, angle };
}
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './physics';
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add deterministic ship physics step"
```

---

### Task 4: Protocol

**Files:**
- Create: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/protocol.test.ts`

**Interfaces:**
- Consumes: `UPGRADE_LINES`, `UpgradeLine`, `Loadout` (Task 2), `SafeZone` (Task 1).
- Produces: `ClientMessage`, `InputMessage`, `parseClientMessage(raw: string): ClientMessage | null`; server message types `ShipState`, `BulletState`, `AsteroidState`, `OreState`, `CrateState`, `EntityState`, `SelfState`, `WelcomeMessage`, `SnapshotMessage`, `DiedMessage`, `BuyFailure`, `BuyResultMessage`, `KickedMessage`, `ServerMessage`.

- [ ] **Step 1: Write the failing test** — `packages/shared/test/protocol.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol';

const input = {
  type: 'input',
  seq: 7,
  thrust: true,
  reverse: false,
  left: false,
  right: true,
  fire: false,
  shield: false,
};

describe('parseClientMessage', () => {
  it('accepts hello', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'hello', token: 'abc' }))).toEqual({
      type: 'hello',
      token: 'abc',
    });
  });

  it('accepts input', () => {
    expect(parseClientMessage(JSON.stringify(input))).toEqual(input);
  });

  it('accepts buy with a known line', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'buy', line: 'weapon' }))).toEqual({
      type: 'buy',
      line: 'weapon',
    });
  });

  it('rejects unknown upgrade lines', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'buy', line: 'laser' }))).toBeNull();
  });

  it('rejects extra fields', () => {
    expect(parseClientMessage(JSON.stringify({ ...input, x: 5 }))).toBeNull();
  });

  it('rejects negative or fractional seq', () => {
    expect(parseClientMessage(JSON.stringify({ ...input, seq: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...input, seq: 1.5 }))).toBeNull();
  });

  it('rejects invalid JSON', () => {
    expect(parseClientMessage('{nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/shared/test/protocol.test.ts`
Expected: FAIL — cannot resolve `../src/protocol`.

- [ ] **Step 3: Implement** — `packages/shared/src/protocol.ts`

```ts
import { z } from 'zod';
import { UPGRADE_LINES, type Loadout, type UpgradeLine } from './upgrades';
import type { SafeZone } from './world';

const HelloSchema = z.object({ type: z.literal('hello'), token: z.string().min(1).max(128) }).strict();

const InputSchema = z
  .object({
    type: z.literal('input'),
    seq: z.number().int().nonnegative(),
    thrust: z.boolean(),
    reverse: z.boolean(),
    left: z.boolean(),
    right: z.boolean(),
    fire: z.boolean(),
    shield: z.boolean(),
  })
  .strict();

const BuySchema = z.object({ type: z.literal('buy'), line: z.enum(UPGRADE_LINES) }).strict();

const ClientMessageSchema = z.discriminatedUnion('type', [HelloSchema, InputSchema, BuySchema]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type InputMessage = z.infer<typeof InputSchema>;

export function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ClientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}

export interface ShipState {
  readonly kind: 'ship';
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly shieldUp: boolean;
  readonly hullTier: number;
}

export interface BulletState {
  readonly kind: 'bullet';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly tier: number;
}

export interface AsteroidState {
  readonly kind: 'asteroid';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly variant: number;
}

export interface OreState {
  readonly kind: 'ore';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface CrateState {
  readonly kind: 'crate';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export type EntityState = ShipState | BulletState | AsteroidState | OreState | CrateState;

export interface SelfState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly hull: number;
  readonly maxHull: number;
  readonly shieldEnergy: number;
  readonly maxShield: number;
  readonly shieldUp: boolean;
  readonly ore: number;
  readonly cargoCapacity: number;
  readonly carriedCredits: number;
  readonly bankedCredits: number;
  readonly loadout: Loadout;
  readonly docked: boolean;
}

export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly shipId: number;
  readonly worldSize: number;
  readonly safeZones: readonly SafeZone[];
}

export interface SnapshotMessage {
  readonly type: 'snapshot';
  readonly tick: number;
  readonly lastSeq: number;
  readonly self: SelfState;
  readonly entities: readonly EntityState[];
}

export interface DiedMessage {
  readonly type: 'died';
  readonly killer: string | null;
}

export type BuyFailure = 'not_docked' | 'max_tier' | 'insufficient_credits';

export type BuyResultMessage =
  | { readonly type: 'buyResult'; readonly line: UpgradeLine; readonly ok: true }
  | { readonly type: 'buyResult'; readonly line: UpgradeLine; readonly ok: false; readonly reason: BuyFailure };

export interface KickedMessage {
  readonly type: 'kicked';
  readonly reason: string;
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | DiedMessage
  | BuyResultMessage
  | KickedMessage;
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './protocol';
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add client and server protocol"
```

---

### Task 5: Asset contract + validator

**Files:**
- Create: `packages/shared/src/assets.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `assets/manifest.json`, `assets/STYLE.md`
- Create: `scripts/assetCheck.ts`; Modify: `scripts/validate-assets.ts` (replace stub)
- Test: `packages/shared/test/assets.test.ts`, `scripts/assetCheck.test.ts`

**Interfaces:**
- Produces: `ManifestSchema`, `SpriteSpec { id, file, width, height, anchor: [number, number], frames }`, `Manifest`; `readPngSize(data: Buffer)`, `checkAssets(assetsDir): Promise<string[]>`. Client loads `/manifest.json` and `/<file>` (Vite serves `assets/` as public dir).

- [ ] **Step 1: Write the failing tests**

`packages/shared/test/assets.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import manifest from '../../../assets/manifest.json';
import { ManifestSchema } from '../src/assets';

describe('asset manifest', () => {
  it('matches the schema', () => {
    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('has unique sprite ids', () => {
    const ids = ManifestSchema.parse(manifest).sprites.map((sprite) => sprite.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists every sprite the client needs', () => {
    const ids = new Set(ManifestSchema.parse(manifest).sprites.map((sprite) => sprite.id));
    const required = [
      ...[0, 1, 2, 3, 4, 5].flatMap((tier) => [`ship_t${tier}`, `bullet_t${tier}`]),
      'asteroid_1', 'asteroid_2', 'asteroid_3', 'asteroid_4',
      'shield_bubble', 'ore_pickup', 'loot_crate', 'explosion', 'safe_zone_station', 'starfield_tile',
      'icon_hull', 'icon_engine', 'icon_weapon', 'icon_shield', 'icon_cargo',
    ];
    expect(required.filter((id) => !ids.has(id))).toEqual([]);
  });
});
```

Add `"resolveJsonModule": true` to `compilerOptions` in `packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "resolveJsonModule": true }, "include": ["src", "test"] }
```

`scripts/assetCheck.test.ts`:
```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAssets, readPngSize } from './assetCheck';

function fakePng(width: number, height: number): Buffer {
  const data = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12, 'ascii');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

async function assetsDir(files: Record<string, Buffer>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'assets-'));
  const manifest = {
    sprites: [
      { id: 'a', file: 'a.png', width: 16, height: 16, anchor: [0.5, 0.5], frames: 1 },
      { id: 'b', file: 'sub/b.png', width: 32, height: 8, anchor: [0, 0], frames: 4 },
    ],
  };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
  await mkdir(join(dir, 'sub'));
  for (const [name, data] of Object.entries(files)) await writeFile(join(dir, name), data);
  return dir;
}

describe('readPngSize', () => {
  it('reads IHDR dimensions', () => {
    expect(readPngSize(fakePng(64, 32))).toEqual({ width: 64, height: 32 });
  });

  it('rejects non-PNG data', () => {
    expect(readPngSize(Buffer.from('hello world, not a png at all'))).toBeNull();
  });
});

describe('checkAssets', () => {
  it('passes when every file matches', async () => {
    const dir = await assetsDir({ 'a.png': fakePng(16, 16), 'sub/b.png': fakePng(32, 8) });
    expect(await checkAssets(dir)).toEqual([]);
  });

  it('reports missing files and wrong sizes', async () => {
    const dir = await assetsDir({ 'a.png': fakePng(20, 16) });
    expect(await checkAssets(dir)).toEqual([
      'a: expected 16x16, got 20x16',
      'b: missing sub/b.png',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/shared/test/assets.test.ts scripts/assetCheck.test.ts`
Expected: FAIL — missing modules / manifest.

- [ ] **Step 3: Implement schema** — `packages/shared/src/assets.ts`

```ts
import { z } from 'zod';

export const SpriteSpecSchema = z
  .object({
    id: z.string().min(1),
    file: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    anchor: z.tuple([z.number(), z.number()]),
    frames: z.number().int().positive(),
  })
  .strict();

export const ManifestSchema = z.object({ sprites: z.array(SpriteSpecSchema) }).strict();

export type SpriteSpec = z.infer<typeof SpriteSpecSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './assets';
```

- [ ] **Step 4: Write `assets/manifest.json`**

```json
{
  "sprites": [
    { "id": "ship_t0", "file": "ships/ship_t0.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "ship_t1", "file": "ships/ship_t1.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "ship_t2", "file": "ships/ship_t2.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "ship_t3", "file": "ships/ship_t3.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "ship_t4", "file": "ships/ship_t4.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "ship_t5", "file": "ships/ship_t5.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "bullet_t0", "file": "bullets/bullet_t0.png", "width": 16, "height": 16, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "bullet_t1", "file": "bullets/bullet_t1.png", "width": 16, "height": 16, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "bullet_t2", "file": "bullets/bullet_t2.png", "width": 16, "height": 16, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "bullet_t3", "file": "bullets/bullet_t3.png", "width": 16, "height": 16, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "bullet_t4", "file": "bullets/bullet_t4.png", "width": 16, "height": 16, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "bullet_t5", "file": "bullets/bullet_t5.png", "width": 16, "height": 16, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "shield_bubble", "file": "fx/shield_bubble.png", "width": 96, "height": 96, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "explosion", "file": "fx/explosion.png", "width": 512, "height": 64, "anchor": [0.5, 0.5], "frames": 8 },
    { "id": "asteroid_1", "file": "world/asteroid_1.png", "width": 128, "height": 128, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "asteroid_2", "file": "world/asteroid_2.png", "width": 128, "height": 128, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "asteroid_3", "file": "world/asteroid_3.png", "width": 128, "height": 128, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "asteroid_4", "file": "world/asteroid_4.png", "width": 128, "height": 128, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "ore_pickup", "file": "world/ore_pickup.png", "width": 24, "height": 24, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "loot_crate", "file": "world/loot_crate.png", "width": 32, "height": 32, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "safe_zone_station", "file": "world/safe_zone_station.png", "width": 256, "height": 256, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "starfield_tile", "file": "world/starfield_tile.png", "width": 512, "height": 512, "anchor": [0, 0], "frames": 1 },
    { "id": "icon_hull", "file": "ui/icon_hull.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "icon_engine", "file": "ui/icon_engine.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "icon_weapon", "file": "ui/icon_weapon.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "icon_shield", "file": "ui/icon_shield.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
    { "id": "icon_cargo", "file": "ui/icon_cargo.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 }
  ]
}
```

- [ ] **Step 5: Write `assets/STYLE.md`**

```markdown
# Space Arena art style

- Top-down 2D, orthographic. No perspective tilt.
- Ships face UP (nose toward the top edge), centered in the canvas, with ~4 px transparent margin.
- Transparent PNG background for everything except `starfield_tile`.
- Look: clean sci-fi, crisp shapes, subtle panel lines, soft rim light from top-left. No text, no logos.
- Palette: hulls cool steel greys; player accent cyan `#5EC8FF`; engines glow orange `#FF9A3C`; shields translucent cyan; ore teal-green `#3CFFB0`; loot crate gold `#FFC83C`.
- Ship tiers t0–t5: same silhouette family, each tier larger in visual detail, more armor plates and weapon hardpoints. t0 = small scrappy fighter, t5 = heavy elite gunship. All fit 64×64.
- Bullets t0–t5: glowing energy bolt, pointing up; color shifts cyan → violet → white-hot with tier.
- Asteroids 1–4: four distinct rocky shapes, grey-brown, roughly round, filling ~90% of 128×128.
- `explosion`: horizontal spritesheet, 8 frames of 64×64, flash → fireball → smoke dissipating.
- `shield_bubble`: translucent hex-pattern sphere, ~40% alpha center, brighter rim.
- `safe_zone_station`: circular space station seen from above, docking ring, green beacon lights.
- `starfield_tile`: seamless tileable deep-space background, dark navy `#05060D` with sparse stars of varied brightness. Must tile without visible seams.
- UI icons 48×48: flat glyph style, white with cyan accent: hull = armor plate, engine = thruster flame, weapon = crosshair, shield = shield emblem, cargo = crate.
```

- [ ] **Step 6: Implement validator**

`scripts/assetCheck.ts`:
```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ManifestSchema, type SpriteSpec } from '@arena/shared';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function checkSprite(assetsDir: string, sprite: SpriteSpec): Promise<string | null> {
  let data: Buffer;
  try {
    data = await readFile(join(assetsDir, sprite.file));
  } catch {
    return `${sprite.id}: missing ${sprite.file}`;
  }
  const size = readPngSize(data);
  if (!size) return `${sprite.id}: not a PNG`;
  if (size.width === sprite.width && size.height === sprite.height) return null;
  return `${sprite.id}: expected ${sprite.width}x${sprite.height}, got ${size.width}x${size.height}`;
}

export async function checkAssets(assetsDir: string): Promise<string[]> {
  const raw: unknown = JSON.parse(await readFile(join(assetsDir, 'manifest.json'), 'utf8'));
  const manifest = ManifestSchema.parse(raw);
  const results = await Promise.all(manifest.sprites.map((sprite) => checkSprite(assetsDir, sprite)));
  return results.filter((problem): problem is string => problem !== null);
}
```

`scripts/validate-assets.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { checkAssets } from './assetCheck';

const problems = await checkAssets(fileURLToPath(new URL('../assets', import.meta.url)));
for (const problem of problems) console.error(problem);
console.log(problems.length === 0 ? 'assets ok' : `${problems.length} asset problem(s)`);
process.exitCode = problems.length === 0 ? 0 : 1;
```

- [ ] **Step 7: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS. (`pnpm assets:check` is expected to FAIL now — PNGs arrive in Task 15.)

- [ ] **Step 8: Commit**

```bash
git add packages/shared assets scripts
git commit -m "feat(assets): add sprite manifest, style guide and validator"
```

---

### Task 6: PlayerRepository

**Files:**
- Create: `packages/server/src/db/PlayerRepository.ts`
- Test: `packages/server/test/PlayerRepository.test.ts`

**Interfaces:**
- Consumes: `Loadout`, `BASE_LOADOUT`, `SAFE_ZONES` from `@arena/shared`.
- Produces:
  - `interface AccountRow { id: number; username: string; passwordHash: string }`
  - `interface SessionInfo { accountId: number; username: string }`
  - `interface ShipRecord { accountId: number; bankedCredits: number; loadout: Loadout; x: number; y: number }`
  - `class UsernameTakenError extends Error`
  - `class PlayerRepository` with `static open(path)`, `close()`, `createAccount(username, passwordHash, now): number`, `findAccountByUsername(username): AccountRow | undefined`, `createSession(tokenHash, accountId, expiresAt)`, `findSession(tokenHash, now): SessionInfo | undefined`, `loadShip(accountId): ShipRecord`, `saveShips(records: readonly ShipRecord[], now)`.

- [ ] **Step 1: Write the failing test** — `packages/server/test/PlayerRepository.test.ts`

```ts
import { BASE_LOADOUT, SAFE_ZONES } from '@arena/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerRepository, UsernameTakenError } from '../src/db/PlayerRepository';

let repo: PlayerRepository;

beforeEach(() => {
  repo = PlayerRepository.open(':memory:');
});

afterEach(() => {
  repo.close();
});

describe('accounts', () => {
  it('creates and finds an account', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    expect(repo.findAccountByUsername('alice')).toEqual({ id, username: 'alice', passwordHash: 'hash' });
  });

  it('rejects duplicate usernames case-insensitively', () => {
    repo.createAccount('alice', 'hash', 1);
    expect(() => repo.createAccount('ALICE', 'hash', 1)).toThrow(UsernameTakenError);
  });

  it('returns undefined for unknown users', () => {
    expect(repo.findAccountByUsername('nobody')).toBeUndefined();
  });
});

describe('sessions', () => {
  it('finds a session before expiry only', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    repo.createSession('tokenhash', id, 1_000);
    expect(repo.findSession('tokenhash', 999)).toEqual({ accountId: id, username: 'alice' });
    expect(repo.findSession('tokenhash', 1_000)).toBeUndefined();
  });
});

describe('ships', () => {
  it('defaults to a base ship at the first safe zone', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    expect(repo.loadShip(id)).toEqual({
      accountId: id,
      bankedCredits: 0,
      loadout: BASE_LOADOUT,
      x: SAFE_ZONES[0]?.x,
      y: SAFE_ZONES[0]?.y,
    });
  });

  it('round-trips saved ships', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    const record = { accountId: id, bankedCredits: 500, loadout: { ...BASE_LOADOUT, weapon: 2 }, x: 10, y: 20 };
    repo.saveShips([record], 5);
    repo.saveShips([{ ...record, bankedCredits: 700 }], 6);
    expect(repo.loadShip(id)).toEqual({ ...record, bankedCredits: 700 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/PlayerRepository.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement** — `packages/server/src/db/PlayerRepository.ts`

```ts
import { BASE_LOADOUT, SAFE_ZONES, type Loadout } from '@arena/shared';
import Database from 'better-sqlite3';

export interface AccountRow {
  readonly id: number;
  readonly username: string;
  readonly passwordHash: string;
}

export interface SessionInfo {
  readonly accountId: number;
  readonly username: string;
}

export interface ShipRecord {
  readonly accountId: number;
  readonly bankedCredits: number;
  readonly loadout: Loadout;
  readonly x: number;
  readonly y: number;
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`username taken: ${username}`);
  }
}

interface AccountDbRow {
  id: number;
  username: string;
  password_hash: string;
}

interface SessionDbRow {
  account_id: number;
  username: string;
}

interface ShipDbRow {
  banked_credits: number;
  hull_tier: number;
  engine_tier: number;
  weapon_tier: number;
  shield_tier: number;
  cargo_tier: number;
  pos_x: number;
  pos_y: number;
}

type ShipParams = [number, number, number, number, number, number, number, number, number, number];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ships (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  banked_credits INTEGER NOT NULL,
  hull_tier INTEGER NOT NULL,
  engine_tier INTEGER NOT NULL,
  weapon_tier INTEGER NOT NULL,
  shield_tier INTEGER NOT NULL,
  cargo_tier INTEGER NOT NULL,
  pos_x REAL NOT NULL,
  pos_y REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const UPSERT_SHIP = `
INSERT INTO ships (account_id, banked_credits, hull_tier, engine_tier, weapon_tier, shield_tier, cargo_tier, pos_x, pos_y, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(account_id) DO UPDATE SET
  banked_credits = excluded.banked_credits,
  hull_tier = excluded.hull_tier,
  engine_tier = excluded.engine_tier,
  weapon_tier = excluded.weapon_tier,
  shield_tier = excluded.shield_tier,
  cargo_tier = excluded.cargo_tier,
  pos_x = excluded.pos_x,
  pos_y = excluded.pos_y,
  updated_at = excluded.updated_at
`;

function defaultShip(accountId: number): ShipRecord {
  const spawn = SAFE_ZONES[0];
  return { accountId, bankedCredits: 0, loadout: BASE_LOADOUT, x: spawn?.x ?? 0, y: spawn?.y ?? 0 };
}

function shipParams(record: ShipRecord, now: number): ShipParams {
  const { loadout } = record;
  return [
    record.accountId,
    record.bankedCredits,
    loadout.hull,
    loadout.engine,
    loadout.weapon,
    loadout.shield,
    loadout.cargo,
    record.x,
    record.y,
    now,
  ];
}

export class PlayerRepository {
  private readonly saveMany: (records: readonly ShipRecord[], now: number) => void;

  private constructor(private readonly db: Database.Database) {
    const upsert = db.prepare<ShipParams>(UPSERT_SHIP);
    this.saveMany = db.transaction((records: readonly ShipRecord[], now: number) => {
      for (const record of records) upsert.run(...shipParams(record, now));
    });
  }

  static open(path: string): PlayerRepository {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
    return new PlayerRepository(db);
  }

  close(): void {
    this.db.close();
  }

  createAccount(username: string, passwordHash: string, now: number): number {
    try {
      const result = this.db
        .prepare<[string, string, number]>('INSERT INTO accounts (username, password_hash, created_at) VALUES (?, ?, ?)')
        .run(username, passwordHash, now);
      return Number(result.lastInsertRowid);
    } catch (error) {
      if (error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new UsernameTakenError(username);
      }
      throw error;
    }
  }

  findAccountByUsername(username: string): AccountRow | undefined {
    const row = this.db
      .prepare<[string], AccountDbRow>('SELECT id, username, password_hash FROM accounts WHERE username = ?')
      .get(username);
    return row && { id: row.id, username: row.username, passwordHash: row.password_hash };
  }

  createSession(tokenHash: string, accountId: number, expiresAt: number): void {
    this.db
      .prepare<[string, number, number]>('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, accountId, expiresAt);
  }

  findSession(tokenHash: string, now: number): SessionInfo | undefined {
    const row = this.db
      .prepare<[string, number], SessionDbRow>(
        `SELECT s.account_id, a.username FROM sessions s
         JOIN accounts a ON a.id = s.account_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, now);
    return row && { accountId: row.account_id, username: row.username };
  }

  loadShip(accountId: number): ShipRecord {
    const row = this.db
      .prepare<[number], ShipDbRow>(
        `SELECT banked_credits, hull_tier, engine_tier, weapon_tier, shield_tier, cargo_tier, pos_x, pos_y
         FROM ships WHERE account_id = ?`,
      )
      .get(accountId);
    if (!row) return defaultShip(accountId);
    return {
      accountId,
      bankedCredits: row.banked_credits,
      loadout: {
        hull: row.hull_tier,
        engine: row.engine_tier,
        weapon: row.weapon_tier,
        shield: row.shield_tier,
        cargo: row.cargo_tier,
      },
      x: row.pos_x,
      y: row.pos_y,
    };
  }

  saveShips(records: readonly ShipRecord[], now: number): void {
    this.saveMany(records, now);
  }
}
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): add SQLite player repository"
```

---

### Task 7: Auth + HTTP

**Files:**
- Create: `packages/server/src/auth/passwords.ts`, `packages/server/src/auth/RateLimiter.ts`, `packages/server/src/auth/AuthService.ts`, `packages/server/src/http/HttpServer.ts`
- Test: `packages/server/test/RateLimiter.test.ts`, `packages/server/test/AuthService.test.ts`, `packages/server/test/HttpServer.test.ts`

**Interfaces:**
- Consumes: `PlayerRepository`, `SessionInfo`, `UsernameTakenError` (Task 6).
- Produces:
  - `class RateLimiter(capacity: number, refillPerMs: number)` with `tryConsume(key: string, now: number): boolean`
  - `type AuthResult = { ok: true; token: string } | { ok: false; status: 400 | 401 | 409; error: string }`
  - `class AuthService(repo, now?)` with `register(input: unknown)`, `login(input: unknown)`, `resolveToken(token: string): SessionInfo | undefined`
  - `interface HttpDeps { auth; limiter; staticDir; now }`, `createHttpServer(deps): http.Server`. Routes: `POST /api/register`, `POST /api/login` → `{ token }` or `{ error }`; `GET` static files.

- [ ] **Step 1: Write failing tests**

`packages/server/test/RateLimiter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/auth/RateLimiter';

describe('RateLimiter', () => {
  it('allows a burst up to capacity then blocks', () => {
    const limiter = new RateLimiter(2, 0.001);
    expect(limiter.tryConsume('ip', 0)).toBe(true);
    expect(limiter.tryConsume('ip', 0)).toBe(true);
    expect(limiter.tryConsume('ip', 0)).toBe(false);
  });

  it('refills over time', () => {
    const limiter = new RateLimiter(1, 0.001);
    expect(limiter.tryConsume('ip', 0)).toBe(true);
    expect(limiter.tryConsume('ip', 500)).toBe(false);
    expect(limiter.tryConsume('ip', 1_500)).toBe(true);
  });

  it('tracks keys separately', () => {
    const limiter = new RateLimiter(1, 0.001);
    expect(limiter.tryConsume('a', 0)).toBe(true);
    expect(limiter.tryConsume('b', 0)).toBe(true);
  });
});
```

`packages/server/test/AuthService.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/AuthService';
import { PlayerRepository } from '../src/db/PlayerRepository';

let repo: PlayerRepository;
let now = 0;
let auth: AuthService;

beforeEach(() => {
  repo = PlayerRepository.open(':memory:');
  now = 1_000;
  auth = new AuthService(repo, () => now);
});

afterEach(() => repo.close());

describe('AuthService', () => {
  it('registers and resolves the issued token', async () => {
    const result = await auth.register({ username: 'alice', password: 'password1' });
    if (!result.ok) throw new Error(result.error);
    expect(auth.resolveToken(result.token)?.username).toBe('alice');
  });

  it('rejects bad formats with 400', async () => {
    expect(await auth.register({ username: 'a', password: 'password1' })).toMatchObject({ ok: false, status: 400 });
    expect(await auth.register({ username: 'alice', password: 'short' })).toMatchObject({ ok: false, status: 400 });
    expect(await auth.register({ username: 'bad name!', password: 'password1' })).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects duplicates with 409', async () => {
    await auth.register({ username: 'alice', password: 'password1' });
    expect(await auth.register({ username: 'alice', password: 'password2' })).toMatchObject({ ok: false, status: 409 });
  });

  it('logs in with the right password only', async () => {
    await auth.register({ username: 'alice', password: 'password1' });
    expect((await auth.login({ username: 'alice', password: 'password1' })).ok).toBe(true);
    expect(await auth.login({ username: 'alice', password: 'wrongpass' })).toMatchObject({ ok: false, status: 401 });
    expect(await auth.login({ username: 'bob', password: 'password1' })).toMatchObject({ ok: false, status: 401 });
  });

  it('expires tokens after 7 days', async () => {
    const result = await auth.register({ username: 'alice', password: 'password1' });
    if (!result.ok) throw new Error(result.error);
    now += 7 * 24 * 3_600_000;
    expect(auth.resolveToken(result.token)).toBeUndefined();
  });
});
```

`packages/server/test/HttpServer.test.ts`:
```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/AuthService';
import { RateLimiter } from '../src/auth/RateLimiter';
import { PlayerRepository } from '../src/db/PlayerRepository';
import { createHttpServer } from '../src/http/HttpServer';

let repo: PlayerRepository;
let server: Server;
let base: string;

async function start(capacity: number): Promise<void> {
  const staticDir = await mkdtemp(join(tmpdir(), 'static-'));
  await writeFile(join(staticDir, 'index.html'), '<h1>arena</h1>');
  repo = PlayerRepository.open(':memory:');
  server = createHttpServer({
    auth: new AuthService(repo),
    limiter: new RateLimiter(capacity, 0),
    staticDir,
    now: Date.now,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${address.port}`;
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  repo.close();
});

describe('auth routes', () => {
  beforeEach(() => start(10));

  it('registers then logs in', async () => {
    const register = await post('/api/register', { username: 'alice', password: 'password1' });
    expect(register.status).toBe(200);
    expect(typeof (await register.json()).token).toBe('string');
    const login = await post('/api/login', { username: 'alice', password: 'password1' });
    expect(login.status).toBe(200);
  });

  it('returns 409 for duplicates and 401 for bad logins', async () => {
    await post('/api/register', { username: 'alice', password: 'password1' });
    expect((await post('/api/register', { username: 'alice', password: 'password1' })).status).toBe(409);
    expect((await post('/api/login', { username: 'alice', password: 'nopenope' })).status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const response = await fetch(`${base}/api/login`, { method: 'POST', body: '{bad' });
    expect(response.status).toBe(400);
  });
});

describe('rate limiting', () => {
  beforeEach(() => start(1));

  it('returns 429 after the burst', async () => {
    await post('/api/login', { username: 'x', password: 'password1' });
    expect((await post('/api/login', { username: 'x', password: 'password1' })).status).toBe(429);
  });
});

describe('static files', () => {
  beforeEach(() => start(10));

  it('serves index.html at /', async () => {
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<h1>arena</h1>');
  });

  it('blocks path traversal', async () => {
    expect((await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/server/test/RateLimiter.test.ts packages/server/test/AuthService.test.ts packages/server/test/HttpServer.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`packages/server/src/auth/passwords.ts`:
```ts
import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

`packages/server/src/auth/RateLimiter.ts`:
```ts
interface Bucket {
  readonly tokens: number;
  readonly updatedAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
  ) {}

  tryConsume(key: string, now: number): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updatedAt) * this.refillPerMs);
    const allowed = tokens >= 1;
    this.buckets.set(key, { tokens: allowed ? tokens - 1 : tokens, updatedAt: now });
    return allowed;
  }
}
```

`packages/server/src/auth/AuthService.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { UsernameTakenError, type PlayerRepository, type SessionInfo } from '../db/PlayerRepository';
import { hashPassword, verifyPassword } from './passwords';

const SESSION_TTL_MS = 7 * 24 * 3_600_000;

const CredentialsSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,16}$/),
  password: z.string().min(8).max(128),
});

export type AuthResult =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly status: 400 | 401 | 409; readonly error: string };

const INVALID_FORMAT: AuthResult = { ok: false, status: 400, error: 'invalid username or password format' };
const INVALID_CREDENTIALS: AuthResult = { ok: false, status: 401, error: 'invalid credentials' };
const USERNAME_TAKEN: AuthResult = { ok: false, status: 409, error: 'username taken' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  constructor(
    private readonly repo: PlayerRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async register(input: unknown): Promise<AuthResult> {
    const parsed = CredentialsSchema.safeParse(input);
    if (!parsed.success) return INVALID_FORMAT;
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      const accountId = this.repo.createAccount(parsed.data.username, passwordHash, this.now());
      return { ok: true, token: this.issueToken(accountId) };
    } catch (error) {
      if (error instanceof UsernameTakenError) return USERNAME_TAKEN;
      throw error;
    }
  }

  async login(input: unknown): Promise<AuthResult> {
    const parsed = CredentialsSchema.safeParse(input);
    if (!parsed.success) return INVALID_CREDENTIALS;
    const account = this.repo.findAccountByUsername(parsed.data.username);
    if (!account) return INVALID_CREDENTIALS;
    const valid = await verifyPassword(account.passwordHash, parsed.data.password);
    return valid ? { ok: true, token: this.issueToken(account.id) } : INVALID_CREDENTIALS;
  }

  resolveToken(token: string): SessionInfo | undefined {
    return this.repo.findSession(hashToken(token), this.now());
  }

  private issueToken(accountId: number): string {
    const token = randomBytes(32).toString('hex');
    this.repo.createSession(hashToken(token), accountId, this.now() + SESSION_TTL_MS);
    return token;
  }
}
```

`packages/server/src/http/HttpServer.ts`:
```ts
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import type { AuthResult, AuthService } from '../auth/AuthService';
import type { RateLimiter } from '../auth/RateLimiter';

const MAX_BODY_BYTES = 4_096;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

type AuthAction = (auth: AuthService, body: unknown) => Promise<AuthResult>;

const AUTH_ROUTES: Readonly<Record<string, AuthAction>> = {
  '/api/register': (auth, body) => auth.register(body),
  '/api/login': (auth, body) => auth.login(body),
};

export interface HttpDeps {
  readonly auth: AuthService;
  readonly limiter: RateLimiter;
  readonly staticDir: string;
  readonly now: () => number;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed;
  } catch {
    return undefined;
  }
}

async function handleAuth(deps: HttpDeps, req: IncomingMessage, res: ServerResponse, action: AuthAction): Promise<void> {
  if (!deps.limiter.tryConsume(req.socket.remoteAddress ?? 'unknown', deps.now())) {
    return sendJson(res, 429, { error: 'too many requests' });
  }
  const body = await readJson(req);
  if (body === undefined) return sendJson(res, 400, { error: 'invalid body' });
  const result = await action(deps.auth, body);
  if (result.ok) return sendJson(res, 200, { token: result.token });
  sendJson(res, result.status, { error: result.error });
}

async function serveStatic(root: string, pathname: string, res: ServerResponse): Promise<void> {
  try {
    const relative = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
    const filePath = resolve(root, `.${relative}`);
    if (!filePath.startsWith(root + sep)) return sendJson(res, 404, { error: 'not found' });
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

async function handle(deps: HttpDeps, root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const action = AUTH_ROUTES[url.pathname];
  if (req.method === 'POST' && action) return handleAuth(deps, req, res, action);
  if (req.method === 'GET') return serveStatic(root, url.pathname, res);
  sendJson(res, 404, { error: 'not found' });
}

export function createHttpServer(deps: HttpDeps): Server {
  const root = resolve(deps.staticDir);
  return createServer((req, res) => {
    handle(deps, root, req, res).catch(() => sendJson(res, 500, { error: 'internal error' }));
  });
}
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): add auth service, rate limiting and HTTP routes"
```

---

### Task 8: SpatialGrid + geometry

**Files:**
- Create: `packages/server/src/world/SpatialGrid.ts`, `packages/server/src/world/geometry.ts`
- Test: `packages/server/test/SpatialGrid.test.ts`, `packages/server/test/geometry.test.ts`

**Interfaces:**
- Produces: `interface Positioned { id: number; x: number; y: number }`; `class SpatialGrid<T extends Positioned>(cellSize)` with `clear()`, `insert(item)`, `queryRadius(x, y, radius): T[]`; `distanceToSegment(px, py, ax, ay, bx, by): number`.

- [ ] **Step 1: Write failing tests**

`packages/server/test/SpatialGrid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/world/SpatialGrid';

const item = (id: number, x: number, y: number) => ({ id, x, y });

describe('SpatialGrid', () => {
  it('returns items within radius across cells', () => {
    const grid = new SpatialGrid(100);
    grid.insert(item(1, 50, 50));
    grid.insert(item(2, 140, 50));
    grid.insert(item(3, 400, 400));
    expect(grid.queryRadius(100, 50, 60).map((e) => e.id).sort()).toEqual([1, 2]);
  });

  it('excludes items in scanned cells but outside radius', () => {
    const grid = new SpatialGrid(100);
    grid.insert(item(1, 0, 0));
    expect(grid.queryRadius(90, 90, 100)).toEqual([]);
  });

  it('clears all items', () => {
    const grid = new SpatialGrid(100);
    grid.insert(item(1, 10, 10));
    grid.clear();
    expect(grid.queryRadius(10, 10, 50)).toEqual([]);
  });
});
```

`packages/server/test/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { distanceToSegment } from '../src/world/geometry';

describe('distanceToSegment', () => {
  it('measures perpendicular distance', () => {
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it('measures to the nearest endpoint beyond the segment', () => {
    expect(distanceToSegment(13, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it('handles zero-length segments', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/server/test/SpatialGrid.test.ts packages/server/test/geometry.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`packages/server/src/world/SpatialGrid.ts`:
```ts
export interface Positioned {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

const ROW_STRIDE = 100_000;

export class SpatialGrid<T extends Positioned> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const key = this.key(this.cell(item.x), this.cell(item.y));
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(item);
    else this.cells.set(key, [item]);
  }

  queryRadius(x: number, y: number, radius: number): T[] {
    const found: T[] = [];
    for (let cx = this.cell(x - radius); cx <= this.cell(x + radius); cx += 1) {
      for (let cy = this.cell(y - radius); cy <= this.cell(y + radius); cy += 1) {
        for (const item of this.cells.get(this.key(cx, cy)) ?? []) {
          if (Math.hypot(item.x - x, item.y - y) <= radius) found.push(item);
        }
      }
    }
    return found;
  }

  private cell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private key(cx: number, cy: number): number {
    return cx * ROW_STRIDE + cy;
  }
}
```

`packages/server/src/world/geometry.ts`:
```ts
export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): add spatial grid and segment geometry"
```

---

### Task 9: World core — ships, bullets, combat, death

**Files:**
- Create: `packages/server/src/world/entities.ts`, `packages/server/src/world/Combat.ts`, `packages/server/src/world/World.ts`
- Create: `packages/server/test/support/fixtures.ts`
- Test: `packages/server/test/Combat.test.ts`, `packages/server/test/World.combat.test.ts`

**Interfaces:**
- Consumes: shared constants, `stepMotion`, `forward`, `IDLE_INPUT`, `statsFor`, `loadoutValue`, `zoneAt`, `nearestZone`; `ShipRecord` (Task 6); `SpatialGrid`, `distanceToSegment` (Task 8).
- Produces:
  - Entities: `ShipEntity`, `BulletEntity`, `AsteroidEntity`, `OreEntity`, `CrateEntity`, `WorldEntity`, `QueuedInput`; `createShip(id, accountId, name, record)`, `respawnShip(ship, x, y)`, `toShipRecord(ship): ShipRecord`.
  - Combat: `updateShield(ship, dt, inSafeZone)`, `tryFire(ship, dt, inSafeZone, time, nextId): BulletEntity | null`, `applyHit(ship, bullet, time)`, `bountyFor(loadout): number`.
  - World: `interface WorldOptions { rng?: () => number; asteroidTarget?: number }`, `interface DeathEvent { ship; killerName: string | null }`, `interface TickEvents { died: DeathEvent[]; docked: ShipEntity[]; departed: ShipEntity[] }`, `class World` with `time`, `tickCount`, `addShip(accountId, name, record)`, `shipById(id)`, `shipByAccount(accountId)`, `allShips()`, `setInput(shipId, seq, input)`, `disconnect(shipId): ShipEntity | undefined`, `reconnect(shipId)`, `entitiesNear(x, y, radius): WorldEntity[]`, `tick(dt): TickEvents`.

- [ ] **Step 1: Test fixtures** — `packages/server/test/support/fixtures.ts`

```ts
import { BASE_LOADOUT } from '@arena/shared';
import type { ShipRecord } from '../../src/db/PlayerRepository';

export const OPEN_SPACE = { x: 8_000, y: 8_000 } as const;

export function shipRecord(x: number, y: number, accountId = 0): ShipRecord {
  return { accountId, bankedCredits: 0, loadout: BASE_LOADOUT, x, y };
}

export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
```

- [ ] **Step 2: Write failing tests**

`packages/server/test/Combat.test.ts`:
```ts
import { BOUNTY_BASE, IDLE_INPUT, SHIELD_LOCKOUT, SHIP_RADIUS } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { applyHit, bountyFor, tryFire, updateShield } from '../src/world/Combat';
import { createShip } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

const newShip = () => createShip(1, 1, 'alice', shipRecord(1_000, 1_000));
const ids = () => 99;

describe('updateShield', () => {
  it('drains energy while held', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 1, false);
    expect(ship.shieldUp).toBe(true);
    expect(ship.shieldEnergy).toBeCloseTo(70);
  });

  it('drops with a lockout when empty', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, shield: true };
    ship.shieldEnergy = 10;
    updateShield(ship, 1, false);
    expect(ship.shieldUp).toBe(false);
    expect(ship.shieldLockout).toBe(SHIELD_LOCKOUT);
    updateShield(ship, 0.5, false);
    expect(ship.shieldUp).toBe(false);
  });

  it('regenerates when lowered and never exceeds max', () => {
    const ship = newShip();
    ship.shieldEnergy = 50;
    updateShield(ship, 1, false);
    expect(ship.shieldEnergy).toBeCloseTo(65);
    updateShield(ship, 10, false);
    expect(ship.shieldEnergy).toBe(100);
  });

  it('cannot be raised inside a safe zone', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 0.1, true);
    expect(ship.shieldUp).toBe(false);
  });
});

describe('tryFire', () => {
  it('fires from the nose and applies cooldown', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, fire: true };
    const bullet = tryFire(ship, 0.1, false, 0, ids);
    expect(bullet).toMatchObject({ ownerId: 1, x: 1_000, y: 1_000 - SHIP_RADIUS, vy: -800, damage: 10 });
    expect(tryFire(ship, 0.1, false, 0, ids)).toBeNull();
    expect(tryFire(ship, 0.2, false, 0, ids)).not.toBeNull();
  });

  it('does not fire while shielded or in a safe zone', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, fire: true };
    ship.shieldUp = true;
    expect(tryFire(ship, 0.1, false, 0, ids)).toBeNull();
    ship.shieldUp = false;
    expect(tryFire(ship, 0.1, true, 0, ids)).toBeNull();
  });
});

describe('applyHit', () => {
  it('damages hull and records the attacker', () => {
    const ship = newShip();
    const bullet = { kind: 'bullet', id: 5, ownerId: 7, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, damage: 10, tier: 0, expiresAt: 1 } as const;
    applyHit(ship, bullet, 3);
    expect(ship.hull).toBe(90);
    expect(ship.lastHitBy).toBe(7);
    expect(ship.lastDamagedAt).toBe(3);
  });

  it('is absorbed by a raised shield', () => {
    const ship = newShip();
    ship.shieldUp = true;
    applyHit(ship, { kind: 'bullet', id: 5, ownerId: 7, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, damage: 10, tier: 0, expiresAt: 1 }, 3);
    expect(ship.hull).toBe(100);
  });
});

describe('bountyFor', () => {
  it('adds a share of the victim loadout value', () => {
    expect(bountyFor({ hull: 1, engine: 0, weapon: 0, shield: 0, cargo: 0 })).toBe(BOUNTY_BASE + 50);
  });
});
```

`packages/server/test/World.combat.test.ts`:
```ts
import { BOUNTY_BASE, DISCONNECT_LINGER, IDLE_INPUT, SAFE_ZONES, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World, type DeathEvent } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function duel() {
  const world = new World({ asteroidTarget: 0 });
  const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
  const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2));
  return { world, alice, bob };
}

function runUntilDeath(world: World, maxTicks = 200): DeathEvent | undefined {
  for (let i = 0; i < maxTicks; i += 1) {
    const death = world.tick(TICK_DT).died[0];
    if (death) return death;
  }
  return undefined;
}

describe('World combat', () => {
  it('kills a target, pays the bounty and respawns the victim', () => {
    const { world, alice, bob } = duel();
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    const death = runUntilDeath(world);
    expect(death?.ship.id).toBe(bob.id);
    expect(death?.killerName).toBe('alice');
    expect(alice.carriedCredits).toBe(BOUNTY_BASE);
    const zone = SAFE_ZONES[0];
    expect([bob.x, bob.y]).toEqual([zone?.x, zone?.y]);
    expect(bob.hull).toBe(100);
  });

  it('shield blocks damage', () => {
    const { world, alice, bob } = duel();
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    world.setInput(bob.id, 1, { ...IDLE_INPUT, shield: true });
    for (let i = 0; i < 30; i += 1) world.tick(TICK_DT);
    expect(bob.hull).toBe(100);
    expect(bob.shieldEnergy).toBeLessThan(100);
  });

  it('drops a crate with carried ore and half the carried credits', () => {
    const { world, alice, bob } = duel();
    bob.ore = 5;
    bob.carriedCredits = 100;
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    runUntilDeath(world);
    world.setInput(alice.id, 2, IDLE_INPUT);
    world.tick(TICK_DT);
    const crate = world.entitiesNear(OPEN_SPACE.x, OPEN_SPACE.y - 200, 50).find((e) => e.kind === 'crate');
    expect(crate).toMatchObject({ ore: 5, credits: 50 });
    expect(bob.ore).toBe(0);
    expect(bob.carriedCredits).toBe(0);
  });

  it('prevents firing inside a safe zone', () => {
    const world = new World({ asteroidTarget: 0 });
    const zone = SAFE_ZONES[0];
    const ship = world.addShip(1, 'alice', shipRecord(zone?.x ?? 0, zone?.y ?? 0, 1));
    world.setInput(ship.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 10; i += 1) world.tick(TICK_DT);
    expect(world.entitiesNear(ship.x, ship.y, 2_000).some((e) => e.kind === 'bullet')).toBe(false);
  });

  it('consumes one queued input per tick and ignores stale seqs', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.setInput(ship.id, 1, { ...IDLE_INPUT, thrust: true });
    world.setInput(ship.id, 2, IDLE_INPUT);
    world.setInput(ship.id, 2, { ...IDLE_INPUT, left: true });
    world.tick(TICK_DT);
    expect(ship.lastSeq).toBe(1);
    world.tick(TICK_DT);
    expect(ship.lastSeq).toBe(2);
    expect(ship.input).toEqual(IDLE_INPUT);
  });

  it('keeps a ship disconnected in open space for the linger period', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    expect(world.disconnect(ship.id)).toBeUndefined();
    const departed = [];
    for (let i = 0; i < Math.ceil(DISCONNECT_LINGER / TICK_DT) + 1; i += 1) departed.push(...world.tick(TICK_DT).departed);
    expect(departed.map((s) => s.id)).toEqual([ship.id]);
    expect(world.shipById(ship.id)).toBeUndefined();
  });

  it('removes a ship disconnected inside a safe zone immediately', () => {
    const world = new World({ asteroidTarget: 0 });
    const zone = SAFE_ZONES[0];
    const ship = world.addShip(1, 'alice', shipRecord(zone?.x ?? 0, zone?.y ?? 0, 1));
    expect(world.disconnect(ship.id)?.id).toBe(ship.id);
    expect(world.shipById(ship.id)).toBeUndefined();
  });

  it('reconnect cancels the linger', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.disconnect(ship.id);
    world.reconnect(ship.id);
    for (let i = 0; i < Math.ceil(DISCONNECT_LINGER / TICK_DT) + 1; i += 1) world.tick(TICK_DT);
    expect(world.shipById(ship.id)).toBeDefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test packages/server/test/Combat.test.ts packages/server/test/World.combat.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement entities** — `packages/server/src/world/entities.ts`

```ts
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
```

- [ ] **Step 5: Implement combat** — `packages/server/src/world/Combat.ts`

```ts
import {
  BOUNTY_BASE,
  BOUNTY_SHARE,
  BULLET_LIFETIME,
  SHIELD_LOCKOUT,
  SHIP_RADIUS,
  forward,
  loadoutValue,
  type Loadout,
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

export function tryFire(
  ship: ShipEntity,
  dt: number,
  inSafeZone: boolean,
  time: number,
  nextId: () => number,
): BulletEntity | null {
  ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
  if (!ship.input.fire || ship.shieldUp || inSafeZone || ship.fireCooldown > 0) return null;
  ship.fireCooldown = 1 / ship.stats.fireRate;
  const direction = forward(ship.angle);
  const x = ship.x + direction.x * SHIP_RADIUS;
  const y = ship.y + direction.y * SHIP_RADIUS;
  return {
    kind: 'bullet',
    id: nextId(),
    ownerId: ship.id,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: ship.vx + direction.x * ship.stats.bulletSpeed,
    vy: ship.vy + direction.y * ship.stats.bulletSpeed,
    damage: ship.stats.damage,
    tier: ship.loadout.weapon,
    expiresAt: time + BULLET_LIFETIME,
  };
}

export function applyHit(ship: ShipEntity, bullet: BulletEntity, time: number): void {
  if (ship.shieldUp) return;
  ship.hull -= bullet.damage;
  ship.lastDamagedAt = time;
  ship.lastHitBy = bullet.ownerId;
}

export function bountyFor(loadout: Loadout): number {
  return BOUNTY_BASE + Math.floor(loadoutValue(loadout) * BOUNTY_SHARE);
}
```

- [ ] **Step 6: Implement world** — `packages/server/src/world/World.ts`

```ts
import {
  ASTEROID_MAX_RADIUS,
  ASTEROID_TARGET_COUNT,
  CRATE_LIFETIME,
  DISCONNECT_LINGER,
  IDLE_INPUT,
  LOOT_CREDIT_SHARE,
  SHIP_RADIUS,
  WORLD_SIZE,
  nearestZone,
  stepMotion,
  zoneAt,
  type ShipInput,
} from '@arena/shared';
import type { ShipRecord } from '../db/PlayerRepository';
import { applyHit, bountyFor, tryFire, updateShield } from './Combat';
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
  readonly docked: ShipEntity[];
  readonly departed: ShipEntity[];
}

const GRID_CELL_SIZE = 512;
const INPUT_QUEUE_LIMIT = 4;
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

  entitiesNear(x: number, y: number, radius: number): WorldEntity[] {
    return this.grid.queryRadius(x, y, radius);
  }

  tick(dt: number): TickEvents {
    this.elapsed += dt;
    this.ticks += 1;
    const events: TickEvents = { died: [], docked: [], departed: [] };
    this.stepShips(dt);
    this.stepBullets(dt);
    this.rebuildGrid();
    this.resolveBulletHits();
    this.resolveDeaths(events.died);
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
      const inSafeZone = zoneAt(ship.x, ship.y) !== undefined;
      updateShield(ship, dt, inSafeZone);
      Object.assign(ship, stepMotion(ship, ship.input, ship.stats, dt));
      const bullet = tryFire(ship, dt, inSafeZone, this.elapsed, () => this.allocateId());
      if (bullet) this.bullets.set(bullet.id, bullet);
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
    if (entity.kind !== 'ship' || entity.id === bullet.ownerId) return false;
    return this.sweptDistance(bullet, entity) <= SHIP_RADIUS;
  }

  private sweptDistance(bullet: BulletEntity, entity: WorldEntity): number {
    return distanceToSegment(entity.x, entity.y, bullet.prevX, bullet.prevY, bullet.x, bullet.y);
  }

  private applyBulletTo(entity: WorldEntity, bullet: BulletEntity): void {
    if (entity.kind === 'ship') applyHit(entity, bullet, this.elapsed);
  }

  private resolveDeaths(died: DeathEvent[]): void {
    for (const ship of this.ships.values()) {
      if (ship.hull > 0) continue;
      const killer = ship.lastHitBy === null ? undefined : this.ships.get(ship.lastHitBy);
      if (killer) killer.carriedCredits += bountyFor(ship.loadout);
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
```

- [ ] **Step 7: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server
git commit -m "feat(server): add world simulation with combat, death and linger"
```

---

### Task 10: Asteroids + pickups

**Files:**
- Create: `packages/server/src/world/AsteroidField.ts`
- Modify: `packages/server/src/world/World.ts`
- Test: `packages/server/test/AsteroidField.test.ts`, `packages/server/test/World.mining.test.ts`

**Interfaces:**
- Consumes: `World` internals from Task 9.
- Produces: `type AsteroidFields = Omit<AsteroidEntity, 'kind' | 'id'>`, `randomAsteroid(rng): AsteroidFields`, `oreYieldAt(clearance): number`, `scatterOre(asteroid, rng): { x: number; y: number }[]`; `World.addAsteroid(fields): AsteroidEntity`. World now fills to `asteroidTarget` on construction and refills over time; bullets break asteroids into ore; ships collect ore and crates.

- [ ] **Step 1: Write failing tests**

`packages/server/test/AsteroidField.test.ts`:
```ts
import { ASTEROID_MAX_RADIUS, ASTEROID_MIN_RADIUS, distanceToNearestZone } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { oreYieldAt, randomAsteroid, scatterOre } from '../src/world/AsteroidField';
import { seeded } from './support/fixtures';

describe('randomAsteroid', () => {
  it('stays clear of safe zones and within size bounds', () => {
    const rng = seeded(42);
    for (let i = 0; i < 1_000; i += 1) {
      const asteroid = randomAsteroid(rng);
      expect(distanceToNearestZone(asteroid.x, asteroid.y)).toBeGreaterThanOrEqual(300);
      expect(asteroid.radius).toBeGreaterThanOrEqual(ASTEROID_MIN_RADIUS);
      expect(asteroid.radius).toBeLessThanOrEqual(ASTEROID_MAX_RADIUS);
      expect(asteroid.variant).toBeGreaterThanOrEqual(1);
      expect(asteroid.variant).toBeLessThanOrEqual(4);
    }
  });
});

describe('oreYieldAt', () => {
  it('grows with distance from zones and caps', () => {
    expect(oreYieldAt(0)).toBe(2);
    expect(oreYieldAt(4_000)).toBe(5);
    expect(oreYieldAt(8_000)).toBe(8);
    expect(oreYieldAt(20_000)).toBe(8);
  });
});

describe('scatterOre', () => {
  it('places one pickup per yield inside the asteroid', () => {
    const asteroid = { x: 100, y: 100, radius: 40, hp: 1, oreYield: 3, variant: 1 };
    const points = scatterOre(asteroid, seeded(1));
    expect(points).toHaveLength(3);
    for (const point of points) expect(Math.hypot(point.x - 100, point.y - 100)).toBeLessThanOrEqual(40);
  });
});
```

`packages/server/test/World.mining.test.ts`:
```ts
import { IDLE_INPUT, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { OPEN_SPACE, seeded, shipRecord } from './support/fixtures';

function ticks(world: World, count: number): void {
  for (let i = 0; i < count; i += 1) world.tick(TICK_DT);
}

function count(world: World, kind: string): number {
  return world.entitiesNear(10_000, 10_000, 30_000).filter((e) => e.kind === kind).length;
}

function minerOnAsteroid(oreYield: number) {
  const world = new World({ asteroidTarget: 0, rng: seeded(7) });
  world.addAsteroid({ x: OPEN_SPACE.x, y: OPEN_SPACE.y, radius: 40, hp: 20, oreYield, variant: 1 });
  const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
  world.setInput(ship.id, 1, { ...IDLE_INPUT, fire: true });
  return { world, ship };
}

describe('World mining', () => {
  it('fills the asteroid field to the target', () => {
    const world = new World({ asteroidTarget: 50, rng: seeded(3) });
    world.tick(TICK_DT);
    expect(count(world, 'asteroid')).toBe(50);
  });

  it('breaks an asteroid into ore that a nearby ship collects', () => {
    const { world, ship } = minerOnAsteroid(3);
    ticks(world, 30);
    expect(count(world, 'asteroid')).toBe(0);
    expect(ship.ore).toBe(3);
  });

  it('respects cargo capacity', () => {
    const { world, ship } = minerOnAsteroid(3);
    ship.ore = ship.stats.cargoCapacity - 1;
    ticks(world, 30);
    expect(ship.ore).toBe(ship.stats.cargoCapacity);
    expect(count(world, 'ore')).toBe(2);
  });

  it('expires uncollected ore', () => {
    const { world, ship } = minerOnAsteroid(3);
    ship.ore = ship.stats.cargoCapacity;
    ticks(world, 30);
    expect(count(world, 'ore')).toBe(3);
    ticks(world, Math.ceil(60 / TICK_DT));
    expect(count(world, 'ore')).toBe(0);
  });

  it('lets a ship collect a loot crate', () => {
    const world = new World({ asteroidTarget: 0 });
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2));
    bob.ore = 4;
    bob.carriedCredits = 100;
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 200 && world.tick(TICK_DT).died.length === 0; i += 1);
    world.setInput(alice.id, 2, IDLE_INPUT);
    const carol = world.addShip(3, 'carol', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 3));
    ticks(world, 2);
    expect(carol.ore).toBe(4);
    expect(carol.carriedCredits).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/server/test/AsteroidField.test.ts packages/server/test/World.mining.test.ts`
Expected: FAIL — module missing / `addAsteroid` not a function.

- [ ] **Step 3: Implement** — `packages/server/src/world/AsteroidField.ts`

```ts
import { ASTEROID_MAX_RADIUS, ASTEROID_MIN_RADIUS, WORLD_SIZE, distanceToNearestZone } from '@arena/shared';
import type { AsteroidEntity } from './entities';

export type AsteroidFields = Omit<AsteroidEntity, 'kind' | 'id'>;

const ZONE_CLEARANCE = 300;
const RICHNESS_DISTANCE = 8_000;
const MIN_YIELD = 2;
const BONUS_YIELD = 6;
const VARIANTS = 4;

export function oreYieldAt(clearance: number): number {
  return MIN_YIELD + Math.floor(BONUS_YIELD * Math.min(1, Math.max(0, clearance) / RICHNESS_DISTANCE));
}

export function randomAsteroid(rng: () => number): AsteroidFields {
  for (;;) {
    const x = rng() * WORLD_SIZE;
    const y = rng() * WORLD_SIZE;
    const clearance = distanceToNearestZone(x, y);
    if (clearance < ZONE_CLEARANCE) continue;
    const radius = ASTEROID_MIN_RADIUS + rng() * (ASTEROID_MAX_RADIUS - ASTEROID_MIN_RADIUS);
    return {
      x,
      y,
      radius,
      hp: Math.round(radius * 2),
      oreYield: oreYieldAt(clearance),
      variant: 1 + Math.min(VARIANTS - 1, Math.floor(rng() * VARIANTS)),
    };
  }
}

export function scatterOre(asteroid: AsteroidFields, rng: () => number): { x: number; y: number }[] {
  return Array.from({ length: asteroid.oreYield }, () => {
    const angle = rng() * Math.PI * 2;
    const distance = rng() * asteroid.radius;
    return { x: asteroid.x + Math.cos(angle) * distance, y: asteroid.y + Math.sin(angle) * distance };
  });
}
```

- [ ] **Step 4: Modify `World.ts`**

Add imports:
```ts
import { ORE_PICKUP_LIFETIME, PICKUP_RADIUS } from '@arena/shared';
import { randomAsteroid, scatterOre, type AsteroidFields } from './AsteroidField';
```
(merge into the existing `@arena/shared` import list rather than adding a second import statement).

Add constant:
```ts
const ASTEROID_SPAWNS_PER_TICK = 20;
```

Constructor body becomes:
```ts
  constructor(options: WorldOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.asteroidTarget = options.asteroidTarget ?? ASTEROID_TARGET_COUNT;
    while (this.asteroids.size < this.asteroidTarget) this.addAsteroid(randomAsteroid(this.rng));
  }
```

Add public method after `reconnect`:
```ts
  addAsteroid(fields: AsteroidFields): AsteroidEntity {
    const asteroid: AsteroidEntity = { kind: 'asteroid', id: this.allocateId(), ...fields };
    this.asteroids.set(asteroid.id, asteroid);
    return asteroid;
  }
```

Replace `tick` body:
```ts
  tick(dt: number): TickEvents {
    this.elapsed += dt;
    this.ticks += 1;
    const events: TickEvents = { died: [], docked: [], departed: [] };
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
```

Replace `isHit` and `applyBulletTo`:
```ts
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

  private applyBulletTo(entity: WorldEntity, bullet: BulletEntity): void {
    if (entity.kind === 'ship') applyHit(entity, bullet, this.elapsed);
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
```

Add private methods:
```ts
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
```

- [ ] **Step 5: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS (Task 9 tests still pass).

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): add asteroid mining, ore and crate pickups"
```

---

### Task 11: Economy + docking

**Files:**
- Create: `packages/server/src/world/Economy.ts`
- Modify: `packages/server/src/world/World.ts`
- Test: `packages/server/test/Economy.test.ts`, `packages/server/test/World.economy.test.ts`

**Interfaces:**
- Consumes: `ShipEntity` (Task 9), `BuyFailure` (Task 4), `nextTierCost`, `withUpgrade`, `statsFor` (Task 2).
- Produces: `type BuyOutcome = { ok: true } | { ok: false; reason: BuyFailure }`, `updateDocking(ship, time): boolean` (true when newly docked), `buyUpgrade(ship, line): BuyOutcome`; `World.buy(shipId, line): BuyOutcome`. `TickEvents.docked` now populated.

- [ ] **Step 1: Write failing tests**

`packages/server/test/Economy.test.ts`:
```ts
import { DOCK_COMBAT_COOLDOWN, ORE_PRICE, SAFE_ZONES } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { buyUpgrade, updateDocking } from '../src/world/Economy';
import { createShip } from '../src/world/entities';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
const dockedShip = () => createShip(1, 1, 'alice', shipRecord(zone.x, zone.y, 1));

describe('updateDocking', () => {
  it('docks, sells ore, banks credits and repairs', () => {
    const ship = dockedShip();
    ship.ore = 3;
    ship.carriedCredits = 40;
    ship.hull = 10;
    expect(updateDocking(ship, 100)).toBe(true);
    expect(ship.docked).toBe(true);
    expect(ship.bankedCredits).toBe(40 + 3 * ORE_PRICE);
    expect(ship.ore).toBe(0);
    expect(ship.carriedCredits).toBe(0);
    expect(ship.hull).toBe(ship.stats.maxHull);
  });

  it('reports docking only once', () => {
    const ship = dockedShip();
    updateDocking(ship, 100);
    expect(updateDocking(ship, 101)).toBe(false);
  });

  it('refuses when moving fast', () => {
    const ship = dockedShip();
    ship.vx = 100;
    expect(updateDocking(ship, 100)).toBe(false);
    expect(ship.docked).toBe(false);
  });

  it('refuses shortly after taking damage', () => {
    const ship = dockedShip();
    ship.lastDamagedAt = 100 - DOCK_COMBAT_COOLDOWN + 1;
    expect(updateDocking(ship, 100)).toBe(false);
  });

  it('undocks outside a zone', () => {
    const ship = createShip(1, 1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    ship.docked = true;
    updateDocking(ship, 100);
    expect(ship.docked).toBe(false);
  });
});

describe('buyUpgrade', () => {
  it('requires docking', () => {
    expect(buyUpgrade(dockedShip(), 'weapon')).toEqual({ ok: false, reason: 'not_docked' });
  });

  it('requires enough banked credits', () => {
    const ship = dockedShip();
    ship.docked = true;
    expect(buyUpgrade(ship, 'weapon')).toEqual({ ok: false, reason: 'insufficient_credits' });
  });

  it('deducts credits and applies new stats', () => {
    const ship = dockedShip();
    ship.docked = true;
    ship.bankedCredits = 300;
    expect(buyUpgrade(ship, 'weapon')).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(50);
    expect(ship.loadout.weapon).toBe(1);
    expect(ship.stats.damage).toBeCloseTo(12.2);
  });

  it('stops at max tier', () => {
    const ship = dockedShip();
    ship.docked = true;
    ship.bankedCredits = 1_000_000;
    ship.loadout = { ...ship.loadout, cargo: 3 };
    expect(buyUpgrade(ship, 'cargo')).toEqual({ ok: false, reason: 'max_tier' });
  });
});
```

`packages/server/test/World.economy.test.ts`:
```ts
import { SAFE_ZONES, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { shipRecord } from './support/fixtures';

describe('World economy', () => {
  it('emits a docked event once and allows buying', () => {
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', { ...shipRecord(zone.x, zone.y, 1), bankedCredits: 500 });
    expect(world.tick(TICK_DT).docked.map((s) => s.id)).toEqual([ship.id]);
    expect(world.tick(TICK_DT).docked).toEqual([]);
    expect(world.buy(ship.id, 'hull')).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(300);
  });

  it('returns not_docked for unknown ships', () => {
    expect(new World({ asteroidTarget: 0 }).buy(999, 'hull')).toEqual({ ok: false, reason: 'not_docked' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/server/test/Economy.test.ts packages/server/test/World.economy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — `packages/server/src/world/Economy.ts`

```ts
import {
  DOCK_COMBAT_COOLDOWN,
  DOCK_MAX_SPEED,
  ORE_PRICE,
  nextTierCost,
  statsFor,
  withUpgrade,
  zoneAt,
  type BuyFailure,
  type UpgradeLine,
} from '@arena/shared';
import type { ShipEntity } from './entities';

export type BuyOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: BuyFailure };

function canDock(ship: ShipEntity, time: number): boolean {
  return (
    zoneAt(ship.x, ship.y) !== undefined &&
    Math.hypot(ship.vx, ship.vy) <= DOCK_MAX_SPEED &&
    time - ship.lastDamagedAt >= DOCK_COMBAT_COOLDOWN
  );
}

export function updateDocking(ship: ShipEntity, time: number): boolean {
  if (!canDock(ship, time)) {
    ship.docked = false;
    return false;
  }
  const newlyDocked = !ship.docked;
  ship.docked = true;
  ship.bankedCredits += ship.carriedCredits + ship.ore * ORE_PRICE;
  ship.carriedCredits = 0;
  ship.ore = 0;
  ship.hull = ship.stats.maxHull;
  return newlyDocked;
}

export function buyUpgrade(ship: ShipEntity, line: UpgradeLine): BuyOutcome {
  if (!ship.docked) return { ok: false, reason: 'not_docked' };
  const cost = nextTierCost(ship.loadout, line);
  if (cost === null) return { ok: false, reason: 'max_tier' };
  if (ship.bankedCredits < cost) return { ok: false, reason: 'insufficient_credits' };
  ship.bankedCredits -= cost;
  ship.loadout = withUpgrade(ship.loadout, line);
  ship.stats = statsFor(ship.loadout);
  ship.hull = ship.stats.maxHull;
  ship.shieldEnergy = Math.min(ship.shieldEnergy, ship.stats.maxShield);
  return { ok: true };
}
```

- [ ] **Step 4: Modify `World.ts`**

Add import (merge `UpgradeLine` into the shared import):
```ts
import { buyUpgrade, updateDocking, type BuyOutcome } from './Economy';
```

Add public method after `addAsteroid`:
```ts
  buy(shipId: number, line: UpgradeLine): BuyOutcome {
    const ship = this.ships.get(shipId);
    if (!ship) return { ok: false, reason: 'not_docked' };
    return buyUpgrade(ship, line);
  }
```

In `tick`, insert after `this.resolveDeaths(events.died);`:
```ts
    this.updateDocking(events.docked);
```

Add private method:
```ts
  private updateDocking(docked: ShipEntity[]): void {
    for (const ship of this.ships.values()) {
      if (updateDocking(ship, this.elapsed)) docked.push(ship);
    }
  }
```

- [ ] **Step 5: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): add docking, banking and upgrade purchases"
```

---

### Task 12: Snapshots

**Files:**
- Create: `packages/server/src/net/snapshot.ts`
- Test: `packages/server/test/snapshot.test.ts`

**Interfaces:**
- Consumes: `WorldEntity`, `ShipEntity` (Task 9); `EntityState`, `SelfState`, `SnapshotMessage` (Task 4).
- Produces: `toEntityState(entity): EntityState`, `toSelfState(ship): SelfState`, `buildSnapshot(self, nearby, tick): SnapshotMessage` (excludes `self` from `entities`; `lastSeq = self.lastSeq`).

- [ ] **Step 1: Write the failing test** — `packages/server/test/snapshot.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildSnapshot, toEntityState } from '../src/net/snapshot';
import { createShip, type WorldEntity } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

describe('snapshot', () => {
  it('excludes self and maps entities to public state', () => {
    const self = createShip(1, 1, 'alice', shipRecord(10, 20, 1));
    self.lastSeq = 42;
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    const ore: WorldEntity = { kind: 'ore', id: 3, x: 5, y: 6, expiresAt: 99 };
    const snapshot = buildSnapshot(self, [self, other, ore], 7);
    expect(snapshot.tick).toBe(7);
    expect(snapshot.lastSeq).toBe(42);
    expect(snapshot.self).toMatchObject({ id: 1, x: 10, y: 20, hull: 100, docked: false });
    expect(snapshot.entities).toEqual([
      { kind: 'ship', id: 2, name: 'bob', x: 30, y: 40, vx: 0, vy: 0, angle: 0, shieldUp: false, hullTier: 0 },
      { kind: 'ore', id: 3, x: 5, y: 6 },
    ]);
  });

  it('does not leak private fields of other ships', () => {
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    other.carriedCredits = 500;
    expect(Object.keys(toEntityState(other))).not.toContain('carriedCredits');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/snapshot.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — `packages/server/src/net/snapshot.ts`

```ts
import type { EntityState, SelfState, SnapshotMessage } from '@arena/shared';
import type { ShipEntity, WorldEntity } from '../world/entities';

export function toEntityState(entity: WorldEntity): EntityState {
  switch (entity.kind) {
    case 'ship':
      return {
        kind: 'ship',
        id: entity.id,
        name: entity.name,
        x: entity.x,
        y: entity.y,
        vx: entity.vx,
        vy: entity.vy,
        angle: entity.angle,
        shieldUp: entity.shieldUp,
        hullTier: entity.loadout.hull,
      };
    case 'bullet':
      return { kind: 'bullet', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, tier: entity.tier };
    case 'asteroid':
      return { kind: 'asteroid', id: entity.id, x: entity.x, y: entity.y, radius: entity.radius, variant: entity.variant };
    case 'ore':
      return { kind: 'ore', id: entity.id, x: entity.x, y: entity.y };
    case 'crate':
      return { kind: 'crate', id: entity.id, x: entity.x, y: entity.y };
  }
}

export function toSelfState(ship: ShipEntity): SelfState {
  return {
    id: ship.id,
    x: ship.x,
    y: ship.y,
    vx: ship.vx,
    vy: ship.vy,
    angle: ship.angle,
    hull: ship.hull,
    maxHull: ship.stats.maxHull,
    shieldEnergy: ship.shieldEnergy,
    maxShield: ship.stats.maxShield,
    shieldUp: ship.shieldUp,
    ore: ship.ore,
    cargoCapacity: ship.stats.cargoCapacity,
    carriedCredits: ship.carriedCredits,
    bankedCredits: ship.bankedCredits,
    loadout: ship.loadout,
    docked: ship.docked,
  };
}

export function buildSnapshot(self: ShipEntity, nearby: readonly WorldEntity[], tick: number): SnapshotMessage {
  return {
    type: 'snapshot',
    tick,
    lastSeq: self.lastSeq,
    self: toSelfState(self),
    entities: nearby.filter((entity) => entity.id !== self.id).map(toEntityState),
  };
}
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): build per-player snapshots"
```

---

### Task 13: Gateway, GameLoop, app, main

**Files:**
- Create: `packages/server/src/net/Gateway.ts`, `packages/server/src/GameLoop.ts`, `packages/server/src/app.ts`
- Modify: `packages/server/src/main.ts` (replace stub)
- Test: `packages/server/test/GameLoop.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 6–12.
- Produces:
  - `interface LoopOutput { broadcastSnapshots(): void; notifyDeaths(events: readonly DeathEvent[]): void }`
  - `interface ShipStore { saveShips(records: readonly ShipRecord[], now: number): void }`
  - `class GameLoop(world, output, store, now?)` with `step()`, `start(): ReturnType<typeof setInterval>`
  - `class Gateway(deps: GatewayDeps) implements LoopOutput` with `attach(wss)`
  - `interface AppConfig { dbPath: string; staticDir: string; asteroidTarget?: number }`, `interface App { server; world; loop; saveAll(); close(): Promise<void> }`, `createApp(config): App`
  - WebSocket path `/ws`, max payload 4096 bytes.

- [ ] **Step 1: Write the failing test** — `packages/server/test/GameLoop.test.ts`

```ts
import { IDLE_INPUT, SAFE_ZONES } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import type { ShipRecord } from '../src/db/PlayerRepository';
import { GameLoop } from '../src/GameLoop';
import { World, type DeathEvent } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function harness() {
  const broadcasts: number[] = [];
  const deaths: DeathEvent[] = [];
  const saved: ShipRecord[] = [];
  const world = new World({ asteroidTarget: 0 });
  const loop = new GameLoop(
    world,
    { broadcastSnapshots: () => broadcasts.push(world.tickCount), notifyDeaths: (events) => deaths.push(...events) },
    { saveShips: (records) => saved.push(...records) },
    () => 0,
  );
  return { world, loop, broadcasts, deaths, saved };
}

describe('GameLoop', () => {
  it('broadcasts 20 snapshots per 30 ticks', () => {
    const { loop, broadcasts } = harness();
    for (let i = 0; i < 30; i += 1) loop.step();
    expect(broadcasts).toHaveLength(20);
  });

  it('saves docked ships and reports deaths', () => {
    const { world, loop, deaths, saved } = harness();
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
    world.addShip(9, 'carl', shipRecord(zone.x, zone.y, 9));
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2));
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 200 && deaths.length === 0; i += 1) loop.step();
    expect(deaths[0]?.killerName).toBe('alice');
    expect(saved.map((record) => record.accountId)).toEqual(expect.arrayContaining([9, 2]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/GameLoop.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — `packages/server/src/GameLoop.ts`

```ts
import { SNAPSHOT_RATE, TICK_DT, TICK_RATE } from '@arena/shared';
import type { ShipRecord } from './db/PlayerRepository';
import { toShipRecord } from './world/entities';
import type { DeathEvent, World } from './world/World';

export interface LoopOutput {
  broadcastSnapshots(): void;
  notifyDeaths(events: readonly DeathEvent[]): void;
}

export interface ShipStore {
  saveShips(records: readonly ShipRecord[], now: number): void;
}

export class GameLoop {
  private snapshotCredit = 0;

  constructor(
    private readonly world: World,
    private readonly output: LoopOutput,
    private readonly store: ShipStore,
    private readonly now: () => number = Date.now,
  ) {}

  step(): void {
    const events = this.world.tick(TICK_DT);
    const changed = [...events.died.map((event) => event.ship), ...events.docked, ...events.departed];
    if (changed.length > 0) this.store.saveShips(changed.map(toShipRecord), this.now());
    this.output.notifyDeaths(events.died);
    this.snapshotCredit += SNAPSHOT_RATE;
    if (this.snapshotCredit < TICK_RATE) return;
    this.snapshotCredit -= TICK_RATE;
    this.output.broadcastSnapshots();
  }

  start(): ReturnType<typeof setInterval> {
    return setInterval(() => this.step(), 1_000 / TICK_RATE);
  }
}
```

- [ ] **Step 4: Implement** — `packages/server/src/net/Gateway.ts`

```ts
import {
  MAX_INPUTS_PER_SECOND,
  SAFE_ZONES,
  VIEW_RADIUS,
  WORLD_SIZE,
  parseClientMessage,
  type InputMessage,
  type ServerMessage,
  type UpgradeLine,
} from '@arena/shared';
import type { RawData, WebSocket, WebSocketServer } from 'ws';
import type { AuthService } from '../auth/AuthService';
import type { PlayerRepository, SessionInfo } from '../db/PlayerRepository';
import type { LoopOutput } from '../GameLoop';
import { toShipRecord } from '../world/entities';
import type { DeathEvent, World } from '../world/World';
import { buildSnapshot } from './snapshot';

const HELLO_TIMEOUT_MS = 5_000;
const RATE_WINDOW_MS = 1_000;
const POLICY_VIOLATION = 1008;

interface Session {
  readonly socket: WebSocket;
  readonly accountId: number;
  readonly shipId: number;
  windowStart: number;
  inputsInWindow: number;
}

export interface GatewayDeps {
  readonly world: World;
  readonly auth: AuthService;
  readonly repo: PlayerRepository;
  readonly now: () => number;
}

function rawToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

export class Gateway implements LoopOutput {
  private readonly sessions = new Map<number, Session>();

  constructor(private readonly deps: GatewayDeps) {}

  attach(wss: WebSocketServer): void {
    wss.on('connection', (socket) => this.awaitHello(socket));
  }

  broadcastSnapshots(): void {
    const { world } = this.deps;
    for (const session of this.sessions.values()) {
      const ship = world.shipById(session.shipId);
      if (!ship) continue;
      send(session.socket, buildSnapshot(ship, world.entitiesNear(ship.x, ship.y, VIEW_RADIUS), world.tickCount));
    }
  }

  notifyDeaths(events: readonly DeathEvent[]): void {
    for (const { ship, killerName } of events) {
      const session = this.sessions.get(ship.accountId);
      if (session) send(session.socket, { type: 'died', killer: killerName });
    }
  }

  private awaitHello(socket: WebSocket): void {
    socket.on('error', () => socket.terminate());
    const timer = setTimeout(() => socket.close(POLICY_VIOLATION, 'hello timeout'), HELLO_TIMEOUT_MS);
    socket.once('message', (data) => {
      clearTimeout(timer);
      const message = parseClientMessage(rawToString(data));
      const info = message?.type === 'hello' ? this.deps.auth.resolveToken(message.token) : undefined;
      if (!info) {
        send(socket, { type: 'kicked', reason: 'unauthorized' });
        socket.close(POLICY_VIOLATION, 'unauthorized');
        return;
      }
      this.startSession(socket, info);
    });
  }

  private startSession(socket: WebSocket, info: SessionInfo): void {
    const { world, repo } = this.deps;
    const ship =
      world.shipByAccount(info.accountId) ?? world.addShip(info.accountId, info.username, repo.loadShip(info.accountId));
    world.reconnect(ship.id);
    const session: Session = {
      socket,
      accountId: info.accountId,
      shipId: ship.id,
      windowStart: this.deps.now(),
      inputsInWindow: 0,
    };
    const previous = this.sessions.get(info.accountId);
    this.sessions.set(info.accountId, session);
    if (previous) {
      send(previous.socket, { type: 'kicked', reason: 'logged in elsewhere' });
      previous.socket.close();
    }
    send(socket, { type: 'welcome', shipId: ship.id, worldSize: WORLD_SIZE, safeZones: SAFE_ZONES });
    socket.on('message', (data) => this.onMessage(session, data));
    socket.on('close', () => this.onClose(session));
  }

  private onMessage(session: Session, data: RawData): void {
    const message = parseClientMessage(rawToString(data));
    if (!message || message.type === 'hello') {
      session.socket.close(POLICY_VIOLATION, 'invalid message');
      return;
    }
    if (message.type === 'input') {
      this.onInput(session, message);
      return;
    }
    this.onBuy(session, message.line);
  }

  private onInput(session: Session, message: InputMessage): void {
    const now = this.deps.now();
    if (now - session.windowStart >= RATE_WINDOW_MS) {
      session.windowStart = now;
      session.inputsInWindow = 0;
    }
    session.inputsInWindow += 1;
    if (session.inputsInWindow > MAX_INPUTS_PER_SECOND) return;
    const { seq, thrust, reverse, left, right, fire, shield } = message;
    this.deps.world.setInput(session.shipId, seq, { thrust, reverse, left, right, fire, shield });
  }

  private onBuy(session: Session, line: UpgradeLine): void {
    const { world, repo } = this.deps;
    const outcome = world.buy(session.shipId, line);
    const ship = world.shipById(session.shipId);
    if (outcome.ok && ship) repo.saveShips([toShipRecord(ship)], this.deps.now());
    send(
      session.socket,
      outcome.ok ? { type: 'buyResult', line, ok: true } : { type: 'buyResult', line, ok: false, reason: outcome.reason },
    );
  }

  private onClose(session: Session): void {
    if (this.sessions.get(session.accountId) !== session) return;
    this.sessions.delete(session.accountId);
    const removed = this.deps.world.disconnect(session.shipId);
    if (removed) this.deps.repo.saveShips([toShipRecord(removed)], this.deps.now());
  }
}
```

- [ ] **Step 5: Implement** — `packages/server/src/app.ts`

```ts
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { AuthService } from './auth/AuthService';
import { RateLimiter } from './auth/RateLimiter';
import { PlayerRepository } from './db/PlayerRepository';
import { GameLoop } from './GameLoop';
import { createHttpServer } from './http/HttpServer';
import { Gateway } from './net/Gateway';
import { toShipRecord } from './world/entities';
import { World } from './world/World';

const AUTH_BURST = 10;
const AUTH_REFILL_PER_MS = 1 / 6_000;
const MAX_WS_PAYLOAD = 4_096;

export interface AppConfig {
  readonly dbPath: string;
  readonly staticDir: string;
  readonly asteroidTarget?: number;
}

export interface App {
  readonly server: Server;
  readonly world: World;
  readonly loop: GameLoop;
  saveAll(): void;
  close(): Promise<void>;
}

export function createApp(config: AppConfig): App {
  const repo = PlayerRepository.open(config.dbPath);
  const auth = new AuthService(repo);
  const world = new World({ asteroidTarget: config.asteroidTarget });
  const server = createHttpServer({
    auth,
    limiter: new RateLimiter(AUTH_BURST, AUTH_REFILL_PER_MS),
    staticDir: config.staticDir,
    now: Date.now,
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_WS_PAYLOAD });
  const gateway = new Gateway({ world, auth, repo, now: Date.now });
  gateway.attach(wss);
  const loop = new GameLoop(world, gateway, repo);
  return {
    server,
    world,
    loop,
    saveAll: () => repo.saveShips(world.allShips().map(toShipRecord), Date.now()),
    close: async () => {
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      repo.close();
    },
  };
}
```

- [ ] **Step 6: Implement** — `packages/server/src/main.ts`

```ts
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const app = createApp({
  dbPath: process.env.DB_PATH ?? 'arena.db',
  staticDir: fileURLToPath(new URL('../../client/dist', import.meta.url)),
});
const timer = app.loop.start();
const port = Number(process.env.PORT ?? 8080);
app.server.listen(port, () => console.log(`Space Arena listening on :${port}`));

function shutdown(): void {
  clearInterval(timer);
  app.saveAll();
  void app.close().then(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 7: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

Smoke: `DB_PATH=/tmp/arena-smoke.db timeout 3 pnpm start`
Expected: prints `Space Arena listening on :8080`, exits on timeout without stack trace.

- [ ] **Step 8: Commit**

```bash
git add packages/server
git commit -m "feat(server): wire gateway, game loop and server entrypoint"
```

---

### Task 14: Server integration test

**Files:**
- Test: `packages/server/test/integration.test.ts`

**Interfaces:**
- Consumes: `createApp` (Task 13), `PlayerRepository` (Task 6), protocol types (Task 4).

- [ ] **Step 1: Write the test** — `packages/server/test/integration.test.ts`

```ts
import type { ClientMessage, ServerMessage, ShipInput } from '@arena/shared';
import { BOUNTY_BASE, IDLE_INPUT } from '@arena/shared';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp, type App } from '../src/app';
import { PlayerRepository } from '../src/db/PlayerRepository';
import { OPEN_SPACE } from './support/fixtures';

type MessageOf<K extends ServerMessage['type']> = Extract<ServerMessage, { type: K }>;

class TestClient {
  readonly messages: ServerMessage[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
  }

  static async connect(port: number, token: string): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const client = new TestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    client.send({ type: 'hello', token });
    return client;
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  input(seq: number, input: ShipInput): void {
    this.send({ type: 'input', seq, ...input });
  }

  close(): void {
    this.socket.close();
  }
}

let app: App;
let port: number;
let dbPath: string;

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 2));
}

async function pump<K extends ServerMessage['type']>(
  client: TestClient,
  type: K,
  predicate: (message: MessageOf<K>) => boolean = () => true,
  maxSteps = 300,
): Promise<MessageOf<K>> {
  for (let step = 0; step < maxSteps; step += 1) {
    const found = client.messages.find(
      (message): message is MessageOf<K> => message.type === type && predicate(message as MessageOf<K>),
    );
    if (found) return found;
    app.loop.step();
    await settle();
  }
  throw new Error(`no ${type} message`);
}

async function register(username: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'password1' }),
  });
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('token' in body) || typeof body.token !== 'string') {
    throw new Error('register failed');
  }
  return body.token;
}

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arena-'));
  dbPath = join(dir, 'arena.db');
  app = createApp({ dbPath, staticDir: dir, asteroidTarget: 0 });
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  port = address.port;
});

afterEach(async () => {
  await app.close();
});

describe('server integration', () => {
  it('rejects invalid tokens', async () => {
    const client = await TestClient.connect(port, 'not-a-token');
    expect((await pump(client, 'kicked')).reason).toBe('unauthorized');
  });

  it('plays a full duel, dock and purchase loop', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const bob = await TestClient.connect(port, await register('bob'));
    const aliceShip = app.world.shipById((await pump(alice, 'welcome')).shipId);
    const bobShip = app.world.shipById((await pump(bob, 'welcome')).shipId);
    if (!aliceShip || !bobShip) throw new Error('ships missing');
    Object.assign(aliceShip, { x: OPEN_SPACE.x, y: OPEN_SPACE.y });
    Object.assign(bobShip, { x: OPEN_SPACE.x, y: OPEN_SPACE.y - 200 });

    alice.input(1, { ...IDLE_INPUT, fire: true });
    expect((await pump(bob, 'died')).killer).toBe('alice');
    await pump(alice, 'snapshot', (s) => s.self.carriedCredits === BOUNTY_BASE);
    await pump(bob, 'snapshot', (s) => s.self.docked);

    alice.send({ type: 'buy', line: 'weapon' });
    expect(await pump(alice, 'buyResult')).toMatchObject({ ok: false, reason: 'not_docked' });
    bob.send({ type: 'buy', line: 'weapon' });
    expect(await pump(bob, 'buyResult')).toMatchObject({ ok: false, reason: 'insufficient_credits' });
  });

  it('kicks the older connection on a second login', async () => {
    const token = await register('alice');
    const first = await TestClient.connect(port, token);
    await pump(first, 'welcome');
    const second = await TestClient.connect(port, token);
    await pump(second, 'welcome');
    expect((await pump(first, 'kicked')).reason).toBe('logged in elsewhere');
  });

  it('saves a ship that disconnects in open space after the linger', async () => {
    const alice = await TestClient.connect(port, await register('alice'));
    const ship = app.world.shipById((await pump(alice, 'welcome')).shipId);
    if (!ship) throw new Error('ship missing');
    Object.assign(ship, { x: OPEN_SPACE.x, y: OPEN_SPACE.y });
    alice.close();
    await settle();
    for (let step = 0; step < 320; step += 1) app.loop.step();
    const repo = PlayerRepository.open(dbPath);
    const account = repo.findAccountByUsername('alice');
    const saved = account && repo.loadShip(account.id);
    repo.close();
    expect(saved?.x).toBeCloseTo(OPEN_SPACE.x);
    expect(saved?.y).toBeCloseTo(OPEN_SPACE.y);
  }, 20_000);
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test packages/server/test/integration.test.ts`
Expected: 4 tests PASS. If a test fails, use superpowers:systematic-debugging; fix the server code, not the test, unless the test contradicts the spec.

- [ ] **Step 3: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server
git commit -m "test(server): add end-to-end server integration test"
```

---

### Task 15: Generate sprites (Codex)

**Files:**
- Create: every PNG listed in `assets/manifest.json`, at the listed path under `assets/`.

**Interfaces:**
- Consumes: `assets/manifest.json`, `assets/STYLE.md` (Task 5).
- Produces: PNGs that pass `pnpm assets:check`.

- [ ] **Step 1: Read `assets/STYLE.md` and `assets/manifest.json`.** Do not change either file.
- [ ] **Step 2: Generate each sprite** with your image generation tool, following STYLE.md. Generate at a larger size if needed, then resize to the exact manifest `width`×`height` (for example `magick in.png -resize 64x64! assets/ships/ship_t0.png`). Keep transparency. For `explosion`, compose 8 frames of 64×64 left-to-right into one 512×64 image.
- [ ] **Step 3: Verify**

Run: `pnpm assets:check`
Expected: `assets ok`, exit code 0.

- [ ] **Step 4: Visual check** — open a contact sheet (`magick montage assets/**/*.png -background '#05060D' -geometry +8+8 /tmp/sheet.png`) and confirm ships face up, tiers read as a progression, starfield tiles without seams.
- [ ] **Step 5: Commit**

```bash
git add assets
git commit -m "feat(assets): add generated sprites"
```

---

### Task 16: Client scaffold, API, connection, login

**Files:**
- Create: `packages/client/index.html`, `packages/client/vite.config.ts`, `packages/client/src/style.css`
- Create: `packages/client/src/api.ts`, `packages/client/src/net/Connection.ts`, `packages/client/src/ui/LoginScreen.ts`
- Test: `packages/client/test/api.test.ts`, `packages/client/test/connection.test.ts`

**Interfaces:**
- Consumes: `ClientMessage`, `ServerMessage` (Task 4).
- Produces: `type AuthMode = 'login' | 'register'`, `type AuthResponse`, `authenticate(mode, username, password): Promise<AuthResponse>`; `isServerMessage(value): value is ServerMessage`, `interface ConnectionHandlers { onMessage; onClose }`, `class Connection` with `static open(token, handlers)`, `send(message)`, `close()`; `class LoginScreen(form, errorText)` with `waitForToken(message?): Promise<string>`.

- [ ] **Step 1: Write failing tests**

`packages/client/test/api.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../src/api';

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe('authenticate', () => {
  it('returns the token on success', async () => {
    stubFetch(200, { token: 'abc' });
    expect(await authenticate('login', 'alice', 'password1')).toEqual({ ok: true, token: 'abc' });
  });

  it('returns the server error message', async () => {
    stubFetch(409, { error: 'username taken' });
    expect(await authenticate('register', 'alice', 'password1')).toEqual({ ok: false, error: 'username taken' });
  });

  it('falls back to the status code', async () => {
    stubFetch(500, 'oops');
    expect(await authenticate('login', 'alice', 'password1')).toEqual({ ok: false, error: 'request failed (500)' });
  });

  it('posts to the mode route', async () => {
    stubFetch(200, { token: 'abc' });
    await authenticate('register', 'alice', 'password1');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/register');
  });
});
```

`packages/client/test/connection.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isServerMessage } from '../src/net/Connection';

describe('isServerMessage', () => {
  it('accepts known message types', () => {
    expect(isServerMessage({ type: 'died', killer: null })).toBe(true);
  });

  it('rejects unknown shapes', () => {
    expect(isServerMessage({ type: 'nope' })).toBe(false);
    expect(isServerMessage(null)).toBe(false);
    expect(isServerMessage('snapshot')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/client`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`packages/client/vite.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: fileURLToPath(new URL('../../assets', import.meta.url)),
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
```

`packages/client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Space Arena</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <form id="login">
      <h1>Space Arena</h1>
      <input name="username" autocomplete="username" placeholder="Pilot name" required />
      <input name="password" type="password" autocomplete="current-password" placeholder="Password" required />
      <div class="actions">
        <button type="submit" value="login">Log in</button>
        <button type="submit" value="register">Register</button>
      </div>
      <p id="login-error" role="alert"></p>
    </form>
    <div id="game" hidden>
      <div id="hud"></div>
      <canvas id="minimap" width="160" height="160"></canvas>
      <div id="shop" hidden></div>
      <div id="toast" role="status"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`packages/client/src/style.css`:
```css
:root { color-scheme: dark; font-family: system-ui, sans-serif; }
html, body { margin: 0; height: 100%; background: #05060d; color: #e6f1ff; overflow: hidden; }
#login { position: absolute; inset: 0; margin: auto; width: 280px; height: fit-content; display: grid; gap: 12px; padding: 24px; background: #0d1224; border: 1px solid #1f2a4a; border-radius: 8px; }
#login[hidden] { display: none; }
#login h1 { margin: 0 0 8px; font-size: 22px; text-align: center; color: #5ec8ff; }
#login input, #login button { padding: 8px 10px; border-radius: 4px; border: 1px solid #2a3a66; background: #070b18; color: inherit; font: inherit; }
#login button { cursor: pointer; background: #12305a; }
#login .actions { display: flex; gap: 8px; }
#login .actions button { flex: 1; }
#login-error { min-height: 1em; margin: 0; color: #ff7a7a; font-size: 13px; }
#game { position: absolute; inset: 0; }
#game canvas:first-child { display: block; }
#hud { position: absolute; top: 12px; left: 12px; font-size: 14px; line-height: 1.5; text-shadow: 0 1px 2px #000; pointer-events: none; }
#minimap { position: absolute; top: 12px; right: 12px; background: rgba(5, 6, 13, 0.7); border: 1px solid #1f2a4a; }
#shop { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: grid; gap: 6px; padding: 12px 16px; background: rgba(13, 18, 36, 0.92); border: 1px solid #2a3a66; border-radius: 8px; min-width: 360px; }
#shop[hidden] { display: none; }
#shop .row { display: grid; grid-template-columns: 32px 1fr auto auto; gap: 10px; align-items: center; }
#shop img { width: 32px; height: 32px; }
#shop button { padding: 4px 10px; border-radius: 4px; border: 1px solid #2a3a66; background: #12305a; color: inherit; cursor: pointer; }
#shop button:disabled { opacity: 0.4; cursor: default; }
#shop .result { min-height: 1em; font-size: 13px; color: #ffc83c; }
#toast { position: absolute; top: 40%; left: 50%; transform: translateX(-50%); font-size: 24px; color: #ff9a3c; text-shadow: 0 2px 4px #000; pointer-events: none; }
```

`packages/client/src/api.ts`:
```ts
import { z } from 'zod';

const ResponseSchema = z.object({ token: z.string().optional(), error: z.string().optional() });

export type AuthMode = 'login' | 'register';

export type AuthResponse =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly error: string };

export async function authenticate(mode: AuthMode, username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`/api/${mode}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body: unknown = await response.json().catch(() => null);
  const parsed = ResponseSchema.safeParse(body);
  const data: z.infer<typeof ResponseSchema> = parsed.success ? parsed.data : {};
  if (response.ok && data.token) return { ok: true, token: data.token };
  return { ok: false, error: data.error ?? `request failed (${response.status})` };
}
```

`packages/client/src/net/Connection.ts`:
```ts
import type { ClientMessage, ServerMessage } from '@arena/shared';

const SERVER_MESSAGE_TYPES: ReadonlySet<string> = new Set(['welcome', 'snapshot', 'died', 'buyResult', 'kicked']);

export function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    SERVER_MESSAGE_TYPES.has(value.type)
  );
}

export interface ConnectionHandlers {
  onMessage(message: ServerMessage): void;
  onClose(): void;
}

export class Connection {
  private constructor(private readonly socket: WebSocket) {}

  static open(token: string, handlers: ConnectionHandlers): Connection {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    const connection = new Connection(socket);
    socket.addEventListener('open', () => connection.send({ type: 'hello', token }));
    socket.addEventListener('message', (event) => {
      const data: unknown = JSON.parse(String(event.data));
      if (isServerMessage(data)) handlers.onMessage(data);
    });
    socket.addEventListener('close', () => handlers.onClose());
    return connection;
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket.close();
  }
}
```

`packages/client/src/ui/LoginScreen.ts`:
```ts
import { authenticate, type AuthMode } from '../api';

export class LoginScreen {
  constructor(
    private readonly form: HTMLFormElement,
    private readonly errorText: HTMLElement,
  ) {}

  waitForToken(message = ''): Promise<string> {
    this.form.hidden = false;
    this.errorText.textContent = message;
    return new Promise((resolve) => {
      const onSubmit = (event: SubmitEvent): void => {
        event.preventDefault();
        void this.submit(this.modeOf(event)).then((token) => {
          if (token === null) return;
          this.form.removeEventListener('submit', onSubmit);
          this.form.hidden = true;
          resolve(token);
        });
      };
      this.form.addEventListener('submit', onSubmit);
    });
  }

  private modeOf(event: SubmitEvent): AuthMode {
    return event.submitter instanceof HTMLButtonElement && event.submitter.value === 'register' ? 'register' : 'login';
  }

  private async submit(mode: AuthMode): Promise<string | null> {
    const data = new FormData(this.form);
    try {
      const result = await authenticate(mode, String(data.get('username') ?? ''), String(data.get('password') ?? ''));
      if (result.ok) return result.token;
      this.errorText.textContent = result.error;
    } catch {
      this.errorText.textContent = 'network error';
    }
    return null;
  }
}
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): add login, auth API and websocket connection"
```

---

### Task 17: Rendering + interpolation

**Files:**
- Create: `packages/client/src/sim/Interpolator.ts`, `packages/client/src/render/spriteIds.ts`, `packages/client/src/render/SpriteFactory.ts`, `packages/client/src/render/Effects.ts`, `packages/client/src/render/Renderer.ts`
- Test: `packages/client/test/interpolator.test.ts`, `packages/client/test/spriteIds.test.ts`

**Interfaces:**
- Consumes: `EntityState`, `SafeZone`, `ManifestSchema`, `VIEW_RADIUS` (shared).
- Produces:
  - `INTERPOLATION_DELAY_MS = 100`; `class Interpolator` with `push(entities, time)`, `sample(renderTime): EntityState[]`.
  - `spriteIdFor(entity: EntityState): string`.
  - `class SpriteFactory` with `static load()`, `create(id): Container`, `frames(id): Texture[] | null`, `size(id): { width; height }`.
  - `class Effects(layer, sprites)` with `explode(x, y)`, `update(dtSeconds)`.
  - `interface RenderView { camera: { x; y }; entities: readonly EntityState[] }`; `class Renderer` with `static create(host, sprites, zones)`, `render(view)`, `onFrame(callback)`, `destroy()`.

- [ ] **Step 1: Write failing tests**

`packages/client/test/interpolator.test.ts`:
```ts
import type { EntityState } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { Interpolator } from '../src/sim/Interpolator';

const ship = (x: number, angle = 0): EntityState => ({
  kind: 'ship', id: 1, name: 'bob', x, y: 0, vx: 0, vy: 0, angle, shieldUp: false, hullTier: 0,
});

describe('Interpolator', () => {
  it('returns nothing before any snapshot', () => {
    expect(new Interpolator().sample(0)).toEqual([]);
  });

  it('blends positions between bracketing snapshots', () => {
    const interpolator = new Interpolator();
    interpolator.push([ship(0)], 0);
    interpolator.push([ship(100)], 100);
    expect(interpolator.sample(25)[0]?.x).toBeCloseTo(25);
  });

  it('takes the short way around for angles', () => {
    const interpolator = new Interpolator();
    interpolator.push([ship(0, Math.PI - 0.1)], 0);
    interpolator.push([ship(0, -Math.PI + 0.1)], 100);
    const sampled = interpolator.sample(50)[0];
    expect(sampled?.kind === 'ship' && Math.abs(Math.cos(sampled.angle))).toBeCloseTo(1, 1);
  });

  it('holds the newest snapshot when render time is ahead', () => {
    const interpolator = new Interpolator();
    interpolator.push([ship(0)], 0);
    interpolator.push([ship(100)], 100);
    expect(interpolator.sample(500)[0]?.x).toBe(100);
  });

  it('shows new entities at their latest position', () => {
    const interpolator = new Interpolator();
    interpolator.push([], 0);
    interpolator.push([ship(100)], 100);
    expect(interpolator.sample(50)[0]?.x).toBe(100);
  });
});
```

`packages/client/test/spriteIds.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { spriteIdFor } from '../src/render/spriteIds';

describe('spriteIdFor', () => {
  it('maps each entity kind to its manifest id', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'a', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullTier: 3 })).toBe('ship_t3');
    expect(spriteIdFor({ kind: 'bullet', id: 1, x: 0, y: 0, vx: 0, vy: 0, tier: 2 })).toBe('bullet_t2');
    expect(spriteIdFor({ kind: 'asteroid', id: 1, x: 0, y: 0, radius: 40, variant: 4 })).toBe('asteroid_4');
    expect(spriteIdFor({ kind: 'ore', id: 1, x: 0, y: 0 })).toBe('ore_pickup');
    expect(spriteIdFor({ kind: 'crate', id: 1, x: 0, y: 0 })).toBe('loot_crate');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/client`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement pure modules**

`packages/client/src/sim/Interpolator.ts`:
```ts
import type { EntityState } from '@arena/shared';

export const INTERPOLATION_DELAY_MS = 100;

const MAX_BUFFERED = 30;

interface TimedSnapshot {
  readonly time: number;
  readonly entities: ReadonlyMap<number, EntityState>;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function lerpAngle(from: number, to: number, t: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

function blend(from: EntityState | undefined, to: EntityState, t: number): EntityState {
  if (!from || from.kind !== to.kind) return to;
  const moved = { ...to, x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
  if (moved.kind === 'ship' && from.kind === 'ship') return { ...moved, angle: lerpAngle(from.angle, moved.angle, t) };
  return moved;
}

export class Interpolator {
  private readonly buffer: TimedSnapshot[] = [];

  push(entities: readonly EntityState[], time: number): void {
    this.buffer.push({ time, entities: new Map(entities.map((entity) => [entity.id, entity])) });
    if (this.buffer.length > MAX_BUFFERED) this.buffer.shift();
  }

  sample(renderTime: number): EntityState[] {
    const newest = this.buffer.at(-1);
    if (!newest) return [];
    const nextIndex = this.buffer.findIndex((snapshot) => snapshot.time > renderTime);
    if (nextIndex === -1) return [...newest.entities.values()];
    const to = this.buffer[nextIndex];
    const from = this.buffer[nextIndex - 1];
    if (!to) return [...newest.entities.values()];
    if (!from) return [...to.entities.values()];
    const t = (renderTime - from.time) / (to.time - from.time);
    return [...to.entities.values()].map((entity) => blend(from.entities.get(entity.id), entity, t));
  }
}
```

`packages/client/src/render/spriteIds.ts`:
```ts
import type { EntityState } from '@arena/shared';

export function spriteIdFor(entity: EntityState): string {
  switch (entity.kind) {
    case 'ship':
      return `ship_t${entity.hullTier}`;
    case 'bullet':
      return `bullet_t${entity.tier}`;
    case 'asteroid':
      return `asteroid_${entity.variant}`;
    case 'ore':
      return 'ore_pickup';
    case 'crate':
      return 'loot_crate';
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test packages/client`
Expected: PASS.

- [ ] **Step 5: Implement Pixi modules** (verified manually in Task 19)

`packages/client/src/render/SpriteFactory.ts`:
```ts
import { ManifestSchema, type SpriteSpec } from '@arena/shared';
import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';

const DEFAULT_SIZE = { width: 32, height: 32 } as const;

const PLACEHOLDER_COLORS: Readonly<Record<string, number>> = {
  bullet: 0x9be7ff,
  asteroid: 0x7a6a5a,
  ore: 0x3cffb0,
  loot: 0xffc83c,
  shield: 0x5ec8ff,
  safe: 0x2f6f4f,
};

function placeholder(id: string, width: number): Graphics {
  if (id.startsWith('ship_')) {
    const half = width / 2;
    return new Graphics().poly([0, -half, half * 0.8, half, -half * 0.8, half]).fill(0x5ec8ff);
  }
  const color = PLACEHOLDER_COLORS[id.split('_')[0] ?? ''] ?? 0xffffff;
  const alpha = id === 'shield_bubble' ? 0.3 : 1;
  return new Graphics().circle(0, 0, width / 2).fill({ color, alpha });
}

async function loadManifest(): Promise<SpriteSpec[]> {
  try {
    const parsed = ManifestSchema.safeParse(await (await fetch('/manifest.json')).json());
    return parsed.success ? parsed.data.sprites : [];
  } catch {
    return [];
  }
}

async function loadTexture(spec: SpriteSpec): Promise<readonly [string, Texture] | null> {
  try {
    return [spec.id, await Assets.load<Texture>(`/${spec.file}`)] as const;
  } catch {
    return null;
  }
}

export class SpriteFactory {
  private constructor(
    private readonly specs: ReadonlyMap<string, SpriteSpec>,
    private readonly textures: ReadonlyMap<string, Texture>,
  ) {}

  static async load(): Promise<SpriteFactory> {
    const specs = await loadManifest();
    const loaded = await Promise.all(specs.map(loadTexture));
    return new SpriteFactory(
      new Map(specs.map((spec) => [spec.id, spec])),
      new Map(loaded.filter((entry): entry is readonly [string, Texture] => entry !== null)),
    );
  }

  size(id: string): { readonly width: number; readonly height: number } {
    const spec = this.specs.get(id);
    return spec ? { width: spec.width / spec.frames, height: spec.height } : DEFAULT_SIZE;
  }

  texture(id: string): Texture | null {
    return this.textures.get(id) ?? null;
  }

  create(id: string): Container {
    const texture = this.textures.get(id);
    const spec = this.specs.get(id);
    if (!texture || !spec) return placeholder(id, this.size(id).width);
    const sprite = new Sprite(texture);
    sprite.anchor.set(spec.anchor[0], spec.anchor[1]);
    return sprite;
  }

  frames(id: string): Texture[] | null {
    const texture = this.textures.get(id);
    const spec = this.specs.get(id);
    if (!texture || !spec || spec.frames < 2) return null;
    const width = spec.width / spec.frames;
    return Array.from(
      { length: spec.frames },
      (_, index) => new Texture({ source: texture.source, frame: new Rectangle(index * width, 0, width, spec.height) }),
    );
  }
}
```

`packages/client/src/render/Effects.ts`:
```ts
import { AnimatedSprite, type Container } from 'pixi.js';
import type { SpriteFactory } from './SpriteFactory';

const EXPLOSION_SECONDS = 0.6;

interface ActiveEffect {
  readonly view: Container;
  remaining: number;
}

export class Effects {
  private readonly active: ActiveEffect[] = [];

  constructor(
    private readonly layer: Container,
    private readonly sprites: SpriteFactory,
  ) {}

  explode(x: number, y: number): void {
    const view = this.explosionView();
    view.position.set(x, y);
    this.layer.addChild(view);
    this.active.push({ view, remaining: EXPLOSION_SECONDS });
  }

  update(dtSeconds: number): void {
    for (const effect of [...this.active]) {
      effect.remaining -= dtSeconds;
      const progress = 1 - effect.remaining / EXPLOSION_SECONDS;
      if (!(effect.view instanceof AnimatedSprite)) {
        effect.view.scale.set(0.5 + progress * 1.5);
        effect.view.alpha = 1 - progress;
      }
      if (effect.remaining > 0) continue;
      effect.view.destroy();
      this.active.splice(this.active.indexOf(effect), 1);
    }
  }

  private explosionView(): Container {
    const frames = this.sprites.frames('explosion');
    if (!frames) return this.sprites.create('explosion');
    const animation = new AnimatedSprite(frames);
    animation.anchor.set(0.5);
    animation.loop = false;
    animation.animationSpeed = frames.length / (EXPLOSION_SECONDS * 60);
    animation.play();
    return animation;
  }
}
```

`packages/client/src/render/Renderer.ts`:
```ts
import { VIEW_RADIUS, type EntityState, type SafeZone } from '@arena/shared';
import { Application, Container, Graphics, Rectangle, TilingSprite, type Texture } from 'pixi.js';
import { Effects } from './Effects';
import type { SpriteFactory } from './SpriteFactory';
import { spriteIdFor } from './spriteIds';

const STARFIELD_PARALLAX = 0.3;
const EXPLOSION_VISIBLE_FRACTION = 0.8;

type LayerName = 'zones' | 'ground' | 'ships' | 'bullets' | 'effects';

const LAYER_FOR: Readonly<Record<EntityState['kind'], LayerName>> = {
  ship: 'ships',
  bullet: 'bullets',
  asteroid: 'ground',
  ore: 'ground',
  crate: 'ground',
};

interface EntityView {
  readonly spriteId: string;
  readonly container: Container;
  readonly shield: Container | null;
  x: number;
  y: number;
}

export interface RenderView {
  readonly camera: { readonly x: number; readonly y: number };
  readonly entities: readonly EntityState[];
}

function generatedStars(app: Application): Texture {
  const stars = new Graphics();
  for (let i = 0; i < 120; i += 1) {
    stars.circle(Math.random() * 512, Math.random() * 512, Math.random() * 1.5 + 0.3).fill({ color: 0xffffff, alpha: Math.random() });
  }
  return app.renderer.generateTexture({ target: stars, frame: new Rectangle(0, 0, 512, 512) });
}

export class Renderer {
  private readonly world = new Container();
  private readonly layers: Readonly<Record<LayerName, Container>> = {
    zones: new Container(),
    ground: new Container(),
    ships: new Container(),
    bullets: new Container(),
    effects: new Container(),
  };
  private readonly views = new Map<number, EntityView>();
  private readonly effects: Effects;
  private camera = { x: 0, y: 0 };

  private constructor(
    private readonly app: Application,
    private readonly sprites: SpriteFactory,
    private readonly starfield: TilingSprite,
  ) {
    this.effects = new Effects(this.layers.effects, sprites);
    for (const layer of Object.values(this.layers)) this.world.addChild(layer);
    app.stage.addChild(starfield, this.world);
    app.ticker.add((ticker) => this.effects.update(ticker.deltaMS / 1_000));
  }

  static async create(host: HTMLElement, sprites: SpriteFactory, zones: readonly SafeZone[]): Promise<Renderer> {
    const app = new Application();
    await app.init({ resizeTo: host, background: 0x05060d, antialias: true });
    host.prepend(app.canvas);
    const starfield = new TilingSprite({
      texture: sprites.texture('starfield_tile') ?? generatedStars(app),
      width: app.screen.width,
      height: app.screen.height,
    });
    const renderer = new Renderer(app, sprites, starfield);
    renderer.drawZones(zones);
    return renderer;
  }

  onFrame(callback: () => void): void {
    this.app.ticker.add(callback);
  }

  render(view: RenderView): void {
    this.camera = { x: view.camera.x, y: view.camera.y };
    this.positionCamera();
    const seen = new Set<number>();
    for (const entity of view.entities) {
      seen.add(entity.id);
      this.syncEntity(entity);
    }
    this.removeMissing(seen);
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  private positionCamera(): void {
    const { width, height } = this.app.screen;
    this.world.pivot.set(this.camera.x, this.camera.y);
    this.world.position.set(width / 2, height / 2);
    this.starfield.width = width;
    this.starfield.height = height;
    this.starfield.tilePosition.set(-this.camera.x * STARFIELD_PARALLAX, -this.camera.y * STARFIELD_PARALLAX);
  }

  private drawZones(zones: readonly SafeZone[]): void {
    for (const zone of zones) {
      const ring = new Graphics().circle(zone.x, zone.y, zone.radius).fill({ color: 0x2f6f4f, alpha: 0.08 }).stroke({ color: 0x3cffb0, alpha: 0.4, width: 4 });
      const station = this.sprites.create('safe_zone_station');
      station.position.set(zone.x, zone.y);
      this.layers.zones.addChild(ring, station);
    }
  }

  private syncEntity(entity: EntityState): void {
    const spriteId = spriteIdFor(entity);
    const existing = this.views.get(entity.id);
    const view = existing && existing.spriteId === spriteId ? existing : this.replaceView(entity, spriteId);
    view.x = entity.x;
    view.y = entity.y;
    view.container.position.set(entity.x, entity.y);
    if (entity.kind !== 'ship') return;
    view.container.rotation = entity.angle;
    if (view.shield) view.shield.visible = entity.shieldUp;
  }

  private replaceView(entity: EntityState, spriteId: string): EntityView {
    this.views.get(entity.id)?.container.destroy();
    const container = this.sprites.create(spriteId);
    const shield = entity.kind === 'ship' ? this.sprites.create('shield_bubble') : null;
    if (shield) container.addChild(shield);
    if (entity.kind === 'asteroid') container.scale.set((entity.radius * 2) / this.sprites.size(spriteId).width);
    this.layers[LAYER_FOR[entity.kind]].addChild(container);
    const view: EntityView = { spriteId, container, shield, x: entity.x, y: entity.y };
    this.views.set(entity.id, view);
    return view;
  }

  private removeMissing(seen: ReadonlySet<number>): void {
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      if (view.spriteId.startsWith('ship_') && this.isWellInsideView(view)) this.effects.explode(view.x, view.y);
      view.container.destroy();
      this.views.delete(id);
    }
  }

  private isWellInsideView(view: EntityView): boolean {
    return Math.hypot(view.x - this.camera.x, view.y - this.camera.y) < VIEW_RADIUS * EXPLOSION_VISIBLE_FRACTION;
  }
}
```

A ship that vanishes while well inside view radius has died or disconnected; both get an explosion. This heuristic avoids a dedicated death broadcast.

- [ ] **Step 6: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client
git commit -m "feat(client): add Pixi renderer, sprite factory and interpolation"
```

---

### Task 18: Input + prediction

**Files:**
- Create: `packages/client/src/input/InputSampler.ts`, `packages/client/src/sim/Predictor.ts`
- Test: `packages/client/test/input.test.ts`, `packages/client/test/predictor.test.ts`

**Interfaces:**
- Consumes: `ShipInput`, `IDLE_INPUT`, `ShipMotion`, `stepMotion`, `statsFor`, `BASE_LOADOUT`, `TICK_DT`, `SelfState` (shared).
- Produces: `class InputSampler` with `attach(target: Window)`, `detach()`, `setKey(code, down): boolean`, `sample(): ShipInput`; `class Predictor` with `predict(input): number` (returns seq), `reconcile(self, lastSeq)`, `get current(): ShipMotion | null`.

- [ ] **Step 1: Write failing tests**

`packages/client/test/input.test.ts`:
```ts
import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { InputSampler } from '../src/input/InputSampler';

describe('InputSampler', () => {
  it('maps WASD, Space and Shift', () => {
    const sampler = new InputSampler();
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) sampler.setKey(code, true);
    expect(sampler.sample()).toEqual({ thrust: true, reverse: true, left: true, right: true, fire: true, shield: true });
  });

  it('releases keys', () => {
    const sampler = new InputSampler();
    sampler.setKey('KeyW', true);
    sampler.setKey('KeyW', false);
    expect(sampler.sample()).toEqual(IDLE_INPUT);
  });

  it('ignores unmapped keys', () => {
    expect(new InputSampler().setKey('KeyQ', true)).toBe(false);
  });
});
```

`packages/client/test/predictor.test.ts`:
```ts
import { BASE_LOADOUT, IDLE_INPUT, type SelfState } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { Predictor } from '../src/sim/Predictor';

const self = (overrides: Partial<SelfState> = {}): SelfState => ({
  id: 1, x: 1_000, y: 1_000, vx: 0, vy: 0, angle: 0,
  hull: 100, maxHull: 100, shieldEnergy: 100, maxShield: 100, shieldUp: false,
  ore: 0, cargoCapacity: 20, carriedCredits: 0, bankedCredits: 0,
  loadout: BASE_LOADOUT, docked: false, ...overrides,
});

const thrust = { ...IDLE_INPUT, thrust: true };

describe('Predictor', () => {
  it('has no motion before the first snapshot', () => {
    const predictor = new Predictor();
    expect(predictor.predict(thrust)).toBe(1);
    expect(predictor.current).toBeNull();
  });

  it('moves immediately after a snapshot', () => {
    const predictor = new Predictor();
    predictor.reconcile(self(), 0);
    predictor.predict(thrust);
    expect(predictor.current?.vy).toBeLessThan(0);
  });

  it('replays unacknowledged inputs on reconcile', () => {
    const predictor = new Predictor();
    predictor.reconcile(self(), 0);
    predictor.predict(thrust);
    predictor.predict(thrust);
    const predicted = predictor.current;
    predictor.reconcile(self(), 0);
    expect(predictor.current?.y).toBeCloseTo(predicted?.y ?? 0);
  });

  it('drops acknowledged inputs', () => {
    const predictor = new Predictor();
    predictor.reconcile(self(), 0);
    predictor.predict(thrust);
    predictor.predict(thrust);
    predictor.reconcile(self({ y: 500 }), 2);
    expect(predictor.current?.y).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/client`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`packages/client/src/input/InputSampler.ts`:
```ts
import { IDLE_INPUT, type ShipInput } from '@arena/shared';

type InputKey = keyof ShipInput;

const KEY_MAP: Readonly<Record<string, InputKey>> = {
  KeyW: 'thrust',
  KeyS: 'reverse',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'fire',
  ShiftLeft: 'shield',
  ShiftRight: 'shield',
};

export class InputSampler {
  private readonly pressed = new Set<InputKey>();
  private target: Window | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.setKey(event.code, true)) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.setKey(event.code, false)) event.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
  };

  attach(target: Window): void {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    this.target?.removeEventListener('keydown', this.onKeyDown);
    this.target?.removeEventListener('keyup', this.onKeyUp);
    this.target?.removeEventListener('blur', this.onBlur);
    this.target = null;
    this.pressed.clear();
  }

  setKey(code: string, down: boolean): boolean {
    const key = KEY_MAP[code];
    if (!key) return false;
    if (down) this.pressed.add(key);
    else this.pressed.delete(key);
    return true;
  }

  sample(): ShipInput {
    return {
      ...IDLE_INPUT,
      thrust: this.pressed.has('thrust'),
      reverse: this.pressed.has('reverse'),
      left: this.pressed.has('left'),
      right: this.pressed.has('right'),
      fire: this.pressed.has('fire'),
      shield: this.pressed.has('shield'),
    };
  }
}
```

`packages/client/src/sim/Predictor.ts`:
```ts
import {
  BASE_LOADOUT,
  TICK_DT,
  statsFor,
  stepMotion,
  type SelfState,
  type ShipInput,
  type ShipMotion,
  type ShipStats,
} from '@arena/shared';

const MAX_PENDING = 120;

interface PendingInput {
  readonly seq: number;
  readonly input: ShipInput;
}

export class Predictor {
  private pending: PendingInput[] = [];
  private nextSeq = 1;
  private motion: ShipMotion | null = null;
  private stats: ShipStats = statsFor(BASE_LOADOUT);

  get current(): ShipMotion | null {
    return this.motion;
  }

  predict(input: ShipInput): number {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (this.motion) this.motion = stepMotion(this.motion, input, this.stats, TICK_DT);
    return seq;
  }

  reconcile(self: SelfState, lastSeq: number): void {
    this.stats = statsFor(self.loadout);
    this.pending = this.pending.filter((entry) => entry.seq > lastSeq);
    const authoritative: ShipMotion = { x: self.x, y: self.y, vx: self.vx, vy: self.vy, angle: self.angle };
    this.motion = this.pending.reduce(
      (motion, entry) => stepMotion(motion, entry.input, this.stats, TICK_DT),
      authoritative,
    );
  }
}
```

- [ ] **Step 4: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client
git commit -m "feat(client): add keyboard input and client-side prediction"
```

---

### Task 19: HUD, shop, game session wiring

**Files:**
- Create: `packages/client/src/ui/Hud.ts`, `packages/client/src/ui/ShopPanel.ts`, `packages/client/src/ui/Toast.ts`, `packages/client/src/game/GameSession.ts`
- Modify: `packages/client/src/main.ts` (replace stub)
- Test: `packages/client/test/hud.test.ts`, `packages/client/test/shop.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 16–18; `UPGRADE_LINES`, `MAX_TIER`, `nextTierCost`, `TICK_RATE` (shared).
- Produces: `hudLines(self): string[]`, `class Hud(root, minimap, zones, worldSize)` with `update(self)`; `interface ShopRow`, `shopRows(self): ShopRow[]`, `class ShopPanel(root, onBuy)` with `update(self)`, `showResult(message)`; `class Toast(root)` with `show(text)`; `interface GameDom`, `runSession(token, sprites, dom): Promise<string>`.

- [ ] **Step 1: Write failing tests**

`packages/client/test/hud.test.ts`:
```ts
import { BASE_LOADOUT, type SelfState } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { hudLines } from '../src/ui/Hud';

const self: SelfState = {
  id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0,
  hull: 62.4, maxHull: 100, shieldEnergy: 33.3, maxShield: 100, shieldUp: true,
  ore: 4, cargoCapacity: 20, carriedCredits: 150, bankedCredits: 900,
  loadout: BASE_LOADOUT, docked: false,
};

describe('hudLines', () => {
  it('summarises ship state', () => {
    expect(hudLines(self)).toEqual([
      'Hull 63 / 100',
      'Shield 33 / 100 (UP)',
      'Cargo 4 / 20 ore',
      'Carried 150 cr (at risk)',
      'Banked 900 cr',
    ]);
  });

  it('shows the docked state', () => {
    expect(hudLines({ ...self, docked: true, shieldUp: false })).toContain('DOCKED');
  });
});
```

`packages/client/test/shop.test.ts`:
```ts
import { BASE_LOADOUT, type SelfState } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { shopRows } from '../src/ui/ShopPanel';

const self = (banked: number, loadout = BASE_LOADOUT): SelfState => ({
  id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0,
  hull: 100, maxHull: 100, shieldEnergy: 100, maxShield: 100, shieldUp: false,
  ore: 0, cargoCapacity: 20, carriedCredits: 0, bankedCredits: banked,
  loadout, docked: true,
});

describe('shopRows', () => {
  it('lists every upgrade line with cost and affordability', () => {
    const rows = shopRows(self(220));
    expect(rows.map((row) => row.line)).toEqual(['hull', 'engine', 'weapon', 'shield', 'cargo']);
    expect(rows.find((row) => row.line === 'hull')).toMatchObject({ tier: 0, maxTier: 5, cost: 200, affordable: true });
    expect(rows.find((row) => row.line === 'weapon')).toMatchObject({ cost: 250, affordable: false });
  });

  it('marks maxed lines', () => {
    const row = shopRows(self(10_000, { ...BASE_LOADOUT, cargo: 3 })).find((r) => r.line === 'cargo');
    expect(row).toMatchObject({ cost: null, affordable: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/client`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement UI**

`packages/client/src/ui/Hud.ts`:
```ts
import type { SafeZone, SelfState } from '@arena/shared';

export function hudLines(self: SelfState): string[] {
  const lines = [
    `Hull ${Math.ceil(self.hull)} / ${Math.round(self.maxHull)}`,
    `Shield ${Math.floor(self.shieldEnergy)} / ${Math.round(self.maxShield)}${self.shieldUp ? ' (UP)' : ''}`,
    `Cargo ${self.ore} / ${self.cargoCapacity} ore`,
    `Carried ${self.carriedCredits} cr (at risk)`,
    `Banked ${self.bankedCredits} cr`,
  ];
  return self.docked ? [...lines, 'DOCKED'] : lines;
}

export class Hud {
  constructor(
    private readonly root: HTMLElement,
    private readonly minimap: HTMLCanvasElement,
    private readonly zones: readonly SafeZone[],
    private readonly worldSize: number,
  ) {}

  update(self: SelfState): void {
    this.root.replaceChildren(
      ...hudLines(self).map((line) => {
        const row = document.createElement('div');
        row.textContent = line;
        return row;
      }),
    );
    this.drawMinimap(self);
  }

  private drawMinimap(self: SelfState): void {
    const context = this.minimap.getContext('2d');
    if (!context) return;
    const scale = this.minimap.width / this.worldSize;
    context.clearRect(0, 0, this.minimap.width, this.minimap.height);
    context.fillStyle = 'rgba(60, 255, 176, 0.35)';
    for (const zone of this.zones) {
      context.beginPath();
      context.arc(zone.x * scale, zone.y * scale, Math.max(3, zone.radius * scale), 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#5ec8ff';
    context.fillRect(self.x * scale - 2, self.y * scale - 2, 4, 4);
  }
}
```

`packages/client/src/ui/ShopPanel.ts`:
```ts
import {
  MAX_TIER,
  UPGRADE_LINES,
  nextTierCost,
  type BuyFailure,
  type BuyResultMessage,
  type SelfState,
  type UpgradeLine,
} from '@arena/shared';

const LABELS: Readonly<Record<UpgradeLine, string>> = {
  hull: 'Hull',
  engine: 'Engine',
  weapon: 'Weapons',
  shield: 'Shields',
  cargo: 'Cargo',
};

const FAILURE_TEXT: Readonly<Record<BuyFailure, string>> = {
  not_docked: 'Dock first',
  max_tier: 'Already at max tier',
  insufficient_credits: 'Not enough banked credits',
};

export interface ShopRow {
  readonly line: UpgradeLine;
  readonly label: string;
  readonly tier: number;
  readonly maxTier: number;
  readonly cost: number | null;
  readonly affordable: boolean;
}

export function shopRows(self: SelfState): ShopRow[] {
  return UPGRADE_LINES.map((line) => {
    const cost = nextTierCost(self.loadout, line);
    return {
      line,
      label: LABELS[line],
      tier: self.loadout[line],
      maxTier: MAX_TIER[line],
      cost,
      affordable: cost !== null && cost <= self.bankedCredits,
    };
  });
}

export class ShopPanel {
  private renderedKey = '';
  private readonly result = document.createElement('div');

  constructor(
    private readonly root: HTMLElement,
    private readonly onBuy: (line: UpgradeLine) => void,
  ) {
    this.result.className = 'result';
  }

  update(self: SelfState): void {
    this.root.hidden = !self.docked;
    if (!self.docked) return;
    const rows = shopRows(self);
    const key = JSON.stringify(rows);
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.replaceChildren(...rows.map((row) => this.rowElement(row)), this.result);
  }

  showResult(message: BuyResultMessage): void {
    this.result.textContent = message.ok ? `${LABELS[message.line]} upgraded` : FAILURE_TEXT[message.reason];
  }

  private rowElement(row: ShopRow): HTMLElement {
    const element = document.createElement('div');
    element.className = 'row';
    const icon = document.createElement('img');
    icon.src = `/ui/icon_${row.line}.png`;
    icon.alt = '';
    icon.addEventListener('error', () => {
      icon.style.visibility = 'hidden';
    });
    const name = document.createElement('span');
    name.textContent = `${row.label} ${row.tier}/${row.maxTier}`;
    const price = document.createElement('span');
    price.textContent = row.cost === null ? 'MAX' : `${row.cost} cr`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Buy';
    button.disabled = !row.affordable;
    button.addEventListener('click', () => this.onBuy(row.line));
    element.append(icon, name, price, button);
    return element;
  }
}
```

`packages/client/src/ui/Toast.ts`:
```ts
const TOAST_MS = 3_000;

export class Toast {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly root: HTMLElement) {}

  show(text: string): void {
    this.root.textContent = text;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.root.textContent = '';
    }, TOAST_MS);
  }
}
```

- [ ] **Step 4: Implement session wiring**

`packages/client/src/game/GameSession.ts`:
```ts
import { TICK_RATE, type ServerMessage, type ShipState, type SnapshotMessage, type WelcomeMessage } from '@arena/shared';
import { InputSampler } from '../input/InputSampler';
import { Connection } from '../net/Connection';
import { Renderer } from '../render/Renderer';
import type { SpriteFactory } from '../render/SpriteFactory';
import { INTERPOLATION_DELAY_MS, Interpolator } from '../sim/Interpolator';
import { Predictor } from '../sim/Predictor';
import { Hud } from '../ui/Hud';
import { ShopPanel } from '../ui/ShopPanel';
import { Toast } from '../ui/Toast';

export interface GameDom {
  readonly gameRoot: HTMLElement;
  readonly hud: HTMLElement;
  readonly minimap: HTMLCanvasElement;
  readonly shop: HTMLElement;
  readonly toast: HTMLElement;
}

class ActiveGame {
  private readonly predictor = new Predictor();
  private readonly interpolator = new Interpolator();
  private readonly input = new InputSampler();
  private latest: SnapshotMessage | null = null;
  private inputTimer: ReturnType<typeof setInterval> | undefined;

  private constructor(
    private readonly connection: Connection,
    private readonly renderer: Renderer,
    private readonly hud: Hud,
    private readonly shop: ShopPanel,
    private readonly toast: Toast,
    private readonly dom: GameDom,
  ) {}

  static async start(welcome: WelcomeMessage, connection: Connection, sprites: SpriteFactory, dom: GameDom): Promise<ActiveGame> {
    dom.gameRoot.hidden = false;
    const renderer = await Renderer.create(dom.gameRoot, sprites, welcome.safeZones);
    const game = new ActiveGame(
      connection,
      renderer,
      new Hud(dom.hud, dom.minimap, welcome.safeZones, welcome.worldSize),
      new ShopPanel(dom.shop, (line) => connection.send({ type: 'buy', line })),
      new Toast(dom.toast),
      dom,
    );
    game.begin();
    return game;
  }

  handle(message: ServerMessage): void {
    switch (message.type) {
      case 'snapshot':
        this.onSnapshot(message);
        return;
      case 'died':
        this.toast.show(message.killer ? `Destroyed by ${message.killer}` : 'Ship destroyed');
        return;
      case 'buyResult':
        this.shop.showResult(message);
        return;
      default:
        return;
    }
  }

  stop(): void {
    clearInterval(this.inputTimer);
    this.input.detach();
    this.renderer.destroy();
    this.dom.gameRoot.hidden = true;
  }

  private begin(): void {
    this.input.attach(window);
    this.inputTimer = setInterval(() => this.sendInput(), 1_000 / TICK_RATE);
    this.renderer.onFrame(() => this.draw());
  }

  private sendInput(): void {
    const input = this.input.sample();
    const seq = this.predictor.predict(input);
    this.connection.send({ type: 'input', seq, ...input });
  }

  private onSnapshot(snapshot: SnapshotMessage): void {
    this.latest = snapshot;
    this.interpolator.push(snapshot.entities, performance.now());
    this.predictor.reconcile(snapshot.self, snapshot.lastSeq);
    this.hud.update(snapshot.self);
    this.shop.update(snapshot.self);
  }

  private draw(): void {
    if (!this.latest) return;
    const { self } = this.latest;
    const motion = this.predictor.current ?? self;
    const ownShip: ShipState = {
      kind: 'ship',
      id: self.id,
      name: 'you',
      x: motion.x,
      y: motion.y,
      vx: motion.vx,
      vy: motion.vy,
      angle: motion.angle,
      shieldUp: self.shieldUp,
      hullTier: self.loadout.hull,
    };
    const others = this.interpolator.sample(performance.now() - INTERPOLATION_DELAY_MS);
    this.renderer.render({ camera: motion, entities: [ownShip, ...others] });
  }
}

export function runSession(token: string, sprites: SpriteFactory, dom: GameDom): Promise<string> {
  return new Promise((resolve) => {
    let reason = 'connection lost';
    let game: ActiveGame | null = null;
    let closed = false;
    const connection = Connection.open(token, {
      onMessage: (message) => {
        if (message.type === 'kicked') {
          reason = message.reason;
          return;
        }
        if (message.type === 'welcome') {
          void ActiveGame.start(message, connection, sprites, dom).then((started) => {
            if (closed) started.stop();
            else game = started;
          });
          return;
        }
        game?.handle(message);
      },
      onClose: () => {
        closed = true;
        game?.stop();
        resolve(reason);
      },
    });
  });
}
```

`packages/client/src/main.ts`:
```ts
import { runSession, type GameDom } from './game/GameSession';
import { SpriteFactory } from './render/SpriteFactory';
import { LoginScreen } from './ui/LoginScreen';

const TOKEN_KEY = 'arena.token';

function element<T extends HTMLElement>(id: string, type: { new (): T; prototype: T }): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`missing #${id}`);
  return found;
}

async function main(): Promise<void> {
  const login = new LoginScreen(element('login', HTMLFormElement), element('login-error', HTMLElement));
  const dom: GameDom = {
    gameRoot: element('game', HTMLDivElement),
    hud: element('hud', HTMLDivElement),
    minimap: element('minimap', HTMLCanvasElement),
    shop: element('shop', HTMLDivElement),
    toast: element('toast', HTMLDivElement),
  };
  const sprites = await SpriteFactory.load();
  let token = localStorage.getItem(TOKEN_KEY);
  let message = '';
  for (;;) {
    token ??= await login.waitForToken(message);
    localStorage.setItem(TOKEN_KEY, token);
    const reason = await runSession(token, sprites, dom);
    if (reason === 'unauthorized') localStorage.removeItem(TOKEN_KEY);
    token = null;
    message = reason;
  }
}

void main();
```

A disconnect returns the player to the login screen instead of auto-reconnecting, so a dead server never causes a reconnect loop. Only an `unauthorized` kick clears the stored token; the next page load reuses a still-valid token.

- [ ] **Step 5: Run gates**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 6: Manual check (dev mode)**

Run in two terminals: `pnpm dev:server` and `pnpm dev:client`. Open the Vite URL, register `alice`, confirm: ship renders (sprite or placeholder triangle), W/A/S/D fly with inertia, Space fires, Shift shows the shield, HUD updates, shop appears while docked at spawn. Report what you saw.

- [ ] **Step 7: Commit**

```bash
git add packages/client
git commit -m "feat(client): add HUD, shop and game session wiring"
```

---

### Task 20: Build + playtest (coordinator)

**Files:** none unless defects are found (each defect fix is its own commit with a regression test).

- [ ] **Step 1: Full gates**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm assets:check`
Expected: all PASS, `assets ok`.

- [ ] **Step 2: Production build and start**

Run: `pnpm build && DB_PATH=/tmp/arena-playtest.db pnpm start`
Expected: `Space Arena listening on :8080`; `http://localhost:8080` serves the game.

- [ ] **Step 3: Two-tab playtest checklist** (tab A = `alice`, tab B = `bob`)

1. Register both; both spawn docked at the alpha station; shop visible.
2. Fly both out of the zone; shop hides; firing works only outside.
3. A shoots B with Shift held on B: B takes no hull damage while energy lasts; shield drops with lockout at 0.
4. A kills B: B sees "Destroyed by alice", explodes in A's view, respawns docked with base ship; A HUD shows carried 100 cr.
5. A shoots asteroids, collects ore, docks: ore sold, credits banked, hull repaired.
6. A buys a weapon upgrade; bullets change sprite tier; credits deducted; reload page → upgrade persists.
7. Close tab A in open space; within 10 s B can still see and kill A's ship; after 10 s it disappears.
8. Log in as A in a second tab while the first is open: first tab returns to login with "logged in elsewhere".
9. Ctrl+C the server, restart: both accounts keep banked credits and loadouts.

- [ ] **Step 4: Report** results per checklist item to the user. Any failed item → superpowers:systematic-debugging, fix with a regression test, re-run Steps 1–3.
