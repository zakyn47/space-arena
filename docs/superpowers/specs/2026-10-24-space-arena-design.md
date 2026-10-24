# Space Arena — Design Spec

Date: 2026-10-24
Status: Approved in brainstorming, pending written review

## 1. Summary

A 2D multiplayer browser game. Players log in with real accounts and fly starships in one shared, persistent universe. They fight each other to the death (free-for-all PvP), mine asteroids for ore, and return to safe zones to sell ore, bank credits, and buy upgrades for hull, engine, weapon, shield, and cargo. Death costs the player all installed upgrades and all unbanked credits and cargo.

Controls: W thrust, S reverse/brake, A/D rotate, Space fire, Shift shield.

## 2. Goals and Non-Goals

### Goals
- One authoritative server process supporting ~100–300 concurrent players in one world.
- Asteroids-style inertial flight with client-side prediction for responsive controls.
- Persistent accounts and ships (SQLite).
- Risk/reward loop: carried credits and ore are at risk until banked in a safe zone.
- Asset pipeline that never blocks code: missing sprites render as placeholders.

### Non-Goals (v1)
NPC AI, chat, parties/clans, multiple shards/sectors, mobile/touch controls, binary wire protocol, leaderboards, HTTPS termination (handled by a reverse proxy).

## 3. Technology

- TypeScript (strict, no `any`) everywhere, pnpm workspaces.
- Server: Node.js, `ws`, `better-sqlite3`, `argon2` (argon2id), `zod`.
- Client: Vite, PixiJS.
- Tests: Vitest. Lint: ESLint. Typecheck: `tsc --noEmit`.

## 4. Repository Layout

```
ships/
  packages/
    shared/   protocol types + zod schemas, constants, physics step, combat rules, upgrade tables
    server/   HTTP + WebSocket gateway, auth, world simulation, spatial grid, persistence
    client/   input, rendering, prediction, interpolation, UI (login, HUD, shop)
  assets/     generated sprites (PNG), manifest.json, STYLE.md
  docs/superpowers/specs/
```

The `shared` package is the key invariant: the same physics step runs on server (authoritative) and client (prediction), so they cannot drift.

## 5. Architecture

### 5.1 Server components

| Component | Responsibility |
|---|---|
| `HttpServer` | Serves built client; `POST /register`, `POST /login` returning a session token. |
| `Gateway` | WebSocket connections; authenticates the token sent in the first message; decodes/validates and encodes messages. |
| `World` | Owns all entities; runs the 30 Hz tick: apply inputs, physics, collisions, damage, deaths, loot. |
| `SpatialGrid` | Uniform grid (512 px cells); neighbor queries for collision and interest. |
| `InterestManager` | Per player, selects entities within view radius for snapshots. |
| `Economy` | Sell ore, auto-bank credits, buy upgrades; valid only while docked in a safe zone. |
| `PlayerRepository` | SQLite access for accounts, sessions, ships. |
| `AsteroidField` | Spawns and respawns asteroids; ore yield increases with distance from safe zones. |

### 5.2 Client components

| Component | Responsibility |
|---|---|
| `LoginScreen` | Register/login forms; stores session token. |
| `Connection` | WebSocket lifecycle; sends token on connect. |
| `InputSampler` | Samples W/A/S/D/Space/Shift into an input frame each tick. |
| `Predictor` | Runs shared physics on the own ship; reconciles against server state using `lastProcessedSeq`. |
| `Interpolator` | Renders other entities ~100 ms in the past between snapshots. |
| `Renderer` | Pixi layers: starfield, safe zones, asteroids, pickups, ships, bullets, effects. |
| `Hud` | Hull, shield energy, cargo, carried/banked credits, minimap. |
| `ShopPanel` | Opens while docked; shows tiers, costs, buy buttons. |

### 5.3 Data flow

1. Client sends `{ seq, thrust, reverse, left, right, fire, shield }` at 30 Hz.
2. Server queues inputs per player, applies them on each tick.
3. Server sends each player a snapshot at 20 Hz with entities from `InterestManager`, plus `lastProcessedSeq`.
4. Client reconciles its own ship (rewind to server state, replay unacknowledged inputs) and interpolates all others.

Messages are JSON, validated with zod schemas defined in `shared`. Binary encoding is deferred until bandwidth is measured as a problem.

### 5.4 World

- Bounded square, 20 000 × 20 000 px. Ships bounce off / stop at edges.
- Three safe zones (circles with a station sprite) spread across the map.
- Asteroid density and ore value increase with distance from the nearest safe zone.

## 6. Gameplay Rules

### 6.1 Ship stats and upgrades

| Stat group | Base values | Upgrade line |
|---|---|---|
| Hull | 100 HP | Hull, 5 tiers |
| Engine | thrust 200 px/s², max speed 400 px/s, turn 180°/s | Engine, 5 tiers |
| Weapon | damage 10, fire rate 4/s, bullet speed 800 px/s | Weapon, 5 tiers |
| Shield | energy 100, regen 15/s, drain 30/s | Shield, 5 tiers |
| Cargo | 20 ore | Cargo, 3 tiers |

Each tier improves its stats by roughly 20–25%; cost roughly doubles per tier. All values live in one table in `shared/upgrades.ts`. Tiers must be bought in order.

### 6.2 Combat

- Space (held): fire forward, limited by weapon cooldown. Bullets live 1.5 s and collide with ships and asteroids.
- Shift (held): raise shield. While up, all damage is blocked, energy drains, and the ship cannot fire. At 0 energy the shield drops with a 1 s lockout. Energy regenerates while the shield is down.
- Hull at 0: ship dies. Free-for-all; every other ship is hostile.

### 6.3 Economy

- Shooting an asteroid breaks it and drops ore pickups. Flying over a pickup collects it until cargo is full.
- Carried state: ore and unbanked credits. Kill bounties go to unbanked credits.
- Kill bounty = fixed base + a share of the victim's total installed upgrade value.
- Docking: ship is inside a safe zone, below a speed threshold, and has taken no damage in the last 5 s. On docking, ore is sold automatically, all unbanked credits are banked, and the shop opens.
- Upgrades are bought with banked credits only.

### 6.4 Death

- Lose all installed upgrades (ship resets to base), all carried ore, and all unbanked credits.
- A loot crate drops at the death position containing all carried ore and 50% of unbanked credits.
- Respawn at the nearest safe zone with the base ship. Banked credits are kept.

### 6.5 Safe zones

- No damage is dealt inside. Bullets despawn on entering a zone.
- Shields and firing are disabled while inside.

### 6.6 Disconnect

- Inside a safe zone: ship is saved and removed immediately.
- Outside: ship stays in the world for 10 s (prevents combat logging), then is saved and removed. If it dies during that time, the death rules apply.

## 7. Persistence

### 7.1 Schema (SQLite)

- `accounts(id INTEGER PK, username TEXT UNIQUE, password_hash TEXT, created_at INTEGER)`
- `sessions(token TEXT PK, account_id INTEGER, expires_at INTEGER)`
- `ships(account_id INTEGER PK, banked_credits INTEGER, hull_tier, engine_tier, weapon_tier, shield_tier, cargo_tier INTEGER, pos_x REAL, pos_y REAL, updated_at INTEGER)`

### 7.2 Save points

On dock, on purchase, on death, and on disconnect (after the linger period). The death write is one transaction (reset tiers, set respawn position). A crash loses only in-flight carried state, which is at-risk by design.

## 8. Auth and Security

- Passwords hashed with argon2id. Username 3–16 chars `[a-zA-Z0-9_]`; password at least 8 chars.
- Session token: 32 random bytes, 7-day expiry, sent in the first WebSocket message (never in the URL).
- Per-IP in-memory rate limit on `/register` and `/login`.
- One live connection per account; a new login disconnects the old one.
- Server is authoritative. Clients send only input bits and a sequence number; client positions are never trusted.
- Every inbound message is validated by a zod schema; invalid messages disconnect the client.
- Input rate capped at 40 frames/s per client; excess frames are dropped.
- Purchases validated server-side: docked, enough banked credits, next tier exists.

## 9. Assets

- `assets/manifest.json` is the contract: sprite id, file, size, anchor, frame count.
- Required ids: `ship_t0`–`ship_t5` (visual by hull tier), `bullet_t0`–`bullet_t5`, `shield_bubble`, `asteroid_1`–`asteroid_4`, `ore_pickup`, `loot_crate`, `explosion` (spritesheet), `safe_zone_station`, `starfield_tile`, and one UI icon per upgrade line.
- Sprites are transparent PNG, top-down, ship nose pointing up. A single style guide lives in `assets/STYLE.md`.
- The client loads sprites via the manifest; any missing sprite renders as a placeholder Pixi `Graphics` shape.
- A validation script checks that every manifest id has a file with the declared dimensions.

## 10. Build Orchestration (Orca)

- **Opus (coordinator):** owns this spec and the implementation plan, splits the plan into a task DAG, reviews each worker's result, and gates merges.
- **Sonnet workers:** implement code tasks, each in its own worktree, test-first, and report completion.
- **Codex worker:** generates assets from `manifest.json` and `STYLE.md`, in parallel with code from the start.
- DAG order:
  1. `shared`: protocol + schemas, constants, physics step, upgrade table.
  2. In parallel: server simulation (World, SpatialGrid, InterestManager, AsteroidField, combat); server auth + persistence; client rendering + input; assets.
  3. Integration: prediction/reconciliation, economy + shop UI, death/loot flow.
  4. Playtest pass.
- Every task must pass `tsc --noEmit`, `vitest`, and `eslint` before review.

## 11. Testing

- Unit (Vitest): physics step determinism, collisions, shield drain/lockout, damage, death and loot, economy rules, upgrade costs and ordering, spatial grid queries, interest selection, input validation.
- Integration: headless server with two scripted WebSocket clients — connect, move, shoot, kill, loot, dock, buy.
- Persistence: repository tests against a temporary SQLite file.
- Manual: two browser tabs playtest before declaring done.

## 12. Operations

- `pnpm build` builds the client; `pnpm start` runs the server, which also serves the client.
- Configuration via env: `PORT`, `DB_PATH`.
