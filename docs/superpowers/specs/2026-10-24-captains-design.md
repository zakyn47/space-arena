# Captains and progression

Each account has a persistent captain: XP and four ranked skills survive ship loss, hull changes, reconnects and server restarts. Captains begin with 3 skill points; every level adds 1 point. Players spend points only while docked. First connection opens Captain in the station and requires spending the initial 3 points before undocking. Existing accounts receive the same starting choices on their next connection.

## Rules

- Level 1–20, 100 × current level XP to the next level. XP is cumulative and capped at level 20 (19,000 total).
- Each skill has 10 ranks. Gunnery: +5% gun damage per rank. Engineering: +5% hull, shield capacity and shield regeneration. Piloting: +3% thrust, speed and turning. Mining: +10% mining rate and +5% cargo capacity. Bonuses multiply hull + equipment totals; engineering does not grant shields without a generator and mining does not grant a laser without equipment.
- Earn 10 XP per ore banked, 50/100/250 XP for Raider/Marauder/Warlord kills, and 100 XP for another player's kill. Only server-confirmed kills count; self kills and NPC captains earn nothing. Multiple level-ups are handled together.
- Unspent points are derived from level and spent ranks. Invalid persisted data falls back with a warning. No respec, captain equipment, paid training or new active abilities.

## Approach

Extend the existing shared stat calculator, dock/shop messages and ship persistence record. This avoids a parallel stat engine or new account lifecycle. A dedicated captain table would add joins without improving this account-owned record's lifecycle; a client-only captain would violate server authority.

## Implementation plan

1. Test and implement shared captain validation, levels, XP, training and bonuses; validate the trainCaptain message.
2. Migrate every supported database version to captain_json, validate on load, and preserve captain data through shop actions, deaths and saves.
3. Add server-awarded XP and the first-launch docking guard; test rejects, kills, deposits, reconnects and persistence through real sockets.
4. Add Captain to the dock menu, show progress and bonuses, update prediction/stat previews and show level/unspent points in the HUD.
5. Run typecheck, the full test suite, lint and build; exercise onboarding and upgrades in the browser. Do not commit. Before restarting the local server, shut it down cleanly and take a consistent SQLite backup before migration.
