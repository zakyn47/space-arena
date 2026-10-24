import {
  BOUNTY_BASE,
  BOUNTY_SHARE,
  DISCONNECT_LINGER,
  IDLE_INPUT,
  RESPAWN_ROCKETS,
  SAFE_ZONES,
  STARTER_BUILD,
  TICK_DT,
  buildValue,
  type HitEvent,
} from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World, type DeathEvent } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function duel() {
  const world = new World({ asteroidTarget: 0 });
  const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
  const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2));
  return { world, alice, bob };
}

function runUntilDeath(world: World, maxTicks = 200): DeathEvent | undefined {
  for (let i = 0; i < maxTicks; i += 1) {
    const death = world.tick(TICK_DT).died[0];
    if (death) return death;
  }
  return undefined;
}

function firstHit(world: World, maxTicks = 60): HitEvent | undefined {
  for (let i = 0; i < maxTicks; i += 1) {
    const hit = world.tick(TICK_DT).hits[0];
    if (hit) return hit;
  }
  return undefined;
}

describe('World combat', () => {
  it('kills a target, pays the bounty and respawns the victim', () => {
    const { world, alice, bob } = duel();
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    const death = runUntilDeath(world);
    expect(death?.ship.id).toBe(bob.id);
    expect(death?.killerName).toBe('alice');
    expect(alice.carriedCredits).toBe(BOUNTY_BASE + Math.floor(buildValue(STARTER_BUILD) * BOUNTY_SHARE));
    const zone = SAFE_ZONES[0];
    expect([bob.x, bob.y]).toEqual([zone?.x, zone?.y]);
    expect(bob.hull).toBe(bob.stats.maxHull);
    expect(bob.rockets).toBe(RESPAWN_ROCKETS);
  });

  it('shield blocks damage', () => {
    const { world, alice, bob } = duel();
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    world.setInput(bob.id, 1, { ...IDLE_INPUT, shield: true });
    for (let i = 0; i < 30; i += 1) world.tick(TICK_DT);
    expect(bob.hull).toBe(bob.stats.maxHull);
    expect(bob.shieldEnergy).toBeLessThan(bob.stats.maxShield);
  });

  it('reports hull hits facing the shooter', () => {
    const { world, alice, bob } = duel();
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    const hit = firstHit(world);
    expect(hit).toMatchObject({ shipId: bob.id, shield: false });
    expect(Math.abs(hit?.angle ?? 0)).toBeCloseTo(Math.PI);
  });

  it('reports shield hits', () => {
    const { world, alice, bob } = duel();
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    world.setInput(bob.id, 1, { ...IDLE_INPUT, shield: true });
    expect(firstHit(world)).toMatchObject({ shipId: bob.id, shield: true });
  });

  it('drops a crate with carried ore and half the carried credits', () => {
    const { world, alice, bob } = duel();
    bob.ore = 5;
    bob.carriedCredits = 100;
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    runUntilDeath(world);
    world.setInput(alice.id, 2, IDLE_INPUT);
    world.tick(TICK_DT);
    const crate = world.entitiesNear(OPEN_SPACE.x, OPEN_SPACE.y - 200, 50).find((e) => e.kind === 'crate');
    expect(crate).toMatchObject({ ore: 5, credits: 50 });
    expect(bob.ore).toBe(0);
    expect(bob.carriedCredits).toBe(0);
  });

  it('prevents firing inside a safe zone', () => {
    const world = new World({ asteroidTarget: 0 });
    const zone = SAFE_ZONES[0];
    const ship = world.addShip(1, 'alice', shipRecord(zone?.x ?? 0, zone?.y ?? 0, 1));
    world.setInput(ship.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 10; i += 1) world.tick(TICK_DT);
    expect(world.entitiesNear(ship.x, ship.y, 2_000).some((e) => e.kind === 'bullet')).toBe(false);
  });

  it('consumes one queued input per tick and ignores stale seqs', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.setInput(ship.id, 1, { ...IDLE_INPUT, thrust: true });
    world.setInput(ship.id, 2, IDLE_INPUT);
    world.setInput(ship.id, 2, { ...IDLE_INPUT, left: true });
    world.tick(TICK_DT);
    expect(ship.lastSeq).toBe(1);
    world.tick(TICK_DT);
    expect(ship.lastSeq).toBe(2);
    expect(ship.input).toEqual(IDLE_INPUT);
  });

  it('keeps a ship disconnected in open space for the linger period', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    expect(world.disconnect(ship.id)).toBeUndefined();
    const departed = [];
    for (let i = 0; i < Math.ceil(DISCONNECT_LINGER / TICK_DT) + 1; i += 1) departed.push(...world.tick(TICK_DT).departed);
    expect(departed.map((s) => s.id)).toEqual([ship.id]);
    expect(world.shipById(ship.id)).toBeUndefined();
  });

  it('removes a ship disconnected inside a safe zone immediately', () => {
    const world = new World({ asteroidTarget: 0 });
    const zone = SAFE_ZONES[0];
    const ship = world.addShip(1, 'alice', shipRecord(zone?.x ?? 0, zone?.y ?? 0, 1));
    expect(world.disconnect(ship.id)?.id).toBe(ship.id);
    expect(world.shipById(ship.id)).toBeUndefined();
  });

  it('reconnect cancels the linger', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.disconnect(ship.id);
    world.reconnect(ship.id);
    for (let i = 0; i < Math.ceil(DISCONNECT_LINGER / TICK_DT) + 1; i += 1) world.tick(TICK_DT);
    expect(world.shipById(ship.id)).toBeDefined();
  });
});
