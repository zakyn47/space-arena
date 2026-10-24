import { BASE_LOADOUT, type SelfState } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { shopRows } from '../src/ui/ShopPanel';

const self = (banked: number, loadout = BASE_LOADOUT): SelfState => ({
  id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0,
  hull: 100, maxHull: 100, shieldEnergy: 100, maxShield: 100, shieldUp: false,
  ore: 0, cargoCapacity: 20, carriedCredits: 0, bankedCredits: banked,
  loadout, docked: true,
});

describe('shopRows', () => {
  it('lists every upgrade line with cost and affordability', () => {
    const rows = shopRows(self(220));
    expect(rows.map((row) => row.line)).toEqual(['hull', 'engine', 'weapon', 'shield', 'cargo']);
    expect(rows.find((row) => row.line === 'hull')).toMatchObject({ tier: 0, maxTier: 5, cost: 200, affordable: true });
    expect(rows.find((row) => row.line === 'weapon')).toMatchObject({ cost: 250, affordable: false });
  });

  it('marks maxed lines', () => {
    const row = shopRows(self(10_000, { ...BASE_LOADOUT, cargo: 3 })).find((r) => r.line === 'cargo');
    expect(row).toMatchObject({ cost: null, affordable: false });
  });
});
