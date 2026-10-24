import { STARTER_BUILD, statsFor } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { describeDelta, gearOptions, hullCards, rocketOffer, slotRows, statSummary } from '../src/ui/buildMenuModel';
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
    ]);
  });
});

describe('slotRows', () => {
  it('lists every slot with its gear', () => {
    expect(slotRows(STARTER_BUILD).map((row) => row.label)).toEqual([
      'Weapon 1: Pulse Laser Mk1',
      'Shield 1: Shield Generator Mk1',
      'Engine 1: Thruster Mk1',
      'Utility 1: Empty',
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
    ]);
    expect(options[0]).toMatchObject({ gearId: 'armor', mk: 1, price: 200, affordable: true, delta: 'Hull +30' });
    expect(options[1]?.affordable).toBe(false);
  });

  it('counts the refund of replaced gear toward affordability', () => {
    const [mk1, mk2] = gearOptions(STARTER_BUILD, { type: 'weapon', index: 0 }, 600);
    expect(mk1?.delta).toBe('no change');
    expect(mk2).toMatchObject({ price: 700, affordable: true, delta: 'Damage/s +23' });
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
