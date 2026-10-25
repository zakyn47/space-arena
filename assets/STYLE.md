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

## Space mine update

- `space_mine` (horizontal spritesheet, 2 frames of 32×32, seen from above): round dark steel mine body (~24 px across) with short radial spikes / contact prongs and subtle panel lines, same rim light as the ships. A small warning light in the center: frame 1 light dim red, frame 2 light bright red `#FF3B30` with a soft glow. The two frames alternate as a blink, so everything except the light must be identical between frames.
- `mine_explosion` (horizontal spritesheet, 8 frames of 96×96): bigger and more violent than `explosion`: white-hot flash → expanding orange `#FF9A3C` / red fireball with a bright shockwave ring → metal shrapnel streaks flying outward → dark smoke dissipating to transparent. Centered, round, fills most of the frame at its peak.
- `icon_mine` (48×48): UI glyph in the same flat style as the other icons (white with cyan accent): a spiked round mine.

## Void Leviathan update

- `leviathan` (horizontal spritesheet, 4 frames of 192×192, seen from above, head facing UP): a huge alien space monster, NOT a ship — organic, no metal or panels. A broad armored carapace body with a beaked or mandibled head at the top, and long trailing tentacles toward the bottom. Dark violet / deep purple skin `#3A1D5C` with darker plates, glowing cyan-green `#3CFFB0` bio-luminescent spots along the body and a glowing maw. Fill about 85% of the frame. The frames are a slow breathing pulse: the bio-lights brighten and dim and the tentacles sway slightly; the silhouette stays aligned between frames.
- `plasma_orb` (horizontal spritesheet, 2 frames of 32×32): round violet/magenta `#C04BFF` energy ball (~20 px) with a white-hot core and a soft glow halo; frame 2 slightly larger and brighter so the pair flickers.
- `leviathan_death` (horizontal spritesheet, 8 frames of 192×192): the monster's death burst: bright violet-white flash → expanding organic burst of glowing violet ichor and cyan-green spores → drifting fragments and spores fading to transparent. No gore, no red blood. Centered and round.

## Plasma blaster update

- `plasma_bolt` (horizontal spritesheet, 2 frames of 32×32, pointing UP): an elongated electric plasma bolt (~10×24 px) with a white-hot core and crackling cyan `#5EC8FF` / electric-blue arcs around it, soft glow halo. Frame 2 shifts the arcs so the pair flickers like live electricity. Must read clearly different from the Leviathan's round violet `plasma_orb`.
- `icon_plasma` (48×48): UI glyph in the same flat style as the other icons (white with cyan accent): a blaster emitter firing a jagged lightning-plasma bolt.
