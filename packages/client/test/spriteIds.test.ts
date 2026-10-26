import { describe, expect, it } from 'vitest';
import { headingFor, hitEffectFor, nameTagFor, shipSpriteId, spriteIdFor, vanishEffectFor } from '../src/render/spriteIds';

const bullet = (weaponId: 'pulse_laser' | 'heavy_cannon', mk: 1 | 2 | 3) =>
  spriteIdFor({ kind: 'bullet', id: 1, x: 0, y: 0, vx: 0, vy: 0, weaponId, mk });

describe('spriteIdFor', () => {
  it('maps ships by hull', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'a', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'gunship', npc: null, miningTargetId: null })).toBe('ship_gunship');
  });

  it('dresses players in their prestige skin', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'a', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'fighter', npc: null, miningTargetId: null, skin: 'stealth' })).toBe('ship_fighter_stealth');
    expect(shipSpriteId('scout', 'standard')).toBe('ship_scout');
  });

  it('maps pirates by tier', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'Raider', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout', npc: 'raider', miningTargetId: null })).toBe('pirate_raider');
  });

  it('maps the leviathan, orbs and their death effect', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'Void Leviathan', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout', npc: 'leviathan', miningTargetId: null, health: 1 })).toBe('leviathan');
    expect(spriteIdFor({ kind: 'orb', id: 2, x: 0, y: 0, vx: 0, vy: 0 })).toBe('plasma_orb');
    expect(vanishEffectFor('leviathan')).toBe('leviathan_death');
  });

  it('maps bullets by weapon and mk', () => {
    expect(bullet('pulse_laser', 1)).toBe('bullet_t0');
    expect(bullet('pulse_laser', 2)).toBe('bullet_t2');
    expect(bullet('pulse_laser', 3)).toBe('bullet_t4');
    expect(bullet('heavy_cannon', 2)).toBe('bullet_cannon');
  });

  it('maps rockets and world objects', () => {
    expect(spriteIdFor({ kind: 'rocket', id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0 })).toBe('rocket');
    expect(spriteIdFor({ kind: 'spaceMine', id: 1, x: 0, y: 0 })).toBe('space_mine');
    expect(spriteIdFor({ kind: 'booster', id: 1, x: 0, y: 0, boost: 'repair' })).toBe('booster_repair');
    expect(spriteIdFor({ kind: 'booster', id: 1, x: 0, y: 0, boost: 'speed' })).toBe('booster_speed');
    expect(spriteIdFor({ kind: 'plasma', id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0 })).toBe('plasma_bolt');
    expect(spriteIdFor({ kind: 'asteroid', id: 1, x: 0, y: 0, radius: 40, variant: 4 })).toBe('asteroid_4');
    expect(spriteIdFor({ kind: 'ore', id: 1, x: 0, y: 0 })).toBe('ore_pickup');
    expect(spriteIdFor({ kind: 'crate', id: 1, x: 0, y: 0, hasGear: false })).toBe('loot_crate');
  });
});

describe('vanishEffectFor', () => {
  it('explodes ships, pirates and mines only', () => {
    expect(vanishEffectFor('ship_scout')).toBe('explosion');
    expect(vanishEffectFor('pirate_raider')).toBe('explosion');
    expect(vanishEffectFor('space_mine')).toBe('mine_explosion');
    expect(vanishEffectFor('rocket')).toBeNull();
    expect(vanishEffectFor('asteroid_1')).toBeNull();
  });
});

describe('hitEffectFor', () => {
  it('picks the impact animation for the layer that took the hit', () => {
    expect(hitEffectFor('hull')).toBe('hull_hit');
    expect(hitEffectFor('shield')).toBe('shield_impact');
    expect(hitEffectFor('dark_matter')).toBe('dark_matter_impact');
    expect(hitEffectFor('rock')).toBe('rock_hit');
  });
});

describe('headingFor', () => {
  it('points bullets along their velocity', () => {
    expect(headingFor({ kind: 'bullet', id: 1, x: 0, y: 0, vx: 0, vy: -500, weaponId: 'pulse_laser', mk: 1 })).toBeCloseTo(0);
    expect(headingFor({ kind: 'bullet', id: 1, x: 0, y: 0, vx: 500, vy: 0, weaponId: 'pulse_laser', mk: 1 })).toBeCloseTo(Math.PI / 2);
  });

  it('uses the angle of entities that carry one and leaves round ones alone', () => {
    expect(headingFor({ kind: 'rocket', id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 1.2 })).toBe(1.2);
    expect(headingFor({ kind: 'orb', id: 2, x: 0, y: 0, vx: 1, vy: 1 })).toBeNull();
  });
});

describe('nameTagFor', () => {
  const ship = (id: number, name: string, npc: 'raider' | 'leviathan' | null) =>
    ({ kind: 'ship', id, name, x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout', npc, miningTargetId: null }) as const;

  it('names other pilots in the player accent colour', () => {
    expect(nameTagFor(ship(2, 'alice', null), 1)).toEqual({ text: 'alice', color: 0x5ec8ff });
  });

  it('leaves your own ship unlabelled', () => {
    expect(nameTagFor(ship(1, 'you', null), 1)).toBeNull();
  });

  it('labels pirates and the leviathan by their kind', () => {
    expect(nameTagFor(ship(3, 'Raider', 'raider'), 1)).toEqual({ text: 'Raider', color: 0xff5a4f });
    expect(nameTagFor(ship(4, 'Void Leviathan', 'leviathan'), 1)?.color).toBe(0xc04bff);
  });

  it('labels nothing but ships', () => {
    expect(nameTagFor({ kind: 'ore', id: 5, x: 0, y: 0 }, 1)).toBeNull();
  });
});
