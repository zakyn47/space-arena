# AGENTS.md — Space Arena

Guide for coding agents (Codex, Claude, others) working in this repository.

## What this is

A 2D multiplayer browser space game. Players fly starships in one shared, persistent world: inertial flight, PvP, homing rockets, asteroid mining, AI pirate patrols, stations for docking, and a hull + gear build system. The server is authoritative; the browser client predicts its own ship and interpolates everything else.

Design specs (read the relevant one before changing a feature):

- `docs/superpowers/specs/2026-10-24-space-arena-design.md` — core game, networking, persistence, security
- `docs/superpowers/specs/2026-10-24-docking-rockets-builds-design.md` — E-docking, rockets, hulls and gear
- `docs/superpowers/specs/2026-10-24-pirates-mining-design.md` — pirates, mining laser, salvage

Implementation plans live in `docs/superpowers/plans/`. Player-facing controls are in `controls.md`.

## Commands

```bash
pnpm install --frozen-lockfile   # install (pnpm 9, Node >= 22)
pnpm typecheck                   # tsc for shared, server, client, scripts
pnpm test                        # vitest, all packages
pnpm lint                        # eslint
pnpm assets:check                # every sprite in assets/manifest.json exists with the right size
pnpm build                       # build the client into packages/client/dist
pnpm start                       # run the server on :8080 (serves the built client), DB_PATH defaults to arena.db
pnpm dev:server / pnpm dev:client  # watch server + Vite dev client (proxies /api and /ws to :8080)
```

**Before every commit** run `pnpm typecheck && pnpm test && pnpm lint`. Add `pnpm assets:check` when assets change and `pnpm build` when client code changes. Do not claim work is done without running them.

## Layout

```
packages/shared/   protocol (zod-validated client messages), constants, deterministic physics,
                   hull/gear/pirate catalogs, build stats (statsFor), asset manifest schema
packages/server/   Node: HTTP auth, WebSocket gateway, 30 Hz world simulation, SQLite persistence
  src/world/       World (orchestrator), Combat, Rockets, Docking, Shop, Mining, Loot,
                   AsteroidField, SpatialGrid, entities, pirates/ (tiers, PirateBrain, PirateDirector)
  src/net/         Gateway (sessions, message routing), snapshot (per-player state), radar
  src/db/          PlayerRepository, versioned migrations
packages/client/   Vite + PixiJS 8: input, prediction, interpolation, renderer, HUD, build menu
scripts/           asset validator
assets/            sprites (PNG), manifest.json (the contract), STYLE.md (art direction)
```

## Architecture rules

- **Shared code is the contract.** Physics (`stepMotion`) and stats (`statsFor`) live in `shared` and run identically on server and client. Never duplicate game rules on one side.
- **Server is authoritative.** Clients send only inputs and shop/dock requests. Validate every inbound message with zod in `shared/src/protocol.ts`; invalid messages close the socket.
- **Small pure modules, World orchestrates.** Game rules go in focused modules (`Combat`, `Docking`, `Shop`, `Mining`, `Loot`, `PirateBrain`) as pure functions over entities; `World` only sequences them per tick. Keep `World` thin.
- **Pirates are normal ships** with `npc` set, driven by `PirateDirector` → `pirateInput`. They reuse all combat code, are never persisted (negative account ids), never appear in `died` events, never pick up loot, and their projectiles never hit other pirates.
- **Persistence changes need a migration.** Bump `SCHEMA_VERSION` in `server/src/db/migrations.ts`, add a step that runs inside the existing transaction, and test migration from every older version. Validate stored JSON on load and fall back safely with a warning.
- **Protocol changes** touch `shared/src/protocol.ts`, server `net/snapshot.ts` or `net/Gateway.ts`, and the client together. Keep payloads small (snapshots go out 20×/s per player).
- **Assets:** code never depends on art existing. Every sprite id must be in `assets/manifest.json`; missing PNGs render as placeholders. New art follows `assets/STYLE.md`.

## Code style

- TypeScript `strict`; no `any`; avoid `as` casts (only at trusted test boundaries).
- No comments that restate what code does. Comment only *why* for non-obvious rules.
- Small focused functions, early returns, composition over inheritance.
- Match surrounding code: naming, file structure, test style.
- Prefer editing existing files over creating new ones; no speculative abstractions or config.

## Testing

- Vitest. Tests live in `packages/*/test/` (server fixtures in `test/support/fixtures.ts`, client `selfState` fixture in `test/support/self.ts`).
- Test-first for game rules: write the failing test, then the code.
- Use `seeded(n)` from the server fixtures for anything random; construct `World` with `asteroidTarget: 0` and without `pirates` unless the test is about them.
- `packages/server/test/integration.test.ts` drives the real app over WebSockets; extend it for end-to-end behavior.

## Git

- Work on `master` unless told otherwise. Commit only when asked or when your task explicitly says to.
- Conventional commit messages (`feat(server): ...`, `fix(client): ...`, `docs: ...`).
- **Never add `Co-Authored-By` or any AI/agent attribution to commits.**
- Never commit `arena.db*`, `node_modules/`, `dist/`.

## Codex: generating art

Codex creates sprites for this repo. For any art task:

1. Read `assets/STYLE.md` and the target entries in `assets/manifest.json`; do not change either unless told to.
2. Produce transparent PNGs at the exact manifest width × height (ships face up; spritesheets are horizontal strips of `frames` equal frames).
3. Keep the look consistent with the existing PNGs in `assets/`.
4. Run `pnpm assets:check` until it prints `assets ok`, then commit only the PNGs.
