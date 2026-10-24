# Space Arena Controls

## Keyboard

| Key | Action |
|---|---|
| `W` | Thrust forward |
| `S` | Reverse thrust / brake (half strength) |
| `A` | Rotate left |
| `D` | Rotate right |
| `Space` (hold) | Fire forward |
| `Shift` (hold, left or right) | Raise shield |
| `E` | Dock / undock at a station |
| `R` (hold) | Fire homing rockets |
| `F` (hold) | Mining laser: drill the asteroid in front of you |

Keys use physical positions, so they work the same on any keyboard layout.

## Mouse

| Input | Action |
|---|---|
| Click tabs and **Buy** / **Sell** / **Change** in the build menu | Manage your ship (only while docked) |

## How the controls behave

- **Flight is inertial.** The ship keeps drifting after you release `W`. Use `S` to slow down.
- **Shield** blocks all damage while held. It drains energy and you cannot fire while it is up. At 0 energy it drops and is locked for 1 second. Energy regenerates while the shield is down.
- **Safe zones** (green circles with a station) disable firing and shields. Bullets vanish when they enter a zone.
- **Docking:** fly within 200 px of a station, slow down (≤ 60 px/s), avoid damage for 5 s, press `E`. The ship snaps to the station and is frozen; ore is sold, carried credits are banked, hull is repaired and the build menu opens. Press `E` again to undock; docking is then unavailable for 30 s.
- **Rockets:** lock the nearest enemy within 1 200 px in front of you and home in; 30 damage each. New pilots get 10, every respawn gives 5, death loses carried rockets. Buy more in the build menu (25 cr each).
- **Builds:** buy hulls (Scout, Fighter, Freighter, Gunship) and install Mk1–Mk3 gear into weapon, shield, engine and utility slots. Replaced or sold gear refunds 50%. Death resets you to a Scout with starter gear.
- **Mining laser:** hold `F` facing an asteroid within range; ore flows straight into cargo. Every new pilot has a Mining Laser Mk1; better lasers are in the build menu. You cannot mine while firing, shielded, docked or in a safe zone.
- **Pirates:** red ships roam open space — Raiders near the stations, Marauders farther out, Warlords in the deep. They attack pilots who come within ~800 px. Destroyed pirates drop a crate with credits, ore and sometimes a gear item.
- **Salvage:** gear from crates goes into your salvage hold (3 items, lost on death). While docked, install it for free or sell it for 50% in the build menu's Ship tab.
- **Mining:** shoot asteroids, then fly over the ore they drop to collect it (up to your cargo capacity).
- **Death** costs all installed upgrades, carried ore, and unbanked credits. Banked credits are safe.
