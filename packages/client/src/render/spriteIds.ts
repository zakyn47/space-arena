import { NPC_NAMES, type EntityState, type GearId, type HitBlock, type HullId, type Mk, type SkinId } from '@arena/shared';

const PULSE_SPRITES: Readonly<Record<Mk, string>> = { 1: 'bullet_t0', 2: 'bullet_t2', 3: 'bullet_t4' };

function bulletSprite(weaponId: GearId, mk: Mk): string {
  return weaponId === 'heavy_cannon' ? 'bullet_cannon' : PULSE_SPRITES[mk];
}

const HIT_EFFECTS: Readonly<Record<HitBlock, string>> = { hull: 'hull_hit', shield: 'shield_impact', dark_matter: 'dark_matter_impact', rock: 'rock_hit' };

export function hitEffectFor(block: HitBlock): string {
  return HIT_EFFECTS[block];
}

export function vanishEffectFor(spriteId: string): string | null {
  if (spriteId === 'leviathan') return 'leviathan_death';
  if (spriteId === 'space_mine') return 'mine_explosion';
  return spriteId.startsWith('ship_') || spriteId.startsWith('pirate_') ? 'explosion' : null;
}

export function shipSpriteId(hullId: HullId, skin: SkinId): string {
  return skin === 'standard' ? `ship_${hullId}` : `ship_${hullId}_${skin}`;
}

export function spriteIdFor(entity: EntityState): string {
  switch (entity.kind) {
    case 'ship':
      if (entity.npc === 'leviathan') return 'leviathan';
      return entity.npc ? `pirate_${entity.npc}` : shipSpriteId(entity.hullId, entity.skin ?? 'standard');
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

// Bullets carry no angle on the wire to keep snapshots small; their velocity already says where they point.
export function headingFor(entity: EntityState): number | null {
  if ('angle' in entity) return entity.angle;
  return entity.kind === 'bullet' ? Math.atan2(entity.vx, -entity.vy) : null;
}

export interface NameTag {
  readonly text: string;
  readonly color: number;
}

export function nameTagFor(entity: EntityState, selfId: number): NameTag | null {
  if (entity.kind !== 'ship' || entity.id === selfId) return null;
  if (entity.npc === null) return { text: entity.name, color: 0x5ec8ff };
  return { text: NPC_NAMES[entity.npc], color: entity.npc === 'leviathan' ? 0xc04bff : 0xff5a4f };
}
