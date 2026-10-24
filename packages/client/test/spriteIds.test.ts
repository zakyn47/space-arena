import { describe, expect, it } from 'vitest';
import { spriteIdFor } from '../src/render/spriteIds';

const bullet = (weaponId: 'pulse_laser' | 'heavy_cannon', mk: 1 | 2 | 3) =>
  spriteIdFor({ kind: 'bullet', id: 1, x: 0, y: 0, vx: 0, vy: 0, weaponId, mk });

describe('spriteIdFor', () => {
  it('maps ships by hull', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'a', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'gunship', npc: null, miningTargetId: null })).toBe('ship_gunship');
  });

  it('maps pirates by tier', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'Raider', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout', npc: 'raider', miningTargetId: null })).toBe('pirate_raider');
  });

  it('maps bullets by weapon and mk', () => {
    expect(bullet('pulse_laser', 1)).toBe('bullet_t0');
    expect(bullet('pulse_laser', 2)).toBe('bullet_t2');
    expect(bullet('pulse_laser', 3)).toBe('bullet_t4');
    expect(bullet('heavy_cannon', 2)).toBe('bullet_cannon');
  });

  it('maps rockets and world objects', () => {
    expect(spriteIdFor({ kind: 'rocket', id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0 })).toBe('rocket');
    expect(spriteIdFor({ kind: 'asteroid', id: 1, x: 0, y: 0, radius: 40, variant: 4 })).toBe('asteroid_4');
    expect(spriteIdFor({ kind: 'ore', id: 1, x: 0, y: 0 })).toBe('ore_pickup');
    expect(spriteIdFor({ kind: 'crate', id: 1, x: 0, y: 0, hasGear: false })).toBe('loot_crate');
  });
});
