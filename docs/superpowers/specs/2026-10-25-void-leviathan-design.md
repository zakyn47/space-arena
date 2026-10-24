# Void Leviathan — world boss design

## Goal

Add one large alien space monster, the **Void Leviathan**, that lives in the middle of the arena. It is slow, has a lot of hull, fires slow plasma orbs that players can dodge, and drops rich loot. It is a group target, but a skilled solo pilot can kill it.

## Decisions

| Topic | Decision |
|---|---|
| Attack | Aimed spread of 3 plasma orbs every 2.5 s |
| Lifecycle | One boss per world, respawns 10 minutes after death |
| Reward | One crate: 1 500 cr, 15 ore, guaranteed random Mk3 gear; killing blow gets 500 captain XP |
| Toughness | 3 000 hull, no shield, regenerates 5 HP/s when no player is within 1 500 px |
| Architecture | Server-flown ship entity (like pirates) with a custom radius and fixed stats; rendered as a monster sprite |

## Behavior (server)

### Stats

- `npc: 'leviathan'`, name "Void Leviathan", hit radius 90 px (normal ships: 24 px).
- Fixed stats, not built from hulls or gear: max hull 3 000, no shield, max speed 60 px/s, low thrust and turn rate.
- Never persisted, never picks up loot, never appears in `died` events, never counts toward PvP highscores — the same rules as pirates.

### Movement

- Patrols random waypoints inside a circle of radius 2 000 px around the arena center (`WORLD_SIZE / 2`, `WORLD_SIZE / 2`).
- Targets the nearest valid player (not docked, not in a safe zone) within 1 400 px and turns slowly toward it.
- Never steers outside the patrol circle: chase goals are clamped to the circle.

### Attack

- While it has a target, fires every 2.5 s: 3 orbs in a 20° spread centered on the bearing to the target.
- Orb: speed 220 px/s, lifetime 6 s, damage 40.
- Orbs reuse the projectile hit pipeline: a raised shield blocks them and hit effects play.
- Orbs pass through all NPCs (pirates and the Leviathan) and other orbs, and vanish in safe zones.

### Health

- Regenerates 5 hull per second while no player is within 1 500 px, capped at max hull.

### Death and respawn

- Drops one crate at its position: 1 500 credits, 15 ore, one random Mk3 gear item.
- The pilot who landed the killing blow (`lastHitBy`, the existing rule) gains 500 captain XP.
- Respawns at the center 600 s after death. On server start it spawns immediately.
- A server restart respawns it at full health. There is no database change.

### Hit radius

- `ShipEntity` gets a `radius` field (default `SHIP_RADIUS`; the Leviathan uses 90).
- Every check that currently uses `SHIP_RADIUS` for a ship uses `ship.radius`: projectile hits, the spatial query padding for hits, and mine triggers and blasts. The client places hit effects on the Leviathan's edge using its sprite size.

## Modules

- `server/src/world/boss/BossDirector.ts` — spawning, patrol waypoints, targeting, attack timing, regeneration and respawn. `World` calls it once per tick, next to `PirateDirector`.
- `server/src/world/boss/leviathan.ts` — the Leviathan's fixed stats, loot and constants.
- `World` gains an `orbs` projectile collection that goes through `resolveProjectileHits`.
- Shared: `NpcKind = PirateTier | 'leviathan'`. `PIRATE_EXPERIENCE` and the NPC display names cover all `NpcKind` values.

## Network and client

- `ShipState.npc` widens to `NpcKind | null`. A new optional `health` field (0–1, two decimals) is sent only for the Leviathan.
- New entity state `OrbState { kind: 'orb', id, x, y, vx, vy }`, interpolated like bullets.
- New radar blip kind `boss`, drawn larger and in purple on the minimap.
- Renderer:
  - `leviathan` animated sprite (slow pulse), rotated to its heading
  - a "Void Leviathan" label and a thin purple health bar above it
  - `plasma_orb` animated sprite
  - `leviathan_death` played when it disappears inside the view, instead of the ship explosion
- Rules tab: one line describing the Leviathan.

## Assets (Codex, via an Orca terminal)

| id | file | size | frames | look |
|---|---|---|---|---|
| `leviathan` | `world/leviathan.png` | 768×192 | 4 | Top-down alien space monster, organic and tentacled, dark violet body with glowing cyan-green bio-lights; frames pulse slowly; head faces up |
| `plasma_orb` | `bullets/plasma_orb.png` | 64×32 | 2 | Violet/magenta energy ball with a white-hot core; frames flicker |
| `leviathan_death` | `fx/leviathan_death.png` | 1536×192 | 8 | Violet flash, then an organic burst of glowing ichor and spores dissipating to transparent; no gore |

Claude adds the manifest entries and a `STYLE.md` section. Codex only produces the PNGs.

## Testing

- `BossDirector`:
  - spawns at the center and stays inside the patrol circle
  - targets the nearest valid player within 1 400 px
  - fires a 3-orb spread every 2.5 s, only with a target
  - regenerates only when no player is near
  - respawns 600 s after death
- Hit radius: a bullet passing 80 px from the Leviathan's center hits it; the same pass misses a normal ship.
- World:
  - orbs deal 40 damage; a shield blocks them
  - orbs pass through pirates and vanish in safe zones
  - a Leviathan kill drops the crate, gives 500 XP, adds no PvP kill and sends no `died` event
- Snapshot: `health` only for the Leviathan; orb mapping; `boss` radar blip.
- Client: sprite ids for the Leviathan and orbs; the death effect id.
- Integration: a player near the center receives the Leviathan and orbs in snapshots.

## Out of scope

Special phases, minions, damage-share rewards, boss-kill statistics, collisions between ships.
