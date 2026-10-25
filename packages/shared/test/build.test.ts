import { describe, expect, it } from 'vitest';
import {
  STARTER_BUILD,
  buildValue,
  fitsHull,
  parseBuild,
  parseSalvage,
  refitToHull,
  resaleValue,
  statsFor,
  withGear,
  type Build,
} from '../src/build';

const gunship: Build = {
  hullId: 'gunship',
  slots: {
    weapon: [{ gearId: 'pulse_laser', mk: 1 }, { gearId: 'heavy_cannon', mk: 2 }, null],
    shield: [{ gearId: 'shield_gen', mk: 1 }, { gearId: 'shield_gen', mk: 3 }],
    engine: [{ gearId: 'thruster', mk: 2 }],
    utility: [{ gearId: 'rocket_rack', mk: 2 }],
  },
};

describe('statsFor', () => {
  it('computes the starter build', () => {
    const stats = statsFor(STARTER_BUILD);
    expect(stats).toMatchObject({
      maxHull: 180,
      thrust: 168,
      maxSpeed: 322,
      turnRate: 3.6,
      maxShield: 100,
      shieldRegen: 15,
      shieldDrain: 30,
      cargoCapacity: 15,
      maxRockets: 10,
    });
    expect(stats.weapons).toEqual([{ gearId: 'pulse_laser', mk: 1, damage: 10, fireRate: 4, bulletSpeed: 800 }]);
  });

  it('slows a ship with an empty engine slot', () => {
    const stats = statsFor(withGear(STARTER_BUILD, { type: 'engine', index: 0 }, null));
    expect(stats.thrust).toBeCloseTo(100.8);
    expect(stats.turnRate).toBeCloseTo(2.16);
  });

  it('sums shields, weapons and utility bonuses', () => {
    const stats = statsFor(gunship);
    expect(stats.weapons.map((w) => w.gearId)).toEqual(['pulse_laser', 'heavy_cannon']);
    expect(stats.maxShield).toBe(320);
    expect(stats.shieldRegen).toBe(43);
    expect(stats.maxRockets).toBe(20);
    expect(stats.thrust).toBeCloseTo(119 * 1.15);
  });

  it('has no weapons and no shield when slots are empty', () => {
    const bare = withGear(withGear(STARTER_BUILD, { type: 'weapon', index: 0 }, null), { type: 'shield', index: 0 }, null);
    expect(statsFor(bare).weapons).toEqual([]);
    expect(statsFor(bare).maxShield).toBe(0);
  });
});

describe('values', () => {
  it('prices the starter build', () => {
    expect(buildValue(STARTER_BUILD)).toBe(1_050);
  });

  it('sells back at half, rounded down', () => {
    expect(resaleValue(255)).toBe(127);
  });
});

describe('build validation', () => {
  it('accepts valid builds', () => {
    expect(fitsHull(gunship)).toBe(true);
    expect(parseBuild(JSON.parse(JSON.stringify(gunship)))).toEqual(gunship);
  });

  it('rejects wrong slot counts and mismatched gear', () => {
    expect(parseBuild({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, utility: [] } })).toBeNull();
    expect(parseBuild({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, utility: [{ gearId: 'pulse_laser', mk: 1 }] } })).toBeNull();
    expect(parseBuild({ hullId: 'battleship', slots: STARTER_BUILD.slots })).toBeNull();
    expect(parseBuild('nope')).toBeNull();
  });
});

describe('refitToHull', () => {
  it('keeps gear that fits a bigger hull', () => {
    const { build, leftovers } = refitToHull(STARTER_BUILD, 'gunship');
    expect(build.slots.weapon).toEqual([{ gearId: 'pulse_laser', mk: 1 }, null, null]);
    expect(build.slots.shield).toEqual([{ gearId: 'shield_gen', mk: 1 }, null]);
    expect(build.slots.utility).toEqual([{ gearId: 'mining_laser', mk: 1 }]);
    expect(leftovers).toEqual([]);
  });

  it('returns gear that does not fit a smaller hull', () => {
    const { build, leftovers } = refitToHull(gunship, 'scout');
    expect(build.slots.weapon).toEqual([{ gearId: 'pulse_laser', mk: 1 }]);
    expect(leftovers).toEqual([{ gearId: 'heavy_cannon', mk: 2 }, { gearId: 'shield_gen', mk: 3 }]);
    expect(fitsHull(build)).toBe(true);
  });
});

describe('mining and salvage', () => {
  it('gives the starter build a mining laser', () => {
    const stats = statsFor(STARTER_BUILD);
    expect(stats.miningRate).toBe(1);
    expect(stats.miningRange).toBe(150);
    expect(buildValue(STARTER_BUILD)).toBe(1_050);
  });

  it('stacks mining rates and keeps the longest range', () => {
    const freighter = {
      hullId: 'freighter' as const,
      slots: {
        weapon: [null],
        shield: [null],
        engine: [null],
        utility: [{ gearId: 'mining_laser' as const, mk: 1 as const }, { gearId: 'mining_laser' as const, mk: 3 as const }, null],
      },
    };
    expect(statsFor(freighter).miningRate).toBe(4.5);
    expect(statsFor(freighter).miningRange).toBe(250);
  });

  it('parses salvage lists up to capacity', () => {
    expect(parseSalvage([{ gearId: 'armor', mk: 2 }])).toEqual([{ gearId: 'armor', mk: 2 }]);
    expect(parseSalvage([])).toEqual([]);
    expect(parseSalvage([{ gearId: 'armor', mk: 1 }, { gearId: 'armor', mk: 1 }, { gearId: 'armor', mk: 1 }, { gearId: 'armor', mk: 1 }])).toBeNull();
    expect(parseSalvage([{ gearId: 'nope', mk: 1 }])).toBeNull();
  });
});
