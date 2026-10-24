import { describe, expect, it } from 'vitest';
import { spriteIdFor } from '../src/render/spriteIds';

describe('spriteIdFor', () => {
  it('maps each entity kind to its manifest id', () => {
    expect(spriteIdFor({ kind: 'ship', id: 1, name: 'a', x: 0, y: 0, vx: 0, vy: 0, angle: 0, shieldUp: false, hullTier: 3 })).toBe('ship_t3');
    expect(spriteIdFor({ kind: 'bullet', id: 1, x: 0, y: 0, vx: 0, vy: 0, tier: 2 })).toBe('bullet_t2');
    expect(spriteIdFor({ kind: 'asteroid', id: 1, x: 0, y: 0, radius: 40, variant: 4 })).toBe('asteroid_4');
    expect(spriteIdFor({ kind: 'ore', id: 1, x: 0, y: 0 })).toBe('ore_pickup');
    expect(spriteIdFor({ kind: 'crate', id: 1, x: 0, y: 0 })).toBe('loot_crate');
  });
});
