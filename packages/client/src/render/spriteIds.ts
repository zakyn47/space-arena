import type { EntityState } from '@arena/shared';

export function spriteIdFor(entity: EntityState): string {
  switch (entity.kind) {
    case 'ship':
      return `ship_t${entity.hullTier}`;
    case 'bullet':
      return `bullet_t${entity.tier}`;
    case 'asteroid':
      return `asteroid_${entity.variant}`;
    case 'ore':
      return 'ore_pickup';
    case 'crate':
      return 'loot_crate';
  }
}
