import { DARK_MATTER_SHIELD, IDLE_INPUT, PLASMA_DAMAGE, SHIELD_DISRUPTION, TICK_DT, type HitEvent } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import type { WorldEntity } from '../src/world/entities';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function duel() {
  const world = new World({ asteroidTarget: 0 });
  const alice = world.addShip(1, 'alice', { ...shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1), ordnance: 'plasma' });
  const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 400, 2));
  return { world, alice, bob };
}

function bolts(world: World): WorldEntity[] {
  return world.entitiesNear(OPEN_SPACE.x, OPEN_SPACE.y, 2_000).filter((entity) => entity.kind === 'plasma');
}

function fireOnce(world: World, shooterId: number): void {
  world.setInput(shooterId, 1, { ...IDLE_INPUT, rocket: true });
  world.tick(TICK_DT);
  world.setInput(shooterId, 2, IDLE_INPUT);
}

function ticks(world: World, seconds: number): HitEvent[] {
  return Array.from({ length: Math.ceil(seconds / TICK_DT) }, () => world.tick(TICK_DT)).flatMap((tick) => tick.hits);
}

describe('World plasma blaster', () => {
  it('fires a slow straight bolt that spends ammo', () => {
    const { world, alice } = duel();
    fireOnce(world, alice.id);
    world.tick(TICK_DT);
    const [bolt] = bolts(world);
    expect(alice.rockets).toBe(9);
    expect(bolt).toMatchObject({ kind: 'plasma', vx: 0 });
    expect(world.entitiesNear(OPEN_SPACE.x, OPEN_SPACE.y, 2_000).some((entity) => entity.kind === 'rocket')).toBe(false);
  });

  it('hits the hull like a rocket and disrupts the shield for five seconds', () => {
    const { world, alice, bob } = duel();
    fireOnce(world, alice.id);
    ticks(world, 1.5);
    expect(bob.hull).toBe(bob.stats.maxHull - PLASMA_DAMAGE);
    expect(bob.shieldDisruptedUntil).toBeGreaterThan(world.time);
    expect(bob.shieldDisruptedUntil).toBeLessThanOrEqual(world.time + SHIELD_DISRUPTION);
  });

  it('is absorbed by a raised shield, which then collapses and stays down', () => {
    const { world, alice, bob } = duel();
    world.setInput(bob.id, 1, { ...IDLE_INPUT, shield: true });
    fireOnce(world, alice.id);
    ticks(world, 1.5);
    expect(bob.hull).toBe(bob.stats.maxHull);
    expect(bob.shieldUp).toBe(false);
    ticks(world, 2);
    expect(bob.shieldUp).toBe(false);
    ticks(world, SHIELD_DISRUPTION - 2);
    expect(bob.shieldUp).toBe(true);
  });

  it('drains the dark matter barrier instead of the hull', () => {
    const { world, alice, bob } = duel();
    bob.darkMatter = DARK_MATTER_SHIELD;
    fireOnce(world, alice.id);
    const hits = ticks(world, 1.5);
    expect(bob.darkMatter).toBe(DARK_MATTER_SHIELD - PLASMA_DAMAGE);
    expect(bob.hull).toBe(bob.stats.maxHull);
    expect(hits).toContainEqual(expect.objectContaining({ targetId: bob.id, block: 'dark_matter' }));
  });
});
