import { describe, expect, it } from 'vitest';
import { engineMountsFor, stepThrottle } from '../src/render/engineFx';

describe('engineMountsFor', () => {
  it('places flames on each hull nozzle behind the ship', () => {
    expect(engineMountsFor('ship_scout')).toHaveLength(2);
    expect(engineMountsFor('ship_freighter')).toHaveLength(3);
    for (const mount of engineMountsFor('pirate_warlord')) expect(mount.y).toBeGreaterThan(0);
  });

  it('gives no flames to things without engines', () => {
    expect(engineMountsFor('leviathan')).toEqual([]);
  });
});

describe('stepThrottle', () => {
  it('spools up faster than it dies down', () => {
    const up = stepThrottle(0, true, 0.05);
    const down = 1 - stepThrottle(1, false, 0.05);
    expect(up).toBeGreaterThan(down);
  });

  it('stays within idle and full throttle', () => {
    expect(stepThrottle(0.9, true, 10)).toBe(1);
    expect(stepThrottle(0.1, false, 10)).toBe(0);
  });
});
