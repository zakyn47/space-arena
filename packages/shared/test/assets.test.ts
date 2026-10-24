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
      ...[0, 1, 2, 3, 4, 5].flatMap((tier) => [`ship_t${tier}`, `bullet_t${tier}`]),
      'asteroid_1', 'asteroid_2', 'asteroid_3', 'asteroid_4',
      'shield_bubble', 'ore_pickup', 'loot_crate', 'explosion', 'safe_zone_station', 'starfield_tile',
      'icon_hull', 'icon_engine', 'icon_weapon', 'icon_shield', 'icon_cargo',
    ];
    expect(required.filter((id) => !ids.has(id))).toEqual([]);
  });
});
