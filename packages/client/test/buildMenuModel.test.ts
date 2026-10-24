import { HULLS, HULL_IDS, STARTER_BUILD, refitToHull, statsFor } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { describeDelta, gearOptions, hullCards, rocketOffer, salvageRows, slotRows, statSummary } from '../src/ui/buildMenuModel';
import { selfState } from './support/self';

describe('statSummary', () => {
  it('summarises the starter build', () => {
    expect(statSummary(statsFor(STARTER_BUILD))).toEqual([
      'Hull 80',
      'Speed 460',
      'Damage/s 40',
      'Shield 100',
      'Cargo 15',
      'Rockets max 10',
      'Mining 1/s',
    ]);
  });
});

describe('slotRows', () => {
  it('gives every hull slot a unique visible hardpoint', () => {
    for (const hullId of HULL_IDS) {
      const rows = slotRows(refitToHull(STARTER_BUILD, hullId).build);
      expect(rows).toHaveLength(Object.values(HULLS[hullId].slots).reduce((a, b) => a + b, 0));
      const positions = rows.map((row) => row.position);
      expect(new Set(positions.map((point) => JSON.stringify(point))).size).toBe(rows.length);
      for (const point of positions) {
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(100);
        expect(point.y).toBeGreaterThan(0);
        expect(point.y).toBeLessThan(100);
      }
    }
  });

  it('lists every slot with its gear', () => {
    expect(slotRows(STARTER_BUILD).map((row) => row.label)).toEqual([
      'Weapon 1: Pulse Laser Mk1',
      'Shield 1: Shield Generator Mk1',
      'Engine 1: Thruster Mk1',
      'Utility 1: Mining Laser Mk1',
    ]);
  });
});

describe('gearOptions', () => {
  it('lists compatible gear with price, affordability and stat change', () => {
    const options = gearOptions(STARTER_BUILD, { type: 'utility', index: 0 }, 200);
    expect(options.map((o) => o.label)).toEqual([
      'Armor Plating Mk1', 'Armor Plating Mk2', 'Armor Plating Mk3',
      'Cargo Pod Mk1', 'Cargo Pod Mk2', 'Cargo Pod Mk3',
      'Rocket Rack Mk1', 'Rocket Rack Mk2', 'Rocket Rack Mk3',
      'Mining Laser Mk1', 'Mining Laser Mk2', 'Mining Laser Mk3',
    ]);
    expect(options[0]).toMatchObject({ gearId: 'armor', mk: 1, price: 200, affordable: true, delta: 'Hull +30, Mining -1/s' });
    expect(options[1]?.affordable).toBe(false);
  });

  it('counts the refund of replaced gear toward affordability', () => {
    const [mk1, mk2] = gearOptions(STARTER_BUILD, { type: 'weapon', index: 0 }, 600);
    expect(mk1?.delta).toBe('no change');
    expect(mk2).toMatchObject({ price: 700, affordable: true, delta: 'Damage/s +23' });
  });
});

describe('salvageRows', () => {
  it('offers install slots and sale price per item', () => {
    const rows = salvageRows(STARTER_BUILD, [{ gearId: 'armor', mk: 2 }]);
    expect(rows).toEqual([
      { index: 0, label: 'Armor Plating Mk2', salePrice: 300, slots: [{ slot: { type: 'utility', index: 0 }, label: 'Utility 1' }] },
    ]);
  });
});

describe('describeDelta', () => {
  it('lists several changes', () => {
    const before = statsFor(STARTER_BUILD);
    const after = statsFor({ ...STARTER_BUILD, hullId: 'fighter', slots: { ...STARTER_BUILD.slots, weapon: [{ gearId: 'pulse_laser', mk: 1 }, null] } });
    expect(describeDelta(before, after)).toBe('Hull +40, Speed -40, Cargo +5');
  });
});

describe('hullCards', () => {
  it('shows each hull’s base handling and cargo properties', () => {
    for (const card of hullCards(STARTER_BUILD, 0)) {
      const hull = HULLS[card.hullId];
      expect(card.stats).toContain(`Thrust ${hull.thrust}`);
      expect(card.stats).toContain(`Turn ${hull.turnRate} rad/s`);
      expect(card.stats).toContain(`Cargo ${hull.cargoCapacity}`);
    }
  });

  it('includes overflow gear refunds when changing to a smaller hull', () => {
    const gunship = refitToHull(STARTER_BUILD, 'gunship').build;
    const build = {
      ...gunship,
      slots: { ...gunship.slots,
        utility: [{ gearId: 'armor', mk: 3 }],
      },
    } as const;
    const freighter = hullCards(build, 500).find((card) => card.hullId === 'freighter');
    expect(freighter?.affordable).toBe(true);
    const armed = { ...build, slots: { ...build.slots, weapon: [
      { gearId: 'heavy_cannon', mk: 3 },
      { gearId: 'heavy_cannon', mk: 3 },
      { gearId: 'heavy_cannon', mk: 3 },
    ] } } as const;
    expect(hullCards(armed, 0).find((card) => card.hullId === 'freighter')?.affordable).toBe(true);
  });

  it('marks the current hull and affordability', () => {
    const cards = hullCards(STARTER_BUILD, 1_500);
    expect(cards.map((c) => [c.hullId, c.current, c.affordable])).toEqual([
      ['scout', true, false],
      ['fighter', false, true],
      ['freighter', false, false],
      ['gunship', false, false],
    ]);
    expect(cards[1]?.slots).toBe('W2 S1 E1 U1');
  });
});

describe('rocketOffer', () => {
  it('prices the missing rockets', () => {
    expect(rocketOffer(selfState({ rockets: 6, bankedCredits: 60 }))).toEqual({ missing: 4, fillPrice: 100, canBuyOne: true, canFill: false });
    expect(rocketOffer(selfState({ rockets: 10, bankedCredits: 60 }))).toMatchObject({ missing: 0, canBuyOne: false });
  });
});
