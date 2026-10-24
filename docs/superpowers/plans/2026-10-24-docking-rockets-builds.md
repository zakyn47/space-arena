# Docking, Rockets, Ship Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Under Orca orchestration, follow the DAG below.

**Goal:** Add manual E-docking with a 30 s cooldown, homing rockets on R, and a hull + gear build system with a build menu, replacing the five fixed upgrade lines.

**Architecture:** Static hull and gear catalogs plus pure build functions (`statsFor`, `refitToHull`, `withGear`) live in `shared`, so server and client compute identical stats. The server gains pure `Docking`, `Rockets` and `Shop` modules that `World` orchestrates; persistence moves to a versioned schema with a one-time migration. The client gains E/R input, a docked-freeze in prediction, rocket and hull rendering, HUD prompts, and a `BuildMenu` replacing `ShopPanel`.

**Tech Stack:** unchanged (TypeScript strict, pnpm, ws, better-sqlite3, zod, PixiJS 8, Vite, Vitest).

**Spec:** `docs/superpowers/specs/2026-10-24-docking-rockets-builds-design.md` (extends `docs/superpowers/specs/2026-10-24-space-arena-design.md`).

## Global Constraints

- TypeScript strict, no `any`, no casts except existing test helpers. No what-comments.
- Never add `Co-Authored-By` or any AI attribution to commits. One commit per task with the given message. Do not push.
- Dock: range 200 px from a zone center, speed ≤ 60 px/s, no damage in last 5 s, 30 s cooldown after undock. Snap to center, velocity 0, inputs ignored while docked. Auto-dock removed.
- Rockets: R held, 1 s cooldown, 300→700 px/s at 400 px/s², turn 2.5 rad/s, 4 s life, 30 damage, lock 1 200 px within ±45°. New account 10, respawn 5, death loses all. Base max 10. 25 credits each.
- Hulls/gear/prices exactly as spec tables 5.1 and 5.2. Sell-back 50% (floor). Empty engine ×0.6. Shield drain 30/s. Weapon lateral spacing 20 px.
- Bounty = 100 + floor(25% × build value).
- **Gates.** Phase A tasks: `pnpm exec tsc -p packages/shared && pnpm exec vitest run packages/shared && pnpm lint`. Server lane: `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/server && pnpm exec vitest run packages/shared packages/server && pnpm lint`. Client lane: `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/client && pnpm exec vitest run packages/shared packages/client && pnpm lint && pnpm --filter @arena/client build`. After the final merge: `pnpm typecheck && pnpm test && pnpm lint && pnpm assets:check && pnpm build`. (Between Phase A and the merge, the other package intentionally fails typecheck because the shared protocol changed.)

## Orchestration (Orca)

| Task | Worker | Placement | Depends on |
|---|---|---|---|
| A1 Catalog + build model | Sonnet | master | — |
| A2 Protocol, physics input, asset contract | Sonnet (same terminal) | master | A1 |
| S1 Persistence v2 + migration | Sonnet | worktree `builds-server` | A2 |
| S2 Entities + per-weapon combat | same worker | same | S1 |
| S3 Docking | same | same | S2 |
| S4 Rockets | same | same | S3 |
| S5 Shop | same | same | S4 |
| S6 Snapshot, Gateway, GameLoop, integration | same | same | S5 |
| C1 Input E/R + predictor freeze | Sonnet | worktree `builds-client` | A2 |
| C2 Rendering: hulls, weapons, rockets | same | same | C1 |
| C3 HUD prompts + rockets | same | same | C2 |
| C4 Build menu + session wiring + controls.md | same | same | C3 |
| X1 Sprites | Codex (unsupervised, terminal send) | worktree `builds-art` | A2 |
| M1 Merge, full gates, playtest | Opus coordinator | master | S6, C4, X1 |

---

## Phase A — shared (master)

### Task A1: Catalog + build model

**Files:**
- Create: `packages/shared/src/catalog/hulls.ts`, `packages/shared/src/catalog/gear.ts`, `packages/shared/src/build.ts`
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/test/build.test.ts`

**Interfaces — Produces:**
- `SLOT_TYPES`, `SlotType`, `HULL_IDS`, `HullId`, `HullSpec`, `HULLS`
- `GEAR_IDS`, `GearId`, `MK_LEVELS`, `Mk`, `GearEffect` (`weapon|shield|engine|utility`), `GearTier`, `GearSpec`, `GEAR`, `gearTier(gearId, mk)`
- `InstalledGear`, `SlotContents`, `BuildSlots`, `Build`, `SlotRef`, `WeaponMount`, `ShipStats`, `MkSchema`, `STARTER_BUILD`, `fitsHull`, `parseBuild`, `gearCost`, `buildValue`, `resaleValue`, `statsFor`, `slotExists`, `gearAt`, `withGear`, `Refit`, `refitToHull`
- New constants (below).

- [ ] **Step 1: Append constants** to `packages/shared/src/constants.ts`:

```ts
export const DOCK_RANGE = 200;
export const DOCK_COOLDOWN = 30;
export const ROCKET_COOLDOWN = 1;
export const ROCKET_LAUNCH_SPEED = 300;
export const ROCKET_MAX_SPEED = 700;
export const ROCKET_ACCELERATION = 400;
export const ROCKET_TURN_RATE = 2.5;
export const ROCKET_LIFETIME = 4;
export const ROCKET_DAMAGE = 30;
export const ROCKET_LOCK_RANGE = 1_200;
export const ROCKET_LOCK_CONE = Math.PI / 4;
export const ROCKET_PRICE = 25;
export const MAX_ROCKETS_PER_PURCHASE = 20;
export const BASE_MAX_ROCKETS = 10;
export const NEW_ACCOUNT_ROCKETS = 10;
export const RESPAWN_ROCKETS = 5;
export const SELL_BACK_SHARE = 0.5;
export const WEAPON_SPACING = 20;
export const EMPTY_ENGINE_FACTOR = 0.6;
export const SHIELD_DRAIN = 30;
```

- [ ] **Step 2: Write the failing test** — `packages/shared/test/build.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  STARTER_BUILD,
  buildValue,
  fitsHull,
  parseBuild,
  refitToHull,
  resaleValue,
  statsFor,
  withGear,
  type Build,
} from '../src/build';

const gunship: Build = {
  hullId: 'gunship',
  slots: {
    weapon: [{ gearId: 'pulse_laser', mk: 1 }, { gearId: 'heavy_cannon', mk: 2 }, null],
    shield: [{ gearId: 'shield_gen', mk: 1 }, { gearId: 'shield_gen', mk: 3 }],
    engine: [{ gearId: 'thruster', mk: 2 }],
    utility: [{ gearId: 'rocket_rack', mk: 2 }],
  },
};

describe('statsFor', () => {
  it('computes the starter build', () => {
    const stats = statsFor(STARTER_BUILD);
    expect(stats).toMatchObject({
      maxHull: 80,
      thrust: 240,
      maxSpeed: 460,
      turnRate: 3.6,
      maxShield: 100,
      shieldRegen: 15,
      shieldDrain: 30,
      cargoCapacity: 15,
      maxRockets: 10,
    });
    expect(stats.weapons).toEqual([{ gearId: 'pulse_laser', mk: 1, damage: 10, fireRate: 4, bulletSpeed: 800 }]);
  });

  it('slows a ship with an empty engine slot', () => {
    const stats = statsFor(withGear(STARTER_BUILD, { type: 'engine', index: 0 }, null));
    expect(stats.thrust).toBeCloseTo(144);
    expect(stats.turnRate).toBeCloseTo(2.16);
  });

  it('sums shields, weapons and utility bonuses', () => {
    const stats = statsFor(gunship);
    expect(stats.weapons.map((w) => w.gearId)).toEqual(['pulse_laser', 'heavy_cannon']);
    expect(stats.maxShield).toBe(320);
    expect(stats.shieldRegen).toBe(43);
    expect(stats.maxRockets).toBe(20);
    expect(stats.thrust).toBeCloseTo(170 * 1.15);
  });

  it('has no weapons and no shield when slots are empty', () => {
    const bare = withGear(withGear(STARTER_BUILD, { type: 'weapon', index: 0 }, null), { type: 'shield', index: 0 }, null);
    expect(statsFor(bare).weapons).toEqual([]);
    expect(statsFor(bare).maxShield).toBe(0);
  });
});

describe('values', () => {
  it('prices the starter build', () => {
    expect(buildValue(STARTER_BUILD)).toBe(750);
  });

  it('sells back at half, rounded down', () => {
    expect(resaleValue(255)).toBe(127);
  });
});

describe('build validation', () => {
  it('accepts valid builds', () => {
    expect(fitsHull(gunship)).toBe(true);
    expect(parseBuild(JSON.parse(JSON.stringify(gunship)))).toEqual(gunship);
  });

  it('rejects wrong slot counts and mismatched gear', () => {
    expect(parseBuild({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, utility: [] } })).toBeNull();
    expect(parseBuild({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, utility: [{ gearId: 'pulse_laser', mk: 1 }] } })).toBeNull();
    expect(parseBuild({ hullId: 'battleship', slots: STARTER_BUILD.slots })).toBeNull();
    expect(parseBuild('nope')).toBeNull();
  });
});

describe('refitToHull', () => {
  it('keeps gear that fits a bigger hull', () => {
    const { build, leftovers } = refitToHull(STARTER_BUILD, 'gunship');
    expect(build.slots.weapon).toEqual([{ gearId: 'pulse_laser', mk: 1 }, null, null]);
    expect(build.slots.shield).toEqual([{ gearId: 'shield_gen', mk: 1 }, null]);
    expect(leftovers).toEqual([]);
  });

  it('returns gear that does not fit a smaller hull', () => {
    const { build, leftovers } = refitToHull(gunship, 'scout');
    expect(build.slots.weapon).toEqual([{ gearId: 'pulse_laser', mk: 1 }]);
    expect(leftovers).toEqual([{ gearId: 'heavy_cannon', mk: 2 }, { gearId: 'shield_gen', mk: 3 }]);
    expect(fitsHull(build)).toBe(true);
  });
});
```

- [ ] **Step 3: Run** `pnpm exec vitest run packages/shared/test/build.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement** `packages/shared/src/catalog/hulls.ts`

```ts
export const SLOT_TYPES = ['weapon', 'shield', 'engine', 'utility'] as const;

export type SlotType = (typeof SLOT_TYPES)[number];

export const HULL_IDS = ['scout', 'fighter', 'freighter', 'gunship'] as const;

export type HullId = (typeof HULL_IDS)[number];

export interface HullSpec {
  readonly id: HullId;
  readonly name: string;
  readonly cost: number;
  readonly maxHull: number;
  readonly thrust: number;
  readonly maxSpeed: number;
  readonly turnRate: number;
  readonly cargoCapacity: number;
  readonly slots: Readonly<Record<SlotType, number>>;
}

export const HULLS: Readonly<Record<HullId, HullSpec>> = {
  scout: {
    id: 'scout',
    name: 'Scout',
    cost: 0,
    maxHull: 80,
    thrust: 240,
    maxSpeed: 460,
    turnRate: 3.6,
    cargoCapacity: 15,
    slots: { weapon: 1, shield: 1, engine: 1, utility: 1 },
  },
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    cost: 1_500,
    maxHull: 120,
    thrust: 220,
    maxSpeed: 420,
    turnRate: 3.2,
    cargoCapacity: 20,
    slots: { weapon: 2, shield: 1, engine: 1, utility: 1 },
  },
  freighter: {
    id: 'freighter',
    name: 'Freighter',
    cost: 3_000,
    maxHull: 160,
    thrust: 160,
    maxSpeed: 320,
    turnRate: 2.2,
    cargoCapacity: 60,
    slots: { weapon: 1, shield: 1, engine: 1, utility: 3 },
  },
  gunship: {
    id: 'gunship',
    name: 'Gunship',
    cost: 5_000,
    maxHull: 200,
    thrust: 170,
    maxSpeed: 340,
    turnRate: 2.4,
    cargoCapacity: 25,
    slots: { weapon: 3, shield: 2, engine: 1, utility: 1 },
  },
};
```

`packages/shared/src/catalog/gear.ts`:
```ts
import type { SlotType } from './hulls';

export const GEAR_IDS = [
  'pulse_laser',
  'heavy_cannon',
  'shield_gen',
  'thruster',
  'armor',
  'cargo_pod',
  'rocket_rack',
] as const;

export type GearId = (typeof GEAR_IDS)[number];

export const MK_LEVELS = [1, 2, 3] as const;

export type Mk = (typeof MK_LEVELS)[number];

export interface WeaponEffect {
  readonly kind: 'weapon';
  readonly damage: number;
  readonly fireRate: number;
  readonly bulletSpeed: number;
}

export interface ShieldEffect {
  readonly kind: 'shield';
  readonly energy: number;
  readonly regen: number;
}

export interface EngineEffect {
  readonly kind: 'engine';
  readonly motionFactor: number;
  readonly turnFactor: number;
}

export interface UtilityEffect {
  readonly kind: 'utility';
  readonly hull: number;
  readonly cargo: number;
  readonly rockets: number;
}

export type GearEffect = WeaponEffect | ShieldEffect | EngineEffect | UtilityEffect;

export interface GearTier {
  readonly cost: number;
  readonly effect: GearEffect;
}

export interface GearSpec {
  readonly id: GearId;
  readonly name: string;
  readonly slot: SlotType;
  readonly tiers: readonly [GearTier, GearTier, GearTier];
}

function weapon(cost: number, damage: number, fireRate: number, bulletSpeed: number): GearTier {
  return { cost, effect: { kind: 'weapon', damage, fireRate, bulletSpeed } };
}

function shield(cost: number, energy: number, regen: number): GearTier {
  return { cost, effect: { kind: 'shield', energy, regen } };
}

function engine(cost: number, motionFactor: number, turnFactor: number): GearTier {
  return { cost, effect: { kind: 'engine', motionFactor, turnFactor } };
}

function utility(cost: number, bonus: Partial<Omit<UtilityEffect, 'kind'>>): GearTier {
  return {
    cost,
    effect: { kind: 'utility', hull: bonus.hull ?? 0, cargo: bonus.cargo ?? 0, rockets: bonus.rockets ?? 0 },
  };
}

export const GEAR: Readonly<Record<GearId, GearSpec>> = {
  pulse_laser: {
    id: 'pulse_laser',
    name: 'Pulse Laser',
    slot: 'weapon',
    tiers: [weapon(250, 10, 4, 800), weapon(700, 14, 4.5, 900), weapon(1_600, 19, 5, 1_000)],
  },
  heavy_cannon: {
    id: 'heavy_cannon',
    name: 'Heavy Cannon',
    slot: 'weapon',
    tiers: [weapon(400, 25, 1.5, 650), weapon(1_000, 34, 1.5, 650), weapon(2_200, 45, 1.5, 650)],
  },
  shield_gen: {
    id: 'shield_gen',
    name: 'Shield Generator',
    slot: 'shield',
    tiers: [shield(250, 100, 15), shield(700, 150, 20), shield(1_600, 220, 28)],
  },
  thruster: {
    id: 'thruster',
    name: 'Thruster',
    slot: 'engine',
    tiers: [engine(250, 1, 1), engine(700, 1.15, 1.1), engine(1_600, 1.3, 1.2)],
  },
  armor: {
    id: 'armor',
    name: 'Armor Plating',
    slot: 'utility',
    tiers: [utility(200, { hull: 30 }), utility(600, { hull: 60 }), utility(1_400, { hull: 100 })],
  },
  cargo_pod: {
    id: 'cargo_pod',
    name: 'Cargo Pod',
    slot: 'utility',
    tiers: [utility(150, { cargo: 10 }), utility(450, { cargo: 20 }), utility(1_000, { cargo: 35 })],
  },
  rocket_rack: {
    id: 'rocket_rack',
    name: 'Rocket Rack',
    slot: 'utility',
    tiers: [utility(200, { rockets: 5 }), utility(600, { rockets: 10 }), utility(1_300, { rockets: 15 })],
  },
};

export function gearTier(gearId: GearId, mk: Mk): GearTier {
  return GEAR[gearId].tiers[mk - 1];
}
```

`packages/shared/src/build.ts`:
```ts
import { z } from 'zod';
import { GEAR, GEAR_IDS, gearTier, type GearId, type Mk } from './catalog/gear';
import { HULLS, HULL_IDS, SLOT_TYPES, type HullId, type SlotType } from './catalog/hulls';
import { BASE_MAX_ROCKETS, EMPTY_ENGINE_FACTOR, SELL_BACK_SHARE, SHIELD_DRAIN } from './constants';

export interface InstalledGear {
  readonly gearId: GearId;
  readonly mk: Mk;
}

export type SlotContents = InstalledGear | null;

export type BuildSlots = Readonly<Record<SlotType, readonly SlotContents[]>>;

export interface Build {
  readonly hullId: HullId;
  readonly slots: BuildSlots;
}

export interface SlotRef {
  readonly type: SlotType;
  readonly index: number;
}

export interface WeaponMount {
  readonly gearId: GearId;
  readonly mk: Mk;
  readonly damage: number;
  readonly fireRate: number;
  readonly bulletSpeed: number;
}

export interface ShipStats {
  readonly maxHull: number;
  readonly thrust: number;
  readonly maxSpeed: number;
  readonly turnRate: number;
  readonly maxShield: number;
  readonly shieldRegen: number;
  readonly shieldDrain: number;
  readonly cargoCapacity: number;
  readonly maxRockets: number;
  readonly weapons: readonly WeaponMount[];
}

export const MkSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const InstalledGearSchema = z.object({ gearId: z.enum(GEAR_IDS), mk: MkSchema }).strict();

const SlotListSchema = z.array(InstalledGearSchema.nullable());

const BuildSchema = z
  .object({
    hullId: z.enum(HULL_IDS),
    slots: z
      .object({ weapon: SlotListSchema, shield: SlotListSchema, engine: SlotListSchema, utility: SlotListSchema })
      .strict(),
  })
  .strict();

export const STARTER_BUILD: Build = {
  hullId: 'scout',
  slots: {
    weapon: [{ gearId: 'pulse_laser', mk: 1 }],
    shield: [{ gearId: 'shield_gen', mk: 1 }],
    engine: [{ gearId: 'thruster', mk: 1 }],
    utility: [null],
  },
};

function installed(build: Build): InstalledGear[] {
  return SLOT_TYPES.flatMap((type) => build.slots[type].filter((gear): gear is InstalledGear => gear !== null));
}

export function fitsHull(build: Build): boolean {
  const capacity = HULLS[build.hullId].slots;
  return SLOT_TYPES.every(
    (type) =>
      build.slots[type].length === capacity[type] &&
      build.slots[type].every((gear) => gear === null || GEAR[gear.gearId].slot === type),
  );
}

export function parseBuild(value: unknown): Build | null {
  const parsed = BuildSchema.safeParse(value);
  return parsed.success && fitsHull(parsed.data) ? parsed.data : null;
}

export function gearCost(gear: InstalledGear): number {
  return gearTier(gear.gearId, gear.mk).cost;
}

export function buildValue(build: Build): number {
  return HULLS[build.hullId].cost + installed(build).reduce((sum, gear) => sum + gearCost(gear), 0);
}

export function resaleValue(cost: number): number {
  return Math.floor(cost * SELL_BACK_SHARE);
}

export function statsFor(build: Build): ShipStats {
  const hull = HULLS[build.hullId];
  const weapons: WeaponMount[] = [];
  let maxHull = hull.maxHull;
  let cargoCapacity = hull.cargoCapacity;
  let maxRockets = BASE_MAX_ROCKETS;
  let maxShield = 0;
  let shieldRegen = 0;
  let motionFactor = EMPTY_ENGINE_FACTOR;
  let turnFactor = EMPTY_ENGINE_FACTOR;
  for (const gear of installed(build)) {
    const effect = gearTier(gear.gearId, gear.mk).effect;
    switch (effect.kind) {
      case 'weapon':
        weapons.push({ gearId: gear.gearId, mk: gear.mk, damage: effect.damage, fireRate: effect.fireRate, bulletSpeed: effect.bulletSpeed });
        break;
      case 'shield':
        maxShield += effect.energy;
        shieldRegen += effect.regen;
        break;
      case 'engine':
        motionFactor = effect.motionFactor;
        turnFactor = effect.turnFactor;
        break;
      case 'utility':
        maxHull += effect.hull;
        cargoCapacity += effect.cargo;
        maxRockets += effect.rockets;
        break;
    }
  }
  return {
    maxHull,
    thrust: hull.thrust * motionFactor,
    maxSpeed: hull.maxSpeed * motionFactor,
    turnRate: hull.turnRate * turnFactor,
    maxShield,
    shieldRegen,
    shieldDrain: SHIELD_DRAIN,
    cargoCapacity,
    maxRockets,
    weapons,
  };
}

export function slotExists(build: Build, slot: SlotRef): boolean {
  return slot.index < build.slots[slot.type].length;
}

export function gearAt(build: Build, slot: SlotRef): SlotContents {
  return build.slots[slot.type][slot.index] ?? null;
}

export function withGear(build: Build, slot: SlotRef, gear: SlotContents): Build {
  const list = build.slots[slot.type].map((current, index) => (index === slot.index ? gear : current));
  return { ...build, slots: { ...build.slots, [slot.type]: list } };
}

export interface Refit {
  readonly build: Build;
  readonly leftovers: readonly InstalledGear[];
}

export function refitToHull(build: Build, hullId: HullId): Refit {
  const capacity = HULLS[hullId].slots;
  const leftovers: InstalledGear[] = [];
  const fit = (type: SlotType): SlotContents[] => {
    const gear = build.slots[type].filter((item): item is InstalledGear => item !== null);
    leftovers.push(...gear.slice(capacity[type]));
    return Array.from({ length: capacity[type] }, (_, index) => gear[index] ?? null);
  };
  return {
    build: { hullId, slots: { weapon: fit('weapon'), shield: fit('shield'), engine: fit('engine'), utility: fit('utility') } },
    leftovers,
  };
}
```

Append to `packages/shared/src/index.ts`:
```ts
export * from './catalog/hulls';
export * from './catalog/gear';
export * from './build';
```

- [ ] **Step 5: Run gates (Phase A).** Expected: PASS. (`upgrades.ts` still exists in this task; it is removed in A2.)

- [ ] **Step 6: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): add hull and gear catalog with build stats"
```

---

### Task A2: Protocol, physics input, asset contract

**Files:**
- Modify: `packages/shared/src/physics.ts`, `packages/shared/src/protocol.ts`, `packages/shared/src/index.ts`
- Delete: `packages/shared/src/upgrades.ts`, `packages/shared/test/upgrades.test.ts`
- Modify: `packages/shared/test/physics.test.ts`, `packages/shared/test/protocol.test.ts`, `packages/shared/test/assets.test.ts`
- Modify: `assets/manifest.json`, `assets/STYLE.md`; delete obsolete PNGs

**Interfaces — Produces:** `ShipInput.rocket`; `ClientMessage` with `dock`, `buyHull`, `buyGear`, `sellGear`, `buyRockets` (no `buy`); `ShopAction`; `ShopFailure`; `ShopResultMessage`; `RocketState`; `ShipState.hullId`; `BulletState.weaponId/mk`; `SelfState.build/rockets/maxRockets/canDock/dockCooldown`; `ServerMessage` with `shopResult` (no `buyResult`). `ShipStats` now comes from `build.ts`.

- [ ] **Step 1: physics.ts** — change the stats import to `import type { ShipStats } from './build';`, add `readonly rocket: boolean;` to `ShipInput` (after `shield`), and `rocket: false` to `IDLE_INPUT`. Nothing else changes.

- [ ] **Step 2: Delete** `packages/shared/src/upgrades.ts` and `packages/shared/test/upgrades.test.ts`; remove `export * from './upgrades';` from `index.ts`.

- [ ] **Step 3: Replace `packages/shared/src/protocol.ts`**

```ts
import { z } from 'zod';
import { MkSchema, type Build } from './build';
import { GEAR_IDS, type GearId, type Mk } from './catalog/gear';
import { HULL_IDS, SLOT_TYPES, type HullId } from './catalog/hulls';
import { MAX_ROCKETS_PER_PURCHASE } from './constants';
import type { SafeZone } from './world';

const SlotRefSchema = z.object({ type: z.enum(SLOT_TYPES), index: z.number().int().nonnegative().max(8) }).strict();

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
    rocket: z.boolean(),
  })
  .strict();

const DockSchema = z.object({ type: z.literal('dock') }).strict();

const BuyHullSchema = z.object({ type: z.literal('buyHull'), hullId: z.enum(HULL_IDS) }).strict();

const BuyGearSchema = z
  .object({ type: z.literal('buyGear'), gearId: z.enum(GEAR_IDS), mk: MkSchema, slot: SlotRefSchema })
  .strict();

const SellGearSchema = z.object({ type: z.literal('sellGear'), slot: SlotRefSchema }).strict();

const BuyRocketsSchema = z
  .object({ type: z.literal('buyRockets'), count: z.number().int().min(1).max(MAX_ROCKETS_PER_PURCHASE) })
  .strict();

const ClientMessageSchema = z.discriminatedUnion('type', [
  HelloSchema,
  InputSchema,
  DockSchema,
  BuyHullSchema,
  BuyGearSchema,
  SellGearSchema,
  BuyRocketsSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type InputMessage = z.infer<typeof InputSchema>;
export type ShopAction = Extract<ClientMessage, { type: 'buyHull' | 'buyGear' | 'sellGear' | 'buyRockets' }>;

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
  readonly hullId: HullId;
}

export interface BulletState {
  readonly kind: 'bullet';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly weaponId: GearId;
  readonly mk: Mk;
}

export interface RocketState {
  readonly kind: 'rocket';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
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

export type EntityState = ShipState | BulletState | RocketState | AsteroidState | OreState | CrateState;

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
  readonly build: Build;
  readonly rockets: number;
  readonly maxRockets: number;
  readonly docked: boolean;
  readonly canDock: boolean;
  readonly dockCooldown: number;
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

export type ShopFailure = 'not_docked' | 'insufficient_credits' | 'slot_mismatch' | 'rocket_cap' | 'unknown_item';

export type ShopResultMessage =
  | { readonly type: 'shopResult'; readonly ok: true }
  | { readonly type: 'shopResult'; readonly ok: false; readonly reason: ShopFailure };

export interface KickedMessage {
  readonly type: 'kicked';
  readonly reason: string;
}

export type ServerMessage = WelcomeMessage | SnapshotMessage | DiedMessage | ShopResultMessage | KickedMessage;
```

- [ ] **Step 4: Update shared tests**

`packages/shared/test/physics.test.ts` — replace the import `import { BASE_LOADOUT, statsFor } from '../src/upgrades';` with `import { STARTER_BUILD, statsFor } from '../src/build';`, use `const stats = statsFor(STARTER_BUILD);`, and change expectations for the Scout (thrust 240, max speed 460, turn 3.6):
- thrust test: `vy` ≈ `-24`, `y` ≈ `997.6`
- reverse test: `vy` ≈ `12`
- rotate tests: angle ≈ `±0.36`
- speed clamp test: start `vy: -460`, expect speed ≈ `460`
Other tests are unchanged.

`packages/shared/test/protocol.test.ts` — replace with:
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
  rocket: true,
};

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('parseClientMessage', () => {
  it('accepts hello, input and dock', () => {
    expect(parse({ type: 'hello', token: 'abc' })).toEqual({ type: 'hello', token: 'abc' });
    expect(parse(input)).toEqual(input);
    expect(parse({ type: 'dock' })).toEqual({ type: 'dock' });
  });

  it('accepts shop actions with catalog ids', () => {
    expect(parse({ type: 'buyHull', hullId: 'fighter' })).not.toBeNull();
    expect(parse({ type: 'buyGear', gearId: 'armor', mk: 2, slot: { type: 'utility', index: 0 } })).not.toBeNull();
    expect(parse({ type: 'sellGear', slot: { type: 'weapon', index: 1 } })).not.toBeNull();
    expect(parse({ type: 'buyRockets', count: 5 })).not.toBeNull();
  });

  it('rejects unknown ids, bad mk, bad counts and removed messages', () => {
    expect(parse({ type: 'buyHull', hullId: 'battleship' })).toBeNull();
    expect(parse({ type: 'buyGear', gearId: 'armor', mk: 4, slot: { type: 'utility', index: 0 } })).toBeNull();
    expect(parse({ type: 'sellGear', slot: { type: 'cockpit', index: 0 } })).toBeNull();
    expect(parse({ type: 'buyRockets', count: 0 })).toBeNull();
    expect(parse({ type: 'buyRockets', count: 21 })).toBeNull();
    expect(parse({ type: 'buy', line: 'weapon' })).toBeNull();
  });

  it('rejects input without the rocket flag or with extra fields', () => {
    const { rocket: _rocket, ...withoutRocket } = input;
    expect(parse(withoutRocket)).toBeNull();
    expect(parse({ ...input, x: 5 })).toBeNull();
  });

  it('rejects invalid JSON', () => {
    expect(parseClientMessage('{nope')).toBeNull();
  });
});
```
If `@typescript-eslint/no-unused-vars` flags `_rocket`, build `withoutRocket` with an explicit object literal of the other seven fields instead.

`packages/shared/test/assets.test.ts` — replace the `required` array in the third test with:
```ts
    const required = [
      'ship_scout', 'ship_fighter', 'ship_freighter', 'ship_gunship',
      'bullet_t0', 'bullet_t2', 'bullet_t4', 'bullet_cannon', 'rocket', 'rocket_trail',
      'asteroid_1', 'asteroid_2', 'asteroid_3', 'asteroid_4',
      'shield_bubble', 'ore_pickup', 'loot_crate', 'explosion', 'safe_zone_station', 'starfield_tile',
      'icon_rocket', 'gear_pulse_laser', 'gear_heavy_cannon', 'gear_shield_gen', 'gear_thruster',
      'gear_armor', 'gear_cargo_pod', 'gear_rocket_rack',
    ];
```
and add a fourth test:
```ts
  it('drops retired sprites', () => {
    const ids = new Set(ManifestSchema.parse(manifest).sprites.map((sprite) => sprite.id));
    const retired = ['ship_t0', 'ship_t5', 'bullet_t1', 'bullet_t3', 'bullet_t5', 'icon_hull', 'icon_cargo'];
    expect(retired.filter((id) => ids.has(id))).toEqual([]);
  });
```

- [ ] **Step 5: Update `assets/manifest.json`** — remove entries `ship_t0`–`ship_t5`, `bullet_t1`, `bullet_t3`, `bullet_t5`, `icon_hull`, `icon_engine`, `icon_weapon`, `icon_shield`, `icon_cargo`. Add (one object per line, same format as existing entries):
```json
{ "id": "ship_scout", "file": "ships/ship_scout.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "ship_fighter", "file": "ships/ship_fighter.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "ship_freighter", "file": "ships/ship_freighter.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "ship_gunship", "file": "ships/ship_gunship.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "bullet_cannon", "file": "bullets/bullet_cannon.png", "width": 16, "height": 16, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "rocket", "file": "bullets/rocket.png", "width": 24, "height": 24, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "rocket_trail", "file": "fx/rocket_trail.png", "width": 16, "height": 16, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "icon_rocket", "file": "ui/icon_rocket.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "gear_pulse_laser", "file": "ui/gear_pulse_laser.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "gear_heavy_cannon", "file": "ui/gear_heavy_cannon.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "gear_shield_gen", "file": "ui/gear_shield_gen.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "gear_thruster", "file": "ui/gear_thruster.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "gear_armor", "file": "ui/gear_armor.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "gear_cargo_pod", "file": "ui/gear_cargo_pod.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "gear_rocket_rack", "file": "ui/gear_rocket_rack.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 }
```
Delete the retired PNG files: `git rm assets/ships/ship_t*.png assets/bullets/bullet_t1.png assets/bullets/bullet_t3.png assets/bullets/bullet_t5.png assets/ui/icon_hull.png assets/ui/icon_engine.png assets/ui/icon_weapon.png assets/ui/icon_shield.png assets/ui/icon_cargo.png`.

- [ ] **Step 6: Append to `assets/STYLE.md`:**
```markdown

## Ship builds update

- Hulls (64×64, nose up, same palette and rendering as the existing ships so they look like one fleet):
  - `ship_scout`: small, nimble, single nose gun, slim swept wings.
  - `ship_fighter`: medium, aggressive delta wing, two wing-mounted guns.
  - `ship_freighter`: wide boxy cargo hull, side cargo pods, one small turret, heavy engines.
  - `ship_gunship`: large heavily armored, three forward gun barrels, double shield emitters.
- `bullet_cannon` (16×16): heavy glowing orange slug `#FF9A3C`, pointing up.
- `rocket` (24×24): small missile pointing up, white-grey body, red-orange tip, fins at the back.
- `rocket_trail` (16×16): soft round exhaust puff, orange core fading to transparent.
- `icon_rocket` and `gear_*` (48×48): same flat glyph style as the other UI icons, white with cyan accent:
  pulse laser = slim energy emitter, heavy cannon = thick barrel, shield generator = dome emitter,
  thruster = nozzle with flame, armor = layered plates, cargo pod = container, rocket rack = rocket pod with three tubes.
```

- [ ] **Step 7: Run gates (Phase A).** Expected: PASS. `pnpm assets:check` is expected to FAIL (new PNGs arrive in X1).

- [ ] **Step 8: Commit**
```bash
git add -A packages/shared assets
git commit -m "feat(shared): switch protocol to builds, docking and rockets"
```

---

## Server lane (worktree `builds-server`, first run `pnpm install --frozen-lockfile`)

### Task S1: Persistence v2 + migration

**Files:**
- Create: `packages/server/src/db/migrations.ts`
- Modify: `packages/server/src/db/PlayerRepository.ts`
- Modify: `packages/server/test/support/fixtures.ts`
- Test: replace `packages/server/test/PlayerRepository.test.ts`

**Interfaces — Produces:** `ShipRecord { accountId, bankedCredits, build: Build, rockets: number, x, y }`; `PlayerRepository.open(path, warn?: (message: string) => void)`; `SCHEMA_VERSION = 2`; `migrate(db)`; `legacyUpgradeValue(tiers)`.

- [ ] **Step 1: Write the failing test** — replace `packages/server/test/PlayerRepository.test.ts`

```ts
import { NEW_ACCOUNT_ROCKETS, SAFE_ZONES, STARTER_BUILD } from '@arena/shared';
import Database from 'better-sqlite3';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerRepository, UsernameTakenError } from '../src/db/PlayerRepository';

let repo: PlayerRepository;

beforeEach(() => {
  repo = PlayerRepository.open(':memory:');
});

afterEach(() => {
  repo.close();
});

describe('accounts and sessions', () => {
  it('creates and finds an account', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    expect(repo.findAccountByUsername('alice')).toEqual({ id, username: 'alice', passwordHash: 'hash' });
    expect(() => repo.createAccount('ALICE', 'hash', 1)).toThrow(UsernameTakenError);
  });

  it('finds a session before expiry only', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    repo.createSession('tokenhash', id, 1_000);
    expect(repo.findSession('tokenhash', 999)).toEqual({ accountId: id, username: 'alice' });
    expect(repo.findSession('tokenhash', 1_000)).toBeUndefined();
  });
});

describe('ships', () => {
  it('defaults to the starter build with new-account rockets', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    expect(repo.loadShip(id)).toEqual({
      accountId: id,
      bankedCredits: 0,
      build: STARTER_BUILD,
      rockets: NEW_ACCOUNT_ROCKETS,
      x: SAFE_ZONES[0]?.x,
      y: SAFE_ZONES[0]?.y,
    });
  });

  it('round-trips builds and rockets', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    const build = { ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, utility: [{ gearId: 'armor' as const, mk: 2 as const }] } };
    const record = { accountId: id, bankedCredits: 500, build, rockets: 3, x: 10, y: 20 };
    repo.saveShips([record], 5);
    expect(repo.loadShip(id)).toEqual(record);
  });
});

describe('migration from version 1', () => {
  async function legacyDatabase(): Promise<string> {
    const path = join(await mkdtemp(join(tmpdir(), 'legacy-')), 'arena.db');
    const db = new Database(path);
    db.exec(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
      CREATE TABLE ships (account_id INTEGER PRIMARY KEY REFERENCES accounts(id), banked_credits INTEGER NOT NULL, hull_tier INTEGER NOT NULL, engine_tier INTEGER NOT NULL, weapon_tier INTEGER NOT NULL, shield_tier INTEGER NOT NULL, cargo_tier INTEGER NOT NULL, pos_x REAL NOT NULL, pos_y REAL NOT NULL, updated_at INTEGER NOT NULL);
      INSERT INTO accounts (username, password_hash, created_at) VALUES ('alice', 'hash', 1);
      INSERT INTO ships VALUES (1, 100, 2, 0, 1, 0, 1, 50, 60, 1);
    `);
    db.close();
    return path;
  }

  it('refunds old upgrades, sets the starter build and 10 rockets', async () => {
    const legacy = PlayerRepository.open(await legacyDatabase());
    expect(legacy.loadShip(1)).toEqual({
      accountId: 1,
      bankedCredits: 100 + 200 + 400 + 250 + 150,
      build: STARTER_BUILD,
      rockets: 10,
      x: 50,
      y: 60,
    });
    legacy.close();
  });

  it('runs only once', async () => {
    const path = await legacyDatabase();
    PlayerRepository.open(path).close();
    const reopened = PlayerRepository.open(path);
    expect(reopened.loadShip(1).bankedCredits).toBe(1_100);
    reopened.close();
  });
});

describe('invalid stored builds', () => {
  it('falls back to the starter build and warns', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'bad-')), 'arena.db');
    const warnings: string[] = [];
    const first = PlayerRepository.open(path);
    const id = first.createAccount('alice', 'hash', 1);
    first.saveShips([{ accountId: id, bankedCredits: 0, build: STARTER_BUILD, rockets: 4, x: 1, y: 2 }], 1);
    first.close();
    const db = new Database(path);
    db.prepare("UPDATE ships SET gear_json = '{\"weapon\":[{\"gearId\":\"laser9000\",\"mk\":1}]}'").run();
    db.close();
    const second = PlayerRepository.open(path, (message) => warnings.push(message));
    expect(second.loadShip(id).build).toEqual(STARTER_BUILD);
    expect(second.loadShip(id).rockets).toBe(4);
    expect(warnings[0]).toContain(`account ${id}`);
    second.close();
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run packages/server/test/PlayerRepository.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `packages/server/src/db/migrations.ts`

```ts
import { NEW_ACCOUNT_ROCKETS, STARTER_BUILD } from '@arena/shared';
import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 2;

export const BASE_SCHEMA = `
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
`;

const SHIPS_V2 = `
CREATE TABLE IF NOT EXISTS ships (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  banked_credits INTEGER NOT NULL,
  hull_id TEXT NOT NULL,
  gear_json TEXT NOT NULL,
  rockets INTEGER NOT NULL,
  pos_x REAL NOT NULL,
  pos_y REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

interface LegacyTiers {
  readonly hull_tier: number;
  readonly engine_tier: number;
  readonly weapon_tier: number;
  readonly shield_tier: number;
  readonly cargo_tier: number;
}

interface LegacyShipRow extends LegacyTiers {
  readonly account_id: number;
  readonly banked_credits: number;
  readonly pos_x: number;
  readonly pos_y: number;
  readonly updated_at: number;
}

const LEGACY_BASE_COST: Readonly<Record<keyof LegacyTiers, number>> = {
  hull_tier: 200,
  engine_tier: 200,
  weapon_tier: 250,
  shield_tier: 200,
  cargo_tier: 150,
};

export function legacyUpgradeValue(tiers: LegacyTiers): number {
  let total = 0;
  for (const [column, baseCost] of Object.entries(LEGACY_BASE_COST)) {
    const tier = tiers[column as keyof LegacyTiers];
    for (let level = 1; level <= tier; level += 1) total += baseCost * 2 ** (level - 1);
  }
  return total;
}

function userVersion(db: Database.Database): number {
  const value: unknown = db.pragma('user_version', { simple: true });
  return typeof value === 'number' ? value : 0;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return db
    .prepare<[string], { name: string }>('SELECT name FROM pragma_table_info(?)')
    .all(table)
    .some((row) => row.name === column);
}

function migrateTierShips(db: Database.Database): void {
  const rows = db.prepare<[], LegacyShipRow>('SELECT * FROM ships').all();
  db.exec('ALTER TABLE ships RENAME TO ships_v1');
  db.exec(SHIPS_V2);
  const insert = db.prepare<[number, number, string, string, number, number, number, number]>(
    'INSERT INTO ships (account_id, banked_credits, hull_id, gear_json, rockets, pos_x, pos_y, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const row of rows) {
    insert.run(
      row.account_id,
      row.banked_credits + legacyUpgradeValue(row),
      STARTER_BUILD.hullId,
      JSON.stringify(STARTER_BUILD.slots),
      NEW_ACCOUNT_ROCKETS,
      row.pos_x,
      row.pos_y,
      row.updated_at,
    );
  }
  db.exec('DROP TABLE ships_v1');
}

export function migrate(db: Database.Database): void {
  db.exec(BASE_SCHEMA);
  if (userVersion(db) >= SCHEMA_VERSION) return;
  db.transaction(() => {
    if (hasColumn(db, 'ships', 'hull_tier')) migrateTierShips(db);
    else db.exec(SHIPS_V2);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}
```

The one `as keyof LegacyTiers` cast is allowed here because `Object.entries` widens keys to `string` on a record whose keys are exactly that union; if lint or review objects, iterate over an explicit `const LEGACY_COLUMNS = ['hull_tier', ...] as const` array instead.

- [ ] **Step 4: Update `PlayerRepository.ts`**
  - Remove `SCHEMA` and `UPSERT_SHIP`'s tier columns; `open(path, warn = console.warn)` calls `migrate(db)` (from `./migrations`) instead of `db.exec(SCHEMA)` and passes `warn` to the constructor.
  - `ShipRecord` becomes:
    ```ts
    export interface ShipRecord {
      readonly accountId: number;
      readonly bankedCredits: number;
      readonly build: Build;
      readonly rockets: number;
      readonly x: number;
      readonly y: number;
    }
    ```
  - Upsert SQL and params:
    ```ts
    const UPSERT_SHIP = `
    INSERT INTO ships (account_id, banked_credits, hull_id, gear_json, rockets, pos_x, pos_y, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      banked_credits = excluded.banked_credits,
      hull_id = excluded.hull_id,
      gear_json = excluded.gear_json,
      rockets = excluded.rockets,
      pos_x = excluded.pos_x,
      pos_y = excluded.pos_y,
      updated_at = excluded.updated_at
    `;

    type ShipParams = [number, number, string, string, number, number, number, number];

    function shipParams(record: ShipRecord, now: number): ShipParams {
      return [record.accountId, record.bankedCredits, record.build.hullId, JSON.stringify(record.build.slots), record.rockets, record.x, record.y, now];
    }
    ```
  - `ShipDbRow` becomes `{ banked_credits: number; hull_id: string; gear_json: string; rockets: number; pos_x: number; pos_y: number }`, selected with `SELECT banked_credits, hull_id, gear_json, rockets, pos_x, pos_y FROM ships WHERE account_id = ?`.
  - Load:
    ```ts
    loadShip(accountId: number): ShipRecord {
      const row = /* prepared select */.get(accountId);
      if (!row) return defaultShip(accountId);
      return { accountId, bankedCredits: row.banked_credits, build: this.decodeBuild(accountId, row), rockets: row.rockets, x: row.pos_x, y: row.pos_y };
    }

    private decodeBuild(accountId: number, row: ShipDbRow): Build {
      const build = parseBuild({ hullId: row.hull_id, slots: safeJson(row.gear_json) });
      if (build) return build;
      this.warn(`invalid stored build for account ${accountId}; using starter build`);
      return STARTER_BUILD;
    }
    ```
    with module-level
    ```ts
    function safeJson(text: string): unknown {
      try {
        const value: unknown = JSON.parse(text);
        return value;
      } catch {
        return null;
      }
    }
    ```
  - `defaultShip` returns `{ accountId, bankedCredits: 0, build: STARTER_BUILD, rockets: NEW_ACCOUNT_ROCKETS, x, y }`.

- [ ] **Step 5: Update fixtures** — `packages/server/test/support/fixtures.ts` `shipRecord` returns `{ accountId, bankedCredits: 0, build: STARTER_BUILD, rockets: NEW_ACCOUNT_ROCKETS, x, y }` (import both from `@arena/shared`; drop `BASE_LOADOUT`).

- [ ] **Step 6: Run** `pnpm exec vitest run packages/server/test/PlayerRepository.test.ts` — Expected: PASS. (Other server files do not compile yet; full lane gates run from S2 on.)

- [ ] **Step 7: Commit**
```bash
git add packages/server
git commit -m "feat(server): persist ship builds and rockets with schema migration"
```

---

### Task S2: Entities + per-weapon combat

**Files:**
- Modify: `packages/server/src/world/entities.ts`, `packages/server/src/world/Combat.ts`, `packages/server/src/world/World.ts` (stats/bounty/fire wiring only; docking and rockets come later)
- Delete: `packages/server/src/world/Economy.ts`, `packages/server/test/Economy.test.ts`, `packages/server/test/World.economy.test.ts`
- Test: replace `packages/server/test/Combat.test.ts`; update `packages/server/test/World.combat.test.ts`, `packages/server/test/World.mining.test.ts`, `packages/server/test/snapshot.test.ts` as described

**Interfaces — Produces:**
- `ShipEntity`: removes `loadout`, `fireCooldown`; adds `build: Build`, `weaponCooldowns: number[]`, `rockets: number`, `rocketCooldown: number`, `dockCooldownUntil: number`.
- `BulletEntity`: removes `tier`; adds `weaponId: GearId`, `mk: Mk`.
- `RocketEntity { kind: 'rocket'; id; ownerId; targetId: number | null; x; y; prevX; prevY; vx; vy; angle; speed; damage; expiresAt }`; `Projectile = BulletEntity | RocketEntity`; `WorldEntity` includes `RocketEntity`.
- `createShip(id, accountId, name, record)`, `respawnShip(ship, x, y)` (starter build, `RESPAWN_ROCKETS`, docked false, `dockCooldownUntil = -Infinity`), `toShipRecord(ship)` (includes build, rockets).
- Combat: `updateShield(ship, dt, inSafeZone)`, `fireWeapons(ship, dt, inSafeZone, time, nextId): BulletEntity[]`, `applyDamage(ship, damage, attackerId, time)`, `bountyFor(build)`.

- [ ] **Step 1: Write the failing test** — replace `packages/server/test/Combat.test.ts`

```ts
import { BOUNTY_BASE, IDLE_INPUT, SHIELD_LOCKOUT, SHIP_RADIUS, STARTER_BUILD, type Build } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { applyDamage, bountyFor, fireWeapons, updateShield } from '../src/world/Combat';
import { createShip } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

const newShip = (build: Build = STARTER_BUILD) => createShip(1, 1, 'alice', { ...shipRecord(1_000, 1_000), build });
let nextId = 100;
const ids = () => (nextId += 1);

const twinFighter: Build = {
  hullId: 'fighter',
  slots: {
    weapon: [{ gearId: 'pulse_laser', mk: 1 }, { gearId: 'heavy_cannon', mk: 1 }],
    shield: [{ gearId: 'shield_gen', mk: 1 }],
    engine: [{ gearId: 'thruster', mk: 1 }],
    utility: [null],
  },
};

describe('updateShield', () => {
  it('drains while held and locks out when empty', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 1, false);
    expect(ship.shieldEnergy).toBeCloseTo(70);
    ship.shieldEnergy = 10;
    updateShield(ship, 1, false);
    expect(ship.shieldUp).toBe(false);
    expect(ship.shieldLockout).toBe(SHIELD_LOCKOUT);
  });

  it('cannot be raised without a shield generator', () => {
    const ship = newShip({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, shield: [null] } });
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 0.1, false);
    expect(ship.shieldUp).toBe(false);
  });
});

describe('fireWeapons', () => {
  it('fires the starter laser from the nose with its own cooldown', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, fire: true };
    const [bullet] = fireWeapons(ship, 0.1, false, 0, ids);
    expect(bullet).toMatchObject({ ownerId: 1, x: 1_000, y: 1_000 - SHIP_RADIUS, vy: -800, damage: 10, weaponId: 'pulse_laser', mk: 1 });
    expect(fireWeapons(ship, 0.1, false, 0, ids)).toEqual([]);
    expect(fireWeapons(ship, 0.2, false, 0, ids)).toHaveLength(1);
  });

  it('fires each weapon from its own lateral offset and cooldown', () => {
    const ship = newShip(twinFighter);
    ship.input = { ...IDLE_INPUT, fire: true };
    const volley = fireWeapons(ship, 0.1, false, 0, ids);
    expect(volley.map((b) => b.x)).toEqual([990, 1_010]);
    expect(volley.map((b) => b.weaponId)).toEqual(['pulse_laser', 'heavy_cannon']);
    expect(fireWeapons(ship, 0.3, false, 0, ids).map((b) => b.weaponId)).toEqual(['pulse_laser']);
  });

  it('does not fire without weapons, while shielded or in a safe zone', () => {
    const unarmed = newShip({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, weapon: [null] } });
    unarmed.input = { ...IDLE_INPUT, fire: true };
    expect(fireWeapons(unarmed, 0.1, false, 0, ids)).toEqual([]);
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, fire: true };
    ship.shieldUp = true;
    expect(fireWeapons(ship, 0.1, false, 0, ids)).toEqual([]);
    ship.shieldUp = false;
    expect(fireWeapons(ship, 0.1, true, 0, ids)).toEqual([]);
  });
});

describe('applyDamage', () => {
  it('damages hull unless shielded', () => {
    const ship = newShip();
    applyDamage(ship, 30, 7, 3);
    expect(ship.hull).toBe(50);
    expect(ship.lastHitBy).toBe(7);
    ship.shieldUp = true;
    applyDamage(ship, 30, 7, 4);
    expect(ship.hull).toBe(50);
  });
});

describe('bountyFor', () => {
  it('pays base plus a quarter of the build value', () => {
    expect(bountyFor(STARTER_BUILD)).toBe(BOUNTY_BASE + 187);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement entities changes** in `entities.ts`:
  - Imports: `IDLE_INPUT, RESPAWN_ROCKETS, STARTER_BUILD, statsFor, type Build, type GearId, type Mk, type ShipInput, type ShipStats` from `@arena/shared`.
  - `ShipEntity`: replace `loadout: Loadout;` with `build: Build;`; replace `fireCooldown: number;` with `weaponCooldowns: number[];`; add `rockets: number; rocketCooldown: number; dockCooldownUntil: number;` after `bankedCredits`.
  - `BulletEntity`: replace `readonly tier: number;` with `readonly weaponId: GearId; readonly mk: Mk;`.
  - Add:
    ```ts
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
      readonly expiresAt: number;
    }

    export type Projectile = BulletEntity | RocketEntity;
    ```
    and add `RocketEntity` to the `WorldEntity` union.
  - `createShip`: `const stats = statsFor(record.build);`, set `build: record.build`, `weaponCooldowns: stats.weapons.map(() => 0)`, `rockets: record.rockets`, `rocketCooldown: 0`, `dockCooldownUntil: -Infinity` (drop `loadout`, `fireCooldown`).
  - `respawnShip`: use `statsFor(STARTER_BUILD)`; assign `build: STARTER_BUILD`, `weaponCooldowns: stats.weapons.map(() => 0)`, `rockets: RESPAWN_ROCKETS`, `rocketCooldown: 0`, `dockCooldownUntil: -Infinity`, `docked: false` (drop `loadout`, `fireCooldown`).
  - `toShipRecord`: `{ accountId, bankedCredits, build: ship.build, rockets: ship.rockets, x, y }`.

- [ ] **Step 4: Replace `Combat.ts`**

```ts
import {
  BOUNTY_BASE,
  BOUNTY_SHARE,
  BULLET_LIFETIME,
  SHIELD_LOCKOUT,
  SHIP_RADIUS,
  WEAPON_SPACING,
  buildValue,
  forward,
  type Build,
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
      damage: weapon.damage,
      weaponId: weapon.gearId,
      mk: weapon.mk,
      expiresAt: time + BULLET_LIFETIME,
    });
  });
  return bullets;
}

export function applyDamage(ship: ShipEntity, damage: number, attackerId: number, time: number): void {
  if (ship.shieldUp) return;
  ship.hull -= damage;
  ship.lastDamagedAt = time;
  ship.lastHitBy = attackerId;
}

export function bountyFor(build: Build): number {
  return BOUNTY_BASE + Math.floor(buildValue(build) * BOUNTY_SHARE);
}
```

Note the test "fires each weapon from its own lateral offset": at angle 0, `right` = (1, 0), so offsets −10 / +10 give x = 990 / 1 010.

- [ ] **Step 5: Wire into `World.ts`** (minimal; docking and rockets follow):
  - Imports: drop `UpgradeLine`, `Economy` imports; import `applyDamage, bountyFor, fireWeapons, updateShield` from `./Combat`.
  - Remove `buy(...)` method, `updateDocking` private method, and the `this.updateDocking(events.docked)` call; remove `docked` from `TickEvents` and its initializer (`{ died: [], departed: [] }`).
  - In `stepShips`, replace the `tryFire` call with:
    ```ts
    for (const bullet of fireWeapons(ship, dt, inSafeZone, this.elapsed, () => this.allocateId())) this.bullets.set(bullet.id, bullet);
    ```
  - In `applyBulletTo`, call `applyDamage(entity, bullet.damage, bullet.ownerId, this.elapsed)`.
  - In `resolveDeaths`, call `bountyFor(ship.build)`.
  - `GameLoop.ts`: `const changed = [...events.died.map((event) => event.ship), ...events.departed];`.

- [ ] **Step 6: Update existing tests**
  - Delete `packages/server/test/Economy.test.ts` and `packages/server/test/World.economy.test.ts` (replaced in S3/S5).
  - `World.combat.test.ts`: import `BOUNTY_SHARE, RESPAWN_ROCKETS, STARTER_BUILD, buildValue`; in the kill test expect `alice.carriedCredits` to be `BOUNTY_BASE + Math.floor(buildValue(STARTER_BUILD) * BOUNTY_SHARE)`, `bob.hull` to be `bob.stats.maxHull`, and add `expect(bob.rockets).toBe(RESPAWN_ROCKETS);`. In the shield test expect `bob.hull` to be `bob.stats.maxHull`.
  - `GameLoop.test.ts`: the second test becomes "saves dead ships and reports deaths": remove `carl`; expect `saved.map((r) => r.accountId)` to equal `[2]`.
  - `snapshot.test.ts`: leave for S6 (it is rewritten there). If it blocks the lane gate now, mark the file's `describe` with `describe.skip` in this commit and remove the skip in S6.

- [ ] **Step 7: Run lane gates.** Expected: PASS (snapshot/Gateway compile errors may remain only in `net/`; if `tsc -p packages/server` fails solely in `src/net/snapshot.ts` and `src/net/Gateway.ts`, finish S6's snapshot and Gateway edits for the changed fields `loadout`→`build` / `tier`→`weaponId,mk` right now so the gate passes, and note it in the summary).

- [ ] **Step 8: Commit**
```bash
git add -A packages/server
git commit -m "feat(server): compute ship stats from builds and fire each weapon"
```

---

### Task S3: Docking

**Files:**
- Create: `packages/server/src/world/Docking.ts`
- Modify: `packages/server/src/world/World.ts`
- Test: `packages/server/test/Docking.test.ts`, `packages/server/test/World.docking.test.ts`

**Interfaces — Produces:** `DockFailure = 'out_of_range' | 'too_fast' | 'recent_damage' | 'cooldown'`; `DockOutcome = { ok: true; docked: boolean } | { ok: false; reason: DockFailure }`; `dockCheck(ship, time): DockFailure | null`; `canDock(ship, time): boolean`; `dockCooldownRemaining(ship, time): number`; `toggleDock(ship, time): DockOutcome`; `World.dock(shipId): DockOutcome`.

- [ ] **Step 1: Write failing tests**

`packages/server/test/Docking.test.ts`:
```ts
import { DOCK_COOLDOWN, ORE_PRICE, SAFE_ZONES } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { canDock, dockCooldownRemaining, toggleDock } from '../src/world/Docking';
import { createShip } from '../src/world/entities';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
const nearStation = () => createShip(1, 1, 'alice', shipRecord(zone.x + 150, zone.y, 1));

describe('toggleDock', () => {
  it('snaps to the station, freezes, sells ore, banks credits and repairs', () => {
    const ship = nearStation();
    ship.vx = 30;
    ship.ore = 3;
    ship.carriedCredits = 40;
    ship.hull = 10;
    expect(toggleDock(ship, 100)).toEqual({ ok: true, docked: true });
    expect([ship.x, ship.y, ship.vx, ship.vy]).toEqual([zone.x, zone.y, 0, 0]);
    expect(ship.bankedCredits).toBe(40 + 3 * ORE_PRICE);
    expect(ship.hull).toBe(ship.stats.maxHull);
    expect(ship.docked).toBe(true);
  });

  it('refuses out of range, too fast, or after recent damage', () => {
    const far = createShip(1, 1, 'alice', shipRecord(zone.x + 250, zone.y, 1));
    expect(toggleDock(far, 100)).toEqual({ ok: false, reason: 'out_of_range' });
    const fast = nearStation();
    fast.vx = 100;
    expect(toggleDock(fast, 100)).toEqual({ ok: false, reason: 'too_fast' });
    const hurt = nearStation();
    hurt.lastDamagedAt = 98;
    expect(toggleDock(hurt, 100)).toEqual({ ok: false, reason: 'recent_damage' });
    expect(hurt.docked).toBe(false);
  });

  it('undocks and enforces the 30 s cooldown', () => {
    const ship = nearStation();
    toggleDock(ship, 100);
    expect(toggleDock(ship, 110)).toEqual({ ok: true, docked: false });
    expect(dockCooldownRemaining(ship, 120)).toBe(DOCK_COOLDOWN - 10);
    expect(toggleDock(ship, 120)).toEqual({ ok: false, reason: 'cooldown' });
    expect(canDock(ship, 120)).toBe(false);
    expect(canDock(ship, 110 + DOCK_COOLDOWN)).toBe(true);
  });

  it('reports canDock false while docked or in open space', () => {
    const ship = nearStation();
    expect(canDock(ship, 0)).toBe(true);
    toggleDock(ship, 0);
    expect(canDock(ship, 0)).toBe(false);
    expect(canDock(createShip(2, 2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 2)), 0)).toBe(false);
  });
});
```

`packages/server/test/World.docking.test.ts`:
```ts
import { IDLE_INPUT, SAFE_ZONES, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { shipRecord } from './support/fixtures';

const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };

describe('World docking', () => {
  it('does not auto-dock', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(zone.x, zone.y, 1));
    world.tick(TICK_DT);
    expect(ship.docked).toBe(false);
  });

  it('freezes a docked ship but still acknowledges its inputs', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(zone.x, zone.y, 1));
    expect(world.dock(ship.id)).toEqual({ ok: true, docked: true });
    world.setInput(ship.id, 1, { ...IDLE_INPUT, thrust: true });
    for (let i = 0; i < 10; i += 1) world.tick(TICK_DT);
    expect([ship.x, ship.y]).toEqual([zone.x, zone.y]);
    expect(ship.lastSeq).toBe(1);
  });

  it('flies again after undocking', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(zone.x, zone.y, 1));
    world.dock(ship.id);
    world.dock(ship.id);
    world.setInput(ship.id, 1, { ...IDLE_INPUT, thrust: true });
    for (let i = 0; i < 10; i += 1) world.tick(TICK_DT);
    expect(ship.y).toBeLessThan(zone.y);
  });

  it('clears the dock state on death', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(zone.x, zone.y, 1));
    world.dock(ship.id);
    ship.hull = 0;
    world.tick(TICK_DT);
    expect(ship.docked).toBe(false);
    expect(ship.dockCooldownUntil).toBe(-Infinity);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** `packages/server/src/world/Docking.ts`

```ts
import {
  DOCK_COMBAT_COOLDOWN,
  DOCK_COOLDOWN,
  DOCK_MAX_SPEED,
  DOCK_RANGE,
  IDLE_INPUT,
  ORE_PRICE,
  nearestZone,
} from '@arena/shared';
import type { ShipEntity } from './entities';

export type DockFailure = 'out_of_range' | 'too_fast' | 'recent_damage' | 'cooldown';

export type DockOutcome =
  | { readonly ok: true; readonly docked: boolean }
  | { readonly ok: false; readonly reason: DockFailure };

export function dockCooldownRemaining(ship: ShipEntity, time: number): number {
  return Math.max(0, ship.dockCooldownUntil - time);
}

export function dockCheck(ship: ShipEntity, time: number): DockFailure | null {
  const zone = nearestZone(ship.x, ship.y);
  if (Math.hypot(ship.x - zone.x, ship.y - zone.y) > DOCK_RANGE) return 'out_of_range';
  if (Math.hypot(ship.vx, ship.vy) > DOCK_MAX_SPEED) return 'too_fast';
  if (time - ship.lastDamagedAt < DOCK_COMBAT_COOLDOWN) return 'recent_damage';
  if (dockCooldownRemaining(ship, time) > 0) return 'cooldown';
  return null;
}

export function canDock(ship: ShipEntity, time: number): boolean {
  return !ship.docked && dockCheck(ship, time) === null;
}

function undock(ship: ShipEntity, time: number): DockOutcome {
  ship.docked = false;
  ship.dockCooldownUntil = time + DOCK_COOLDOWN;
  return { ok: true, docked: false };
}

function dock(ship: ShipEntity): DockOutcome {
  const station = nearestZone(ship.x, ship.y);
  ship.x = station.x;
  ship.y = station.y;
  ship.vx = 0;
  ship.vy = 0;
  ship.input = IDLE_INPUT;
  ship.shieldUp = false;
  ship.bankedCredits += ship.carriedCredits + ship.ore * ORE_PRICE;
  ship.carriedCredits = 0;
  ship.ore = 0;
  ship.hull = ship.stats.maxHull;
  ship.docked = true;
  return { ok: true, docked: true };
}

export function toggleDock(ship: ShipEntity, time: number): DockOutcome {
  if (ship.docked) return undock(ship, time);
  const failure = dockCheck(ship, time);
  return failure ? { ok: false, reason: failure } : dock(ship);
}
```

- [ ] **Step 4: Modify `World.ts`**
  - Import `toggleDock, type DockOutcome` from `./Docking`.
  - Add public method:
    ```ts
    dock(shipId: number): DockOutcome {
      const ship = this.ships.get(shipId);
      if (!ship) return { ok: false, reason: 'out_of_range' };
      return toggleDock(ship, this.elapsed);
    }
    ```
  - In `stepShips`, after consuming the queued input and before shield/motion/fire:
    ```ts
      if (ship.docked) {
        ship.vx = 0;
        ship.vy = 0;
        ship.shieldUp = false;
        continue;
      }
    ```

- [ ] **Step 5: Run lane gates.** Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add -A packages/server
git commit -m "feat(server): add manual station docking with cooldown"
```

---

### Task S4: Rockets

**Files:**
- Create: `packages/server/src/world/Rockets.ts`
- Modify: `packages/server/src/world/World.ts`
- Test: `packages/server/test/Rockets.test.ts`, `packages/server/test/World.rockets.test.ts`

**Interfaces — Produces:** `tryLaunch(ship, dt, inSafeZone): boolean`, `acquireTarget(shooter, candidates: Iterable<ShipEntity>): ShipEntity | null`, `launchRocket(ship, id, time, target): RocketEntity`, `steerRocket(rocket, target: { x: number; y: number } | undefined, dt): void`.

- [ ] **Step 1: Write failing tests**

`packages/server/test/Rockets.test.ts`:
```ts
import { IDLE_INPUT, ROCKET_COOLDOWN, ROCKET_MAX_SPEED, ROCKET_TURN_RATE } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip } from '../src/world/entities';
import { acquireTarget, launchRocket, steerRocket, tryLaunch } from '../src/world/Rockets';
import { shipRecord } from './support/fixtures';

const at = (id: number, x: number, y: number) => createShip(id, id, `p${id}`, shipRecord(x, y, id));

describe('tryLaunch', () => {
  it('spends ammo and applies the cooldown', () => {
    const ship = at(1, 1_000, 1_000);
    ship.input = { ...IDLE_INPUT, rocket: true };
    expect(tryLaunch(ship, 0.1, false)).toBe(true);
    expect(ship.rockets).toBe(9);
    expect(ship.rocketCooldown).toBe(ROCKET_COOLDOWN);
    expect(tryLaunch(ship, 0.5, false)).toBe(false);
    expect(tryLaunch(ship, 0.6, false)).toBe(true);
  });

  it('refuses without ammo, while shielded or in a safe zone', () => {
    const ship = at(1, 1_000, 1_000);
    ship.input = { ...IDLE_INPUT, rocket: true };
    ship.rockets = 0;
    expect(tryLaunch(ship, 0.1, false)).toBe(false);
    ship.rockets = 5;
    ship.shieldUp = true;
    expect(tryLaunch(ship, 0.1, false)).toBe(false);
    ship.shieldUp = false;
    expect(tryLaunch(ship, 0.1, true)).toBe(false);
  });
});

describe('acquireTarget', () => {
  it('locks the nearest ship inside the forward cone and range', () => {
    const shooter = at(1, 1_000, 1_000);
    const ahead = at(2, 1_000, 500);
    const closerAhead = at(3, 1_100, 800);
    const behind = at(4, 1_000, 1_100);
    const wide = at(5, 1_200, 1_000);
    const far = at(6, 1_000, -500);
    expect(acquireTarget(shooter, [shooter, ahead, closerAhead, behind, wide, far])?.id).toBe(3);
    expect(acquireTarget(shooter, [shooter, behind, wide, far])).toBeNull();
  });
});

describe('steerRocket', () => {
  it('turns toward the target no faster than the turn rate and accelerates', () => {
    const shooter = at(1, 1_000, 1_000);
    const rocket = launchRocket(shooter, 50, 0, null);
    steerRocket(rocket, { x: 2_000, y: 1_000 }, 0.1);
    expect(rocket.angle).toBeCloseTo(ROCKET_TURN_RATE * 0.1);
    expect(rocket.speed).toBeCloseTo(340);
    for (let i = 0; i < 100; i += 1) steerRocket(rocket, undefined, 0.1);
    expect(rocket.speed).toBe(ROCKET_MAX_SPEED);
  });

  it('flies straight without a target', () => {
    const rocket = launchRocket(at(1, 1_000, 1_000), 50, 0, null);
    steerRocket(rocket, undefined, 0.1);
    expect(rocket.angle).toBe(0);
    expect(rocket.y).toBeLessThan(rocket.prevY);
  });
});
```

`packages/server/test/World.rockets.test.ts`:
```ts
import { IDLE_INPUT, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

describe('World rockets', () => {
  it('homes in and kills a target in three hits', () => {
    const world = new World({ asteroidTarget: 0 });
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x + 200, OPEN_SPACE.y - 500, 2));
    world.setInput(alice.id, 1, { ...IDLE_INPUT, rocket: true });
    let killer: string | null = null;
    for (let i = 0; i < 300 && killer === null; i += 1) killer = world.tick(TICK_DT).died[0]?.killerName ?? null;
    expect(killer).toBe('alice');
    expect(alice.rockets).toBeLessThanOrEqual(7);
    expect(bob.rockets).toBe(5);
  });

  it('is absorbed by a raised shield', () => {
    const world = new World({ asteroidTarget: 0 });
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 300, 2));
    world.setInput(alice.id, 1, { ...IDLE_INPUT, rocket: true });
    world.setInput(bob.id, 1, { ...IDLE_INPUT, shield: true });
    for (let i = 0; i < 45; i += 1) world.tick(TICK_DT);
    expect(bob.hull).toBe(bob.stats.maxHull);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** `packages/server/src/world/Rockets.ts`

```ts
import {
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
} from '@arena/shared';
import type { RocketEntity, ShipEntity } from './entities';

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
  ship.rocketCooldown = ROCKET_COOLDOWN;
  return true;
}

export function acquireTarget(shooter: ShipEntity, candidates: Iterable<ShipEntity>): ShipEntity | null {
  let best: ShipEntity | null = null;
  let bestDistance = ROCKET_LOCK_RANGE;
  for (const ship of candidates) {
    if (ship.id === shooter.id || ship.docked) continue;
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
```

- [ ] **Step 4: Modify `World.ts`** to treat bullets and rockets as projectiles:
  - Add `private readonly rockets = new Map<number, RocketEntity>();` and include `this.rockets` in `rebuildGrid`'s collection list.
  - In `stepShips`, after `fireWeapons`:
    ```ts
      if (tryLaunch(ship, dt, inSafeZone)) {
        const rocket = launchRocket(ship, this.allocateId(), this.elapsed, acquireTarget(ship, this.ships.values()));
        this.rockets.set(rocket.id, rocket);
      }
    ```
  - Replace `stepBullets` with:
    ```ts
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
    }

    private isExpired(projectile: Projectile): boolean {
      return (
        projectile.expiresAt <= this.elapsed ||
        outOfBounds(projectile.x, projectile.y) ||
        zoneAt(projectile.x, projectile.y) !== undefined
      );
    }
    ```
  - Replace `resolveBulletHits()` with a generic method called once per collection in `tick` (`this.resolveProjectileHits(this.bullets); this.resolveProjectileHits(this.rockets);`):
    ```ts
    private resolveProjectileHits<T extends Projectile>(collection: Map<number, T>): void {
      for (const projectile of collection.values()) {
        const travel = Math.hypot(projectile.x - projectile.prevX, projectile.y - projectile.prevY);
        const target = this.grid
          .queryRadius(projectile.x, projectile.y, HIT_QUERY_RADIUS + travel)
          .find((entity) => this.isHit(projectile, entity));
        if (!target) continue;
        collection.delete(projectile.id);
        this.applyProjectileTo(target, projectile);
      }
    }
    ```
    Rename `isHit`, `sweptDistance` and `applyBulletTo` parameters from `BulletEntity` to `Projectile` (`applyBulletTo` → `applyProjectileTo`); bodies are otherwise unchanged.
  - `tick` order: `stepShips`, `stepProjectiles`, `rebuildGrid`, `resolveProjectileHits(bullets)`, `resolveProjectileHits(rockets)`, `collectPickups`, `resolveDeaths`, `expirePickups`, `maintainAsteroids`, `expireLingering`.

- [ ] **Step 5: Run lane gates.** Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add -A packages/server
git commit -m "feat(server): add homing rockets"
```

---

### Task S5: Shop

**Files:**
- Create: `packages/server/src/world/Shop.ts`
- Modify: `packages/server/src/world/World.ts`
- Test: `packages/server/test/Shop.test.ts`

**Interfaces — Produces:** `ShopOutcome = { ok: true } | { ok: false; reason: ShopFailure }`; `applyShopAction(ship, action: ShopAction): ShopOutcome`; `World.shop(shipId, action): ShopOutcome`.

- [ ] **Step 1: Write the failing test** — `packages/server/test/Shop.test.ts`

```ts
import { HULLS, ROCKET_PRICE, SAFE_ZONES, STARTER_BUILD, type ShopAction } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip } from '../src/world/entities';
import { applyShopAction } from '../src/world/Shop';
import { shipRecord } from './support/fixtures';

const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };

function dockedShip(banked: number) {
  const ship = createShip(1, 1, 'alice', { ...shipRecord(zone.x, zone.y, 1), bankedCredits: banked });
  ship.docked = true;
  return ship;
}

const buy = (action: ShopAction) => action;

describe('shop guards', () => {
  it('requires docking', () => {
    const ship = dockedShip(10_000);
    ship.docked = false;
    expect(applyShopAction(ship, buy({ type: 'buyRockets', count: 1 }))).toEqual({ ok: false, reason: 'not_docked' });
  });
});

describe('buyGear', () => {
  it('replaces installed gear with a 50% refund and recomputes stats', () => {
    const ship = dockedShip(600);
    const outcome = applyShopAction(ship, buy({ type: 'buyGear', gearId: 'pulse_laser', mk: 2, slot: { type: 'weapon', index: 0 } }));
    expect(outcome).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(600 + 125 - 700);
    expect(ship.stats.weapons[0]?.damage).toBe(14);
  });

  it('fills an empty utility slot and raises max hull', () => {
    const ship = dockedShip(200);
    applyShopAction(ship, buy({ type: 'buyGear', gearId: 'armor', mk: 1, slot: { type: 'utility', index: 0 } }));
    expect(ship.stats.maxHull).toBe(110);
    expect(ship.hull).toBe(110);
    expect(ship.bankedCredits).toBe(0);
  });

  it('rejects mismatched slots and leaves state unchanged', () => {
    const ship = dockedShip(10_000);
    expect(applyShopAction(ship, buy({ type: 'buyGear', gearId: 'armor', mk: 1, slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: false, reason: 'slot_mismatch' });
    expect(applyShopAction(ship, buy({ type: 'buyGear', gearId: 'armor', mk: 1, slot: { type: 'utility', index: 3 } }))).toEqual({ ok: false, reason: 'slot_mismatch' });
    expect(ship.build).toEqual(STARTER_BUILD);
    expect(ship.bankedCredits).toBe(10_000);
  });

  it('rejects when credits plus refund are short', () => {
    const ship = dockedShip(100);
    expect(applyShopAction(ship, buy({ type: 'buyGear', gearId: 'heavy_cannon', mk: 1, slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: false, reason: 'insufficient_credits' });
    expect(ship.build).toEqual(STARTER_BUILD);
  });
});

describe('sellGear', () => {
  it('empties the slot and refunds half', () => {
    const ship = dockedShip(0);
    expect(applyShopAction(ship, buy({ type: 'sellGear', slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(125);
    expect(ship.stats.weapons).toEqual([]);
    expect(applyShopAction(ship, buy({ type: 'sellGear', slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: false, reason: 'slot_mismatch' });
  });
});

describe('buyHull', () => {
  it('moves gear to the new hull and charges the price', () => {
    const ship = dockedShip(HULLS.fighter.cost);
    expect(applyShopAction(ship, buy({ type: 'buyHull', hullId: 'fighter' }))).toEqual({ ok: true });
    expect(ship.build.hullId).toBe('fighter');
    expect(ship.build.slots.weapon).toEqual([{ gearId: 'pulse_laser', mk: 1 }, null]);
    expect(ship.bankedCredits).toBe(0);
    expect(ship.hull).toBe(120);
  });

  it('sells gear that does not fit a smaller hull', () => {
    const ship = dockedShip(HULLS.gunship.cost);
    applyShopAction(ship, buy({ type: 'buyHull', hullId: 'gunship' }));
    ship.bankedCredits = 1_000;
    applyShopAction(ship, buy({ type: 'buyGear', gearId: 'heavy_cannon', mk: 1, slot: { type: 'weapon', index: 1 } }));
    const before = ship.bankedCredits;
    applyShopAction(ship, buy({ type: 'buyHull', hullId: 'scout' }));
    expect(ship.build.slots.weapon).toEqual([{ gearId: 'pulse_laser', mk: 1 }]);
    expect(ship.bankedCredits).toBe(before + 2_500 + 200);
  });

  it('rejects the current hull and unaffordable hulls', () => {
    const ship = dockedShip(100);
    expect(applyShopAction(ship, buy({ type: 'buyHull', hullId: 'scout' }))).toEqual({ ok: false, reason: 'unknown_item' });
    expect(applyShopAction(ship, buy({ type: 'buyHull', hullId: 'gunship' }))).toEqual({ ok: false, reason: 'insufficient_credits' });
    expect(ship.build).toEqual(STARTER_BUILD);
  });
});

describe('buyRockets', () => {
  it('buys up to the cap', () => {
    const ship = dockedShip(1_000);
    ship.rockets = 7;
    expect(applyShopAction(ship, buy({ type: 'buyRockets', count: 3 }))).toEqual({ ok: true });
    expect(ship.rockets).toBe(10);
    expect(ship.bankedCredits).toBe(1_000 - 3 * ROCKET_PRICE);
    expect(applyShopAction(ship, buy({ type: 'buyRockets', count: 1 }))).toEqual({ ok: false, reason: 'rocket_cap' });
  });

  it('clamps rockets when a rack is sold', () => {
    const ship = dockedShip(1_000);
    applyShopAction(ship, buy({ type: 'buyGear', gearId: 'rocket_rack', mk: 1, slot: { type: 'utility', index: 0 } }));
    ship.rockets = 15;
    applyShopAction(ship, buy({ type: 'sellGear', slot: { type: 'utility', index: 0 } }));
    expect(ship.rockets).toBe(10);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** `packages/server/src/world/Shop.ts`

```ts
import {
  GEAR,
  HULLS,
  ROCKET_PRICE,
  gearAt,
  gearCost,
  refitToHull,
  resaleValue,
  slotExists,
  statsFor,
  withGear,
  type Build,
  type GearId,
  type HullId,
  type Mk,
  type ShopAction,
  type ShopFailure,
  type SlotRef,
} from '@arena/shared';
import type { ShipEntity } from './entities';

export type ShopOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: ShopFailure };

const OK: ShopOutcome = { ok: true };

function fail(reason: ShopFailure): ShopOutcome {
  return { ok: false, reason };
}

function charge(ship: ShipEntity, price: number, refund: number): boolean {
  if (ship.bankedCredits + refund < price) return false;
  ship.bankedCredits += refund - price;
  return true;
}

function equip(ship: ShipEntity, build: Build): void {
  ship.build = build;
  ship.stats = statsFor(build);
  ship.hull = ship.stats.maxHull;
  ship.shieldEnergy = Math.min(ship.shieldEnergy, ship.stats.maxShield);
  ship.rockets = Math.min(ship.rockets, ship.stats.maxRockets);
}

function buyHull(ship: ShipEntity, hullId: HullId): ShopOutcome {
  if (hullId === ship.build.hullId) return fail('unknown_item');
  const refit = refitToHull(ship.build, hullId);
  const refund =
    resaleValue(HULLS[ship.build.hullId].cost) +
    refit.leftovers.reduce((sum, gear) => sum + resaleValue(gearCost(gear)), 0);
  if (!charge(ship, HULLS[hullId].cost, refund)) return fail('insufficient_credits');
  equip(ship, refit.build);
  return OK;
}

function buyGear(ship: ShipEntity, gearId: GearId, mk: Mk, slot: SlotRef): ShopOutcome {
  if (!slotExists(ship.build, slot) || GEAR[gearId].slot !== slot.type) return fail('slot_mismatch');
  const current = gearAt(ship.build, slot);
  const refund = current ? resaleValue(gearCost(current)) : 0;
  if (!charge(ship, gearCost({ gearId, mk }), refund)) return fail('insufficient_credits');
  equip(ship, withGear(ship.build, slot, { gearId, mk }));
  return OK;
}

function sellGear(ship: ShipEntity, slot: SlotRef): ShopOutcome {
  const current = slotExists(ship.build, slot) ? gearAt(ship.build, slot) : null;
  if (!current) return fail('slot_mismatch');
  ship.bankedCredits += resaleValue(gearCost(current));
  equip(ship, withGear(ship.build, slot, null));
  return OK;
}

function buyRockets(ship: ShipEntity, count: number): ShopOutcome {
  if (ship.rockets + count > ship.stats.maxRockets) return fail('rocket_cap');
  if (!charge(ship, count * ROCKET_PRICE, 0)) return fail('insufficient_credits');
  ship.rockets += count;
  return OK;
}

export function applyShopAction(ship: ShipEntity, action: ShopAction): ShopOutcome {
  if (!ship.docked) return fail('not_docked');
  switch (action.type) {
    case 'buyHull':
      return buyHull(ship, action.hullId);
    case 'buyGear':
      return buyGear(ship, action.gearId, action.mk, action.slot);
    case 'sellGear':
      return sellGear(ship, action.slot);
    case 'buyRockets':
      return buyRockets(ship, action.count);
  }
}
```

Check the "sells gear that does not fit" expectation: gunship resale 2 500, cannon Mk1 resale 200 (scout keeps the laser in weapon 0 and drops the cannon in weapon 1; the empty second shield slot is null so nothing else is sold), scout costs 0.

- [ ] **Step 4: Modify `World.ts`** — import `applyShopAction, type ShopOutcome` and `type ShopAction`; add:
```ts
  shop(shipId: number, action: ShopAction): ShopOutcome {
    const ship = this.ships.get(shipId);
    if (!ship) return { ok: false, reason: 'not_docked' };
    return applyShopAction(ship, action);
  }
```

- [ ] **Step 5: Run lane gates.** Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add -A packages/server
git commit -m "feat(server): add hull, gear and rocket shop"
```

---

### Task S6: Snapshot, Gateway, integration

**Files:**
- Modify: `packages/server/src/net/snapshot.ts`, `packages/server/src/net/Gateway.ts`
- Test: replace `packages/server/test/snapshot.test.ts`; update `packages/server/test/integration.test.ts`

**Interfaces — Produces:** `buildSnapshot(self, nearby, tick, time)`; `toSelfState(ship, time)`; Gateway handles `dock`, shop actions → `shopResult`.

- [ ] **Step 1: Write the failing test** — replace `packages/server/test/snapshot.test.ts`

```ts
import { STARTER_BUILD } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, toEntityState } from '../src/net/snapshot';
import { createShip, type WorldEntity } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

describe('snapshot', () => {
  it('maps ships, bullets and rockets and excludes self', () => {
    const self = createShip(1, 1, 'alice', shipRecord(10, 20, 1));
    self.lastSeq = 42;
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    const bullet: WorldEntity = { kind: 'bullet', id: 3, ownerId: 2, x: 1, y: 2, prevX: 1, prevY: 2, vx: 0, vy: -800, damage: 10, weaponId: 'pulse_laser', mk: 1, expiresAt: 9 };
    const rocket: WorldEntity = { kind: 'rocket', id: 4, ownerId: 2, targetId: 1, x: 5, y: 6, prevX: 5, prevY: 6, vx: 0, vy: -300, angle: 0.5, speed: 300, damage: 30, expiresAt: 9 };
    const snapshot = buildSnapshot(self, [self, other, bullet, rocket], 7, 100);
    expect(snapshot.lastSeq).toBe(42);
    expect(snapshot.entities).toEqual([
      { kind: 'ship', id: 2, name: 'bob', x: 30, y: 40, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout' },
      { kind: 'bullet', id: 3, x: 1, y: 2, vx: 0, vy: -800, weaponId: 'pulse_laser', mk: 1 },
      { kind: 'rocket', id: 4, x: 5, y: 6, vx: 0, vy: -300, angle: 0.5 },
    ]);
  });

  it('reports build, rockets and dock availability for self', () => {
    const self = createShip(1, 1, 'alice', shipRecord(4_000, 4_000, 1));
    self.dockCooldownUntil = 112;
    const state = buildSnapshot(self, [], 1, 100).self;
    expect(state).toMatchObject({ build: STARTER_BUILD, rockets: 10, maxRockets: 10, canDock: false, dockCooldown: 12, docked: false });
  });

  it('does not leak private fields of other ships', () => {
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    expect(Object.keys(toEntityState(other))).not.toContain('rockets');
  });
});
```

- [ ] **Step 2: Implement `snapshot.ts` changes**
  - Import `canDock, dockCooldownRemaining` from `../world/Docking`.
  - ship state: `hullId: entity.build.hullId` (replaces `hullTier`).
  - bullet state: `weaponId: entity.weaponId, mk: entity.mk` (replaces `tier`).
  - add case:
    ```ts
        case 'rocket':
          return { kind: 'rocket', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, angle: entity.angle };
    ```
  - `toSelfState(ship: ShipEntity, time: number)`: replace `loadout` with `build: ship.build`; add `rockets: ship.rockets, maxRockets: ship.stats.maxRockets, canDock: canDock(ship, time), dockCooldown: dockCooldownRemaining(ship, time)`.
  - `buildSnapshot(self, nearby, tick, time)` passes `time` to `toSelfState`.

- [ ] **Step 3: Implement `Gateway.ts` changes**
  - `broadcastSnapshots`: `buildSnapshot(ship, world.entitiesNear(ship.x, ship.y, VIEW_RADIUS), world.tickCount, world.time)`.
  - `onInput`: also pass `rocket` from the message into `setInput`.
  - Replace the end of `onMessage` (`this.onBuy(...)`) and `onBuy` with:
    ```ts
        if (message.type === 'dock') {
          this.onDock(session);
          return;
        }
        this.onShop(session, message);
      }

      private onDock(session: Session): void {
        if (this.deps.world.dock(session.shipId).ok) this.saveShip(session);
      }

      private onShop(session: Session, action: ShopAction): void {
        const outcome = this.deps.world.shop(session.shipId, action);
        if (outcome.ok) this.saveShip(session);
        send(
          session.socket,
          outcome.ok ? { type: 'shopResult', ok: true } : { type: 'shopResult', ok: false, reason: outcome.reason },
        );
      }

      private saveShip(session: Session): void {
        const ship = this.deps.world.shipById(session.shipId);
        if (ship) this.deps.repo.saveShips([toShipRecord(ship)], this.deps.now());
      }
    ```
    Import `type ShopAction` from `@arena/shared`; drop `UpgradeLine`.

- [ ] **Step 4: Update `integration.test.ts`**
  - Imports: add `BOUNTY_SHARE, RESPAWN_ROCKETS, STARTER_BUILD, buildValue` to the `@arena/shared` import.
  - `TestClient`: add `clear(): void { this.messages.length = 0; }`.
  - `input(seq, input)` is unchanged (ShipInput now includes `rocket`).
  - Replace the test "plays a full duel, dock and purchase loop" with:
    ```ts
      it('kills with rockets, docks with E, shops and enforces the dock cooldown', async () => {
        const alice = await TestClient.connect(port, await register('alice'));
        const bob = await TestClient.connect(port, await register('bob'));
        const aliceShip = app.world.shipById((await pump(alice, 'welcome')).shipId);
        const bobShip = app.world.shipById((await pump(bob, 'welcome')).shipId);
        if (!aliceShip || !bobShip) throw new Error('ships missing');
        Object.assign(aliceShip, { x: OPEN_SPACE.x, y: OPEN_SPACE.y });
        Object.assign(bobShip, { x: OPEN_SPACE.x, y: OPEN_SPACE.y - 400 });

        alice.input(1, { ...IDLE_INPUT, rocket: true });
        expect((await pump(bob, 'died')).killer).toBe('alice');
        bob.clear();
        const respawned = await pump(bob, 'snapshot');
        expect(respawned.self.build).toEqual(STARTER_BUILD);
        expect(respawned.self.rockets).toBe(RESPAWN_ROCKETS);
        expect(respawned.self.docked).toBe(false);

        alice.input(2, IDLE_INPUT);
        const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
        Object.assign(aliceShip, { x: zone.x + 50, y: zone.y, vx: 0, vy: 0 });
        alice.clear();
        alice.send({ type: 'dock' });
        const docked = await pump(alice, 'snapshot', (s) => s.self.docked);
        expect(docked.self.bankedCredits).toBe(BOUNTY_BASE + Math.floor(buildValue(STARTER_BUILD) * BOUNTY_SHARE));

        alice.send({ type: 'buyGear', gearId: 'rocket_rack', mk: 1, slot: { type: 'utility', index: 0 } });
        expect(await pump(alice, 'shopResult')).toEqual({ type: 'shopResult', ok: true });
        await pump(alice, 'snapshot', (s) => s.self.maxRockets === 15);

        alice.clear();
        alice.send({ type: 'dock' });
        const undocked = await pump(alice, 'snapshot', (s) => !s.self.docked);
        expect(undocked.self.dockCooldown).toBeGreaterThan(29);
        alice.clear();
        alice.send({ type: 'dock' });
        for (let step = 0; step < 10; step += 1) app.loop.step();
        await settle();
        expect((await pump(alice, 'snapshot')).self.docked).toBe(false);

        bob.send({ type: 'buyRockets', count: 1 });
        expect(await pump(bob, 'shopResult')).toEqual({ type: 'shopResult', ok: false, reason: 'not_docked' });
      });
    ```

- [ ] **Step 5: Run lane gates.** Expected: PASS, including `integration.test.ts`. If any test fails, use superpowers:systematic-debugging; fix server code, not the test, unless the test contradicts the spec.

- [ ] **Step 6: Commit**
```bash
git add -A packages/server
git commit -m "feat(server): expose docking, rockets and shop over the gateway"
```

---

## Client lane (worktree `builds-client`, first run `pnpm install --frozen-lockfile`)

Shared test fixture for this lane — create `packages/client/test/support/self.ts` in C1:
```ts
import { STARTER_BUILD, type SelfState } from '@arena/shared';

export function selfState(overrides: Partial<SelfState> = {}): SelfState {
  return {
    id: 1, x: 1_000, y: 1_000, vx: 0, vy: 0, angle: 0,
    hull: 80, maxHull: 80, shieldEnergy: 100, maxShield: 100, shieldUp: false,
    ore: 0, cargoCapacity: 15, carriedCredits: 0, bankedCredits: 0,
    build: STARTER_BUILD, rockets: 10, maxRockets: 10,
    docked: false, canDock: false, dockCooldown: 0,
    ...overrides,
  };
}
```

### Task C1: Input E/R + predictor freeze

**Files:**
- Modify: `packages/client/src/input/InputSampler.ts`, `packages/client/src/sim/Predictor.ts`
- Create: `packages/client/test/support/self.ts`
- Test: replace `packages/client/test/input.test.ts`, `packages/client/test/predictor.test.ts`

**Interfaces — Produces:** `new InputSampler(onDock: () => void = () => {})`; `handleKey(code: string, down: boolean, repeat: boolean): boolean`; `sample()` includes `rocket`. `Predictor` freezes while `self.docked`.

- [ ] **Step 1: Write failing tests**

`packages/client/test/input.test.ts`:
```ts
import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { InputSampler } from '../src/input/InputSampler';

describe('InputSampler', () => {
  it('maps WASD, Space, Shift and R', () => {
    const sampler = new InputSampler();
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'KeyR']) sampler.handleKey(code, true, false);
    expect(sampler.sample()).toEqual({ thrust: true, reverse: true, left: true, right: true, fire: true, shield: true, rocket: true });
  });

  it('releases keys', () => {
    const sampler = new InputSampler();
    sampler.handleKey('KeyR', true, false);
    sampler.handleKey('KeyR', false, false);
    expect(sampler.sample()).toEqual(IDLE_INPUT);
  });

  it('fires dock once per E press, ignoring key repeat and release', () => {
    let docks = 0;
    const sampler = new InputSampler(() => (docks += 1));
    expect(sampler.handleKey('KeyE', true, false)).toBe(true);
    sampler.handleKey('KeyE', true, true);
    sampler.handleKey('KeyE', false, false);
    expect(docks).toBe(1);
    expect(sampler.sample()).toEqual(IDLE_INPUT);
  });

  it('ignores unmapped keys', () => {
    expect(new InputSampler().handleKey('KeyQ', true, false)).toBe(false);
  });
});
```

`packages/client/test/predictor.test.ts`:
```ts
import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { Predictor } from '../src/sim/Predictor';
import { selfState } from './support/self';

const thrust = { ...IDLE_INPUT, thrust: true };

describe('Predictor', () => {
  it('has no motion before the first snapshot', () => {
    const predictor = new Predictor();
    expect(predictor.predict(thrust)).toBe(1);
    expect(predictor.current).toBeNull();
  });

  it('moves immediately after a snapshot', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState(), 0);
    predictor.predict(thrust);
    expect(predictor.current?.vy).toBeLessThan(0);
  });

  it('replays unacknowledged inputs and drops acknowledged ones', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState(), 0);
    predictor.predict(thrust);
    predictor.predict(thrust);
    const predicted = predictor.current;
    predictor.reconcile(selfState(), 0);
    expect(predictor.current?.y).toBeCloseTo(predicted?.y ?? 0);
    predictor.reconcile(selfState({ y: 500 }), 2);
    expect(predictor.current?.y).toBe(500);
  });

  it('stays frozen at the server position while docked', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState({ docked: true }), 0);
    predictor.predict(thrust);
    expect(predictor.current).toMatchObject({ x: 1_000, y: 1_000, vx: 0, vy: 0 });
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run packages/client/test/input.test.ts packages/client/test/predictor.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `InputSampler.ts`** (full replacement)

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
  KeyR: 'rocket',
};

const DOCK_KEY = 'KeyE';

export class InputSampler {
  private readonly pressed = new Set<InputKey>();
  private target: Window | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.handleKey(event.code, true, event.repeat)) event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.handleKey(event.code, false, false)) event.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
  };

  constructor(private readonly onDock: () => void = () => {}) {}

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

  handleKey(code: string, down: boolean, repeat: boolean): boolean {
    if (code === DOCK_KEY) {
      if (down && !repeat) this.onDock();
      return true;
    }
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
      rocket: this.pressed.has('rocket'),
    };
  }
}
```

If lint flags the empty arrow default (`@typescript-eslint/no-empty-function`), use a named module-level `function ignoreDock(): void { return; }` as the default.

- [ ] **Step 4: Implement `Predictor.ts` changes**
  - Imports: replace `BASE_LOADOUT` with `STARTER_BUILD`; `private stats: ShipStats = statsFor(STARTER_BUILD);` add `private frozen = false;`.
  - `predict`: step only `if (this.motion && !this.frozen)`.
  - `reconcile`:
    ```ts
    reconcile(self: SelfState, lastSeq: number): void {
      this.stats = statsFor(self.build);
      this.frozen = self.docked;
      this.pending = this.frozen ? [] : this.pending.filter((entry) => entry.seq > lastSeq);
      const authoritative: ShipMotion = { x: self.x, y: self.y, vx: self.vx, vy: self.vy, angle: self.angle };
      this.motion = this.pending.reduce(
        (motion, entry) => stepMotion(motion, entry.input, this.stats, TICK_DT),
        authoritative,
      );
    }
    ```

- [ ] **Step 5: Run lane gates** (client build may fail until C4 rewires `GameSession`; if so, run the other client gate commands now and the build from C4 on, and say so in the summary).

- [ ] **Step 6: Commit**
```bash
git add -A packages/client
git commit -m "feat(client): add E dock and R rocket keys, freeze prediction while docked"
```

---

### Task C2: Rendering — hulls, weapons, rockets

**Files:**
- Modify: `packages/client/src/render/spriteIds.ts`, `packages/client/src/render/Renderer.ts`, `packages/client/src/sim/Interpolator.ts`
- Test: replace `packages/client/test/spriteIds.test.ts`; update `packages/client/test/interpolator.test.ts`

**Interfaces — Produces:** `spriteIdFor(entity)` for all six entity kinds; renderer views are plain `Container`s holding a body sprite plus optional shield bubble / rocket trail; interpolator blends `angle` for ships and rockets.

- [ ] **Step 1: Write failing tests**

`packages/client/test/spriteIds.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { spriteIdFor } from '../src/render/spriteIds';

const bullet = (weaponId: 'pulse_laser' | 'heavy_cannon', mk: 1 | 2 | 3) =>
  spriteIdFor({ kind: 'bullet', id: 1, x: 0, y: 0, vx: 0, vy: 0, weaponId, mk });

describe('spriteIdFor', () => {
  it('maps ships by hull', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'a', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'gunship' })).toBe('ship_gunship');
  });

  it('maps bullets by weapon and mk', () => {
    expect(bullet('pulse_laser', 1)).toBe('bullet_t0');
    expect(bullet('pulse_laser', 2)).toBe('bullet_t2');
    expect(bullet('pulse_laser', 3)).toBe('bullet_t4');
    expect(bullet('heavy_cannon', 2)).toBe('bullet_cannon');
  });

  it('maps rockets and world objects', () => {
    expect(spriteIdFor({ kind: 'rocket', id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0 })).toBe('rocket');
    expect(spriteIdFor({ kind: 'asteroid', id: 1, x: 0, y: 0, radius: 40, variant: 4 })).toBe('asteroid_4');
    expect(spriteIdFor({ kind: 'ore', id: 1, x: 0, y: 0 })).toBe('ore_pickup');
    expect(spriteIdFor({ kind: 'crate', id: 1, x: 0, y: 0 })).toBe('loot_crate');
  });
});
```

In `packages/client/test/interpolator.test.ts`, change the `ship` fixture's `hullTier: 0` to `hullId: 'scout'` and add:
```ts
  it('blends rocket angles too', () => {
    const rocket = (angle: number): EntityState => ({ kind: 'rocket', id: 9, x: 0, y: 0, vx: 0, vy: 0, angle });
    const interpolator = new Interpolator();
    interpolator.push([rocket(0)], 0);
    interpolator.push([rocket(1)], 100);
    const sampled = interpolator.sample(50)[0];
    expect(sampled?.kind === 'rocket' && sampled.angle).toBeCloseTo(0.5);
  });
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement `spriteIds.ts`**

```ts
import type { EntityState, GearId, Mk } from '@arena/shared';

const PULSE_SPRITES: Readonly<Record<Mk, string>> = { 1: 'bullet_t0', 2: 'bullet_t2', 3: 'bullet_t4' };

function bulletSprite(weaponId: GearId, mk: Mk): string {
  return weaponId === 'heavy_cannon' ? 'bullet_cannon' : PULSE_SPRITES[mk];
}

export function spriteIdFor(entity: EntityState): string {
  switch (entity.kind) {
    case 'ship':
      return `ship_${entity.hullId}`;
    case 'bullet':
      return bulletSprite(entity.weaponId, entity.mk);
    case 'rocket':
      return 'rocket';
    case 'asteroid':
      return `asteroid_${entity.variant}`;
    case 'ore':
      return 'ore_pickup';
    case 'crate':
      return 'loot_crate';
  }
}
```

- [ ] **Step 4: Interpolator** — in `blend`, replace the ship-only angle branch with:
```ts
  if ('angle' in moved && 'angle' in from) return { ...moved, angle: lerpAngle(from.angle, moved.angle, t) };
  return moved;
```
If TypeScript cannot narrow the spread union with `in`, use `if ((moved.kind === 'ship' && from.kind === 'ship') || (moved.kind === 'rocket' && from.kind === 'rocket'))` with the same return.

- [ ] **Step 5: Renderer changes**
  - `LAYER_FOR` gains `rocket: 'bullets'`.
  - Views wrap sprites in a plain `Container` (Pixi v8 deprecates children on `Sprite`/`Graphics`). Replace `replaceView`'s body with:
    ```ts
      private replaceView(entity: EntityState, spriteId: string): EntityView {
        this.views.get(entity.id)?.container.destroy({ children: true });
        const container = new Container();
        if (entity.kind === 'rocket') {
          const trail = this.sprites.create('rocket_trail');
          trail.position.set(0, 16);
          container.addChild(trail);
        }
        const body = this.sprites.create(spriteId);
        if (entity.kind === 'asteroid') body.scale.set((entity.radius * 2) / this.sprites.size(spriteId).width);
        container.addChild(body);
        const shield = entity.kind === 'ship' ? this.sprites.create('shield_bubble') : null;
        if (shield) container.addChild(shield);
        this.layers[LAYER_FOR[entity.kind]].addChild(container);
        const view: EntityView = { spriteId, container, shield, x: entity.x, y: entity.y };
        this.views.set(entity.id, view);
        return view;
      }
    ```
  - In `syncEntity`, after positioning: `if ('angle' in entity) view.container.rotation = entity.angle;` then `if (view.shield && entity.kind === 'ship') view.shield.visible = entity.shieldUp;` (remove the old ship-only early return).
  - In `removeMissing`, use `view.container.destroy({ children: true })`; the explosion check uses `view.spriteId.startsWith('ship_')` (unchanged).

- [ ] **Step 6: Run lane gates** (build caveat as in C1).

- [ ] **Step 7: Commit**
```bash
git add -A packages/client
git commit -m "feat(client): render hull classes, weapon bullets and rockets"
```

---

### Task C3: HUD prompts + rockets

**Files:**
- Modify: `packages/client/src/ui/Hud.ts`
- Test: replace `packages/client/test/hud.test.ts`

**Interfaces — Produces:** `dockPrompt(self, inRange): string | null`; `hudLines(self, prompt): string[]`; `Hud.update(self)` computes `inRange` from safe zones and `DOCK_RANGE`.

- [ ] **Step 1: Write the failing test** — `packages/client/test/hud.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { dockPrompt, hudLines } from '../src/ui/Hud';
import { selfState } from './support/self';

describe('dockPrompt', () => {
  it('explains each dock state', () => {
    expect(dockPrompt(selfState({ docked: true }), true)).toBe('Docked — press E to undock');
    expect(dockPrompt(selfState({ canDock: true }), true)).toBe('Press E to dock');
    expect(dockPrompt(selfState({ dockCooldown: 12.3 }), true)).toBe('Dock available in 13s');
    expect(dockPrompt(selfState({ dockCooldown: 12.3 }), false)).toBeNull();
    expect(dockPrompt(selfState(), false)).toBeNull();
  });
});

describe('hudLines', () => {
  it('summarises ship state with rockets and the prompt', () => {
    const lines = hudLines(selfState({ hull: 62.4, shieldEnergy: 33.3, shieldUp: true, ore: 4, carriedCredits: 150, bankedCredits: 900, rockets: 7 }), 'Press E to dock');
    expect(lines).toEqual([
      'Hull 63 / 80',
      'Shield 33 / 100 (UP)',
      'Rockets 7 / 10',
      'Cargo 4 / 15 ore',
      'Carried 150 cr (at risk)',
      'Banked 900 cr',
      'Press E to dock',
    ]);
  });

  it('omits an empty prompt', () => {
    expect(hudLines(selfState(), null)).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** — in `Hud.ts`:
```ts
import { DOCK_RANGE, type SafeZone, type SelfState } from '@arena/shared';

export function dockPrompt(self: SelfState, inRange: boolean): string | null {
  if (self.docked) return 'Docked — press E to undock';
  if (self.canDock) return 'Press E to dock';
  if (inRange && self.dockCooldown > 0) return `Dock available in ${Math.ceil(self.dockCooldown)}s`;
  return null;
}

export function hudLines(self: SelfState, prompt: string | null): string[] {
  const lines = [
    `Hull ${Math.ceil(self.hull)} / ${Math.round(self.maxHull)}`,
    `Shield ${Math.floor(self.shieldEnergy)} / ${Math.round(self.maxShield)}${self.shieldUp ? ' (UP)' : ''}`,
    `Rockets ${self.rockets} / ${self.maxRockets}`,
    `Cargo ${self.ore} / ${self.cargoCapacity} ore`,
    `Carried ${self.carriedCredits} cr (at risk)`,
    `Banked ${self.bankedCredits} cr`,
  ];
  return prompt ? [...lines, prompt] : lines;
}
```
and in `Hud.update`:
```ts
    const inRange = this.zones.some((zone) => Math.hypot(self.x - zone.x, self.y - zone.y) <= DOCK_RANGE);
    const lines = hudLines(self, dockPrompt(self, inRange));
```
(then render `lines` as before; the old `DOCKED` line is gone).

- [ ] **Step 4: Run lane gates** (build caveat as in C1).

- [ ] **Step 5: Commit**
```bash
git add -A packages/client
git commit -m "feat(client): show rockets and dock prompts in the HUD"
```

---

### Task C4: Build menu + session wiring + controls.md

**Files:**
- Create: `packages/client/src/ui/buildMenuModel.ts`, `packages/client/src/ui/BuildMenu.ts`
- Delete: `packages/client/src/ui/ShopPanel.ts`, `packages/client/test/shop.test.ts`
- Modify: `packages/client/src/game/GameSession.ts`, `packages/client/src/net/Connection.ts`, `packages/client/src/style.css`, `controls.md`
- Test: `packages/client/test/buildMenuModel.test.ts`

**Interfaces — Produces:** `statSummary(stats): string[]`, `describeDelta(before, after): string`, `slotRows(build): SlotRow[]`, `gearOptions(build, slot, banked): GearOption[]`, `hullCards(build, banked): HullCard[]`, `rocketOffer(self): RocketOffer`; `class BuildMenu(root, send)` with `update(self)`, `showResult(message)`.

- [ ] **Step 1: Write the failing test** — `packages/client/test/buildMenuModel.test.ts`

```ts
import { STARTER_BUILD, statsFor } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { describeDelta, gearOptions, hullCards, rocketOffer, slotRows, statSummary } from '../src/ui/buildMenuModel';
import { selfState } from './support/self';

describe('statSummary', () => {
  it('summarises the starter build', () => {
    expect(statSummary(statsFor(STARTER_BUILD))).toEqual([
      'Hull 80',
      'Speed 460',
      'Damage/s 40',
      'Shield 100',
      'Cargo 15',
      'Rockets max 10',
    ]);
  });
});

describe('slotRows', () => {
  it('lists every slot with its gear', () => {
    expect(slotRows(STARTER_BUILD).map((row) => row.label)).toEqual([
      'Weapon 1: Pulse Laser Mk1',
      'Shield 1: Shield Generator Mk1',
      'Engine 1: Thruster Mk1',
      'Utility 1: Empty',
    ]);
  });
});

describe('gearOptions', () => {
  it('lists compatible gear with price, affordability and stat change', () => {
    const options = gearOptions(STARTER_BUILD, { type: 'utility', index: 0 }, 200);
    expect(options.map((o) => o.label)).toEqual([
      'Armor Plating Mk1', 'Armor Plating Mk2', 'Armor Plating Mk3',
      'Cargo Pod Mk1', 'Cargo Pod Mk2', 'Cargo Pod Mk3',
      'Rocket Rack Mk1', 'Rocket Rack Mk2', 'Rocket Rack Mk3',
    ]);
    expect(options[0]).toMatchObject({ gearId: 'armor', mk: 1, price: 200, affordable: true, delta: 'Hull +30' });
    expect(options[1]?.affordable).toBe(false);
  });

  it('counts the refund of replaced gear toward affordability', () => {
    const [mk1, mk2] = gearOptions(STARTER_BUILD, { type: 'weapon', index: 0 }, 600);
    expect(mk1?.delta).toBe('no change');
    expect(mk2).toMatchObject({ price: 700, affordable: true, delta: 'Damage/s +23' });
  });
});

describe('describeDelta', () => {
  it('lists several changes', () => {
    const before = statsFor(STARTER_BUILD);
    const after = statsFor({ ...STARTER_BUILD, hullId: 'fighter', slots: { ...STARTER_BUILD.slots, weapon: [{ gearId: 'pulse_laser', mk: 1 }, null] } });
    expect(describeDelta(before, after)).toBe('Hull +40, Speed -40, Cargo +5');
  });
});

describe('hullCards', () => {
  it('marks the current hull and affordability', () => {
    const cards = hullCards(STARTER_BUILD, 1_500);
    expect(cards.map((c) => [c.hullId, c.current, c.affordable])).toEqual([
      ['scout', true, false],
      ['fighter', false, true],
      ['freighter', false, false],
      ['gunship', false, false],
    ]);
    expect(cards[1]?.slots).toBe('W2 S1 E1 U1');
  });
});

describe('rocketOffer', () => {
  it('prices the missing rockets', () => {
    expect(rocketOffer(selfState({ rockets: 6, bankedCredits: 60 }))).toEqual({ missing: 4, fillPrice: 100, canBuyOne: true, canFill: false });
    expect(rocketOffer(selfState({ rockets: 10, bankedCredits: 60 }))).toMatchObject({ missing: 0, canBuyOne: false });
  });
});
```

Damage/s: starter laser 10 × 4 = 40; Mk2 14 × 4.5 = 63 → +23. Fighter vs scout: hull 120 − 80 = +40; speed 420 − 460 = −40; cargo 20 − 15 = +5; damage and shield unchanged.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** `packages/client/src/ui/buildMenuModel.ts`

```ts
import {
  GEAR,
  GEAR_IDS,
  HULLS,
  HULL_IDS,
  MK_LEVELS,
  ROCKET_PRICE,
  SLOT_TYPES,
  gearAt,
  gearCost,
  resaleValue,
  statsFor,
  withGear,
  type Build,
  type GearId,
  type HullId,
  type InstalledGear,
  type Mk,
  type SelfState,
  type ShipStats,
  type SlotRef,
  type SlotType,
} from '@arena/shared';

const SLOT_LABELS: Readonly<Record<SlotType, string>> = {
  weapon: 'Weapon',
  shield: 'Shield',
  engine: 'Engine',
  utility: 'Utility',
};

const SLOT_LETTERS: Readonly<Record<SlotType, string>> = { weapon: 'W', shield: 'S', engine: 'E', utility: 'U' };

interface StatMetric {
  readonly label: string;
  readonly value: (stats: ShipStats) => number;
}

const METRICS: readonly StatMetric[] = [
  { label: 'Hull', value: (s) => s.maxHull },
  { label: 'Speed', value: (s) => s.maxSpeed },
  { label: 'Damage/s', value: (s) => s.weapons.reduce((sum, w) => sum + w.damage * w.fireRate, 0) },
  { label: 'Shield', value: (s) => s.maxShield },
  { label: 'Cargo', value: (s) => s.cargoCapacity },
  { label: 'Rockets max', value: (s) => s.maxRockets },
];

export function gearLabel(gear: InstalledGear): string {
  return `${GEAR[gear.gearId].name} Mk${gear.mk}`;
}

export function statSummary(stats: ShipStats): string[] {
  return METRICS.map((metric) => `${metric.label} ${Math.round(metric.value(stats))}`);
}

export function describeDelta(before: ShipStats, after: ShipStats): string {
  const changes = METRICS.flatMap((metric) => {
    const delta = Math.round(metric.value(after) - metric.value(before));
    return delta === 0 ? [] : [`${metric.label} ${delta > 0 ? '+' : ''}${delta}`];
  });
  return changes.length > 0 ? changes.join(', ') : 'no change';
}

export interface SlotRow {
  readonly slot: SlotRef;
  readonly label: string;
  readonly gear: InstalledGear | null;
}

export function slotRows(build: Build): SlotRow[] {
  return SLOT_TYPES.flatMap((type) =>
    build.slots[type].map((gear, index) => ({
      slot: { type, index },
      label: `${SLOT_LABELS[type]} ${index + 1}: ${gear ? gearLabel(gear) : 'Empty'}`,
      gear,
    })),
  );
}

export interface GearOption {
  readonly gearId: GearId;
  readonly mk: Mk;
  readonly label: string;
  readonly price: number;
  readonly affordable: boolean;
  readonly delta: string;
}

export function gearOptions(build: Build, slot: SlotRef, banked: number): GearOption[] {
  const current = gearAt(build, slot);
  const refund = current ? resaleValue(gearCost(current)) : 0;
  const before = statsFor(build);
  return GEAR_IDS.filter((gearId) => GEAR[gearId].slot === slot.type).flatMap((gearId) =>
    MK_LEVELS.map((mk) => {
      const price = gearCost({ gearId, mk });
      return {
        gearId,
        mk,
        label: gearLabel({ gearId, mk }),
        price,
        affordable: banked + refund >= price,
        delta: describeDelta(before, statsFor(withGear(build, slot, { gearId, mk }))),
      };
    }),
  );
}

export interface HullCard {
  readonly hullId: HullId;
  readonly name: string;
  readonly price: number;
  readonly current: boolean;
  readonly affordable: boolean;
  readonly slots: string;
  readonly stats: readonly string[];
}

export function hullCards(build: Build, banked: number): HullCard[] {
  const refund = resaleValue(HULLS[build.hullId].cost);
  return HULL_IDS.map((hullId) => {
    const hull = HULLS[hullId];
    const current = hullId === build.hullId;
    return {
      hullId,
      name: hull.name,
      price: hull.cost,
      current,
      affordable: !current && banked + refund >= hull.cost,
      slots: SLOT_TYPES.map((type) => `${SLOT_LETTERS[type]}${hull.slots[type]}`).join(' '),
      stats: [`Hull ${hull.maxHull}`, `Speed ${hull.maxSpeed}`, `Cargo ${hull.cargoCapacity}`],
    };
  });
}

export interface RocketOffer {
  readonly missing: number;
  readonly fillPrice: number;
  readonly canBuyOne: boolean;
  readonly canFill: boolean;
}

export function rocketOffer(self: SelfState): RocketOffer {
  const missing = Math.max(0, self.maxRockets - self.rockets);
  const fillPrice = missing * ROCKET_PRICE;
  return {
    missing,
    fillPrice,
    canBuyOne: missing > 0 && self.bankedCredits >= ROCKET_PRICE,
    canFill: missing > 0 && self.bankedCredits >= fillPrice,
  };
}
```

- [ ] **Step 4: Run model tests** — Expected: PASS.

- [ ] **Step 5: Implement** `packages/client/src/ui/BuildMenu.ts`

```ts
import {
  MAX_ROCKETS_PER_PURCHASE,
  statsFor,
  type ClientMessage,
  type SelfState,
  type ShopFailure,
  type ShopResultMessage,
  type SlotRef,
} from '@arena/shared';
import { gearOptions, hullCards, rocketOffer, slotRows, statSummary } from './buildMenuModel';

type Tab = 'ship' | 'hulls' | 'rockets';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'ship', label: 'Ship' },
  { id: 'hulls', label: 'Hulls' },
  { id: 'rockets', label: 'Rockets' },
];

const FAILURE_TEXT: Readonly<Record<ShopFailure, string>> = {
  not_docked: 'Dock first',
  insufficient_credits: 'Not enough banked credits',
  slot_mismatch: 'That item does not fit this slot',
  rocket_cap: 'Rocket racks are full',
  unknown_item: 'Not available',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
  const node = element('button', text);
  node.type = 'button';
  node.disabled = !enabled;
  node.addEventListener('click', onClick);
  return node;
}

export class BuildMenu {
  private tab: Tab = 'ship';
  private selectedSlot: SlotRef | null = null;
  private self: SelfState | null = null;
  private renderedKey = '';
  private resultText = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly send: (message: ClientMessage) => void,
  ) {}

  update(self: SelfState): void {
    this.root.hidden = !self.docked;
    this.self = self;
    if (!self.docked) {
      this.selectedSlot = null;
      return;
    }
    this.render();
  }

  showResult(message: ShopResultMessage): void {
    this.resultText = message.ok ? 'Done' : FAILURE_TEXT[message.reason];
    this.render(true);
  }

  private render(force = false): void {
    const self = this.self;
    if (!self) return;
    const key = JSON.stringify([self.build, self.bankedCredits, self.rockets, this.tab, this.selectedSlot, this.resultText]);
    if (!force && key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.replaceChildren(
      this.tabBar(),
      element('div', statSummary(statsFor(self.build)).join(' · '), 'summary'),
      element('div', `Banked ${self.bankedCredits} cr`, 'summary'),
      this.tabBody(self),
      element('div', this.resultText, 'result'),
    );
  }

  private select(tab: Tab): void {
    this.tab = tab;
    this.render();
  }

  private tabBar(): HTMLElement {
    const bar = element('div', '', 'tabs');
    for (const tab of TABS) {
      const node = button(tab.label, tab.id !== this.tab, () => this.select(tab.id));
      bar.append(node);
    }
    return bar;
  }

  private tabBody(self: SelfState): HTMLElement {
    if (this.tab === 'hulls') return this.hullsTab(self);
    if (this.tab === 'rockets') return this.rocketsTab(self);
    return this.shipTab(self);
  }

  private shipTab(self: SelfState): HTMLElement {
    const body = element('div', '', 'list');
    for (const row of slotRows(self.build)) {
      const line = element('div', '', 'row');
      const icon = element('img');
      icon.alt = '';
      if (row.gear) icon.src = `/ui/gear_${row.gear.gearId}.png`;
      line.append(
        icon,
        element('span', row.label),
        button('Change', true, () => {
          this.selectedSlot = row.slot;
          this.render();
        }),
        button('Sell', row.gear !== null, () => this.send({ type: 'sellGear', slot: row.slot })),
      );
      body.append(line);
    }
    if (this.selectedSlot) body.append(this.gearList(self, this.selectedSlot));
    return body;
  }

  private gearList(self: SelfState, slot: SlotRef): HTMLElement {
    const list = element('div', '', 'list options');
    for (const option of gearOptions(self.build, slot, self.bankedCredits)) {
      const line = element('div', '', 'row');
      line.append(
        element('span', option.label),
        element('span', `${option.price} cr`),
        element('span', option.delta, 'delta'),
        button('Buy', option.affordable, () =>
          this.send({ type: 'buyGear', gearId: option.gearId, mk: option.mk, slot }),
        ),
      );
      list.append(line);
    }
    return list;
  }

  private hullsTab(self: SelfState): HTMLElement {
    const body = element('div', '', 'list');
    for (const card of hullCards(self.build, self.bankedCredits)) {
      const line = element('div', '', 'row');
      const icon = element('img');
      icon.src = `/ships/ship_${card.hullId}.png`;
      icon.alt = '';
      line.append(
        icon,
        element('span', `${card.name} — ${card.slots} — ${card.stats.join(', ')}`),
        element('span', card.current ? 'Current' : `${card.price} cr`),
        button('Buy', card.affordable, () => this.send({ type: 'buyHull', hullId: card.hullId })),
      );
      body.append(line);
    }
    return body;
  }

  private rocketsTab(self: SelfState): HTMLElement {
    const offer = rocketOffer(self);
    const body = element('div', '', 'list');
    const line = element('div', '', 'row');
    const icon = element('img');
    icon.src = '/ui/icon_rocket.png';
    icon.alt = '';
    line.append(
      icon,
      element('span', `Rockets ${self.rockets} / ${self.maxRockets}`),
      button('+1', offer.canBuyOne, () => this.send({ type: 'buyRockets', count: 1 })),
      button(`Fill (${offer.fillPrice} cr)`, offer.canFill, () =>
        this.send({ type: 'buyRockets', count: Math.min(offer.missing, MAX_ROCKETS_PER_PURCHASE) }),
      ),
    );
    body.append(line);
    return body;
  }
}
```

- [ ] **Step 6: Wire the session**
  - `Connection.ts`: `SERVER_MESSAGE_TYPES` becomes `new Set(['welcome', 'snapshot', 'died', 'shopResult', 'kicked'])`.
  - `GameSession.ts`:
    - Replace the `ShopPanel` import and field with `BuildMenu` (`private readonly menu: BuildMenu`); construct with `new BuildMenu(dom.shop, (message) => connection.send(message))`.
    - Replace the field initializer `private readonly input = new InputSampler();` with a constructor-created `this.input = new InputSampler(() => this.connection.send({ type: 'dock' }));` (declare `private readonly input: InputSampler;` and assign it in the constructor body).
    - `handle`: replace the `'buyResult'` case with `case 'shopResult': this.menu.showResult(message); return;`.
    - `onSnapshot`: `this.menu.update(snapshot.self);` instead of `this.shop.update(...)`.
    - `draw`: own ship state uses `hullId: self.build.hullId` instead of `hullTier`.
  - Delete `ShopPanel.ts` and `test/shop.test.ts`.
  - `style.css`: append
    ```css
    #shop { min-width: 520px; max-height: 60vh; overflow-y: auto; }
    #shop .tabs { display: flex; gap: 6px; }
    #shop .tabs button:disabled { opacity: 1; background: #1f4f8a; }
    #shop .summary { font-size: 13px; color: #9fb4d9; }
    #shop .list { display: grid; gap: 4px; }
    #shop .options { margin-top: 6px; padding-top: 6px; border-top: 1px solid #2a3a66; }
    #shop .row { grid-template-columns: 32px 1fr auto auto; }
    #shop .options .row { grid-template-columns: 1fr auto 1.2fr auto; }
    #shop .delta { font-size: 12px; color: #3cffb0; }
    ```

- [ ] **Step 7: Update `controls.md`**: in the keyboard table add rows `| \`E\` | Dock / undock at a station |` and `| \`R\` (hold) | Fire homing rockets |`; change the Mouse row to "Click tabs and **Buy** / **Sell** / **Change** in the build menu (only while docked)"; replace the Docking bullet with: "**Docking:** fly within 200 px of a station, slow down (≤ 60 px/s), avoid damage for 5 s, press `E`. The ship snaps to the station and is frozen; ore is sold, carried credits are banked, hull is repaired and the build menu opens. Press `E` again to undock; docking is then unavailable for 30 s."; add bullets "**Rockets:** lock the nearest enemy within 1 200 px in front of you and home in; 30 damage each. New pilots get 10, every respawn gives 5, death loses carried rockets. Buy more in the build menu (25 cr each)." and "**Builds:** buy hulls (Scout, Fighter, Freighter, Gunship) and install Mk1–Mk3 gear into weapon, shield, engine and utility slots. Replaced or sold gear refunds 50%. Death resets you to a Scout with starter gear."

- [ ] **Step 8: Run lane gates** including `pnpm --filter @arena/client build`. Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add -A packages/client controls.md
git commit -m "feat(client): add build menu, wire docking and rockets into the session"
```

---

## Art lane (worktree `builds-art`) — Task X1: Sprites (Codex)

- [ ] Codex reads `assets/STYLE.md` (including "Ship builds update") and `assets/manifest.json`, generates every PNG in the manifest that is missing (16 files: 4 hulls, `bullet_cannon`, `rocket`, `rocket_trail`, `icon_rocket`, 7 `gear_*`), at exact dimensions with transparency, consistent with the existing art.
- [ ] `pnpm assets:check` prints `assets ok`.
- [ ] Commit `feat(assets): add hull, rocket and gear sprites` (PNG files only, no attribution).

---

## Task M1: Merge, full gates, playtest (coordinator)

- [ ] Merge `builds-server`, `builds-client`, `builds-art` into `master` (`--no-ff`).
- [ ] Run `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm lint && pnpm assets:check && pnpm build`. Any failure → dispatch a fix worker with the failing output; no coordinator edits to product code.
- [ ] Review the new sprites in a contact sheet (hulls distinct, nose up, icons readable).
- [ ] Scripted playtest against `pnpm start`: E-dock near a station (snap + frozen), buy gear and a hull, undock, cooldown blocks re-dock, rockets home and kill, victim respawns with 5 rockets and the starter build, restart keeps build and rockets, legacy `arena.db` migrates with refund.
- [ ] Report per task with evidence.
