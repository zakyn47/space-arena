import type { EntityState, GearId, Mk } from '@arena/shared';

const PULSE_SPRITES: Readonly<Record<Mk, string>> = { 1: 'bullet_t0', 2: 'bullet_t2', 3: 'bullet_t4' };

function bulletSprite(weaponId: GearId, mk: Mk): string {
  return weaponId === 'heavy_cannon' ? 'bullet_cannon' : PULSE_SPRITES[mk];
}

export function vanishEffectFor(spriteId: string): string | null {
  if (spriteId === 'space_mine') return 'mine_explosion';
  return spriteId.startsWith('ship_') || spriteId.startsWith('pirate_') ? 'explosion' : null;
}

export function spriteIdFor(entity: EntityState): string {
  switch (entity.kind) {
    case 'ship':
      return entity.npc ? `pirate_${entity.npc}` : `ship_${entity.hullId}`;
    case 'bullet':
      return bulletSprite(entity.weaponId, entity.mk);
    case 'rocket':
      return 'rocket';
    case 'spaceMine':
      return 'space_mine';
    case 'asteroid':
      return `asteroid_${entity.variant}`;
    case 'ore':
      return 'ore_pickup';
    case 'crate':
      return 'loot_crate';
  }
}
