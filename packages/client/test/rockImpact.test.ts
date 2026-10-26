import { describe, expect, it } from 'vitest';
import { rockImpactBursts } from '../src/render/rockImpact';

describe('rockImpactBursts', () => {
  it('throws sparks, chips and dust outward from the struck point', () => {
    const bursts = rockImpactBursts(10, 20, 1.5);
    expect(bursts.map((burst) => burst.style.spriteId)).toEqual(['impact_spark', 'mining_debris', 'rock_dust']);
    for (const burst of bursts) expect(burst).toMatchObject({ x: 10, y: 20, direction: 1.5 });
  });
});
