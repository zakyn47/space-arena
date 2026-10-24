# Pirates and Mining Laser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Under Orca orchestration, follow the DAG below.

**Goal:** Add AI pirate patrols in three tiers with loot crates, a mining laser utility gear driven by the F key, and a 3-item salvage hold for dropped gear.

**Architecture:** Pirates are ordinary `ShipEntity`s tagged with `npc`. A `PirateDirector` owns patrols (spawn, respawn, shared target) and asks a pure `pirateInput` brain for each pirate's `ShipInput` every tick, so all physics and combat code is reused. Mining is a pure `Mining` module invoked from `World.stepShips`. Loot rules move into a pure `Loot` module. Salvage is a ship field with two new shop actions; persistence goes to schema v3.

**Tech Stack:** unchanged.

**Spec:** `docs/superpowers/specs/2026-10-24-pirates-mining-design.md`

## Global Constraints

- TypeScript strict, no `any`, no casts beyond existing test helpers. No what-comments. Never add `Co-Authored-By` or AI attribution. One commit per task with the given message. Do not push.
- Tier table, patrol counts, brain distances (aggro 800, attack 450, lose 1 600, waypoint 150, zone margin 200, patrol speed 60%, shield < 40% hull & > 30 energy), respawn 60 s, mining table (1/2/3.5 ore/s, 150/200/250 px, 300/800/1 800 cr), cone ±45°, reserve = 2 × yield, salvage capacity 3 — exactly as the spec.
- Starter build utility = `mining_laser` Mk1 (value 1 050, bounty 362).
- Pirates: never persisted, never in `died` events, never pick up loot, projectiles from pirates never hit pirates, pirate rockets lock only players, no PvP bounty for or by pirates.
- **Gates.** Phase A: `pnpm exec tsc -p packages/shared && pnpm exec vitest run packages/shared && pnpm lint`. Server lane: `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/server && pnpm exec vitest run packages/shared packages/server && pnpm lint`. Client lane: `pnpm exec tsc -p packages/shared && pnpm exec tsc -p packages/client && pnpm exec vitest run packages/shared packages/client && pnpm lint && pnpm --filter @arena/client build`. After merge: `pnpm typecheck && pnpm test && pnpm lint && pnpm assets:check && pnpm build`. Between Phase A and merge, the other package is expected not to compile.

## Orchestration (Orca)

| Task | Worker | Placement | Depends on |
|---|---|---|---|
| A1 Shared: mining gear, pirates catalog, salvage, protocol, assets contract | Sonnet | master | — |
| S1 Persistence v3 + salvage on ships | Sonnet | worktree `pirates-server` | A1 |
| S2 Entities, npc combat rules, asteroid reserve, mining | same | same | S1 |
| S3 Loot, crates with gear, salvage shop | same | same | S2 |
| S4 Pirate tiers + brain | same | same | S3 |
| S5 Director + World integration | same | same | S4 |
| S6 Snapshot, app, integration | same | same | S5 |
| C1 Input F + rendering (pirates, labels, beam, salvage badge) | Sonnet | worktree `pirates-client` | A1 |
| C2 HUD + build menu salvage + controls.md | same | same | C1 |
| X1 Sprites | Codex via `orca worktree create --agent codex --prompt` | worktree `pirates-art` | A1 |
| M1 Merge, gates, playtest | Opus | master | S6, C2, X1 |

---

## Phase A (master)

### Task A1: Shared catalog, salvage, protocol, asset contract

**Files:**
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/catalog/gear.ts`, `packages/shared/src/build.ts`, `packages/shared/src/physics.ts`, `packages/shared/src/protocol.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/catalog/pirates.ts`
- Modify tests: `packages/shared/test/build.test.ts`, `packages/shared/test/protocol.test.ts`, `packages/shared/test/physics.test.ts` (only if it builds inputs without `mine`), `packages/shared/test/assets.test.ts`
- Modify: `assets/manifest.json`, `assets/STYLE.md`

**Interfaces — Produces:** `SALVAGE_CAPACITY`, `MINING_CONE`; `GEAR_IDS` gains `'mining_laser'` (appended last); `MiningEffect { kind: 'mining'; rate; range }`; `ShipStats.miningRate`, `ShipStats.miningRange`; `STARTER_BUILD` with mining laser; `parseSalvage(value): InstalledGear[] | null`; `PIRATE_TIERS`, `PirateTier`, `PIRATE_NAMES`; `ShipInput.mine`; protocol additions (spec §6) including `ShopAction` with `installSalvage` and `sellSalvage`.

- [ ] **Step 1: Write failing tests** — append to `packages/shared/test/build.test.ts`:
```ts
import { parseSalvage } from '../src/build';

describe('mining and salvage', () => {
  it('gives the starter build a mining laser', () => {
    const stats = statsFor(STARTER_BUILD);
    expect(stats.miningRate).toBe(1);
    expect(stats.miningRange).toBe(150);
    expect(buildValue(STARTER_BUILD)).toBe(1_050);
  });

  it('stacks mining rates and keeps the longest range', () => {
    const freighter = {
      hullId: 'freighter' as const,
      slots: {
        weapon: [null],
        shield: [null],
        engine: [null],
        utility: [{ gearId: 'mining_laser' as const, mk: 1 as const }, { gearId: 'mining_laser' as const, mk: 3 as const }, null],
      },
    };
    expect(statsFor(freighter).miningRate).toBe(4.5);
    expect(statsFor(freighter).miningRange).toBe(250);
  });

  it('parses salvage lists up to capacity', () => {
    expect(parseSalvage([{ gearId: 'armor', mk: 2 }])).toEqual([{ gearId: 'armor', mk: 2 }]);
    expect(parseSalvage([])).toEqual([]);
    expect(parseSalvage([{ gearId: 'armor', mk: 1 }, { gearId: 'armor', mk: 1 }, { gearId: 'armor', mk: 1 }, { gearId: 'armor', mk: 1 }])).toBeNull();
    expect(parseSalvage([{ gearId: 'nope', mk: 1 }])).toBeNull();
  });
});
```
Update existing expectations in `build.test.ts`: the starter `toMatchObject` stays valid; `buildValue(STARTER_BUILD)` in "prices the starter build" becomes `1_050`; in `refitToHull` "keeps gear that fits a bigger hull", additionally `expect(build.slots.utility).toEqual([{ gearId: 'mining_laser', mk: 1 }])`.

Append to `packages/shared/test/protocol.test.ts` (inside the describe):
```ts
  it('accepts salvage actions and the mine flag', () => {
    expect(parse({ ...input, mine: true })).not.toBeNull();
    expect(parse({ type: 'installSalvage', index: 2, slot: { type: 'utility', index: 0 } })).not.toBeNull();
    expect(parse({ type: 'sellSalvage', index: 0 })).not.toBeNull();
    expect(parse({ type: 'sellSalvage', index: 3 })).toBeNull();
  });
```
and add `mine: false` to the `input` fixture object at the top of the file (the existing "without the rocket flag" test keeps working because its explicit literal must now also include `mine: false`; update that literal accordingly).

In `packages/shared/test/assets.test.ts` add to `required`: `'pirate_raider', 'pirate_marauder', 'pirate_warlord', 'mining_beam', 'gear_mining_laser', 'icon_salvage'`.

- [ ] **Step 2: Run** `pnpm exec vitest run packages/shared` — Expected: FAIL.

- [ ] **Step 3: Implement**

`constants.ts` append:
```ts
export const SALVAGE_CAPACITY = 3;
export const MINING_CONE = Math.PI / 4;
```

`catalog/gear.ts`:
- `GEAR_IDS` append `'mining_laser'` as the last element.
- Add:
  ```ts
  export interface MiningEffect {
    readonly kind: 'mining';
    readonly rate: number;
    readonly range: number;
  }
  ```
  and include it in `GearEffect`.
- Add helper:
  ```ts
  function mining(cost: number, rate: number, range: number): GearTier {
    return { cost, effect: { kind: 'mining', rate, range } };
  }
  ```
- Add to `GEAR`:
  ```ts
  mining_laser: {
    id: 'mining_laser',
    name: 'Mining Laser',
    slot: 'utility',
    tiers: [mining(300, 1, 150), mining(800, 2, 200), mining(1_800, 3.5, 250)],
  },
  ```

`catalog/pirates.ts`:
```ts
export const PIRATE_TIERS = ['raider', 'marauder', 'warlord'] as const;

export type PirateTier = (typeof PIRATE_TIERS)[number];

export const PIRATE_NAMES: Readonly<Record<PirateTier, string>> = {
  raider: 'Raider',
  marauder: 'Marauder',
  warlord: 'Warlord',
};
```

`build.ts`:
- `ShipStats` adds `readonly miningRate: number; readonly miningRange: number;`.
- In `statsFor` add `let miningRate = 0; let miningRange = 0;`, the switch case
  ```ts
      case 'mining':
        miningRate += effect.rate;
        miningRange = Math.max(miningRange, effect.range);
        break;
  ```
  and return both fields.
- `STARTER_BUILD.slots.utility` becomes `[{ gearId: 'mining_laser', mk: 1 }]`.
- Add:
  ```ts
  const SalvageSchema = z.array(InstalledGearSchema).max(SALVAGE_CAPACITY);

  export function parseSalvage(value: unknown): InstalledGear[] | null {
    const parsed = SalvageSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }
  ```
  (import `SALVAGE_CAPACITY` from `./constants`).

`physics.ts`: `ShipInput` adds `readonly mine: boolean;`; `IDLE_INPUT` adds `mine: false`.

`protocol.ts`:
- `InputSchema` adds `mine: z.boolean()`.
- Add schemas and include them in the discriminated union:
  ```ts
  const SalvageIndexSchema = z.number().int().min(0).max(SALVAGE_CAPACITY - 1);

  const InstallSalvageSchema = z
    .object({ type: z.literal('installSalvage'), index: SalvageIndexSchema, slot: SlotRefSchema })
    .strict();

  const SellSalvageSchema = z.object({ type: z.literal('sellSalvage'), index: SalvageIndexSchema }).strict();
  ```
- `ShopAction` = `Extract<ClientMessage, { type: 'buyHull' | 'buyGear' | 'sellGear' | 'buyRockets' | 'installSalvage' | 'sellSalvage' }>`.
- `ShipState` adds `readonly npc: PirateTier | null; readonly miningTargetId: number | null;`.
- `CrateState` adds `readonly hasGear: boolean;`.
- `SelfState` adds `readonly salvage: readonly InstalledGear[]; readonly miningTargetId: number | null;`.
- Imports: `SALVAGE_CAPACITY`, `type InstalledGear`, `type PirateTier`.

`index.ts` append `export * from './catalog/pirates';`.

- [ ] **Step 4: Assets contract** — add to `assets/manifest.json` (same one-line format):
```json
{ "id": "pirate_raider", "file": "ships/pirate_raider.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "pirate_marauder", "file": "ships/pirate_marauder.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "pirate_warlord", "file": "ships/pirate_warlord.png", "width": 64, "height": 64, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "mining_beam", "file": "fx/mining_beam.png", "width": 16, "height": 64, "anchor": [0.5, 1], "frames": 1 },
{ "id": "gear_mining_laser", "file": "ui/gear_mining_laser.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 },
{ "id": "icon_salvage", "file": "ui/icon_salvage.png", "width": 48, "height": 48, "anchor": [0.5, 0.5], "frames": 1 }
```
Append to `assets/STYLE.md`:
```markdown

## Pirates and mining update

- Pirate ships (64×64, nose up, same top-down rendering as the player fleet): red `#E0403A` and black livery, jagged hostile silhouettes, scavenged mismatched armor plates.
  - `pirate_raider`: small scrappy interceptor with one gun.
  - `pirate_marauder`: medium aggressive raider with twin guns and spiked wings.
  - `pirate_warlord`: large heavily armored flagship, multiple barrels, skull-like prow.
- `mining_beam` (16×64): vertical teal `#3CFFB0` energy beam with a bright white core, seamlessly tileable top-to-bottom, transparent edges.
- `gear_mining_laser` (48×48): UI glyph, drill emitter with a small beam.
- `icon_salvage` (48×48): UI glyph, gear cog over a crate.
```

- [ ] **Step 5: Run Phase A gates.** Expected: PASS. (`pnpm assets:check` fails until X1.)

- [ ] **Step 6: Commit**
```bash
git add -A packages/shared assets
git commit -m "feat(shared): add mining laser, pirate tiers, salvage and protocol"
```

---

## Server lane (worktree `pirates-server`, first run `pnpm install --frozen-lockfile`)

### Task S1: Persistence v3 + salvage on ships

**Files:** Modify `packages/server/src/db/migrations.ts`, `packages/server/src/db/PlayerRepository.ts`, `packages/server/test/support/fixtures.ts`, `packages/server/test/PlayerRepository.test.ts`.

**Interfaces — Produces:** `SCHEMA_VERSION = 3`; `ShipRecord.salvage: readonly InstalledGear[]`.

- [ ] **Step 1: Tests** — in `PlayerRepository.test.ts`:
  - Every expected `ShipRecord` object gains `salvage: []`; the round-trip test uses `salvage: [{ gearId: 'armor', mk: 2 }]` and expects it back.
  - Add:
    ```ts
    describe('migration to version 3', () => {
      it('adds an empty salvage hold to version-2 ships', async () => {
        const path = join(await mkdtemp(join(tmpdir(), 'v2-')), 'arena.db');
        const db = new Database(path);
        db.exec(`
          CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
          CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
          CREATE TABLE ships (account_id INTEGER PRIMARY KEY REFERENCES accounts(id), banked_credits INTEGER NOT NULL, hull_id TEXT NOT NULL, gear_json TEXT NOT NULL, rockets INTEGER NOT NULL, pos_x REAL NOT NULL, pos_y REAL NOT NULL, updated_at INTEGER NOT NULL);
          INSERT INTO accounts (username, password_hash, created_at) VALUES ('alice', 'hash', 1);
          PRAGMA user_version = 2;
        `);
        db.prepare('INSERT INTO ships VALUES (1, 77, ?, ?, 3, 5, 6, 1)').run('scout', JSON.stringify(STARTER_BUILD.slots));
        db.close();
        const repo3 = PlayerRepository.open(path);
        expect(repo3.loadShip(1)).toMatchObject({ bankedCredits: 77, rockets: 3, salvage: [] });
        repo3.close();
      });

      it('falls back to an empty hold for invalid salvage', async () => {
        const path = join(await mkdtemp(join(tmpdir(), 'bad-salvage-')), 'arena.db');
        const warnings: string[] = [];
        const first = PlayerRepository.open(path);
        const id = first.createAccount('alice', 'hash', 1);
        first.saveShips([{ accountId: id, bankedCredits: 0, build: STARTER_BUILD, rockets: 4, salvage: [], x: 1, y: 2 }], 1);
        first.close();
        const db = new Database(path);
        db.prepare("UPDATE ships SET salvage_json = '[{\"gearId\":\"x\",\"mk\":9}]'").run();
        db.close();
        const second = PlayerRepository.open(path, (message) => warnings.push(message));
        expect(second.loadShip(id).salvage).toEqual([]);
        expect(warnings.some((w) => w.includes('salvage'))).toBe(true);
        second.close();
      });
    });
    ```
  - The version-1 migration test expects `salvage: []` in the loaded record.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**
  - `migrations.ts`: `SCHEMA_VERSION = 3`. Rename the existing post-version-check body into `function toVersion2(db): void { if (hasColumn(db, 'ships', 'hull_tier')) migrateTierShips(db); else db.exec(SHIPS_V2); }`. Add `function toVersion3(db): void { db.exec("ALTER TABLE ships ADD COLUMN salvage_json TEXT NOT NULL DEFAULT '[]'"); }`. New `migrate`:
    ```ts
    export function migrate(db: Database.Database): void {
      db.exec(BASE_SCHEMA);
      const from = userVersion(db);
      if (from >= SCHEMA_VERSION) return;
      db.transaction(() => {
        if (from < 2) toVersion2(db);
        if (from < 3) toVersion3(db);
        db.pragma(`user_version = ${SCHEMA_VERSION}`);
      })();
    }
    ```
  - `PlayerRepository.ts`: `ShipRecord` adds `readonly salvage: readonly InstalledGear[];`. Upsert adds `salvage_json` column/param (`JSON.stringify(record.salvage)`) and `salvage_json = excluded.salvage_json`; `ShipParams` gains a `string`. Select adds `salvage_json`; `ShipDbRow` adds `salvage_json: string`. Load uses:
    ```ts
    private decodeSalvage(accountId: number, row: ShipDbRow): InstalledGear[] {
      const salvage = parseSalvage(safeJson(row.salvage_json));
      if (salvage) return salvage;
      this.warn(`invalid stored salvage for account ${accountId}; using empty hold`);
      return [];
    }
    ```
    `defaultShip` sets `salvage: []`.
  - `fixtures.ts`: `shipRecord` adds `salvage: []`.
- [ ] **Step 4: Run** `pnpm exec vitest run packages/server/test/PlayerRepository.test.ts` — PASS (other server files may not compile until S2; run full lane gates from S2).
- [ ] **Step 5: Commit** `feat(server): persist salvage holds with schema v3`

---

### Task S2: Entities, npc combat rules, asteroid reserve, mining

**Files:**
- Create: `packages/server/src/world/Mining.ts`
- Modify: `packages/server/src/world/entities.ts`, `Combat.ts`, `Rockets.ts`, `AsteroidField.ts`, `World.ts`
- Test: `packages/server/test/Mining.test.ts`, `packages/server/test/World.mining.test.ts` (append), `packages/server/test/Rockets.test.ts` (append), `packages/server/test/Combat.test.ts` (update)

**Interfaces — Produces:**
- `ShipEntity` adds `npc: PirateTier | null; salvage: InstalledGear[]; miningProgress: number; miningTargetId: number | null;` (`createShip` sets `null`, `record.salvage` copy, `0`, `null`; `respawnShip` sets `salvage: []`, `miningProgress: 0`, `miningTargetId: null`; `toShipRecord` includes `salvage`).
- `BulletEntity` and `RocketEntity` add `readonly fromNpc: boolean`.
- `AsteroidEntity` adds `ore: number` (reserve). `AsteroidFields = Omit<AsteroidEntity, 'kind' | 'id' | 'ore'> & { readonly ore?: number }`; `World.addAsteroid` sets `ore: fields.ore ?? fields.oreYield * 2`.
- `Mining.ts`: `canMine(ship, inSafeZone): boolean`, `findMiningTarget(ship, candidates: Iterable<AsteroidEntity>): AsteroidEntity | null`, `mineStep(ship, asteroid, dt): void`.
- `acquireTarget` skips npc candidates when the shooter is npc.

- [ ] **Step 1: Write failing tests**

`packages/server/test/Mining.test.ts`:
```ts
import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip, type AsteroidEntity } from '../src/world/entities';
import { canMine, findMiningTarget, mineStep } from '../src/world/Mining';
import { shipRecord } from './support/fixtures';

const miner = () => {
  const ship = createShip(1, 1, 'alice', shipRecord(1_000, 1_000, 1));
  ship.input = { ...IDLE_INPUT, mine: true };
  return ship;
};

const rock = (id: number, x: number, y: number, ore = 6): AsteroidEntity => ({
  kind: 'asteroid', id, x, y, radius: 40, hp: 80, oreYield: 3, ore, variant: 1,
});

describe('canMine', () => {
  it('requires F, a laser, free cargo, no firing, no shield, not docked, not in a zone', () => {
    expect(canMine(miner(), false)).toBe(true);
    expect(canMine(miner(), true)).toBe(false);
    const firing = miner();
    firing.input = { ...firing.input, fire: true };
    expect(canMine(firing, false)).toBe(false);
    const full = miner();
    full.ore = full.stats.cargoCapacity;
    expect(canMine(full, false)).toBe(false);
    const idle = miner();
    idle.input = IDLE_INPUT;
    expect(canMine(idle, false)).toBe(false);
  });
});

describe('findMiningTarget', () => {
  it('picks the nearest asteroid surface in range and in the forward cone', () => {
    const ship = miner();
    const near = rock(2, 1_000, 850);
    const farther = rock(3, 1_050, 820);
    const behind = rock(4, 1_000, 1_100);
    const outOfRange = rock(5, 1_000, 700);
    expect(findMiningTarget(ship, [farther, near, behind, outOfRange])?.id).toBe(2);
    expect(findMiningTarget(ship, [behind, outOfRange])).toBeNull();
  });
});

describe('mineStep', () => {
  it('moves whole ore units into cargo at the laser rate', () => {
    const ship = miner();
    const asteroid = rock(2, 1_000, 850);
    mineStep(ship, asteroid, 0.6);
    expect(ship.ore).toBe(0);
    mineStep(ship, asteroid, 0.6);
    expect(ship.ore).toBe(1);
    expect(asteroid.ore).toBe(5);
    expect(ship.miningTargetId).toBe(2);
  });

  it('resets progress when the target changes', () => {
    const ship = miner();
    mineStep(ship, rock(2, 1_000, 850), 0.6);
    mineStep(ship, rock(3, 1_000, 850), 0.6);
    expect(ship.ore).toBe(0);
  });
});
```

Append to `World.mining.test.ts`:
```ts
describe('World mining laser', () => {
  it('drills ore into cargo and crumbles an empty asteroid', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.addAsteroid({ x: OPEN_SPACE.x, y: OPEN_SPACE.y - 150, radius: 40, hp: 80, oreYield: 1, variant: 1 });
    world.setInput(ship.id, 1, { ...IDLE_INPUT, mine: true });
    ticks(world, Math.ceil(2.5 / TICK_DT));
    expect(ship.ore).toBe(2);
    expect(count(world, 'asteroid')).toBe(0);
    expect(count(world, 'ore')).toBe(0);
  });
});
```

Append to `Rockets.test.ts`:
```ts
describe('npc targeting', () => {
  it('pirate rockets ignore other pirates', () => {
    const shooter = at(1, 1_000, 1_000);
    shooter.npc = 'raider';
    const pirate = at(2, 1_000, 800);
    pirate.npc = 'raider';
    const player = at(3, 1_000, 600);
    expect(acquireTarget(shooter, [pirate, player])?.id).toBe(3);
  });
});
```

In `Combat.test.ts`: `bountyFor(STARTER_BUILD)` expectation becomes `BOUNTY_BASE + 262`; the bullet `toMatchObject` adds `fromNpc: false`. In `Shop.test.ts` the "fills an empty utility slot" test now replaces the mining laser: expect `ship.bankedCredits` to be `150` (200 + 150 refund − 200).

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `packages/server/src/world/Mining.ts`
```ts
import { MINING_CONE } from '@arena/shared';
import type { AsteroidEntity, ShipEntity } from './entities';

function headingTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toX - fromX, fromY - toY);
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function canMine(ship: ShipEntity, inSafeZone: boolean): boolean {
  return (
    ship.input.mine &&
    ship.stats.miningRate > 0 &&
    !ship.input.fire &&
    !ship.shieldUp &&
    !ship.docked &&
    !inSafeZone &&
    ship.ore < ship.stats.cargoCapacity
  );
}

export function findMiningTarget(ship: ShipEntity, candidates: Iterable<AsteroidEntity>): AsteroidEntity | null {
  let best: AsteroidEntity | null = null;
  let bestGap = ship.stats.miningRange;
  for (const asteroid of candidates) {
    const gap = Math.hypot(asteroid.x - ship.x, asteroid.y - ship.y) - asteroid.radius;
    if (gap > bestGap) continue;
    const bearing = angleDelta(ship.angle, headingTo(ship.x, ship.y, asteroid.x, asteroid.y));
    if (Math.abs(bearing) > MINING_CONE) continue;
    best = asteroid;
    bestGap = gap;
  }
  return best;
}

export function mineStep(ship: ShipEntity, asteroid: AsteroidEntity, dt: number): void {
  if (ship.miningTargetId !== asteroid.id) {
    ship.miningTargetId = asteroid.id;
    ship.miningProgress = 0;
  }
  ship.miningProgress += ship.stats.miningRate * dt;
  while (ship.miningProgress >= 1 && asteroid.ore > 0 && ship.ore < ship.stats.cargoCapacity) {
    ship.miningProgress -= 1;
    asteroid.ore -= 1;
    ship.ore += 1;
  }
}
```

Note the "drills ore" world test: yield 1 → reserve 2; Mk1 = 1 ore/s; 2 ore after ~2 s, then the asteroid crumbles.

- [ ] **Step 4: Other changes**
  - `entities.ts`: fields listed in Interfaces. `createShip(id, accountId, name, record)` keeps its signature; `npc: null`, `salvage: [...record.salvage]`, `miningProgress: 0`, `miningTargetId: null`.
  - `Combat.ts` `fireWeapons`: bullets get `fromNpc: ship.npc !== null`.
  - `Rockets.ts`: `launchRocket` sets `fromNpc: ship.npc !== null`; in `acquireTarget` add `if (shooter.npc !== null && ship.npc !== null) continue;` after the self/docked check.
  - `AsteroidField.ts`: `AsteroidFields` type per Interfaces (`randomAsteroid` keeps returning no `ore`).
  - `World.ts`:
    - `addAsteroid(fields)` builds `{ kind: 'asteroid', id, ...fields, ore: fields.ore ?? fields.oreYield * 2 }`.
    - In `stepShips`, after rockets and still inside the non-docked branch:
      ```ts
      this.stepMining(ship, dt, inSafeZone);
      ```
      and in the docked branch set `ship.miningTargetId = null;`.
    - Add:
      ```ts
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
      ```
      (The grid is from the previous tick; asteroids are static, and the `has` check drops removed ones.)
    - `isHit` ship case: `return entity.id !== projectile.ownerId && !(projectile.fromNpc && entity.npc !== null) && this.sweptDistance(projectile, entity) <= SHIP_RADIUS;`
    - `collectPickups`: skip ships with `ship.npc !== null`.
    - `resolveDeaths`: bounty only when both are players: `if (killer && killer.npc === null && ship.npc === null) killer.carriedCredits += bountyFor(ship.build);` (pirate deaths are handled in S5; for now pirates do not exist yet).
    - `allShips()` is renamed `playerShips()` and returns only ships with `npc === null`; update `app.ts` `saveAll` to call `world.playerShips()`.
- [ ] **Step 5: Run lane gates.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(server): add mining laser and npc-aware combat rules`

---

### Task S3: Loot, crates with gear, salvage shop

**Files:**
- Create: `packages/server/src/world/Loot.ts`
- Modify: `entities.ts` (crate gear), `World.ts` (dropCrate, collectCrate), `Shop.ts`
- Test: `packages/server/test/Loot.test.ts`, `packages/server/test/World.salvage.test.ts`, append to `packages/server/test/Shop.test.ts`

**Interfaces — Produces:** `CrateEntity.gear: InstalledGear | null`; `randomGear(rng, mks): InstalledGear`; `playerDeathCrates(ship): CrateDrop[]` where `CrateDrop = { ore; credits; gear: InstalledGear | null }`; `takeCrate(ship, crate): CrateDrop | null` returning the leftover crate contents (or `null` when fully taken); shop `installSalvage`, `sellSalvage`.

- [ ] **Step 1: Tests**

`packages/server/test/Loot.test.ts`:
```ts
import { GEAR_IDS, SALVAGE_CAPACITY } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip } from '../src/world/entities';
import { playerDeathCrates, randomGear, takeCrate } from '../src/world/Loot';
import { seeded, shipRecord } from './support/fixtures';

const ship = () => createShip(1, 1, 'alice', shipRecord(0, 0, 1));

describe('randomGear', () => {
  it('picks a catalog item within the allowed marks', () => {
    const rng = seeded(5);
    for (let i = 0; i < 100; i += 1) {
      const gear = randomGear(rng, [2, 3]);
      expect(GEAR_IDS).toContain(gear.gearId);
      expect([2, 3]).toContain(gear.mk);
    }
  });
});

describe('playerDeathCrates', () => {
  it('puts ore, half the carried credits and the first salvage item in one crate, and each other item in its own', () => {
    const victim = ship();
    victim.ore = 4;
    victim.carriedCredits = 101;
    victim.salvage = [{ gearId: 'armor', mk: 1 }, { gearId: 'thruster', mk: 2 }];
    expect(playerDeathCrates(victim)).toEqual([
      { ore: 4, credits: 50, gear: { gearId: 'armor', mk: 1 } },
      { ore: 0, credits: 0, gear: { gearId: 'thruster', mk: 2 } },
    ]);
  });

  it('drops nothing for an empty ship', () => {
    expect(playerDeathCrates(ship())).toEqual([]);
  });
});

describe('takeCrate', () => {
  it('takes everything when the hold has room', () => {
    const looter = ship();
    expect(takeCrate(looter, { ore: 2, credits: 40, gear: { gearId: 'armor', mk: 1 } })).toBeNull();
    expect(looter.salvage).toEqual([{ gearId: 'armor', mk: 1 }]);
    expect(looter.carriedCredits).toBe(40);
    expect(looter.ore).toBe(2);
  });

  it('leaves the gear behind when the hold is full', () => {
    const looter = ship();
    looter.salvage = Array.from({ length: SALVAGE_CAPACITY }, () => ({ gearId: 'armor' as const, mk: 1 as const }));
    expect(takeCrate(looter, { ore: 0, credits: 10, gear: { gearId: 'thruster', mk: 1 } })).toEqual({ ore: 0, credits: 0, gear: { gearId: 'thruster', mk: 1 } });
    expect(looter.carriedCredits).toBe(10);
  });
});
```

`packages/server/test/World.salvage.test.ts`:
```ts
import { IDLE_INPUT, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

describe('World salvage', () => {
  it('drops the victim salvage and lets another ship pick it up', () => {
    const world = new World({ asteroidTarget: 0 });
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bob = world.addShip(2, 'bob', { ...shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2), salvage: [{ gearId: 'armor', mk: 2 }] });
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 300 && world.tick(TICK_DT).died.length === 0; i += 1);
    world.setInput(alice.id, 2, IDLE_INPUT);
    expect(bob.salvage).toEqual([]);
    const carol = world.addShip(3, 'carol', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 3));
    for (let i = 0; i < 2; i += 1) world.tick(TICK_DT);
    expect(carol.salvage).toEqual([{ gearId: 'armor', mk: 2 }]);
  });
});
```

Append to `Shop.test.ts`:
```ts
describe('salvage', () => {
  it('installs salvage for free and refunds the replaced gear', () => {
    const ship = dockedShip(0);
    ship.salvage = [{ gearId: 'pulse_laser', mk: 3 }];
    expect(applyShopAction(ship, buy({ type: 'installSalvage', index: 0, slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: true });
    expect(ship.salvage).toEqual([]);
    expect(ship.stats.weapons[0]?.damage).toBe(19);
    expect(ship.bankedCredits).toBe(125);
  });

  it('rejects wrong slots and bad indexes without changes', () => {
    const ship = dockedShip(0);
    ship.salvage = [{ gearId: 'armor', mk: 1 }];
    expect(applyShopAction(ship, buy({ type: 'installSalvage', index: 0, slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: false, reason: 'slot_mismatch' });
    expect(applyShopAction(ship, buy({ type: 'sellSalvage', index: 2 }))).toEqual({ ok: false, reason: 'unknown_item' });
    expect(ship.salvage).toHaveLength(1);
  });

  it('sells salvage for half its value', () => {
    const ship = dockedShip(0);
    ship.salvage = [{ gearId: 'armor', mk: 2 }];
    expect(applyShopAction(ship, buy({ type: 'sellSalvage', index: 0 }))).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(300);
    expect(ship.salvage).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `packages/server/src/world/Loot.ts`
```ts
import {
  GEAR_IDS,
  LOOT_CREDIT_SHARE,
  SALVAGE_CAPACITY,
  type InstalledGear,
  type Mk,
} from '@arena/shared';
import type { ShipEntity } from './entities';

export interface CrateDrop {
  readonly ore: number;
  readonly credits: number;
  readonly gear: InstalledGear | null;
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
  if (item === undefined) throw new RangeError('cannot pick from an empty list');
  return item;
}

export function randomGear(rng: () => number, mks: readonly Mk[]): InstalledGear {
  return { gearId: pick(rng, GEAR_IDS), mk: pick(rng, mks) };
}

export function playerDeathCrates(ship: ShipEntity): CrateDrop[] {
  const credits = Math.floor(ship.carriedCredits * LOOT_CREDIT_SHARE);
  const [first = null, ...rest] = ship.salvage;
  const main: CrateDrop = { ore: ship.ore, credits, gear: first };
  const extras: CrateDrop[] = rest.map((gear) => ({ ore: 0, credits: 0, gear }));
  const hasMain = main.ore > 0 || main.credits > 0 || main.gear !== null;
  return hasMain ? [main, ...extras] : extras;
}

export function takeCrate(ship: ShipEntity, crate: CrateDrop): CrateDrop | null {
  ship.carriedCredits += crate.credits;
  ship.ore = Math.min(ship.stats.cargoCapacity, ship.ore + crate.ore);
  if (crate.gear === null) return null;
  if (ship.salvage.length < SALVAGE_CAPACITY) {
    ship.salvage.push(crate.gear);
    return null;
  }
  return { ore: 0, credits: 0, gear: crate.gear };
}
```

- [ ] **Step 4: Wire**
  - `entities.ts`: `CrateEntity` adds `readonly gear: InstalledGear | null;`.
  - `World.ts`:
    - Add `private spawnCrate(x: number, y: number, drop: CrateDrop): void` creating a `CrateEntity` with `...drop`, `expiresAt: this.elapsed + CRATE_LIFETIME`.
    - Replace `dropCrate(ship)` body: `playerDeathCrates(ship).forEach((drop, index) => this.spawnCrate(ship.x + index * 12, ship.y, drop));` (call it before `respawnShip`; `respawnShip` now clears `salvage`).
    - Replace `collectCrate` body:
      ```ts
      if (!this.crates.has(crate.id)) return;
      const leftover = takeCrate(ship, crate);
      if (leftover === null) this.crates.delete(crate.id);
      else this.crates.set(crate.id, { ...crate, ...leftover });
      ```
  - `Shop.ts`: add
    ```ts
    function installSalvage(ship: ShipEntity, index: number, slot: SlotRef): ShopOutcome {
      const item = ship.salvage[index];
      if (!item) return fail('unknown_item');
      if (!slotExists(ship.build, slot) || GEAR[item.gearId].slot !== slot.type) return fail('slot_mismatch');
      const current = gearAt(ship.build, slot);
      if (current) ship.bankedCredits += resaleValue(gearCost(current));
      ship.salvage.splice(index, 1);
      equip(ship, withGear(ship.build, slot, item));
      return OK;
    }

    function sellSalvage(ship: ShipEntity, index: number): ShopOutcome {
      const item = ship.salvage[index];
      if (!item) return fail('unknown_item');
      ship.salvage.splice(index, 1);
      ship.bankedCredits += resaleValue(gearCost(item));
      return OK;
    }
    ```
    and the two `case`s in `applyShopAction`.
- [ ] **Step 5: Run lane gates.** PASS.
- [ ] **Step 6: Commit** `feat(server): add salvage crates and salvage shop actions`

---

### Task S4: Pirate tiers + brain

**Files:**
- Create: `packages/server/src/world/pirates/tiers.ts`, `packages/server/src/world/pirates/PirateBrain.ts`
- Test: `packages/server/test/PirateBrain.test.ts`

**Interfaces — Produces:**
- `PirateTierSpec { build; rockets; band: { min; max }; credits; ore; dropChance; dropMks: readonly Mk[] }`, `PIRATE_SPECS: Record<PirateTier, PirateTierSpec>`.
- `Point { x; y }`; `BrainContext { target: ShipEntity | null; waypoint: Point }`; `pirateInput(ship, ctx): ShipInput`; `isValidTarget(candidate): boolean`; brain constants `AGGRO_RANGE = 800`, `ATTACK_RANGE = 450`, `LOSE_RANGE = 1_600`, `WAYPOINT_REACHED = 150`.

- [ ] **Step 1: Write failing test** — `packages/server/test/PirateBrain.test.ts`
```ts
import { SAFE_ZONES } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip, type ShipEntity } from '../src/world/entities';
import { isValidTarget, pirateInput } from '../src/world/pirates/PirateBrain';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function pirate(x = OPEN_SPACE.x, y = OPEN_SPACE.y): ShipEntity {
  const ship = createShip(1, -1, 'Raider', shipRecord(x, y, -1));
  ship.npc = 'raider';
  return ship;
}

const player = (x: number, y: number) => createShip(2, 2, 'alice', shipRecord(x, y, 2));

describe('pirateInput', () => {
  it('turns toward the waypoint and thrusts while slow', () => {
    const input = pirateInput(pirate(), { target: null, waypoint: { x: OPEN_SPACE.x + 1_000, y: OPEN_SPACE.y } });
    expect(input.right).toBe(true);
    expect(input.fire).toBe(false);
  });

  it('caps patrol speed at 60% of max speed', () => {
    const ship = pirate();
    ship.vy = -0.7 * ship.stats.maxSpeed;
    const input = pirateInput(ship, { target: null, waypoint: { x: OPEN_SPACE.x, y: OPEN_SPACE.y - 2_000 } });
    expect(input.thrust).toBe(false);
  });

  it('fires when facing a target in attack range', () => {
    const input = pirateInput(pirate(), { target: player(OPEN_SPACE.x, OPEN_SPACE.y - 300), waypoint: { x: 0, y: 0 } });
    expect(input.fire).toBe(true);
  });

  it('does not fire while badly aimed', () => {
    const input = pirateInput(pirate(), { target: player(OPEN_SPACE.x + 300, OPEN_SPACE.y), waypoint: { x: 0, y: 0 } });
    expect(input.fire).toBe(false);
    expect(input.right).toBe(true);
  });

  it('fires rockets when it has them and is roughly aimed', () => {
    const ship = pirate();
    ship.rockets = 5;
    const input = pirateInput(ship, { target: player(OPEN_SPACE.x + 100, OPEN_SPACE.y - 300), waypoint: { x: 0, y: 0 } });
    expect(input.rocket).toBe(true);
  });

  it('raises the shield instead of firing when badly hurt', () => {
    const ship = pirate();
    ship.hull = ship.stats.maxHull * 0.3;
    const input = pirateInput(ship, { target: player(OPEN_SPACE.x, OPEN_SPACE.y - 300), waypoint: { x: 0, y: 0 } });
    expect(input.shield).toBe(true);
    expect(input.fire).toBe(false);
  });

  it('steers away from a safe zone', () => {
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0, radius: 800 };
    const ship = pirate(zone.x, zone.y - zone.radius - 100);
    ship.angle = Math.PI;
    const input = pirateInput(ship, { target: null, waypoint: { x: zone.x, y: zone.y } });
    expect(input.left || input.right).toBe(true);
    expect(input.thrust).toBe(false);
  });
});

describe('isValidTarget', () => {
  it('accepts players in open space only', () => {
    expect(isValidTarget(player(OPEN_SPACE.x, OPEN_SPACE.y))).toBe(true);
    expect(isValidTarget(pirate())).toBe(false);
    const docked = player(OPEN_SPACE.x, OPEN_SPACE.y);
    docked.docked = true;
    expect(isValidTarget(docked)).toBe(false);
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
    expect(isValidTarget(player(zone.x, zone.y))).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `packages/server/src/world/pirates/tiers.ts`
```ts
import type { Build, Mk, PirateTier } from '@arena/shared';

export interface PirateTierSpec {
  readonly build: Build;
  readonly rockets: number;
  readonly band: { readonly min: number; readonly max: number };
  readonly credits: number;
  readonly ore: number;
  readonly dropChance: number;
  readonly dropMks: readonly Mk[];
}

export const PIRATE_SPECS: Readonly<Record<PirateTier, PirateTierSpec>> = {
  raider: {
    build: {
      hullId: 'scout',
      slots: {
        weapon: [{ gearId: 'pulse_laser', mk: 1 }],
        shield: [{ gearId: 'shield_gen', mk: 1 }],
        engine: [{ gearId: 'thruster', mk: 1 }],
        utility: [null],
      },
    },
    rockets: 0,
    band: { min: 1_000, max: 4_000 },
    credits: 40,
    ore: 2,
    dropChance: 0.02,
    dropMks: [1],
  },
  marauder: {
    build: {
      hullId: 'fighter',
      slots: {
        weapon: [{ gearId: 'pulse_laser', mk: 2 }, { gearId: 'pulse_laser', mk: 2 }],
        shield: [{ gearId: 'shield_gen', mk: 2 }],
        engine: [{ gearId: 'thruster', mk: 2 }],
        utility: [null],
      },
    },
    rockets: 5,
    band: { min: 4_000, max: 8_000 },
    credits: 120,
    ore: 4,
    dropChance: 0.05,
    dropMks: [1, 2],
  },
  warlord: {
    build: {
      hullId: 'gunship',
      slots: {
        weapon: [{ gearId: 'heavy_cannon', mk: 2 }, { gearId: 'heavy_cannon', mk: 2 }, { gearId: 'pulse_laser', mk: 3 }],
        shield: [{ gearId: 'shield_gen', mk: 2 }, { gearId: 'shield_gen', mk: 2 }],
        engine: [{ gearId: 'thruster', mk: 2 }],
        utility: [{ gearId: 'armor', mk: 2 }],
      },
    },
    rockets: 5,
    band: { min: 8_000, max: Number.POSITIVE_INFINITY },
    credits: 350,
    ore: 6,
    dropChance: 0.12,
    dropMks: [2, 3],
  },
};
```

`packages/server/src/world/pirates/PirateBrain.ts`
```ts
import { IDLE_INPUT, forward, nearestZone, zoneAt, type ShipInput } from '@arena/shared';
import type { ShipEntity } from '../entities';

export const AGGRO_RANGE = 800;
export const ATTACK_RANGE = 450;
export const LOSE_RANGE = 1_600;
export const WAYPOINT_REACHED = 150;

const ZONE_MARGIN = 200;
const LOOKAHEAD_SECONDS = 0.5;
const PATROL_SPEED_SHARE = 0.6;
const ATTACK_HOLD_DISTANCE = 250;
const TURN_DEADBAND = 0.05;
const THRUST_ALIGNMENT = 1;
const BRAKE_TOLERANCE = 40;
const GUN_AIM = 0.2;
const ROCKET_AIM = 0.4;
const SHIELD_HULL_SHARE = 0.4;
const SHIELD_MIN_ENERGY = 30;
const ESCAPE_DISTANCE = 1_000;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BrainContext {
  readonly target: ShipEntity | null;
  readonly waypoint: Point;
}

interface Steering {
  readonly thrust: boolean;
  readonly reverse: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly error: number;
}

function headingTo(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, from.y - to.y);
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function steer(ship: ShipEntity, goal: Point, desiredSpeed: number): Steering {
  const error = angleDelta(ship.angle, headingTo(ship, goal));
  const direction = forward(ship.angle);
  const speedAlong = ship.vx * direction.x + ship.vy * direction.y;
  return {
    left: error < -TURN_DEADBAND,
    right: error > TURN_DEADBAND,
    thrust: Math.abs(error) < THRUST_ALIGNMENT && speedAlong < desiredSpeed,
    reverse: speedAlong > desiredSpeed + BRAKE_TOLERANCE,
    error,
  };
}

function zoneEscape(ship: ShipEntity): Point | null {
  const ahead = { x: ship.x + ship.vx * LOOKAHEAD_SECONDS, y: ship.y + ship.vy * LOOKAHEAD_SECONDS };
  const zone = nearestZone(ahead.x, ahead.y);
  const gap = distance(ahead, zone);
  if (gap >= zone.radius + ZONE_MARGIN) return null;
  const awayX = (ship.x - zone.x) / Math.max(1, distance(ship, zone));
  const awayY = (ship.y - zone.y) / Math.max(1, distance(ship, zone));
  return { x: ship.x + awayX * ESCAPE_DISTANCE, y: ship.y + awayY * ESCAPE_DISTANCE };
}

function wantsShield(ship: ShipEntity): boolean {
  return ship.hull < ship.stats.maxHull * SHIELD_HULL_SHARE && ship.shieldEnergy > SHIELD_MIN_ENERGY;
}

function movement(steering: Steering): ShipInput {
  return { ...IDLE_INPUT, thrust: steering.thrust, reverse: steering.reverse, left: steering.left, right: steering.right };
}

function attack(ship: ShipEntity, target: ShipEntity): ShipInput {
  const holding = distance(ship, target) < ATTACK_HOLD_DISTANCE;
  const steering = steer(ship, target, holding ? 0 : ship.stats.maxSpeed);
  const shield = wantsShield(ship);
  const aim = Math.abs(steering.error);
  return {
    ...movement(steering),
    shield,
    fire: !shield && aim <= GUN_AIM,
    rocket: !shield && ship.rockets > 0 && aim <= ROCKET_AIM,
  };
}

export function isValidTarget(candidate: ShipEntity): boolean {
  return candidate.npc === null && !candidate.docked && zoneAt(candidate.x, candidate.y) === undefined;
}

export function pirateInput(ship: ShipEntity, context: BrainContext): ShipInput {
  const escape = zoneEscape(ship);
  if (escape) return movement(steer(ship, escape, ship.stats.maxSpeed));
  const { target } = context;
  if (target && distance(ship, target) <= ATTACK_RANGE) return attack(ship, target);
  if (target) return movement(steer(ship, target, ship.stats.maxSpeed));
  return movement(steer(ship, context.waypoint, ship.stats.maxSpeed * PATROL_SPEED_SHARE));
}
```

Check the zone test: the pirate sits 100 px outside the zone edge (inside the 200 px margin) with angle π, nose pointing toward the zone (+y). The escape goal is straight away from the zone (−y), so the heading error is ±π: it turns and does not thrust (alignment > 1 rad). If `input.thrust` comes out true, re-check `headingTo`; do not loosen the test.

- [ ] **Step 4: Run lane gates.** PASS.
- [ ] **Step 5: Commit** `feat(server): add pirate tiers and pirate brain`

---

### Task S5: Director + World integration

**Files:**
- Create: `packages/server/src/world/pirates/PirateDirector.ts`
- Modify: `entities.ts` (`createPirateShip`), `World.ts`
- Test: `packages/server/test/PirateDirector.test.ts`, `packages/server/test/World.pirates.test.ts`

**Interfaces — Produces:**
- `PatrolSpec { band: PirateTier; composition: (rng) => PirateTier[] }`, `DEFAULT_PATROLS` (8 raider ×2, 5 marauder ×2–3, 2 warlord + 2 marauders).
- `PirateHost { spawnPirate(tier, x, y): ShipEntity; ship(id): ShipEntity | undefined; players(): Iterable<ShipEntity> }`.
- `class PirateDirector(rng, specs = DEFAULT_PATROLS)` with `step(host, time): void`, `pirateLoot(tier): CrateDrop` (uses its rng), and constants `PATROL_RESPAWN = 60`.
- `randomPointInBand(rng, band): Point`.
- `createPirateShip(id, tier, x, y): ShipEntity` (accountId `-id`, name `PIRATE_NAMES[tier]`, build/rockets from `PIRATE_SPECS`, `npc = tier`).
- `WorldOptions.pirates?: PatrolSpec[] | boolean` — `true` uses `DEFAULT_PATROLS`, an array uses those specs, `false`/absent disables pirates. `World.npcShips(): ShipEntity[]`.

- [ ] **Step 1: Write failing tests**

`packages/server/test/PirateDirector.test.ts`:
```ts
import { distanceToNearestZone, type PirateTier } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createPirateShip, createShip, type ShipEntity } from '../src/world/entities';
import { PATROL_RESPAWN, PirateDirector, randomPointInBand, type PirateHost } from '../src/world/pirates/PirateDirector';
import { PIRATE_SPECS } from '../src/world/pirates/tiers';
import { seeded, shipRecord } from './support/fixtures';

class FakeHost implements PirateHost {
  readonly ships = new Map<number, ShipEntity>();
  private nextId = 1;
  spawnPirate(tier: PirateTier, x: number, y: number): ShipEntity {
    const ship = createPirateShip(this.nextId++, tier, x, y);
    this.ships.set(ship.id, ship);
    return ship;
  }
  ship(id: number): ShipEntity | undefined {
    return this.ships.get(id);
  }
  *players(): Iterable<ShipEntity> {
    for (const ship of this.ships.values()) if (ship.npc === null) yield ship;
  }
  addPlayer(x: number, y: number): ShipEntity {
    const ship = createShip(this.nextId++, 99, 'alice', shipRecord(x, y, 99));
    this.ships.set(ship.id, ship);
    return ship;
  }
}

const twoRaiders = [{ band: 'raider' as const, composition: (): PirateTier[] => ['raider', 'raider'] }];

describe('randomPointInBand', () => {
  it('stays inside the band', () => {
    const rng = seeded(9);
    for (let i = 0; i < 200; i += 1) {
      const point = randomPointInBand(rng, PIRATE_SPECS.marauder.band);
      const gap = distanceToNearestZone(point.x, point.y);
      expect(gap).toBeGreaterThanOrEqual(4_000);
      expect(gap).toBeLessThanOrEqual(8_000);
    }
  });
});

describe('PirateDirector', () => {
  it('spawns the default population', () => {
    const host = new FakeHost();
    new PirateDirector(seeded(1)).step(host, 0);
    const tiers = [...host.ships.values()].map((s) => s.npc);
    expect(tiers.filter((t) => t === 'raider')).toHaveLength(16);
    expect(tiers.filter((t) => t === 'warlord')).toHaveLength(2);
    expect(tiers.filter((t) => t === 'marauder').length).toBeGreaterThanOrEqual(14);
    expect(tiers.filter((t) => t === 'marauder').length).toBeLessThanOrEqual(19);
  });

  it('respawns a wiped patrol after 60 s', () => {
    const host = new FakeHost();
    const director = new PirateDirector(seeded(2), twoRaiders);
    director.step(host, 0);
    host.ships.clear();
    director.step(host, 1);
    director.step(host, 1 + PATROL_RESPAWN - 0.1);
    expect(host.ships.size).toBe(0);
    director.step(host, 1 + PATROL_RESPAWN);
    expect(host.ships.size).toBe(2);
  });

  it('shares a target across the patrol and attacks it', () => {
    const host = new FakeHost();
    const director = new PirateDirector(seeded(3), twoRaiders);
    director.step(host, 0);
    const [first, second] = [...host.ships.values()];
    if (!first || !second) throw new Error('missing pirates');
    const victim = host.addPlayer(first.x, first.y - 300);
    second.x = first.x + 600;
    second.y = first.y;
    director.step(host, 0.1);
    expect(first.input.fire || first.input.left || first.input.right).toBe(true);
    expect(second.input.thrust || second.input.left || second.input.right).toBe(true);
    victim.docked = true;
    director.step(host, 0.2);
    expect(first.input.fire).toBe(false);
  });

  it('rolls loot from the tier table', () => {
    const director = new PirateDirector(seeded(4), twoRaiders);
    const loot = director.pirateLoot('warlord');
    expect(loot.credits).toBe(350);
    expect(loot.ore).toBe(6);
  });
});
```

`packages/server/test/World.pirates.test.ts`:
```ts
import { IDLE_INPUT, TICK_DT, type PirateTier } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { seeded, shipRecord } from './support/fixtures';

const patrolOf = (...tiers: PirateTier[]) => [{ band: 'raider' as const, composition: (): PirateTier[] => tiers }];

describe('World pirates', () => {
  it('kills a pirate without a death event or bounty and drops its loot crate', () => {
    const world = new World({ asteroidTarget: 0, rng: seeded(11), pirates: patrolOf('raider') });
    world.tick(TICK_DT);
    const [raider] = world.npcShips();
    if (!raider) throw new Error('no raider');
    raider.hull = 1;
    raider.shieldEnergy = 0;
    const hunter = world.addShip(1, 'alice', shipRecord(raider.x, raider.y + 300, 1));
    world.setInput(hunter.id, 1, { ...IDLE_INPUT, fire: true });
    let reported = 0;
    for (let i = 0; i < 60 && world.npcShips().length > 0; i += 1) {
      reported += world.tick(TICK_DT).died.filter((d) => d.ship.npc !== null).length;
    }
    expect(world.npcShips()).toHaveLength(0);
    expect(reported).toBe(0);
    expect(hunter.carriedCredits).toBe(0);
    world.tick(TICK_DT);
    expect(world.entitiesNear(10_000, 10_000, 30_000).some((e) => e.kind === 'crate' && e.credits === 40)).toBe(true);
  });

  it('pirate bullets pass through other pirates', () => {
    const world = new World({ asteroidTarget: 0, rng: seeded(12), pirates: patrolOf('raider', 'raider') });
    world.tick(TICK_DT);
    const [shooter, shield] = world.npcShips();
    if (!shooter || !shield) throw new Error('missing raiders');
    Object.assign(shield, { x: shooter.x, y: shooter.y - 150, angle: 0 });
    Object.assign(shooter, { angle: 0 });
    world.addShip(1, 'alice', shipRecord(shooter.x, shooter.y - 400, 1));
    for (let i = 0; i < 20; i += 1) world.tick(TICK_DT);
    expect(shield.hull).toBe(shield.stats.maxHull);
  });
});
```


- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`entities.ts` add:
```ts
export function createPirateShip(id: number, tier: PirateTier, x: number, y: number): ShipEntity {
  const spec = PIRATE_SPECS[tier];
  const ship = createShip(id, -id, PIRATE_NAMES[tier], {
    accountId: -id,
    bankedCredits: 0,
    build: spec.build,
    rockets: spec.rockets,
    salvage: [],
    x,
    y,
  });
  ship.npc = tier;
  return ship;
}
```
(import `PIRATE_NAMES`, `type PirateTier` from `@arena/shared` and `PIRATE_SPECS` from `./pirates/tiers`).

`packages/server/src/world/pirates/PirateDirector.ts`
```ts
import { WORLD_SIZE, distanceToNearestZone, type PirateTier } from '@arena/shared';
import type { ShipEntity } from '../entities';
import { randomGear, type CrateDrop } from '../Loot';
import { AGGRO_RANGE, LOSE_RANGE, WAYPOINT_REACHED, isValidTarget, pirateInput, type Point } from './PirateBrain';
import { PIRATE_SPECS, type PirateTierSpec } from './tiers';

export const PATROL_RESPAWN = 60;

const WAYPOINT_COUNT = 4;
const FORMATION_SPACING = 120;
const MAX_PLACEMENT_TRIES = 2_000;

export interface PatrolSpec {
  readonly band: PirateTier;
  readonly composition: (rng: () => number) => PirateTier[];
}

export interface PirateHost {
  spawnPirate(tier: PirateTier, x: number, y: number): ShipEntity;
  ship(id: number): ShipEntity | undefined;
  players(): Iterable<ShipEntity>;
}

interface Patrol {
  readonly spec: PatrolSpec;
  members: number[];
  waypoints: Point[];
  waypointIndex: number;
  targetId: number | null;
  respawnAt: number;
}

function repeat(count: number, spec: PatrolSpec): PatrolSpec[] {
  return Array.from({ length: count }, () => spec);
}

export const DEFAULT_PATROLS: readonly PatrolSpec[] = [
  ...repeat(8, { band: 'raider', composition: () => ['raider', 'raider'] }),
  ...repeat(5, {
    band: 'marauder',
    composition: (rng) => (rng() < 0.5 ? ['marauder', 'marauder'] : ['marauder', 'marauder', 'marauder']),
  }),
  ...repeat(2, { band: 'warlord', composition: () => ['warlord', 'marauder', 'marauder'] }),
];

export function randomPointInBand(rng: () => number, band: PirateTierSpec['band']): Point {
  for (let attempt = 0; attempt < MAX_PLACEMENT_TRIES; attempt += 1) {
    const point = { x: rng() * WORLD_SIZE, y: rng() * WORLD_SIZE };
    const gap = distanceToNearestZone(point.x, point.y);
    if (gap >= band.min && gap <= band.max) return point;
  }
  throw new RangeError(`no point found in band ${band.min}-${band.max}`);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class PirateDirector {
  private readonly patrols: Patrol[];

  constructor(
    private readonly rng: () => number,
    specs: readonly PatrolSpec[] = DEFAULT_PATROLS,
  ) {
    this.patrols = specs.map((spec) => ({ spec, members: [], waypoints: [], waypointIndex: 0, targetId: null, respawnAt: 0 }));
  }

  step(host: PirateHost, time: number): void {
    for (const patrol of this.patrols) this.stepPatrol(host, patrol, time);
  }

  pirateLoot(tier: PirateTier): CrateDrop {
    const spec = PIRATE_SPECS[tier];
    const gear = this.rng() < spec.dropChance ? randomGear(this.rng, spec.dropMks) : null;
    return { credits: spec.credits, ore: spec.ore, gear };
  }

  private stepPatrol(host: PirateHost, patrol: Patrol, time: number): void {
    const members = patrol.members.map((id) => host.ship(id)).filter((ship): ship is ShipEntity => ship !== undefined);
    patrol.members = members.map((ship) => ship.id);
    if (members.length === 0) {
      this.handleEmptyPatrol(host, patrol, time);
      return;
    }
    const target = this.updateTarget(host, patrol, members);
    const leader = members[0];
    const waypoint = patrol.waypoints[patrol.waypointIndex];
    if (!leader || !waypoint) return;
    if (distance(leader, waypoint) <= WAYPOINT_REACHED) patrol.waypointIndex = (patrol.waypointIndex + 1) % patrol.waypoints.length;
    members.forEach((ship, index) => {
      const goal = patrol.waypoints[patrol.waypointIndex] ?? waypoint;
      ship.input = pirateInput(ship, { target, waypoint: { x: goal.x + index * FORMATION_SPACING, y: goal.y } });
    });
  }

  private handleEmptyPatrol(host: PirateHost, patrol: Patrol, time: number): void {
    if (patrol.respawnAt < 0) patrol.respawnAt = time + PATROL_RESPAWN;
    if (time < patrol.respawnAt) return;
    this.spawnPatrol(host, patrol);
    patrol.respawnAt = -1;
  }

  private spawnPatrol(host: PirateHost, patrol: Patrol): void {
    const band = PIRATE_SPECS[patrol.spec.band].band;
    const origin = randomPointInBand(this.rng, band);
    patrol.waypoints = Array.from({ length: WAYPOINT_COUNT }, () => randomPointInBand(this.rng, band));
    patrol.waypointIndex = 0;
    patrol.targetId = null;
    patrol.members = patrol.spec
      .composition(this.rng)
      .map((tier, index) => host.spawnPirate(tier, origin.x + index * FORMATION_SPACING, origin.y).id);
  }

  private updateTarget(host: PirateHost, patrol: Patrol, members: readonly ShipEntity[]): ShipEntity | null {
    const current = patrol.targetId === null ? undefined : host.ship(patrol.targetId);
    const nearestMember = (ship: ShipEntity): number => Math.min(...members.map((member) => distance(member, ship)));
    if (current && isValidTarget(current) && nearestMember(current) <= LOSE_RANGE) return current;
    let best: ShipEntity | null = null;
    let bestDistance = AGGRO_RANGE;
    for (const candidate of host.players()) {
      if (!isValidTarget(candidate)) continue;
      const gap = nearestMember(candidate);
      if (gap > bestDistance) continue;
      best = candidate;
      bestDistance = gap;
    }
    patrol.targetId = best?.id ?? null;
    return best;
  }
}
```
Initial state: `respawnAt: 0` means "spawn on the first step at time ≥ 0"; after a spawn it is set to `-1` ("alive, no timer"); when a patrol empties, `-1` becomes `time + 60`.

`World.ts`:
- `WorldOptions` adds `readonly pirates?: boolean | readonly PatrolSpec[];`.
- Field `private readonly director: PirateDirector | null;` set in the constructor: `options.pirates === true ? new PirateDirector(this.rng) : Array.isArray(options.pirates) ? new PirateDirector(this.rng, options.pirates) : null`. If `Array.isArray` does not narrow the readonly array, use a small `function patrolSpecs(option): readonly PatrolSpec[] | null` helper.
- Host object (private field built once):
  ```ts
  private readonly pirateHost: PirateHost = {
    spawnPirate: (tier, x, y) => {
      const ship = createPirateShip(this.allocateId(), tier, x, y);
      this.ships.set(ship.id, ship);
      return ship;
    },
    ship: (id) => this.ships.get(id),
    players: () => this.playerShips(),
  };
  ```
- In `tick`, before `stepShips`: `this.director?.step(this.pirateHost, this.elapsed);`.
- `npcShips()` returns ships with `npc !== null`.
- `resolveDeaths`: at the top of the loop body after the hull check:
  ```ts
      if (ship.npc !== null) {
        this.spawnCrate(ship.x, ship.y, this.director?.pirateLoot(ship.npc) ?? { credits: 0, ore: 0, gear: null });
        this.ships.delete(ship.id);
        continue;
      }
  ```
- Pirate inputs are assigned directly (`ship.input`) by the director; pirates have empty input queues so `stepShips` keeps them.

- [ ] **Step 4: Run lane gates.** PASS.
- [ ] **Step 5: Commit** `feat(server): add pirate director and wire pirates into the world`

---

### Task S6: Snapshot, app, integration

**Files:** Modify `packages/server/src/net/snapshot.ts`, `packages/server/src/app.ts`; tests `packages/server/test/snapshot.test.ts`, `packages/server/test/integration.test.ts`.

- [ ] **Step 1: Tests**
  - `snapshot.test.ts`: expected ship state adds `npc: null, miningTargetId: null`; add a test:
    ```ts
    it('marks pirates, mining targets, salvage and crate gear', () => {
      const self = createShip(1, 1, 'alice', { ...shipRecord(10, 20, 1), salvage: [{ gearId: 'armor', mk: 1 }] });
      self.miningTargetId = 7;
      const pirate = createPirateShip(5, 'marauder', 30, 40);
      const crate: WorldEntity = { kind: 'crate', id: 6, x: 0, y: 0, ore: 0, credits: 0, gear: { gearId: 'armor', mk: 1 }, expiresAt: 9 };
      const snapshot = buildSnapshot(self, [pirate, crate], 1, 0);
      expect(snapshot.self).toMatchObject({ salvage: [{ gearId: 'armor', mk: 1 }], miningTargetId: 7 });
      expect(snapshot.entities[0]).toMatchObject({ kind: 'ship', npc: 'marauder', name: 'Marauder', hullId: 'fighter' });
      expect(snapshot.entities[1]).toEqual({ kind: 'crate', id: 6, x: 0, y: 0, hasGear: true });
    });
    ```
  - `integration.test.ts`: `createApp` in `beforeEach` gains `pirates: false`. Add:
    ```ts
      it('mines with F and never saves pirates', async () => {
        const alice = await TestClient.connect(port, await register('alice'));
        const ship = app.world.shipById((await pump(alice, 'welcome')).shipId);
        if (!ship) throw new Error('ship missing');
        Object.assign(ship, { x: OPEN_SPACE.x, y: OPEN_SPACE.y });
        app.world.addAsteroid({ x: OPEN_SPACE.x, y: OPEN_SPACE.y - 150, radius: 40, hp: 80, oreYield: 3, variant: 1 });
        alice.input(1, { ...IDLE_INPUT, mine: true });
        const mined = await pump(alice, 'snapshot', (s) => s.self.ore >= 2);
        expect(mined.self.miningTargetId).not.toBeNull();
      });
    ```
    and a separate `describe('with pirates')` block that creates its own app with `pirates: true`, steps the loop 3 times, then asserts that reopening the database with `PlayerRepository.open(dbPath)` contains no ship rows with a negative `account_id` after `app.saveAll()` (query via `better-sqlite3` directly: `SELECT COUNT(*) AS n FROM ships WHERE account_id < 0` → `0`).
- [ ] **Step 2: Implement**
  - `snapshot.ts`: ship state adds `npc: entity.npc, miningTargetId: entity.miningTargetId`; crate state adds `hasGear: entity.gear !== null`; self state adds `salvage: ship.salvage, miningTargetId: ship.miningTargetId`.
  - `app.ts`: `AppConfig` adds `readonly pirates?: boolean;`; world is `new World({ asteroidTarget: config.asteroidTarget, pirates: config.pirates ?? true })`; `saveAll` uses `world.playerShips()`.
- [ ] **Step 3: Run lane gates** including integration. PASS.
- [ ] **Step 4: Commit** `feat(server): expose pirates, mining and salvage in snapshots`

---

## Client lane (worktree `pirates-client`, first run `pnpm install --frozen-lockfile`)

The `selfState` fixture in `packages/client/test/support/self.ts` adds `salvage: []` and `miningTargetId: null`. Test ship fixtures (`interpolator.test.ts`, `spriteIds.test.ts`) add `npc: null, miningTargetId: null`.

### Task C1: Input F + rendering

**Files:** Modify `packages/client/src/input/InputSampler.ts`, `render/spriteIds.ts`, `render/Renderer.ts`, `game/GameSession.ts`; tests `input.test.ts`, `spriteIds.test.ts`.

- [ ] **Step 1: Tests**
  - `input.test.ts`: the first test also presses `KeyF` and expects `mine: true` in the sampled input; `IDLE_INPUT` comparisons stay.
  - `spriteIds.test.ts` add:
    ```ts
    it('maps pirates by tier', () => {
      expect(spriteIdFor({ kind: 'ship', id: 1, name: 'Raider', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout', npc: 'raider', miningTargetId: null })).toBe('pirate_raider');
    });
    ```
- [ ] **Step 2: Implement**
  - `InputSampler`: `KEY_MAP` adds `KeyF: 'mine'`; `sample()` adds `mine: this.pressed.has('mine')`.
  - `spriteIds`: ship case `return entity.npc ? \`pirate_${entity.npc}\` : \`ship_${entity.hullId}\`;`.
  - `Renderer`:
    - Add a `labels` layer and a `beams` layer to `layers` (`beams` added before `ships`, `labels` last).
    - `EntityView` adds `label: Text | null`. In `replaceView`, for ships with `npc`, create `new Text({ text: PIRATE_NAMES[entity.npc], style: { fill: 0xff5a4f, fontSize: 12, fontFamily: 'system-ui' } })`, `anchor.set(0.5)`, add to `layers.labels`. In `syncEntity`, position the label at `(entity.x, entity.y - 44)`. On view removal destroy the label too.
    - For crates with `hasGear`, add a child `sprites.create('icon_salvage')` scaled `0.4` at `(10, -10)`.
    - Beams: `private readonly beams = new Map<number, Container>();`. After syncing all entities in `render`, call `this.syncBeams(view.entities)`:
      ```ts
      private syncBeams(entities: readonly EntityState[]): void {
        const byId = new Map(entities.map((entity) => [entity.id, entity]));
        const active = new Set<number>();
        for (const entity of entities) {
          if (entity.kind !== 'ship' || entity.miningTargetId === null) continue;
          const target = byId.get(entity.miningTargetId);
          if (!target) continue;
          active.add(entity.id);
          const beam = this.beams.get(entity.id) ?? this.createBeam(entity.id);
          const length = Math.hypot(target.x - entity.x, target.y - entity.y);
          beam.position.set(entity.x, entity.y);
          beam.rotation = Math.atan2(target.x - entity.x, entity.y - target.y);
          beam.scale.set(1, length / this.sprites.size('mining_beam').height);
        }
        for (const [id, beam] of this.beams) {
          if (active.has(id)) continue;
          beam.destroy({ children: true });
          this.beams.delete(id);
        }
      }

      private createBeam(id: number): Container {
        const beam = this.sprites.create('mining_beam');
        this.layers.beams.addChild(beam);
        this.beams.set(id, beam);
        return beam;
      }
      ```
      The `mining_beam` anchor is `(0.5, 1)` so the beam extends upward (nose direction) from the ship; rotation uses the same heading convention as ships.
  - `GameSession.draw`: own ship state adds `npc: null, miningTargetId: self.miningTargetId`.
- [ ] **Step 3: Run lane gates.** PASS.
- [ ] **Step 4: Commit** `feat(client): add F mining key and render pirates, beams and salvage crates`

### Task C2: HUD + build menu salvage + controls.md

**Files:** Modify `ui/Hud.ts`, `ui/buildMenuModel.ts`, `ui/BuildMenu.ts`, `controls.md`; tests `hud.test.ts`, `buildMenuModel.test.ts`.

- [ ] **Step 1: Tests**
  - `hud.test.ts`: expected lines insert `'Salvage 0 / 3'` after the Cargo line (8 lines with the prompt; update the "omits an empty prompt" length to `7`).
  - `buildMenuModel.test.ts` updates for the new starter build and a Mining metric:
    - `statSummary(statsFor(STARTER_BUILD))` → `['Hull 80', 'Speed 460', 'Damage/s 40', 'Shield 100', 'Cargo 15', 'Rockets max 10', 'Mining 1/s']`.
    - `slotRows` last label → `'Utility 1: Mining Laser Mk1'`.
    - `gearOptions(..., { type: 'utility', index: 0 }, 200)` labels gain `'Mining Laser Mk1', 'Mining Laser Mk2', 'Mining Laser Mk3'` at the end; `options[0]` → `{ gearId: 'armor', mk: 1, price: 200, affordable: true, delta: 'Hull +30, Mining -1/s' }`; `options[1].affordable` stays `false` (200 + 150 < 600).
  - Add:
    ```ts
    describe('salvageRows', () => {
      it('offers install slots and sale price per item', () => {
        const rows = salvageRows(STARTER_BUILD, [{ gearId: 'armor', mk: 2 }]);
        expect(rows).toEqual([
          { index: 0, label: 'Armor Plating Mk2', salePrice: 300, slots: [{ slot: { type: 'utility', index: 0 }, label: 'Utility 1' }] },
        ]);
      });
    });
    ```
- [ ] **Step 2: Implement**
  - `Hud.hudLines`: insert `` `Salvage ${self.salvage.length} / ${SALVAGE_CAPACITY}` `` after the Cargo line.
  - `buildMenuModel.ts`:
    - `StatMetric` gains `readonly unit?: string`; add `{ label: 'Mining', unit: '/s', value: (s) => s.miningRate }` last. `statSummary` and `describeDelta` append `metric.unit ?? ''` to the number (so `Mining 1/s`, `Mining -1/s`).
    - Add:
      ```ts
      export interface SalvageRow {
        readonly index: number;
        readonly label: string;
        readonly salePrice: number;
        readonly slots: readonly { readonly slot: SlotRef; readonly label: string }[];
      }

      export function salvageRows(build: Build, salvage: readonly InstalledGear[]): SalvageRow[] {
        return salvage.map((gear, index) => {
          const type = GEAR[gear.gearId].slot;
          return {
            index,
            label: gearLabel(gear),
            salePrice: resaleValue(gearCost(gear)),
            slots: build.slots[type].map((_, slotIndex) => ({
              slot: { type, index: slotIndex },
              label: `${SLOT_LABELS[type]} ${slotIndex + 1}`,
            })),
          };
        });
      }
      ```
  - `BuildMenu.shipTab`: after the slot rows, if `self.salvage.length > 0` append a `Salvage` heading and, for each `salvageRows(self.build, self.salvage)` row: the item label, one `Install → <slot label>` button per slot sending `{ type: 'installSalvage', index: row.index, slot }`, and `Sell (<salePrice> cr)` sending `{ type: 'sellSalvage', index: row.index }`. Icon `/ui/gear_<gearId>.png`. Include `self.salvage` in the render key.
  - `controls.md`: add the row `| \`F\` (hold) | Mining laser: drill the asteroid in front of you |`; add bullets: "**Mining laser:** hold `F` facing an asteroid within range; ore flows straight into cargo. Every new pilot has a Mining Laser Mk1; better lasers are in the build menu. You cannot mine while firing, shielded, docked or in a safe zone." and "**Pirates:** red ships roam open space — Raiders near the stations, Marauders farther out, Warlords in the deep. They attack pilots who come within ~800 px. Destroyed pirates drop a crate with credits, ore and sometimes a gear item." and "**Salvage:** gear from crates goes into your salvage hold (3 items, lost on death). While docked, install it for free or sell it for 50% in the build menu's Ship tab."
- [ ] **Step 3: Run lane gates** incl. build. PASS.
- [ ] **Step 4: Commit** `feat(client): show salvage in HUD and build menu, document new controls`

---

## Art lane — Task X1 (Codex, worktree `pirates-art`)

Prompt via `orca worktree create --name pirates-art --base-branch master --agent codex --surface terminal --prompt "<task>"`: generate the 6 PNGs added to `assets/manifest.json` in A1 (`pirate_raider`, `pirate_marauder`, `pirate_warlord`, `mining_beam`, `gear_mining_laser`, `icon_salvage`) per `assets/STYLE.md` "Pirates and mining update", exact sizes, transparency, consistent with existing art; `pnpm assets:check` → `assets ok`; commit `feat(assets): add pirate, mining beam and salvage sprites` with PNGs only, no attribution.

---

## Task M1: Merge, gates, playtest (coordinator)

- [ ] Merge the three lanes with `--no-ff`; run the post-merge gates.
- [ ] Contact-sheet review of the 6 sprites (pirates read as hostile and distinct from player hulls; beam tiles).
- [ ] Back up `arena.db`, restart the live server, confirm migration to `user_version 3`.
- [ ] Scripted playtest on a scratch server with pirates on: a pilot flies to a Raider patrol, gets attacked (hull drops), kills a Raider with rockets, picks up the 40-credit crate, mines an asteroid with F, docks and banks. Confirm no negative account ids in the scratch database.
- [ ] Report per task with evidence.
