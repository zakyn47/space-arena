import { IDLE_INPUT, SAFE_ZONES } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import type { ShipRecord } from '../src/db/PlayerRepository';
import { GameLoop } from '../src/GameLoop';
import { World, type DeathEvent } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function harness() {
  const broadcasts: number[] = [];
  const deaths: DeathEvent[] = [];
  const saved: ShipRecord[] = [];
  const world = new World({ asteroidTarget: 0 });
  const loop = new GameLoop(
    world,
    { broadcastSnapshots: () => broadcasts.push(world.tickCount), notifyDeaths: (events) => deaths.push(...events) },
    { saveShips: (records) => saved.push(...records) },
    () => 0,
  );
  return { world, loop, broadcasts, deaths, saved };
}

describe('GameLoop', () => {
  it('broadcasts 20 snapshots per 30 ticks', () => {
    const { loop, broadcasts } = harness();
    for (let i = 0; i < 30; i += 1) loop.step();
    expect(broadcasts).toHaveLength(20);
  });

  it('saves docked ships and reports deaths', () => {
    const { world, loop, deaths, saved } = harness();
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
    world.addShip(9, 'carl', shipRecord(zone.x, zone.y, 9));
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2));
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 200 && deaths.length === 0; i += 1) loop.step();
    expect(deaths[0]?.killerName).toBe('alice');
    expect(saved.map((record) => record.accountId)).toEqual(expect.arrayContaining([9, 2]));
  });
});
