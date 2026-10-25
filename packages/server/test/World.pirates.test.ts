import { HULLS, IDLE_INPUT, PLAYER_HULL_BONUS, TICK_DT, type PirateTier } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createPirateShip, createShip } from '../src/world/entities';
import { DEFAULT_PATROLS } from '../src/world/pirates/PirateDirector';
import { World } from '../src/world/World';
import { seeded, shipRecord } from './support/fixtures';

const patrolOf = (...tiers: PirateTier[]) => [{ band: 'raider' as const, composition: (): PirateTier[] => tiers }];

describe('pirate hull', () => {
  it('pirates keep their catalog hull without the player bonus', () => {
    const raider = createPirateShip(9, 'raider', 0, 0);
    expect(raider.stats.maxHull).toBe(HULLS.scout.maxHull);
    expect(raider.hull).toBe(HULLS.scout.maxHull);
  });

  it('players get the bonus on top of the same hull', () => {
    expect(createShip(1, 1, 'alice', shipRecord(0, 0, 1)).stats.maxHull).toBe(HULLS.scout.maxHull + PLAYER_HULL_BONUS);
  });
});

describe('default patrols', () => {
  it('fields half the original pirate patrols', () => {
    expect(DEFAULT_PATROLS.map((patrol) => patrol.band)).toEqual(['raider', 'raider', 'raider', 'raider', 'marauder', 'marauder', 'marauder', 'warlord']);
  });
});

describe('World pirates', () => {
  it('kills a pirate without a death event or bounty and drops its loot crate', () => {
    const world = new World({ asteroidTarget: 0, rng: seeded(11), pirates: patrolOf('raider') });
    world.tick(TICK_DT);
    const [raider] = world.npcShips();
    if (!raider) throw new Error('no raider');
    raider.hull = 1;
    raider.shieldEnergy = 0;
    const hunter = world.addShip(1, 'alice', shipRecord(raider.x, raider.y + 300, 1));
    world.setInput(hunter.id, 1, { ...IDLE_INPUT, fire: true });
    let reported = 0;
    for (let i = 0; i < 60 && world.npcShips().length > 0; i += 1) {
      reported += world.tick(TICK_DT).died.filter((d) => d.ship.npc !== null).length;
    }
    expect(world.npcShips()).toHaveLength(0);
    expect(reported).toBe(0);
    expect(hunter.carriedCredits).toBe(0);
    expect(hunter.pvpKills).toBe(0);
    world.tick(TICK_DT);
    expect(world.entitiesNear(10_000, 10_000, 30_000).some((e) => e.kind === 'crate' && e.credits === 40)).toBe(true);
  });

  it('pirate bullets pass through other pirates', () => {
    const world = new World({ asteroidTarget: 0, rng: seeded(12), pirates: patrolOf('raider', 'raider') });
    world.tick(TICK_DT);
    const [shooter, shield] = world.npcShips();
    if (!shooter || !shield) throw new Error('missing raiders');
    Object.assign(shield, { x: shooter.x, y: shooter.y - 150, angle: 0 });
    Object.assign(shooter, { angle: 0 });
    world.addShip(1, 'alice', shipRecord(shooter.x, shooter.y - 400, 1));
    for (let i = 0; i < 20; i += 1) world.tick(TICK_DT);
    expect(shield.hull).toBe(shield.stats.maxHull);
  });
});
