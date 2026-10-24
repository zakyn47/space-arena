# Space Arena — Pirates and Mining Laser

Date: 2026-10-24
Status: Approved in brainstorming, pending written review
Extends: `docs/superpowers/specs/2026-10-24-space-arena-design.md`, `docs/superpowers/specs/2026-10-24-docking-rockets-builds-design.md`

## 1. Summary

1. **AI pirate patrols:** server-controlled pirate ships roam open space in three tiers. They attack nearby players and drop crates with credits, ore and sometimes a gear item. New players farm weak Raiders near safe zones; richer pirates live farther out.
2. **Mining laser:** a new utility gear. Holding F drills the nearest asteroid in front of the ship and pulls ore straight into cargo.
3. **Salvage hold:** gear dropped by pirates (or by players on death) is carried in a 3-item hold and can be installed or sold while docked.

Follow-up (separate spec, not in scope here): pirate bases.

## 2. Non-Goals

Pirate bases, pirate factions or reputation, pirate chat or taunts, pathfinding around asteroids (pirates fly through asteroids like players do), hangar storage, trading salvage between players.

## 3. Pirates

### 3.1 Tiers

Builds use the existing catalog.

| Tier | Hull | Gear | Rockets | Band (distance from nearest safe-zone edge) | Reward credits | Ore in crate | Gear drop chance | Drop Mk range |
|---|---|---|---|---|---|---|---|---|
| `raider` | Scout | Pulse Laser Mk1; Shield Gen Mk1; Thruster Mk1; utility empty | 0 | 1 000–4 000 px | 40 | 2 | 2% | 1 |
| `marauder` | Fighter | Pulse Laser Mk2 ×2; Shield Gen Mk2; Thruster Mk2; utility empty | 5 | 4 000–8 000 px | 120 | 4 | 5% | 1–2 |
| `warlord` | Gunship | Heavy Cannon Mk2 ×2 + Pulse Laser Mk3; Shield Gen Mk2 ×2; Thruster Mk2; Armor Mk2 | 5 | ≥ 8 000 px | 350 | 6 | 12% | 2–3 |

### 3.2 Population and respawn

- Patrols: 8 Raider patrols of 2 ships; 5 Marauder patrols of 2–3 ships (uniform random); 2 Warlord patrols of 1 Warlord + 2 Marauders.
- A patrol spawns at a random point inside its band (and inside the world) and picks 4 random waypoints in the same band.
- When every member of a patrol is dead, the patrol respawns after 60 s at a new random point.
- Pirates are server-only: never persisted, never saved on death or disconnect.

### 3.3 Brain (per pirate, evaluated every tick)

States:

- **patrol:** fly toward the current waypoint at ≤ 60% of max speed; switch to the next waypoint within 150 px. Patrol members share the patrol's waypoint list.
- **chase:** a target exists; fly toward it at full speed.
- **attack:** target within 450 px; turn to face it, fire guns when the heading error is ≤ 0.2 rad, fire a rocket (if any left) when the heading error is ≤ 0.4 rad.
- **return:** target lost; fly back toward the current waypoint, then **patrol**.

Targeting:

- Acquire: the nearest player ship within 800 px that is not docked, not inside a safe zone, and not another pirate.
- Lose: the target is dead, docked, inside a safe zone, or farther than 1 600 px.
- When any patrol member acquires a target, all members of that patrol take the same target.

Movement rules:

- Steering produces normal `ShipInput` (thrust / reverse / left / right / fire / shield / rocket) for the shared physics; pirates obey every rule players obey.
- Pirates keep out of safe zones: if the next position would be within `zone radius + 200 px` of a zone center, the brain turns away from the zone and thrusts outward.
- Shield: raised when hull < 40% of max and shield energy > 30 and the pirate is not firing this tick.
- Speed control: thrust when speed along the heading is below the desired speed, reverse when above by more than 40 px/s.

### 3.4 Combat rules involving pirates

- Projectiles fired by a pirate never hit another pirate. Player projectiles hit pirates.
- Pirate rockets lock only player ships; player rockets may lock pirates.
- On pirate death: no PvP bounty is paid. A crate drops at the death point with the tier's reward credits, its ore amount, and, with the tier's drop chance, one random gear item (uniform over all gear ids, Mk uniform in the tier's Mk range).
- When a pirate kills a player, the normal player death rules apply (player crate drops); the pirate gains nothing.
- `died` events for pirates are not sent to anyone and are not saved.

## 4. Mining Laser

### 4.1 Gear

New utility gear `mining_laser`:

| Mk | Ore per second | Range | Cost |
|---|---|---|---|
| 1 | 1.0 | 150 px | 300 |
| 2 | 2.0 | 200 px | 800 |
| 3 | 3.5 | 250 px | 1 800 |

Several installed mining lasers add their rates; range is the maximum of the installed lasers.

### 4.2 Rules

- Hold F (`input.mine`). Each tick, the beam targets the nearest asteroid whose surface (center distance − radius) is within range and whose center is within ±45° of the nose.
- Mining is active only when: the ship has at least one mining laser, cargo is not full, the ship is not firing, not shielded, not docked, and not in a safe zone.
- Each active tick adds `rate × dt` to the ship's mining progress; each whole unit moves 1 ore from the asteroid's reserve into cargo.
- Asteroids get an `ore` reserve equal to 2 × their shoot yield at spawn. Mining lowers the reserve; at 0 the asteroid crumbles (removed without dropping pickups) and the field respawns it as usual. Shooting an asteroid to destruction still drops `oreYield` pickups (unchanged), independent of the remaining reserve.
- Progress resets when the target changes or mining stops.

### 4.3 Starter build

The starter build's utility slot gets `mining_laser` Mk1. New accounts and respawns get it. Already-saved ships keep their builds. Build value and bounty change accordingly (starter value 1 050, bounty 362).

## 5. Salvage Hold

- Ships carry `salvage`: a list of up to 3 `InstalledGear` items (`SALVAGE_CAPACITY = 3`).
- Crates gain an optional `gear: InstalledGear | null`. On pickup: credits and ore as today; the gear moves into the hold if there is room. If the hold is full, the crate remains with only its gear until it expires.
- On player death, the victim's salvage goes into their death crate: the crate keeps one gear item per crate, so each salvage item becomes its own crate at the death point (credits and ore stay in the first crate).
- Shop actions (docked only):
  - `installSalvage { index, slot }`: installs the item free of charge into the slot; any gear already there sells for 50%. Fails with `slot_mismatch` if the slot type differs or the slot does not exist, `unknown_item` if the index is out of range.
  - `sellSalvage { index }`: removes the item and adds 50% of its cost to banked credits. Fails with `unknown_item` if the index is out of range.
- Salvage is persisted with the ship and lost on death.

## 6. Protocol

- `ShipInput.mine` (F held).
- `ShipState` adds `npc: 'raider' | 'marauder' | 'warlord' | null` and `miningTargetId: number | null`.
- `SelfState` adds `salvage: InstalledGear[]` and `miningTargetId: number | null`.
- `CrateState` adds `hasGear: boolean`.
- New client messages: `{ type: 'installSalvage', index, slot }`, `{ type: 'sellSalvage', index }` (part of `ShopAction`). `index` is an integer 0–2.

## 7. Persistence

- Schema version 3: `ships.salvage_json TEXT NOT NULL DEFAULT '[]'`.
- Migration 2 → 3 adds the column in one transaction. A version-1 database migrates through 2 then 3.
- `salvage_json` is zod-validated on load; invalid data loads an empty hold and logs a warning.

## 8. Client

- Keys: F held sets `input.mine`.
- Rendering:
  - Pirates use sprites `pirate_raider`, `pirate_marauder`, `pirate_warlord` and show a red tier label ("Raider", "Marauder", "Warlord") above the ship (label does not rotate).
  - Mining beam: a `mining_beam` sprite stretched from the ship's nose to the target asteroid while `miningTargetId` is set.
  - Crates with `hasGear` show a small `icon_salvage` badge.
- HUD: a `Salvage n / 3` line.
- Build menu, Ship tab: a Salvage section listing items with **Install** (opens the compatible-slot list) and **Sell** (shows the 50% price).
- `controls.md`: add F; add notes on pirates, mining and salvage.

## 9. Assets (Codex)

| Id | Size | Notes |
|---|---|---|
| `pirate_raider`, `pirate_marauder`, `pirate_warlord` | 64×64 | nose up; red/black pirate livery, jagged silhouettes, readable as hostile next to the player hulls; size and menace grow with tier |
| `mining_beam` | 16×64 | vertical, seamlessly tileable along its length, teal `#3CFFB0` energy beam with bright core |
| `gear_mining_laser` | 48×48 | UI glyph style: drill emitter |
| `icon_salvage` | 48×48 | UI glyph style: gear cog inside a crate |

## 10. Architecture

- Shared: `mining_laser` in the gear catalog (new `mining` effect kind with `rate` and `range`); `ShipStats` adds `miningRate` and `miningRange`; `SALVAGE_CAPACITY`; pirate tier ids; protocol changes.
- Server:
  - `world/pirates/tiers.ts`: tier table (build, rockets, band, reward, ore, drop chance, Mk range).
  - `world/pirates/PirateBrain.ts`: pure function from (pirate, patrol, visible ships, zones, time) to `ShipInput` plus state transitions.
  - `world/pirates/PirateDirector.ts`: spawns patrols, keeps patrol membership, respawn timers, assigns shared targets.
  - `world/Mining.ts`: target selection and ore transfer.
  - `world/Shop.ts`: salvage actions.
  - `ShipEntity` gains `npc` (tier or null), `salvage`, `miningProgress`, `miningTargetId`. Pirate account ids are negative and never persisted.
  - `World` runs the director before ships step; pirate inputs go through the same input path.
  - `db/migrations.ts`: version 3.
- Client: input F, renderer additions (pirate sprites, labels, beam, salvage badge), HUD line, build menu salvage section.

## 11. Testing

- Unit:
  - Pirate brain: patrol waypoint switching, acquire/lose rules (range, docked, safe zone, other pirates), shared patrol target, attack firing conditions, shield rule, safe-zone avoidance.
  - Director: band placement, population counts, respawn after 60 s.
  - Combat: pirate projectiles ignore pirates; pirate rockets lock only players; pirate death crate contents and drop chances (seeded RNG); no bounty for pirate kills.
  - Mining: target selection (range, cone), rate stacking, cargo full, blocked while firing/shielded/docked/in zone, reserve depletion crumbles asteroid.
  - Salvage: pickup into hold, full hold leaves gear crate, install/sell actions and failures, death crate split.
  - Migration 2 → 3 and 1 → 3; invalid salvage JSON fallback.
  - Client view-models: salvage section, HUD line, sprite ids for pirates.
- Integration: a player kills a Raider and picks up its crate; a player mines an asteroid with F and cargo rises; pirates are never saved.

## 12. Build Orchestration

Opus coordinates. Shared catalog + protocol first (serial, master). Then parallel lanes in worktrees: server (Sonnet), client (Sonnet), art (Codex via `orca worktree create --agent codex --prompt`). Then merge, full gates, playtest.
