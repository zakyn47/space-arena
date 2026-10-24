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

## Mobile / touch

- The **left flight stick** steers toward the direction you hold and always applies forward thrust outside its center dead zone. The ship turns at its hull/build turn rate. Release the stick to coast; the ship keeps its inertia.
- Hold **Reverse** for backward thrust or to slow down while facing the direction of travel. Hold **Fire**, **Shield**, **Rockets** or **Mine** with your right thumb. Steering and actions support simultaneous touches. Release a button to stop the action.
- Tap **Dock** when available near a station. While docked, use the normal build/captain menus; tap **Undock** to return to flight.
- Portrait and landscape are supported. Landscape gives a wider view. Touch controls hide while docked and reset when you change orientation, switch apps or lose the connection.
- The bottom strip shows hull, shield energy and rocket ammo. Greyed actions show why they are unavailable, such as a safe zone, empty rockets or missing equipment.

## Mouse

| Input | Action |
|---|---|
| Click tabs and **Buy** / **Sell** / **Change** in the build menu | Manage your ship (only while docked) |

## Captain progression

- New and existing pilots choose a captain build on first launch: spend 3 starting points in the station's **Captain** tab before undocking.
- Captains keep XP and skills after ship destruction, hull changes and reconnects. Every level grants 1 skill point, up to level 20. Each level requires 100 × current level XP.
- Earn 10 XP per ore banked, 50 / 100 / 250 XP for Raider / Marauder / Warlord kills, and 100 XP for player kills.
- Train only while docked. Each skill has 10 ranks: **Gunnery** adds 5% gun damage per rank; **Engineering** adds 5% hull, shield capacity and shield regeneration; **Piloting** adds 3% thrust, speed and turning; **Mining** adds 10% mining rate and 5% cargo capacity.
- Skills modify installed equipment; a mining skill does not replace a mining laser, and engineering does not replace a shield generator. Training is permanent.
- The top-left HUD shows captain level and unspent points. Dock and open **Captain** to spend points and inspect the resulting ship stats.

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
- **Minimap:** you are the cyan square, stations are green circles, other pilots within 4 000 px are white dots, and every pirate on the map is a red dot.
- **Mining:** shoot asteroids, then fly over the ore they drop to collect it (up to your cargo capacity).
- **Death** costs all installed upgrades, carried ore, and unbanked credits. Banked credits are safe.

On mobile, tap **Landscape ⛶** to enter fullscreen landscape; tap **Exit fullscreen** to return. If orientation locking is unavailable, enable Android auto-rotate and turn the phone sideways. Mobile flight uses a wider, zoomed-out camera while controls and HUD keep their normal size.
