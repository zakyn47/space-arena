import type { EntityState, GearId, HitBlock, Mk } from '@arena/shared';

const PULSE_SPRITES: Readonly<Record<Mk, string>> = { 1: 'bullet_t0', 2: 'bullet_t2', 3: 'bullet_t4' };

function bulletSprite(weaponId: GearId, mk: Mk): string {
  return weaponId === 'heavy_cannon' ? 'bullet_cannon' : PULSE_SPRITES[mk];
}

const HIT_EFFECTS: Readonly<Record<HitBlock, string>> = { hull: 'hull_hit', shield: 'shield_impact', dark_matter: 'dark_matter_impact' };

export function hitEffectFor(block: HitBlock): string {
  return HIT_EFFECTS[block];
}

export function vanishEffectFor(spriteId: string): string | null {
  if (spriteId === 'leviathan') return 'leviathan_death';
  if (spriteId === 'space_mine') return 'mine_explosion';
  return spriteId.startsWith('ship_') || spriteId.startsWith('pirate_') ? 'explosion' : null;
}

export function spriteIdFor(entity: EntityState): string {
  switch (entity.kind) {
    case 'ship':
      if (entity.npc === 'leviathan') return 'leviathan';
      return entity.npc ? `pirate_${entity.npc}` : `ship_${entity.hullId}`;
    case 'bullet':
      return bulletSprite(entity.weaponId, entity.mk);
    case 'orb':
      return 'plasma_orb';
    case 'rocket':
      return 'rocket';
    case 'plasma':
      return 'plasma_bolt';
    case 'spaceMine':
      return 'space_mine';
    case 'asteroid':
      return `asteroid_${entity.variant}`;
    case 'ore':
      return 'ore_pickup';
    case 'booster':
      return `booster_${entity.boost}`;
    case 'crate':
      return 'loot_crate';
  }
}
