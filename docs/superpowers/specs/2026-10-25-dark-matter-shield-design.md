# Dark matter shield — Leviathan reward design

## Goal

Every Void Leviathan crate also grants a **dark matter shield**: an always-on 500-point barrier that absorbs damage until it breaks. Unlike the normal shield, its owner can keep firing guns, rockets and the mining laser through it.

## Decisions

| Topic | Decision |
|---|---|
| Kind | Pickup buff on the ship, not gear; the build and normal shield are unchanged |
| Drop | Always included in the Leviathan crate, on top of the existing loot |
| Strength | 500 points, no regeneration; a second pickup refills to 500 (no stacking) |
| Lifetime | Survives docking; lost on logout and server restart (in memory, no migration) |
| Plasma | Deals normal damage to the barrier; never disrupts it |

## Rules (server)

- Shared constant `DARK_MATTER_SHIELD = 500`.
- `ShipEntity.darkMatter: number`, `0` when absent. New ships start at `0`.
- `CrateDrop` gains `darkMatter: boolean`. `BossDirector.loot()` sets it to `true`; player death crates set it to `false`.
- `takeCrate` sets `ship.darkMatter = DARK_MATTER_SHIELD` when the crate has dark matter. This happens even if the salvage hold is full (the leftover crate keeps only the gear).
- `applyDamage` resolves a hit in this order:
  1. Normal shield raised: the hit is blocked, the barrier is not drained.
  2. Barrier above `0`: subtract the damage from the barrier, clamped at `0`. Overflow on the breaking hit is lost; hull is untouched.
  3. Otherwise: hull takes the damage, as today.
- The barrier never sets `shieldUp`, so `fireWeapons`, rockets, mines, plasma and mining all keep working while it is active.
- Every damage source already goes through `applyDamage` (bullets, rockets, mine blasts, Leviathan orbs, plasma); all are absorbed by the barrier. Plasma shield disruption only affects the normal shield.
- NPCs never take loot, so pirates and the Leviathan never have a barrier.

## Network

- `SelfState.darkMatter: number` (rounded integer) for the HUD.
- `ShipState.darkMatter?: true`, sent only while the barrier is above `0`, so every client can draw it.
- `HitEvent.shield: boolean` is replaced by `block: 'hull' | 'shield' | 'dark_matter'`; the server picks the value from the branch taken in `applyDamage`.

## Client

- Renderer: an animated `dark_matter_shield` sprite on every ship whose state has `darkMatter`, drawn under the normal shield bubble.
- Effects: `block` selects `hull_hit`, `shield_impact` or `dark_matter_impact`. Barrier impacts sit on the barrier edge like shield impacts.
- HUD: a "Dark matter" meter (`current / 500`) with the animated `dark_matter_icon`, shown only while the barrier is active, including in the compact touch HUD strip.
- Rules tab: one line describing the reward.

## Assets (Codex, via an Orca terminal)

| id | file | size | frames | look |
|---|---|---|---|---|
| `dark_matter_shield` | `fx/dark_matter_shield.png` | 384×96 | 4 | Near-black violet sphere around the ship with a swirling interior, faint star specks and a thin magenta rim; mostly transparent centre so the ship stays visible; frames rotate the swirl |
| `dark_matter_impact` | `fx/dark_matter_impact.png` | 384×96 | 4 | Violet ripple collapsing inward to a black point with magenta sparks, fading to transparent |
| `dark_matter_icon` | `ui/dark_matter.png` | 192×48 | 4 | Small dark orb with an orbiting magenta wisp; frames loop |

Claude adds the manifest entries and a `STYLE.md` section. Codex only produces the PNGs.

## Testing

- `applyDamage`: barrier absorbs; breaking hit loses overflow; raised normal shield blocks without draining the barrier; returns the right `block` value.
- Plasma hit on a barrier ship: barrier drained, normal shield not disrupted.
- `takeCrate`: grants 500, refills a partial barrier, grants even with a full salvage hold.
- `BossDirector.loot()` includes dark matter; player death crates do not.
- `fireWeapons` fires while the barrier is active.
- Snapshot: `darkMatter` in self state; `ShipState.darkMatter` only while active; `block` values in hits.
- Client: effect sprite per `block`; barrier sprite shown and hidden; HUD meter only while active.
- Integration: a player who takes a Leviathan crate receives `darkMatter: 500`.

## Out of scope

Persistence, stacking above 500, a dedicated loot sprite, dark matter for NPCs, other ways to obtain it.
