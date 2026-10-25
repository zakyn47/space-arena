import { DARK_MATTER_SHIELD, GEAR_IDS, SALVAGE_CAPACITY } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip } from '../src/world/entities';
import { playerDeathCrates, randomGear, takeCrate } from '../src/world/Loot';
import { seeded, shipRecord } from './support/fixtures';

const ship = () => createShip(1, 1, 'alice', shipRecord(0, 0, 1));

describe('randomGear', () => {
  it('picks a catalog item within the allowed marks', () => {
    const rng = seeded(5);
    for (let i = 0; i < 100; i += 1) {
      const gear = randomGear(rng, [2, 3]);
      expect(GEAR_IDS).toContain(gear.gearId);
      expect([2, 3]).toContain(gear.mk);
    }
  });
});

describe('playerDeathCrates', () => {
  it('puts ore, half the carried credits and the first salvage item in one crate, and each other item in its own', () => {
    const victim = ship();
    victim.ore = 4;
    victim.carriedCredits = 101;
    victim.salvage = [{ gearId: 'armor', mk: 1 }, { gearId: 'thruster', mk: 2 }];
    expect(playerDeathCrates(victim)).toEqual([
      { ore: 4, credits: 50, gear: { gearId: 'armor', mk: 1 }, darkMatter: false },
      { ore: 0, credits: 0, gear: { gearId: 'thruster', mk: 2 }, darkMatter: false },
    ]);
  });

  it('drops nothing for an empty ship', () => {
    expect(playerDeathCrates(ship())).toEqual([]);
  });
});

describe('takeCrate', () => {
  it('takes everything when the hold has room', () => {
    const looter = ship();
    expect(takeCrate(looter, { ore: 2, credits: 40, gear: { gearId: 'armor', mk: 1 }, darkMatter: false })).toBeNull();
    expect(looter.salvage).toEqual([{ gearId: 'armor', mk: 1 }]);
    expect(looter.carriedCredits).toBe(40);
    expect(looter.ore).toBe(2);
  });

  it('leaves the gear behind when the hold is full', () => {
    const looter = ship();
    looter.salvage = Array.from({ length: SALVAGE_CAPACITY }, () => ({ gearId: 'armor' as const, mk: 1 as const }));
    expect(takeCrate(looter, { ore: 0, credits: 10, gear: { gearId: 'thruster', mk: 1 }, darkMatter: false })).toEqual({ ore: 0, credits: 0, gear: { gearId: 'thruster', mk: 1 }, darkMatter: false });
    expect(looter.carriedCredits).toBe(10);
  });
});

describe('takeCrate dark matter', () => {
  it('grants a full barrier and refills a partial one', () => {
    const pilot = ship();
    expect(takeCrate(pilot, { ore: 0, credits: 0, gear: null, darkMatter: true })).toBeNull();
    expect(pilot.darkMatter).toBe(DARK_MATTER_SHIELD);
    pilot.darkMatter = 120;
    takeCrate(pilot, { ore: 0, credits: 0, gear: null, darkMatter: true });
    expect(pilot.darkMatter).toBe(DARK_MATTER_SHIELD);
  });

  it('grants the barrier even with a full salvage hold and leaves only the gear behind', () => {
    const pilot = ship();
    pilot.salvage = Array.from({ length: SALVAGE_CAPACITY }, () => ({ gearId: 'armor' as const, mk: 1 as const }));
    const leftover = takeCrate(pilot, { ore: 0, credits: 10, gear: { gearId: 'thruster', mk: 3 }, darkMatter: true });
    expect(pilot.darkMatter).toBe(DARK_MATTER_SHIELD);
    expect(leftover).toEqual({ ore: 0, credits: 0, gear: { gearId: 'thruster', mk: 3 }, darkMatter: false });
  });

  it('leaves the barrier alone for ordinary crates', () => {
    const pilot = ship();
    pilot.darkMatter = 80;
    takeCrate(pilot, { ore: 1, credits: 0, gear: null, darkMatter: false });
    expect(pilot.darkMatter).toBe(80);
  });
});
