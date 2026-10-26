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

## Boosters update

Both are collectible power-ups floating in space, seen from above, centered, ~30 px across with a soft glow, transparent background. Horizontal spritesheets of 4 frames of 40×40 that loop smoothly (frame 4 flows back into frame 1): the capsule slowly rotates/bobs and its glow pulses bright → dim → bright.
- `booster_repair`: rounded energy capsule with a glowing green `#3CFFB0` core showing a white medical/repair cross, thin steel rim.
- `booster_speed`: rounded energy capsule with a glowing amber `#FFB23C` core showing two white forward chevrons (»), thin steel rim.
The two must be instantly distinguishable by color and symbol.

## Arena barrier update

- `arena_barrier` (64×64, tiled): one tile of the energy wall at the edge of the arena. It is repeated top-to-bottom along a vertical edge (and rotated 90° for horizontal edges), so it MUST tile seamlessly top-to-bottom; left and right edges fade to transparent. A vertical force-field band ~40 px wide centered in the tile: bright hot red-orange `#FF5A3C` core line, a faint hexagonal energy mesh around it, glowing falloff to transparent on both sides. Reads clearly as "danger / do not cross" against the dark navy starfield.

## Dark matter shield update

- `dark_matter_shield` (horizontal spritesheet, 12 frames of 96×96, centered on the ship like `shield_bubble`): an always-on barrier sphere of radius ~44 px. Near-black deep violet `#1A0B2E` swirling energy with faint white star specks inside, a thin glowing magenta `#C04BFF` rim and a soft outer glow. The centre ~30 px radius must be mostly transparent so the ship stays readable. Frames rotate the swirl 30° each so the loop is smooth and seamless (frame 12 flows into frame 1). Must read clearly different from the cyan `shield_bubble`.
- `dark_matter_impact` (horizontal spritesheet, 4 frames of 96×96): a hit on the barrier. Same placement rule as `shield_impact`: centered on the ship, the impact sits on the TOP edge of the rim (radius ~44 px). Frames: magenta-white flash on the rim → violet ripple arc (~70°) collapsing inward toward a black point → black core with a few magenta sparks → almost transparent. No cyan.
- `dark_matter_icon` (horizontal spritesheet, 12 frames of 48×48): UI glyph in the same flat icon style, used in the HUD: a small dark violet orb (~28 px) with a magenta rim and a bright magenta wisp orbiting it; each frame moves the wisp 30° along its orbit so the loop is smooth and seamless (frame 12 flows into frame 1).

## Mining beam update

- `mining_beam` (16×64, redraw): the beam is now drawn as a tiling strip that scrolls from the ship toward the asteroid, so it MUST tile seamlessly top-to-bottom. A thin white-hot core line (~2 px) inside a teal `#3CFFB0` energy band (~8 px), soft glow falloff to fully transparent left and right edges. Add 2–3 brighter elongated energy pulses / streaks along the core spaced irregularly over the 64 px so the motion reads when it scrolls; no hard horizontal edges at the top or bottom.
- `mining_impact` (horizontal spritesheet, 4 frames of 48×48, loops): the hot spot where the beam touches the rock, centered. A white-hot point (~6 px) inside a teal `#3CFFB0` glow (~24 px) with a few short radial flare spikes. Frames flicker: bright → slightly smaller → brightest with longer spikes → medium, and frame 4 flows back into frame 1. Everything else transparent.
- `mining_spark` (8×8): one particle, a tiny round glowing dot, white center fading to teal `#3CFFB0` and transparent at the edge. Code moves, fades and scales it.
- `mining_debris` (8×8): one particle, a tiny jagged rock chip in the asteroid grey-brown with a single bright edge highlight from the top-left, transparent background. Code moves, rotates and fades it.

## Standard ammo update

- `bullet_t0`, `bullet_t2`, `bullet_t4` (16×32 each, redraw, pointing UP): the pulse laser bolts were 2–3 px wide and got lost against the starfield. Each is now an elongated energy bolt: a white-hot core ~4 px wide and ~18 px long with rounded ends, wrapped in a saturated colored glow ~10 px wide, and a soft halo fading to fully transparent at least 2 px before every canvas edge. Make the head (top) slightly brighter and fatter than the tail so the direction reads. Color by tier, all red so they read as hot standard ammo: t0 red `#FF4A3C`, t2 deeper crimson `#FF2440` with a brighter core, t4 white-hot red with the most white in the core and the widest glow. The code draws them with additive blending, so keep the glow strong but don't pre-darken the background; everything outside the glow is transparent.

## Plasma bolt update

- `plasma_bolt` (redraw, horizontal spritesheet, 4 frames of 48×48, pointing UP): special ammo must look clearly heavier than the standard red pulse bolts (16×32) and the orange `bullet_cannon`. Electric blue `#3C8CFF`: a fat plasma slug ~16 px wide and ~32 px long with a white-hot core ~8 px wide, a bright rounded head at the top and a short tapering tail, wrapped in a deep blue glow halo that fades to fully transparent at least 3 px before every frame edge. Jagged white / pale cyan `#9BE7FF` electric arcs crackle around the slug and a few tiny sparks trail behind it. The slug body stays aligned in all frames; only the arcs, sparks and glow intensity change, so the 4-frame loop flickers like live electricity (frame 4 flows into frame 1). The code draws it with additive blending. No red, orange, green or violet, so it never reads as a pulse bolt, the cannon or the Leviathan's `plasma_orb`.

## Engine flame update

- `engine_flame` (horizontal spritesheet, 4 frames of 16×32, loops): one engine exhaust plume pointing DOWN. The code pins the TOP CENTER of each frame on a ship's nozzle and scales it: short and dim when idle, full length when thrusting. Its root sits at the top edge: a white-hot core ~4 px wide, then an orange `#FF9A3C` flame that tapers to a point ~26 px below the top and fades to fully transparent before the bottom edge, plus a soft orange glow ~10 px wide. Frames flicker: the length and the tip wobble slightly (±3 px) and the core stays fixed at the top centre in every frame, so the loop never jumps (frame 4 flows into frame 1). Drawn with additive blending; everything outside the flame is transparent.

## Ship set 3 (worn industrial)

- All player hulls and pirates now use the chunkier, worn military look: heavier armor plates, weathering and scuffs, same silhouettes, palette and size classes as above.
- Engine nozzles are dark exhaust ports with a faint orange rim and no baked flames; `engine_flame` is drawn by code. Nozzle positions are fixed because the client pins flames there (offsets from the sprite centre): scout (-6,26) (6,26); fighter (-5,27) (5,27); freighter (-5,22) (0,22) (5,22); gunship (-11,22) (0,26) (11,22); raider (0,17); marauder (-5,20) (5,20); warlord (-8,24) (0,27) (8,24). Keep them when redrawing a ship.

## Heavy cannon update

- `bullet_cannon` (32×32, redraw, pointing UP): a heavy kinetic slug that must look weightier than the 16×32 red pulse bolts while staying smaller than the 48×48 blue `plasma_bolt`. A thick bullet-shaped slug ~10 px wide and ~20 px long with a blunt rounded nose at the top: white-hot yellow core, molten amber-gold `#FFC23C` body and a darker orange `#FF9A3C` rim, wrapped in a warm glow ~16 px wide. Behind it a short tapering heat trail of orange sparks and shimmer, fading to transparent at least 2 px before the bottom edge. Gold/amber, not red, so it never reads as a pulse bolt; no blue. Drawn with additive blending; everything outside the glow is transparent.
