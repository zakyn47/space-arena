# Dark Matter Shield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Void Leviathan crate grants a 500-point, always-on dark matter barrier that absorbs all damage until broken while its owner keeps firing.

**Architecture:** One numeric field `darkMatter` on `ShipEntity`, set by `takeCrate` and drained inside `applyDamage`, which now returns which layer took the hit (`HitBlock`). Snapshots expose the barrier to the owner (`SelfState.darkMatter`) and to everyone else (`ShipState.darkMatter?: true`); the client picks the impact effect from `HitEvent.block` and draws an animated barrier sprite and HUD meter.

**Tech Stack:** TypeScript strict, pnpm workspaces, Vitest, Node WebSocket server, Vite + PixiJS 8 client.

**Spec:** `docs/superpowers/specs/2026-10-25-dark-matter-shield-design.md`

## Global Constraints

- `DARK_MATTER_SHIELD = 500`; no regeneration; a pickup sets the barrier to exactly 500 (refill, no stacking).
- Barrier lives in memory only: no DB migration, no change to `ShipRecord` or `toShipRecord`.
- Hit order in `applyDamage`: raised normal shield → barrier → hull. Overflow on the breaking hit is lost.
- The barrier never touches `shieldUp`; firing, rockets, mines, plasma and mining stay allowed.
- Plasma's `disruptShield` keeps affecting only the normal shield.
- `ShipState.darkMatter` is present (`true`) only while `darkMatter > 0`; omitted otherwise.
- `HitEvent.shield: boolean` is replaced by `block: HitBlock` where `HitBlock = 'hull' | 'shield' | 'dark_matter'`.
- No `any`, no `as` casts outside tests, no comments that restate code. Match surrounding style.
- Work on branch `dev`. Commit after each task with the given conventional message. Never add `Co-Authored-By` or any AI attribution. Stage only the files you changed (`git add <paths>`): another agent commits PNGs into the same checkout; if `index.lock` exists, wait a few seconds and retry.
- Before each commit: `pnpm typecheck && pnpm test && pnpm lint`. After client tasks also `pnpm build`.

## Orchestration

- **Coordinator (Claude):** does Task 1, dispatches the workers, reviews each task diff, runs final checks and the phone check.
- **Codex worker (assets):** Task A, starts right after Task 1 is committed; runs in parallel with the coding tasks.
- **Opus worker (code):** Tasks 2 → 5 in order.

## File Map

| File | Change |
|---|---|
| `assets/manifest.json`, `assets/STYLE.md` | 3 new sprite entries + style section (Task 1) |
| `assets/fx/dark_matter_shield.png`, `assets/fx/dark_matter_impact.png`, `assets/ui/dark_matter.png` | New PNGs (Task A) |
| `packages/shared/src/constants.ts` | `DARK_MATTER_SHIELD` |
| `packages/shared/src/protocol.ts` | `HitBlock`, `HitEvent.block`, `SelfState.darkMatter`, `ShipState.darkMatter?` |
| `packages/server/src/world/entities.ts` | `darkMatter` field in all factories and `respawnShip` |
| `packages/server/src/world/Combat.ts` | `applyDamage` returns `HitBlock` |
| `packages/server/src/world/Loot.ts` | `CrateDrop.darkMatter`, `takeCrate` grants it |
| `packages/server/src/world/boss/BossDirector.ts`, `pirates/PirateDirector.ts`, `World.ts` | crate drops carry `darkMatter`; hit events carry `block` |
| `packages/server/src/net/snapshot.ts` | self and ship state fields |
| `packages/client/src/render/spriteIds.ts`, `Effects.ts`, `Renderer.ts` | impact effect per block, barrier sprite |
| `packages/client/src/ui/Hud.ts`, `style.css` | dark matter meter with animated icon |
| `packages/client/index.html`, `controls.md` | rules line |

---

### Task 1: Asset contract (Coordinator)

**Files:**
- Modify: `assets/manifest.json` (append after the `shield_impact` line)
- Modify: `assets/STYLE.md` (append section at the end)

- [ ] **Step 1: Add manifest entries** after the `shield_impact` entry:

```json
    {"id": "dark_matter_shield", "file": "fx/dark_matter_shield.png", "width": 384, "height": 96, "anchor": [0.5, 0.5], "frames": 4},
    {"id": "dark_matter_impact", "file": "fx/dark_matter_impact.png", "width": 384, "height": 96, "anchor": [0.5, 0.5], "frames": 4},
    {"id": "dark_matter_icon", "file": "ui/dark_matter.png", "width": 192, "height": 48, "anchor": [0.5, 0.5], "frames": 4},
```

- [ ] **Step 2: Append to `assets/STYLE.md`:**

```markdown
## Dark matter shield update

- `dark_matter_shield` (horizontal spritesheet, 4 frames of 96×96, centered on the ship like `shield_bubble`): an always-on barrier sphere of radius ~44 px. Near-black deep violet `#1A0B2E` swirling energy with faint white star specks inside, a thin glowing magenta `#C04BFF` rim and a soft outer glow. The centre ~30 px radius must be mostly transparent so the ship stays readable. Frames rotate the swirl a quarter turn each so the loop is seamless (frame 4 flows into frame 1). Must read clearly different from the cyan `shield_bubble`.
- `dark_matter_impact` (horizontal spritesheet, 4 frames of 96×96): a hit on the barrier. Same placement rule as `shield_impact`: centered on the ship, the impact sits on the TOP edge of the rim (radius ~44 px). Frames: magenta-white flash on the rim → violet ripple arc (~70°) collapsing inward toward a black point → black core with a few magenta sparks → almost transparent. No cyan.
- `dark_matter_icon` (horizontal spritesheet, 4 frames of 48×48): UI glyph in the same flat icon style, used in the HUD: a small dark violet orb (~28 px) with a magenta rim and a bright magenta wisp orbiting it; each frame moves the wisp a quarter orbit so the loop is seamless.
```

- [ ] **Step 3: Verify** `pnpm assets:check` reports exactly the 3 new files missing and nothing else.

- [ ] **Step 4: Commit**

```bash
git add assets/manifest.json assets/STYLE.md
git commit -m "docs(assets): add dark matter shield sprite specs"
```

---

### Task A: Sprites (Codex worker)

Follow `AGENTS.md` → "Codex: generating art". Produce the three PNGs listed in the `## Dark matter shield update` section of `assets/STYLE.md` at the exact manifest sizes, transparent background, consistent with `assets/fx/shield_bubble.png`, `assets/fx/shield_impact.png` and the icons in `assets/ui/`. Run `pnpm assets:check` until it prints `assets ok`, then:

```bash
git add assets/fx/dark_matter_shield.png assets/fx/dark_matter_impact.png assets/ui/dark_matter.png
git commit -m "feat(assets): add dark matter shield sprites"
```

Do not touch any other file.

---

### Task 2: Barrier rules and hit blocks (server + shared, minimal client compile fix)

**Files:**
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/protocol.ts:228-232`
- Modify: `packages/server/src/world/entities.ts`, `Combat.ts:76-81`, `Loot.ts`, `boss/BossDirector.ts:66-68`, `pirates/PirateDirector.ts:73-77`, `World.ts:318-322,428-433,528-531`
- Modify: `packages/client/src/render/spriteIds.ts`, `Effects.ts:15-21,39-50`, `Renderer.ts:117`
- Test: `packages/server/test/Combat.test.ts`, `Loot.test.ts`, `World.leviathan.test.ts`, `World.plasma.test.ts`, `snapshot.test.ts`, `packages/client/test/spriteIds.test.ts`; update every test that builds or expects `shield: true|false` in a hit (`World.combat`, `World.mines`, `World.rockets`, `World.plasma`, `World.leviathan`, `snapshot`, `Combat`).

**Interfaces:**
- Produces: `DARK_MATTER_SHIELD: number` (shared); `type HitBlock = 'hull' | 'shield' | 'dark_matter'` and `HitEvent { shipId; angle; block: HitBlock }` (shared protocol); `ShipEntity.darkMatter: number`; `applyDamage(ship, damage, attackerId, time): HitBlock`; `CrateDrop { ore; credits; gear; darkMatter: boolean }`; `hitEffectFor(block: HitBlock): string` (client `spriteIds.ts`).

- [ ] **Step 1: Write failing tests**

`packages/server/test/Combat.test.ts` — replace the `applyDamage` describe:

```ts
describe('applyDamage', () => {
  it('damages hull unless shielded and reports which layer took the hit', () => {
    const ship = newShip();
    expect(applyDamage(ship, 30, 7, 3)).toBe('hull');
    expect(ship.hull).toBe(150);
    expect(ship.lastHitBy).toBe(7);
    ship.shieldUp = true;
    expect(applyDamage(ship, 30, 7, 4)).toBe('shield');
    expect(ship.hull).toBe(150);
  });

  it('drains the dark matter barrier before the hull and loses overflow when it breaks', () => {
    const ship = newShip();
    ship.darkMatter = 50;
    expect(applyDamage(ship, 30, 7, 3)).toBe('dark_matter');
    expect(ship.darkMatter).toBe(20);
    expect(applyDamage(ship, 30, 8, 4)).toBe('dark_matter');
    expect(ship.darkMatter).toBe(0);
    expect(ship.hull).toBe(ship.stats.maxHull);
    expect(ship.lastHitBy).toBe(8);
    expect(ship.lastDamagedAt).toBe(4);
    expect(applyDamage(ship, 30, 7, 5)).toBe('hull');
  });

  it('lets a raised normal shield block without draining the barrier', () => {
    const ship = newShip();
    ship.darkMatter = 100;
    ship.shieldUp = true;
    expect(applyDamage(ship, 30, 7, 3)).toBe('shield');
    expect(ship.darkMatter).toBe(100);
  });
});
```

Add to the `fireWeapons` describe in the same file:

```ts
  it('fires while the dark matter barrier is active', () => {
    const ship = newShip();
    ship.darkMatter = DARK_MATTER_SHIELD;
    ship.input = { ...IDLE_INPUT, fire: true };
    expect(fireWeapons(ship, 0.1, false, 0, ids)).toHaveLength(1);
  });
```

(import `DARK_MATTER_SHIELD` from `@arena/shared`.)

`packages/server/test/Loot.test.ts` — update the `playerDeathCrates` expectations to include `darkMatter: false` on every crate, and add:

```ts
describe('takeCrate dark matter', () => {
  it('grants a full barrier and refills a partial one', () => {
    const pilot = ship();
    expect(takeCrate(pilot, { ore: 0, credits: 0, gear: null, darkMatter: true })).toBeNull();
    expect(pilot.darkMatter).toBe(DARK_MATTER_SHIELD);
    pilot.darkMatter = 120;
    takeCrate(pilot, { ore: 0, credits: 0, gear: null, darkMatter: true });
    expect(pilot.darkMatter).toBe(DARK_MATTER_SHIELD);
  });

  it('grants the barrier even with a full salvage hold and leaves only the gear behind', () => {
    const pilot = ship();
    pilot.salvage = Array.from({ length: SALVAGE_CAPACITY }, () => ({ gearId: 'armor' as const, mk: 1 as const }));
    const leftover = takeCrate(pilot, { ore: 0, credits: 10, gear: { gearId: 'thruster', mk: 3 }, darkMatter: true });
    expect(pilot.darkMatter).toBe(DARK_MATTER_SHIELD);
    expect(leftover).toEqual({ ore: 0, credits: 0, gear: { gearId: 'thruster', mk: 3 }, darkMatter: false });
  });

  it('leaves the barrier alone for ordinary crates', () => {
    const pilot = ship();
    pilot.darkMatter = 80;
    takeCrate(pilot, { ore: 1, credits: 0, gear: null, darkMatter: false });
    expect(pilot.darkMatter).toBe(80);
  });
});
```

`packages/server/test/World.leviathan.test.ts` — add inside `describe('Leviathan in the world')`:

```ts
  it('drops a crate that grants the dark matter barrier', () => {
    const world = new World({ asteroidTarget: 0, boss: true, rng: seeded(8) });
    world.tick(TICK_DT);
    const boss = world.npcShips().find((ship) => ship.npc === 'leviathan');
    if (!boss) throw new Error('no boss');
    boss.hull = 0;
    world.tick(TICK_DT);
    const looter = world.addShip(1, 'alice', shipRecord(boss.x, boss.y, 1));
    for (let i = 0; i < 2; i += 1) world.tick(TICK_DT);
    expect(looter.darkMatter).toBe(DARK_MATTER_SHIELD);
  });
```

`packages/server/test/World.plasma.test.ts` — add a test, reusing that file's existing setup helpers for firing a plasma bolt at a target, asserting: target with `darkMatter = 500` hit by one plasma bolt ends with `darkMatter === 500 - PLASMA_DAMAGE` (use the damage constant the file already uses), `hull === maxHull`, and the reported hit has `block: 'dark_matter'`.

`packages/client/test/spriteIds.test.ts` — add:

```ts
describe('hitEffectFor', () => {
  it('picks the impact animation for the layer that took the hit', () => {
    expect(hitEffectFor('hull')).toBe('hull_hit');
    expect(hitEffectFor('shield')).toBe('shield_impact');
    expect(hitEffectFor('dark_matter')).toBe('dark_matter_impact');
  });
});
```

`packages/server/test/snapshot.test.ts` — in `sends hits only for ships in view`, replace `shield: false` with `block: 'hull'` and `shield: true` with `block: 'shield'` in both input and expected arrays. Do the same `shield` → `block` replacement in every other test that asserts on hit events (search `shield: true` / `shield: false` / `.shield)` in `packages/server/test`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL (type errors / `darkMatter` undefined / `hitEffectFor` not exported).

- [ ] **Step 3: Implement**

`packages/shared/src/constants.ts` — next to the other shield constants (`SHIELD_DRAIN`):

```ts
export const DARK_MATTER_SHIELD = 500;
```

`packages/shared/src/protocol.ts`:

```ts
export type HitBlock = 'hull' | 'shield' | 'dark_matter';

export interface HitEvent {
  readonly shipId: number;
  readonly angle: number;
  readonly block: HitBlock;
}
```

`packages/server/src/world/entities.ts` — add `darkMatter: number;` after `shieldDisruptedUntil` in `ShipEntity`; add `darkMatter: 0,` after `shieldDisruptedUntil: -Infinity,` in `createShip` and in `respawnShip`. (`createPirateShip` and `createLeviathan` build on `createShip`; verify and add there too only if they construct their own literal.)

`packages/server/src/world/Combat.ts`:

```ts
export function applyDamage(ship: ShipEntity, damage: number, attackerId: number, time: number): HitBlock {
  if (ship.shieldUp) return 'shield';
  ship.lastDamagedAt = time;
  ship.lastHitBy = attackerId;
  if (ship.darkMatter > 0) {
    ship.darkMatter = Math.max(0, ship.darkMatter - damage);
    return 'dark_matter';
  }
  ship.hull -= damage;
  return 'hull';
}
```

(import `type HitBlock` from `@arena/shared`.)

`packages/server/src/world/Loot.ts`:

```ts
export interface CrateDrop {
  readonly ore: number;
  readonly credits: number;
  readonly gear: InstalledGear | null;
  readonly darkMatter: boolean;
}
```

In `playerDeathCrates`: `const main: CrateDrop = { ore: ship.ore, credits, gear: first, darkMatter: false };` and extras `({ ore: 0, credits: 0, gear, darkMatter: false })`.

`takeCrate`:

```ts
export function takeCrate(ship: ShipEntity, crate: CrateDrop): CrateDrop | null {
  ship.carriedCredits += crate.credits;
  ship.ore = Math.min(ship.stats.cargoCapacity, ship.ore + crate.ore);
  if (crate.darkMatter) ship.darkMatter = DARK_MATTER_SHIELD;
  if (crate.gear === null) return null;
  if (ship.salvage.length < SALVAGE_CAPACITY) {
    ship.salvage.push(crate.gear);
    return null;
  }
  return { ore: 0, credits: 0, gear: crate.gear, darkMatter: false };
}
```

`CrateEntity` in `entities.ts` gains `readonly darkMatter: boolean;` (it is spread from `CrateDrop` in `World.spawnCrate`).

`BossDirector.loot()`: `return { credits: LEVIATHAN_CREDITS, ore: LEVIATHAN_ORE, gear: randomGear(this.rng, [3]), darkMatter: true };`

`PirateDirector.pirateLoot()`: `return { credits: spec.credits, ore: spec.ore, gear, darkMatter: false };`

`World.ts`:
- `npcLoot`: `const empty: CrateDrop = { credits: 0, ore: 0, gear: null, darkMatter: false };`
- `resolveMines`: `const block = applyDamage(...)` and push `{ shipId, angle, block }`.
- `hitShip`: `const block = applyDamage(...)` and `return { shipId: ship.id, angle, block };`

`packages/client/src/render/spriteIds.ts`:

```ts
const HIT_EFFECTS: Readonly<Record<HitBlock, string>> = { hull: 'hull_hit', shield: 'shield_impact', dark_matter: 'dark_matter_impact' };

export function hitEffectFor(block: HitBlock): string {
  return HIT_EFFECTS[block];
}
```

`packages/client/src/render/Effects.ts` — `HitEffect.shield: boolean` becomes `readonly block: HitBlock;`. In `hit()`:

```ts
  hit({ ship, angle, block, offset: hullOffset, delaySeconds }: HitEffect): void {
    const view = this.sprites.animate(hitEffectFor(block), HIT_SECONDS, false);
    const attach = (): void => {
      if (ship.destroyed) return;
      const local = angle - ship.rotation;
      const offset = block === 'hull' ? hullOffset : 0;
```

(rest unchanged).

`packages/client/src/render/Renderer.ts:117` — pass `block: hit.block` instead of `shield: hit.shield`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src packages/server/src packages/server/test packages/client/src/render packages/client/test
git commit -m "feat: add dark matter barrier from leviathan crates"
```

---

### Task 3: Snapshot fields

**Files:**
- Modify: `packages/shared/src/protocol.ts:86-100,185-213`
- Modify: `packages/server/src/net/snapshot.ts`
- Modify: `packages/client/test/support/self.ts`
- Test: `packages/server/test/snapshot.test.ts`, `packages/server/test/integration.test.ts`

**Interfaces:**
- Consumes: `ShipEntity.darkMatter` (Task 2).
- Produces: `SelfState.darkMatter: number`; `ShipState.darkMatter?: true`.

- [ ] **Step 1: Write failing tests** in `snapshot.test.ts`:

```ts
  it('reports the dark matter barrier to its owner and flags it for others only while active', () => {
    const self = createShip(1, 1, 'alice', shipRecord(10, 20, 1));
    self.darkMatter = 312.6;
    expect(buildSnapshot(self, [self], 1, 100).self.darkMatter).toBe(313);
    expect(toEntityState(self)).toMatchObject({ darkMatter: true });
    self.darkMatter = 0;
    expect(toEntityState(self)).not.toHaveProperty('darkMatter');
  });
```

In `integration.test.ts`, inside the test `sends the leviathan and its orbs to a nearby player` style (reuse its app/client helpers), add a new test: add a leviathan near the player, set its `hull = 0`, wait for snapshots until `self.darkMatter === DARK_MATTER_SHIELD` after the player is moved onto the crate position (set the server-side ship `x`/`y` to the boss position via `app.world`), and assert it.

- [ ] **Step 2: Run** `pnpm --filter @arena/server test -- snapshot integration` → FAIL.

- [ ] **Step 3: Implement**

`protocol.ts`: in `ShipState` add `readonly darkMatter?: true;` after `health?`; in `SelfState` add `readonly darkMatter: number;` after `shieldDisrupted`.

`snapshot.ts` `toEntityState` ship case, after the `health` spread:

```ts
        ...(entity.darkMatter > 0 ? { darkMatter: true as const } : {}),
```

`toSelfState`, after `shieldDisrupted`:

```ts
    darkMatter: Math.round(ship.darkMatter),
```

`packages/client/test/support/self.ts`: add `darkMatter: 0,` after `shieldDisrupted: 0,`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm test && pnpm lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts packages/server/src/net/snapshot.ts packages/server/test packages/client/test/support/self.ts
git commit -m "feat: send dark matter barrier state in snapshots"
```

---

### Task 4: Barrier sprite on ships

**Files:**
- Modify: `packages/client/src/render/Renderer.ts` (`ANIMATIONS`, `EntityView`, `replaceView`, the update at line ~184)

**Interfaces:**
- Consumes: `ShipState.darkMatter?: true` (Task 3), sprite id `dark_matter_shield` (Task 1).

- [ ] **Step 1: Implement**
- Add `dark_matter_shield: 1.2` to `ANIMATIONS`.
- `EntityView` gains `readonly darkMatter: Container | null;`.
- In `replaceView`, for non-Leviathan ships create the barrier before the normal bubble so the bubble draws on top:

```ts
    const darkMatter = entity.kind === 'ship' && !isLeviathan ? this.sprites.animate('dark_matter_shield', ANIMATIONS.dark_matter_shield ?? 1.2, true) : null;
    if (darkMatter) container.addChild(darkMatter);
    const shield = ...existing...
```

  and include `darkMatter` in the `view` literal.
- Next to `if (view.shield && entity.kind === 'ship') view.shield.visible = entity.shieldUp;` add:

```ts
    if (view.darkMatter && entity.kind === 'ship') view.darkMatter.visible = entity.darkMatter === true;
```

- Make sure the own ship's view goes through the same path (check how the predicted self ship is rendered; if it uses `SelfState`, set visibility from `self.darkMatter > 0`).

- [ ] **Step 2: Run** `pnpm typecheck && pnpm test && pnpm lint && pnpm build` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/render/Renderer.ts
git commit -m "feat(client): draw the dark matter barrier around ships"
```

---

### Task 5: HUD meter, animated icon, rules text

**Files:**
- Modify: `packages/client/src/ui/Hud.ts:107-125,154-180`
- Modify: `packages/client/src/style.css` (near `.hud-resource.shield` line 83)
- Modify: `packages/client/index.html:97`, `controls.md:55`
- Test: `packages/client/test/hud.test.ts`

**Interfaces:**
- Consumes: `SelfState.darkMatter` (Task 3), `DARK_MATTER_SHIELD` (Task 2), sprite file `/ui/dark_matter.png` (Task A).

- [ ] **Step 1: Write failing test** in `hud.test.ts`:

```ts
describe('hudResources', () => {
  it('adds the dark matter meter only while the barrier is active', () => {
    expect(hudResources(selfState())).toEqual(['hull', 'shield', 'ammo']);
    expect(hudResources(selfState({ darkMatter: 120 }))).toEqual(['hull', 'shield', 'dark_matter', 'ammo']);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @arena/client test -- hud` → FAIL.

- [ ] **Step 3: Implement** in `Hud.ts`:

```ts
type HudResource = 'hull' | 'shield' | 'dark_matter' | 'ammo';

export function hudResources(self: SelfState): HudResource[] {
  return self.darkMatter > 0 ? ['hull', 'shield', 'dark_matter', 'ammo'] : ['hull', 'shield', 'ammo'];
}
```

Widen `resourceMeter`'s `className` parameter to `'hull' | 'shield' | 'dark_matter'`. Add:

```ts
function darkMatterMeter(self: SelfState): HTMLElement {
  const panel = resourceMeter('Dark matter', self.darkMatter, DARK_MATTER_SHIELD, 'dark_matter');
  panel.prepend(textNode('span', 'hud-dark-matter-icon', ''));
  return panel;
}
```

In `update`, add `self.darkMatter` to the `key` array, and build resources from `hudResources(self)`:

```ts
      const meters: Readonly<Record<HudResource, () => HTMLElement>> = {
        hull: () => resourceMeter('Hull integrity', self.hull, self.maxHull, 'hull'),
        shield: () => shieldMeter(self),
        dark_matter: () => darkMatterMeter(self),
        ammo: () => ammo,
      };
      resources.append(...hudResources(self).map((kind) => meters[kind]()));
```

`style.css`, after `.hud-resource.shield`:

```css
.hud-resource.dark_matter { --meter-color: #c04bff; position: relative; padding-left: 26px; }
.hud-dark-matter-icon { position: absolute; left: 0; top: 50%; width: 22px; height: 22px; transform: translateY(-50%); background: url('/ui/dark_matter.png') 0 0 / 400% 100% no-repeat; animation: dark-matter-spin 0.8s steps(4) infinite; }
@keyframes dark-matter-spin { to { background-position: -400% 0; } }
```

Check the `.combat-bar` / `.hud-resources` grid: if it uses fixed `grid-template-columns`, switch it to `grid-auto-flow: column` / `repeat(auto-fit, ...)` so a fourth meter fits on desktop and in the compact touch strip (portrait and landscape). Verify in the browser at 390×844 and 844×390.

`index.html:97` — append to the Leviathan line: ` Its crate also holds a <b>dark matter shield</b>: 500 points of always-on protection that absorbs every hit until it breaks, and you can keep firing through it.`

`controls.md:55` — append: ` The crate also grants a dark matter shield: a 500-point always-on barrier that absorbs all damage until broken, kept through docking, lost on logout. You can fire, launch rockets and mine through it.`

- [ ] **Step 4: Run** `pnpm typecheck && pnpm test && pnpm lint && pnpm build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/Hud.ts packages/client/src/style.css packages/client/index.html packages/client/test/hud.test.ts controls.md
git commit -m "feat(client): show the dark matter shield in the HUD and rules"
```

---

### Task 6: Final verification (Coordinator)

- [ ] After Task A and Task 5 are committed: `pnpm typecheck && pnpm test && pnpm lint && pnpm assets:check && pnpm build` → all pass, `assets ok`.
- [ ] Phone check over ADB + Chrome DevTools (`adb reverse tcp:5173 tcp:5173`): kill a spawned Leviathan, pick the crate, confirm barrier sprite, purple HUD meter with animated icon, `dark_matter_impact` on hits, firing allowed, barrier disappears at 0.
- [ ] Report to the user; do not merge to `master`.
