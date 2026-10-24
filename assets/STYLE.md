# Space Arena art style

- Top-down 2D, orthographic. No perspective tilt.
- Ships face UP (nose toward the top edge), centered in the canvas, with ~4 px transparent margin.
- Transparent PNG background for everything except `starfield_tile`.
- Look: clean sci-fi, crisp shapes, subtle panel lines, soft rim light from top-left. No text, no logos.
- Palette: hulls cool steel greys; player accent cyan `#5EC8FF`; engines glow orange `#FF9A3C`; shields translucent cyan; ore teal-green `#3CFFB0`; loot crate gold `#FFC83C`.
- Ship tiers t0–t5: same silhouette family, each tier larger in visual detail, more armor plates and weapon hardpoints. t0 = small scrappy fighter, t5 = heavy elite gunship. All fit 64×64.
- Bullets t0–t5: glowing energy bolt, pointing up; color shifts cyan → violet → white-hot with tier.
- Asteroids 1–4: four distinct rocky shapes, grey-brown, roughly round, filling ~90% of 128×128.
- `explosion`: horizontal spritesheet, 8 frames of 64×64, flash → fireball → smoke dissipating.
- `shield_bubble`: translucent hex-pattern sphere, ~40% alpha center, brighter rim.
- `safe_zone_station`: circular space station seen from above, docking ring, green beacon lights.
- `starfield_tile`: seamless tileable deep-space background, dark navy `#05060D` with sparse stars of varied brightness. Must tile without visible seams.
- UI icons 48×48: flat glyph style, white with cyan accent: hull = armor plate, engine = thruster flame, weapon = crosshair, shield = shield emblem, cargo = crate.

## Ship builds update

- Hulls (64×64, nose up, same palette and rendering as the existing ships so they look like one fleet):
  - `ship_scout`: small, nimble, single nose gun, slim swept wings.
  - `ship_fighter`: medium, aggressive delta wing, two wing-mounted guns.
  - `ship_freighter`: wide boxy cargo hull, side cargo pods, one small turret, heavy engines.
  - `ship_gunship`: large heavily armored, three forward gun barrels, double shield emitters.
- `bullet_cannon` (16×16): heavy glowing orange slug `#FF9A3C`, pointing up.
- `rocket` (24×24): small missile pointing up, white-grey body, red-orange tip, fins at the back.
- `rocket_trail` (16×16): soft round exhaust puff, orange core fading to transparent.
- `icon_rocket` and `gear_*` (48×48): same flat glyph style as the other UI icons, white with cyan accent:
  pulse laser = slim energy emitter, heavy cannon = thick barrel, shield generator = dome emitter,
  thruster = nozzle with flame, armor = layered plates, cargo pod = container, rocket rack = rocket pod with three tubes.

## Pirates and mining update

- Pirate ships (64×64, nose up, same top-down rendering as the player fleet): red `#E0403A` and black livery, jagged hostile silhouettes, scavenged mismatched armor plates.
  - `pirate_raider`: small scrappy interceptor with one gun.
  - `pirate_marauder`: medium aggressive raider with twin guns and spiked wings.
  - `pirate_warlord`: large heavily armored flagship, multiple barrels, skull-like prow.
- `mining_beam` (16×64): vertical teal `#3CFFB0` energy beam with a bright white core, seamlessly tileable top-to-bottom, transparent edges.
- `gear_mining_laser` (48×48): UI glyph, drill emitter with a small beam.
- `icon_salvage` (48×48): UI glyph, gear cog over a crate.

## Hit feedback update

- `shield_impact` (horizontal spritesheet, 4 frames of 96×96): shield ripple where a shot strikes the shield. Each frame is centered on the ship like `shield_bubble`; the impact sits on the TOP edge of the bubble rim (radius ~44 px). Draw a bright translucent cyan `#5EC8FF` arc (~70° wide) with a white-hot center point and a hint of the hex pattern. Frames: sharp bright flash → arc widens along the rim → hex ripple spreads and fades → faint glow almost gone. Everything else transparent.
- `hull_hit` (horizontal spritesheet, 4 frames of 48×48): impact on bare armor, centered on the impact point, sparks spraying UP (outward from the hull). Frames: small white-hot flash → orange `#FF9A3C` sparks and molten fragments burst upward → sparks thin out with a puff of grey smoke → last embers fading. Must read clearly different from `shield_impact`: warm orange/white, no cyan.
