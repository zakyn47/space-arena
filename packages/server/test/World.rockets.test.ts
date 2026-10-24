import { IDLE_INPUT, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

describe('World rockets', () => {
  it('homes in and kills a target in three hits', () => {
    const world = new World({ asteroidTarget: 0 });
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x + 200, OPEN_SPACE.y - 500, 2));
    world.setInput(alice.id, 1, { ...IDLE_INPUT, rocket: true });
    let killer: string | null = null;
    for (let i = 0; i < 300 && killer === null; i += 1) killer = world.tick(TICK_DT).died[0]?.killerName ?? null;
    expect(killer).toBe('alice');
    expect(alice.rockets).toBeLessThanOrEqual(7);
    expect(bob.rockets).toBe(0);
  });

  it('is absorbed by a raised shield', () => {
    const world = new World({ asteroidTarget: 0 });
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 300, 2));
    world.setInput(alice.id, 1, { ...IDLE_INPUT, rocket: true });
    world.setInput(bob.id, 1, { ...IDLE_INPUT, shield: true });
    for (let i = 0; i < 45; i += 1) world.tick(TICK_DT);
    expect(bob.hull).toBe(bob.stats.maxHull);
  });
});
