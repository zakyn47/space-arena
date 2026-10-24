import { BASE_LOADOUT, type SelfState } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { hudLines } from '../src/ui/Hud';

const self: SelfState = {
  id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0,
  hull: 62.4, maxHull: 100, shieldEnergy: 33.3, maxShield: 100, shieldUp: true,
  ore: 4, cargoCapacity: 20, carriedCredits: 150, bankedCredits: 900,
  loadout: BASE_LOADOUT, docked: false,
};

describe('hudLines', () => {
  it('summarises ship state', () => {
    expect(hudLines(self)).toEqual([
      'Hull 63 / 100',
      'Shield 33 / 100 (UP)',
      'Cargo 4 / 20 ore',
      'Carried 150 cr (at risk)',
      'Banked 900 cr',
    ]);
  });

  it('shows the docked state', () => {
    expect(hudLines({ ...self, docked: true, shieldUp: false })).toContain('DOCKED');
  });
});
