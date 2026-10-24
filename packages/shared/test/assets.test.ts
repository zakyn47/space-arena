import { describe, expect, it } from 'vitest';
import manifest from '../../../assets/manifest.json';
import { ManifestSchema } from '../src/assets';

describe('asset manifest', () => {
  it('matches the schema', () => {
    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('has unique sprite ids', () => {
    const ids = ManifestSchema.parse(manifest).sprites.map((sprite) => sprite.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists every sprite the client needs', () => {
    const ids = new Set(ManifestSchema.parse(manifest).sprites.map((sprite) => sprite.id));
    const required = [
      'ship_scout', 'ship_fighter', 'ship_freighter', 'ship_gunship',
      'bullet_t0', 'bullet_t2', 'bullet_t4', 'bullet_cannon', 'rocket', 'rocket_trail',
      'asteroid_1', 'asteroid_2', 'asteroid_3', 'asteroid_4',
      'shield_bubble', 'ore_pickup', 'loot_crate', 'explosion', 'safe_zone_station', 'starfield_tile',
      'icon_rocket', 'gear_pulse_laser', 'gear_heavy_cannon', 'gear_shield_gen', 'gear_thruster',
      'gear_armor', 'gear_cargo_pod', 'gear_rocket_rack',
      'pirate_raider', 'pirate_marauder', 'pirate_warlord', 'mining_beam', 'gear_mining_laser', 'icon_salvage',
    ];
    expect(required.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('drops retired sprites', () => {
    const ids = new Set(ManifestSchema.parse(manifest).sprites.map((sprite) => sprite.id));
    const retired = ['ship_t0', 'ship_t5', 'bullet_t1', 'bullet_t3', 'bullet_t5', 'icon_hull', 'icon_cargo'];
    expect(retired.filter((id) => ids.has(id))).toEqual([]);
  });
});
