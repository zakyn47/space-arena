import { IDLE_INPUT, type HitEvent } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import type { ShipRecord } from '../src/db/PlayerRepository';
import { GameLoop } from '../src/GameLoop';
import { World, type DeathEvent } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function harness() {
  const broadcasts: number[] = [];
  const hits: HitEvent[][] = [];
  const deaths: DeathEvent[] = [];
  const saved: ShipRecord[] = [];
  const world = new World({ asteroidTarget: 0 });
  const loop = new GameLoop(
    world,
    {
      broadcastSnapshots: (pending) => {
        broadcasts.push(world.tickCount);
        hits.push([...pending]);
      }, notifyDeaths: (events) => deaths.push(...events),
    },
    { saveShips: (records) => saved.push(...records) },
    () => 0,
  );
  return { world, loop, broadcasts, hits, deaths, saved };
}

describe('GameLoop', () => {
  it('broadcasts 20 snapshots per 30 ticks', () => {
    const { loop, broadcasts } = harness();
    for (let i = 0; i < 30; i += 1) loop.step();
    expect(broadcasts).toHaveLength(20);
  });

  it('hands every hit since the last snapshot to the broadcast exactly once', () => {
    const { world, loop, hits } = harness();
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2));
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 60; i += 1) loop.step();
    const all = hits.flat();
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all).size).toBe(all.length);
  });

  it('saves dead ships and reports deaths', () => {
    const { world, loop, deaths, saved } = harness();
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2));
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 200 && deaths.length === 0; i += 1) loop.step();
    expect(deaths[0]?.killerName).toBe('alice');
    expect(saved.map((record) => record.accountId)).toEqual([2, 1]);
    expect(saved[1]?.pvpKills).toBe(1);
  });
});
