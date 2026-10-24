import {
  LEVIATHAN_AGGRO_RANGE,
  LEVIATHAN_FIRE_INTERVAL,
  LEVIATHAN_MAX_HULL,
  LEVIATHAN_PATROL_RADIUS,
  LEVIATHAN_RESPAWN,
  LEVIATHAN_SPREAD,
  TICK_DT,
} from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { ARENA_CENTER, BossDirector, type BossHost } from '../src/world/boss/BossDirector';
import { createLeviathan, createShip, type ShipEntity } from '../src/world/entities';
import { seeded, shipRecord } from './support/fixtures';

function fakeHost() {
  const ships = new Map<number, ShipEntity>();
  const shots: number[] = [];
  let nextId = 100;
  const host: BossHost = {
    spawnLeviathan: (x, y) => {
      const boss = createLeviathan((nextId += 1), x, y);
      ships.set(boss.id, boss);
      return boss;
    },
    ship: (id) => ships.get(id),
    players: () => [...ships.values()].filter((ship) => ship.npc === null),
    fireOrb: (_from, angle) => void shots.push(angle),
  };
  const addPlayer = (x: number, y: number): ShipEntity => {
    const player = createShip((nextId += 1), nextId, 'p', shipRecord(x, y, nextId));
    ships.set(player.id, player);
    return player;
  };
  const boss = (): ShipEntity | undefined => [...ships.values()].find((ship) => ship.npc === 'leviathan');
  return { host, ships, shots, addPlayer, boss };
}

function run(director: BossDirector, host: BossHost, from: number, seconds: number): number {
  let time = from;
  for (let i = 0; i < Math.ceil(seconds / TICK_DT); i += 1) {
    time += TICK_DT;
    director.step(host, time, TICK_DT);
  }
  return time;
}

describe('BossDirector', () => {
  it('spawns the leviathan at the arena center on the first step', () => {
    const { host, boss } = fakeHost();
    new BossDirector(seeded(1)).step(host, 0, TICK_DT);
    expect(boss()).toMatchObject({ x: ARENA_CENTER.x, y: ARENA_CENTER.y });
  });

  it('patrols with goals inside the patrol circle', () => {
    const { host, boss } = fakeHost();
    const director = new BossDirector(seeded(2));
    director.step(host, 0, TICK_DT);
    const leviathan = boss();
    if (!leviathan) throw new Error('no boss');
    for (let i = 0; i < 400; i += 1) {
      director.step(host, i * TICK_DT, TICK_DT);
      Object.assign(leviathan, { x: leviathan.x + leviathan.vx * TICK_DT, y: leviathan.y + leviathan.vy * TICK_DT });
      expect(Math.hypot(director.goal.x - ARENA_CENTER.x, director.goal.y - ARENA_CENTER.y)).toBeLessThanOrEqual(LEVIATHAN_PATROL_RADIUS);
    }
  });

  it('fires a three-orb spread at the nearest player in range every interval', () => {
    const { host, shots, addPlayer } = fakeHost();
    const director = new BossDirector(seeded(3));
    director.step(host, 0, TICK_DT);
    addPlayer(ARENA_CENTER.x, ARENA_CENTER.y - 600);
    run(director, host, 0, LEVIATHAN_FIRE_INTERVAL * 2 + 0.2);
    expect(shots).toHaveLength(6);
    expect(shots[1]).toBeCloseTo(0);
    expect((shots[2] ?? 0) - (shots[0] ?? 0)).toBeCloseTo(LEVIATHAN_SPREAD);
  });

  it('does not fire without a player in range', () => {
    const { host, shots, addPlayer } = fakeHost();
    const director = new BossDirector(seeded(4));
    director.step(host, 0, TICK_DT);
    addPlayer(ARENA_CENTER.x, ARENA_CENTER.y - LEVIATHAN_AGGRO_RANGE - 100);
    run(director, host, 0, LEVIATHAN_FIRE_INTERVAL * 3);
    expect(shots).toHaveLength(0);
  });

  it('regenerates only when no player is near', () => {
    const { host, boss, addPlayer } = fakeHost();
    const director = new BossDirector(seeded(5));
    director.step(host, 0, TICK_DT);
    const leviathan = boss();
    if (!leviathan) throw new Error('no boss');
    leviathan.hull = 1_000;
    run(director, host, 0, 2);
    expect(leviathan.hull).toBeCloseTo(1_010, 0);
    addPlayer(leviathan.x, leviathan.y - 500);
    run(director, host, 2, 2);
    expect(leviathan.hull).toBeCloseTo(1_010, 0);
  });

  it('respawns at full health after the respawn delay', () => {
    const { host, ships, boss } = fakeHost();
    const director = new BossDirector(seeded(6));
    director.step(host, 0, TICK_DT);
    const first = boss();
    if (!first) throw new Error('no boss');
    ships.delete(first.id);
    director.step(host, 10, TICK_DT);
    expect(boss()).toBeUndefined();
    director.step(host, 10 + LEVIATHAN_RESPAWN - 1, TICK_DT);
    expect(boss()).toBeUndefined();
    director.step(host, 10 + LEVIATHAN_RESPAWN, TICK_DT);
    expect(boss()?.hull).toBe(LEVIATHAN_MAX_HULL);
  });

  it('drops a rich crate with a Mk3 item', () => {
    const drop = new BossDirector(seeded(7)).loot();
    expect(drop).toMatchObject({ credits: 1_500, ore: 15 });
    expect(drop.gear?.mk).toBe(3);
  });
});
