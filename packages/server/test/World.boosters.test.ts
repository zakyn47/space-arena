import { BOOSTER_COUNT, BOOSTER_RESPAWN, IDLE_INPUT, TICK_DT, type ShipInput } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import type { BoosterEntity } from '../src/world/entities';
import { World } from '../src/world/World';
import { OPEN_SPACE, seeded, shipRecord } from './support/fixtures';

function boosters(world: World): BoosterEntity[] {
  return world.boosterList();
}

function ticks(world: World, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / TICK_DT); i += 1) world.tick(TICK_DT);
}

describe('World boosters', () => {
  it('keeps five boosters on the map when enabled and none otherwise', () => {
    const world = new World({ asteroidTarget: 0, boosters: true, rng: seeded(1) });
    world.tick(TICK_DT);
    expect(boosters(world)).toHaveLength(BOOSTER_COUNT);
    const plain = new World({ asteroidTarget: 0 });
    plain.tick(TICK_DT);
    expect(boosters(plain)).toHaveLength(0);
  });

  it('replaces a collected booster ten seconds later', () => {
    const world = new World({ asteroidTarget: 0, boosters: true, rng: seeded(2) });
    world.tick(TICK_DT);
    const [target] = boosters(world);
    if (!target) throw new Error('no booster');
    const ship = world.addShip(1, 'alice', shipRecord(target.x, target.y, 1));
    ship.hull = 1;
    world.tick(TICK_DT);
    world.tick(TICK_DT);
    expect(boosters(world)).toHaveLength(BOOSTER_COUNT - 1);
    expect(ship.hull > 1 || ship.speedBoostUntil > world.time).toBe(true);
    ticks(world, BOOSTER_RESPAWN - 1);
    expect(boosters(world)).toHaveLength(BOOSTER_COUNT - 1);
    ticks(world, 1.2);
    expect(boosters(world)).toHaveLength(BOOSTER_COUNT);
  });

  it('is ignored by pirates', () => {
    const world = new World({ asteroidTarget: 0, boosters: true, rng: seeded(3), pirates: [{ band: 'raider', composition: () => ['raider'] }] });
    world.tick(TICK_DT);
    const [target] = boosters(world);
    const pirate = world.npcShips()[0];
    if (!target || !pirate) throw new Error('setup failed');
    Object.assign(pirate, { x: target.x, y: target.y, hull: 1 });
    world.tick(TICK_DT);
    world.tick(TICK_DT);
    expect(boosters(world)).toHaveLength(BOOSTER_COUNT);
  });

  it('lets a speed-boosted ship fly half again as fast', () => {
    const thrust: ShipInput = { ...IDLE_INPUT, thrust: true };
    const world = new World({ asteroidTarget: 0 });
    const normal = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const boosted = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x + 500, OPEN_SPACE.y, 2));
    boosted.speedBoostUntil = 100;
    world.setInput(normal.id, 1, thrust);
    world.setInput(boosted.id, 1, thrust);
    ticks(world, 5);
    expect(Math.hypot(boosted.vx, boosted.vy)).toBeCloseTo(Math.hypot(normal.vx, normal.vy) * 1.5, 0);
  });
});
