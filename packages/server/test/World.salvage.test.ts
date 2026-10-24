import { IDLE_INPUT, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

describe('World salvage', () => {
  it('drops the victim salvage and lets another ship pick it up', () => {
    const world = new World({ asteroidTarget: 0 });
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bob = world.addShip(2, 'bob', { ...shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2), salvage: [{ gearId: 'armor', mk: 2 }] });
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 300 && world.tick(TICK_DT).died.length === 0; i += 1);
    world.setInput(alice.id, 2, IDLE_INPUT);
    expect(bob.salvage).toEqual([]);
    const carol = world.addShip(3, 'carol', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 3));
    for (let i = 0; i < 2; i += 1) world.tick(TICK_DT);
    expect(carol.salvage).toEqual([{ gearId: 'armor', mk: 2 }]);
  });
});
