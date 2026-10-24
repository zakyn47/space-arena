import { GEAR_IDS, SALVAGE_CAPACITY } from '@arena/shared';
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
      { ore: 4, credits: 50, gear: { gearId: 'armor', mk: 1 } },
      { ore: 0, credits: 0, gear: { gearId: 'thruster', mk: 2 } },
    ]);
  });

  it('drops nothing for an empty ship', () => {
    expect(playerDeathCrates(ship())).toEqual([]);
  });
});

describe('takeCrate', () => {
  it('takes everything when the hold has room', () => {
    const looter = ship();
    expect(takeCrate(looter, { ore: 2, credits: 40, gear: { gearId: 'armor', mk: 1 } })).toBeNull();
    expect(looter.salvage).toEqual([{ gearId: 'armor', mk: 1 }]);
    expect(looter.carriedCredits).toBe(40);
    expect(looter.ore).toBe(2);
  });

  it('leaves the gear behind when the hold is full', () => {
    const looter = ship();
    looter.salvage = Array.from({ length: SALVAGE_CAPACITY }, () => ({ gearId: 'armor' as const, mk: 1 as const }));
    expect(takeCrate(looter, { ore: 0, credits: 10, gear: { gearId: 'thruster', mk: 1 } })).toEqual({ ore: 0, credits: 0, gear: { gearId: 'thruster', mk: 1 } });
    expect(looter.carriedCredits).toBe(10);
  });
});
