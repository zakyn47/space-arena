# Space Arena — Docking, Rockets, Ship Builds

Date: 2026-10-24
Status: Approved in brainstorming, pending written review
Extends: `docs/superpowers/specs/2026-10-24-space-arena-design.md`

## 1. Summary

Three features:

1. **Manual docking (E):** dock at a station by pressing E; the ship snaps to the station and is frozen; E undocks. After undocking, docking is unavailable for 30 s.
2. **Rockets (R):** a homing special weapon with limited ammo.
3. **Build menu:** buyable hull classes with gear slots and Mk1–Mk3 gear items. This replaces the five fixed upgrade lines (hull, engine, weapon, shield, cargo).

New art (Codex): rocket sprites, four hull sprites, a cannon bullet, and seven gear icons.

## 2. Non-Goals

Hangar or item storage, item trading between players, NPCs, crafting, gear durability, more than one engine slot, keyboard navigation inside the build menu.

## 3. Docking

### 3.1 Rules

- Client sends `{ type: 'dock' }` when E is pressed. The server toggles the dock state.
- **Dock** succeeds when all hold:
  - distance to a safe-zone center ≤ 200 px (`DOCK_RANGE`),
  - speed ≤ 60 px/s (`DOCK_MAX_SPEED`, unchanged),
  - no damage taken in the last 5 s (`DOCK_COMBAT_COOLDOWN`, unchanged),
  - at least 30 s since the last undock (`DOCK_COOLDOWN`).
- On dock: the ship moves to the station center, velocity becomes 0, ore is sold, carried credits are banked, and the hull is repaired. Rockets are not refilled.
- While docked, the ship ignores movement, fire, shield and rocket input. The build menu is available only while docked.
- **Undock** (E while docked): the ship stays at the station center with velocity 0 and can fly. The 30 s cooldown starts.
- A dock request that fails changes nothing; the HUD explains why (see 6.3).
- Automatic docking is removed.
- Death clears the dock state and the cooldown.
- Disconnect while docked: the ship is inside a safe zone, so it is saved and removed immediately (unchanged).

### 3.2 Client prediction

While `self.docked` is true, the predictor does not step motion; it adopts the server position.

## 4. Rockets

| Property | Value |
|---|---|
| Key | R (held) |
| Fire cooldown | 1 s |
| Launch speed / max speed | 300 / 700 px/s |
| Acceleration | 400 px/s² |
| Turn rate | 2.5 rad/s |
| Lifetime | 4 s |
| Damage | 30 |
| Lock range / cone | 1 200 px / ±45° from the nose |
| Base max rockets | 10 |
| Shop price | 25 credits each |

- Launch from the nose. At launch, lock the nearest other ship inside the range and cone; with no lock, fly straight.
- Each tick, steer toward the locked target (limited by turn rate) while it exists; then accelerate along the heading.
- Hits use the swept segment of the last step against ships (radius 24) and asteroids, like bullets. A raised shield absorbs the hit. Rockets despawn on entering a safe zone or leaving the world.
- Cannot fire while shielded, docked, or in a safe zone. Each shot uses one rocket.
- Ammo: new account 10 rockets; respawn after death 5 rockets; death loses all carried rockets. Rocket count is persisted.
- Rockets are an entity type of their own on server and in snapshots.

## 5. Hulls and Gear

### 5.1 Hulls

| Id | Name | Cost | Hull HP | Thrust px/s² | Max speed px/s | Turn rad/s | Cargo | Weapon | Shield | Engine | Utility |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `scout` | Scout | 0 | 80 | 240 | 460 | 3.6 | 15 | 1 | 1 | 1 | 1 |
| `fighter` | Fighter | 1 500 | 120 | 220 | 420 | 3.2 | 20 | 2 | 1 | 1 | 1 |
| `freighter` | Freighter | 3 000 | 160 | 160 | 320 | 2.2 | 60 | 1 | 1 | 1 | 3 |
| `gunship` | Gunship | 5 000 | 200 | 170 | 340 | 2.4 | 25 | 3 | 2 | 1 | 1 |

### 5.2 Gear

Installed gear is `{ gearId, mk }` with `mk` 1–3.

| Id | Slot | Mk1 | Mk2 | Mk3 |
|---|---|---|---|---|
| `pulse_laser` | weapon | dmg 10, 4 shots/s, 800 px/s — 250 cr | dmg 14, 4.5/s, 900 px/s — 700 cr | dmg 19, 5/s, 1 000 px/s — 1 600 cr |
| `heavy_cannon` | weapon | dmg 25, 1.5/s, 650 px/s — 400 cr | dmg 34, 1.5/s, 650 px/s — 1 000 cr | dmg 45, 1.5/s, 650 px/s — 2 200 cr |
| `shield_gen` | shield | +100 energy, +15 regen/s — 250 cr | +150, +20 — 700 cr | +220, +28 — 1 600 cr |
| `thruster` | engine | thrust & speed ×1.00, turn ×1.00 — 250 cr | ×1.15, ×1.10 — 700 cr | ×1.30, ×1.20 — 1 600 cr |
| `armor` | utility | +30 hull — 200 cr | +60 — 600 cr | +100 — 1 400 cr |
| `cargo_pod` | utility | +10 cargo — 150 cr | +20 — 450 cr | +35 — 1 000 cr |
| `rocket_rack` | utility | +5 max rockets — 200 cr | +10 — 600 cr | +15 — 1 300 cr |

### 5.3 Stat rules

- Stats = hull base values + the sum of installed gear effects.
- Engine slot empty: thrust, max speed and turn rate ×0.6.
- No weapon installed: cannot fire the gun. No shield generator: shield cannot be raised (energy 0).
- Shield drain stays 30/s regardless of generators.
- Each installed weapon has its own cooldown and fires its own bullet. With *n* weapons, weapon *i* fires from the nose offset sideways by `(i − (n−1)/2) × 20` px.
- Bullets carry `weaponId` and `mk` so the client picks a sprite.
- Build value = hull cost + cost of each installed gear item.
- Bounty = 100 + 25% of the victim's build value.

### 5.4 Starter build

Scout + `pulse_laser` Mk1 + `shield_gen` Mk1 + `thruster` Mk1, utility empty. New accounts and respawns get the starter build.

### 5.5 Shop rules (server-side, docked only)

- **Buy hull:** the old hull is sold for 50% of its cost. Installed gear moves into the new hull's slots of the same type, in order. Gear that does not fit is sold for 50%. Fails with `insufficient_credits` if banked credits plus refunds do not cover the price; on failure nothing changes. Buying the hull already flown fails with `unknown_item`.
- **Buy gear into slot `{ type, index }`:** the item's slot type must match (`slot_mismatch`); the index must exist (`slot_mismatch`). Gear already in the slot is sold for 50% first. Price check uses banked credits plus that refund.
- **Sell gear from slot:** empties the slot and refunds 50%. Empty slot fails with `slot_mismatch`.
- **Buy rockets `{ count }`:** count 1–20, 25 credits each, total after purchase ≤ max rockets (`rocket_cap`).
- After any successful purchase or sale: recompute stats, set hull to new max, clamp shield energy to new max, clamp rockets to new max, save the ship.
- Failure reasons: `not_docked`, `insufficient_credits`, `slot_mismatch`, `rocket_cap`, `unknown_item`.

## 6. Protocol

### 6.1 Client → server

- `input` gains `rocket: boolean`.
- New: `{ type: 'dock' }`, `{ type: 'buyHull', hullId }`, `{ type: 'buyGear', gearId, mk, slot: { type, index } }`, `{ type: 'sellGear', slot: { type, index } }`, `{ type: 'buyRockets', count }`.
- Removed: `{ type: 'buy', line }`.
- `hullId`, `gearId`, slot type are zod enums from the catalog; `mk` is 1–3; `index` is a non-negative integer.

### 6.2 Server → client

- `shopResult { ok: true } | { ok: false, reason }` replaces `buyResult`.
- `ShipState`: `hullId` replaces `hullTier`.
- `BulletState`: `weaponId`, `mk` replace `tier`.
- New `RocketState { kind: 'rocket', id, x, y, vx, vy, angle }`.
- `SelfState`: `build { hullId, slots }` replaces `loadout`; adds `rockets`, `maxRockets`, `canDock`, `dockCooldown` (seconds remaining, 0 when ready).

### 6.3 HUD dock prompt

- `canDock` true: "Press E to dock".
- Docked: "Docked — press E to undock".
- In range of a station but `dockCooldown` > 0: "Dock available in Ns".

## 7. Persistence

- `ships` table gains `hull_id TEXT`, `gear_json TEXT`, `rockets INTEGER`; the five tier columns are dropped.
- Schema versioning with `PRAGMA user_version`: version 1 = original schema, version 2 = this schema. Migration runs once, in one transaction:
  - for each existing ship: refund the old upgrade value (sum of old tier costs) into banked credits, set the starter build, set rockets to 10;
  - drop the tier columns.
- `gear_json` is validated with zod on load. Invalid data loads the starter build and logs a warning with the account id.
- Saved on: dock, undock, every shop action, death, disconnect (unchanged otherwise).

## 8. Client

- Keys: E sends `dock` on key press (not repeated while held); R held sets `input.rocket`.
- **Build menu** panel, visible only while docked, three tabs:
  - *Ship:* current hull name and its slots grouped Weapon / Shield / Engine / Utility. Each slot shows the installed item icon and Mk or "Empty", with a Sell button. Selecting a slot lists compatible gear (each Mk) with price and the stat change it would cause, and a Buy button.
  - *Hulls:* one card per hull with sprite, stats, slot counts, price and Buy (disabled for the current hull).
  - *Rockets:* count / max, "+1" and "Fill" buttons with total price.
  - A stat summary (hull HP, max speed, damage per second, shield energy, cargo, max rockets) is always shown.
  - Shop errors appear in the panel.
- HUD: rocket counter and the dock prompt from 6.3.
- Renderer: hull sprite by `hullId`; bullet sprite by weapon (`pulse_laser` Mk1/2/3 → `bullet_t0` / `bullet_t2` / `bullet_t4`, `heavy_cannon` → `bullet_cannon`); rocket sprite rotated to its angle with a `rocket_trail` puff behind it.
- `controls.md` gains E and R.

## 9. Assets (Codex)

Add to `assets/manifest.json`, following `assets/STYLE.md`:

| Id | Size | Notes |
|---|---|---|
| `ship_scout`, `ship_fighter`, `ship_freighter`, `ship_gunship` | 64×64 | nose up; silhouettes clearly distinct by role |
| `bullet_cannon` | 16×16 | heavy orange slug |
| `rocket` | 24×24 | nose up, small missile |
| `rocket_trail` | 16×16 | exhaust puff, soft orange |
| `icon_rocket` | 48×48 | UI glyph |
| `gear_pulse_laser`, `gear_heavy_cannon`, `gear_shield_gen`, `gear_thruster`, `gear_armor`, `gear_cargo_pod`, `gear_rocket_rack` | 48×48 | UI glyph style |

Remove `ship_t0`–`ship_t5`, `bullet_t1`, `bullet_t3`, `bullet_t5`, and `icon_hull`, `icon_engine`, `icon_weapon`, `icon_shield`, `icon_cargo` from the manifest and repository.

## 10. Architecture

- `shared/catalog/hulls.ts`, `shared/catalog/gear.ts`: static typed tables. `shared/build.ts`: `Build`, `STARTER_BUILD`, `statsFor(build)`, `buildValue(build)`, `weaponsOf(build)`. `upgrades.ts` is removed.
- Server: `world/Docking.ts` (dock state machine), `world/Rockets.ts` (launch, lock, steering), `world/Shop.ts` (pure shop operations returning outcomes) replacing `Economy.ts` buy logic; `world/Combat.ts` fires per-weapon bullets. `db/migrations.ts` for versioned migrations.
- Client: `ui/BuildMenu.ts` (+ small pure view-model functions for testing), HUD and input changes, renderer additions.

## 11. Testing

- Unit: catalog stats and `statsFor` rules (empty engine, no weapon, multiple weapons, multiple shield generators); build value and bounty; every shop operation including refunds, fit-on-hull-change, failures leaving state unchanged; dock state machine (range, speed, damage, cooldown, frozen input, undock); rocket lock (cone, range, nearest), steering, hit, shield absorb, ammo rules (10/5/0); migration from a version-1 database with tiers to version 2 with correct refunds; invalid `gear_json` fallback; client view-models for build menu and HUD prompt; predictor freeze while docked.
- Integration: E-dock, buy gear, undock, fire a rocket that kills a target, victim respawns with the starter build and 5 rockets.

## 12. Build Orchestration

Same as the first spec: Opus coordinates. Shared catalog + protocol first, serially. Then parallel lanes: server, client, Codex art. Then integration and playtest.
