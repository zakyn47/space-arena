import { IDLE_INPUT, MAX_ACTIVE_MINES, MINE_ARM_TIME, MINE_DAMAGE, MINE_LIFETIME, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import type { WorldEntity } from '../src/world/entities';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function minefield() {
  const world = new World({ asteroidTarget: 0 });
  const alice = world.addShip(1, 'alice', { ...shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1), ordnance: 'mines' });
  const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x + 1_000, OPEN_SPACE.y, 2));
  return { world, alice, bob };
}

function mines(world: World): WorldEntity[] {
  return world.entitiesNear(OPEN_SPACE.x, OPEN_SPACE.y, 2_000).filter((entity) => entity.kind === 'spaceMine');
}

function ticks(world: World, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / TICK_DT); i += 1) world.tick(TICK_DT);
}

function armedMine(world: World, alice: { readonly id: number }) {
  world.setInput(alice.id, 1, { ...IDLE_INPUT, rocket: true });
  world.tick(TICK_DT);
  world.setInput(alice.id, 2, IDLE_INPUT);
  ticks(world, MINE_ARM_TIME);
  const mine = mines(world)[0];
  if (!mine) throw new Error('no mine dropped');
  return mine;
}

describe('World space mines', () => {
  it('drops a mine instead of a rocket and spends ammo', () => {
    const { world, alice } = minefield();
    armedMine(world, alice);
    expect(mines(world)).toHaveLength(1);
    expect(alice.rockets).toBe(9);
    expect(world.entitiesNear(OPEN_SPACE.x, OPEN_SPACE.y, 2_000).some((entity) => entity.kind === 'rocket')).toBe(false);
  });

  it('blows up under an unshielded enemy for big hull damage', () => {
    const { world, alice, bob } = minefield();
    const mine = armedMine(world, alice);
    Object.assign(bob, { x: mine.x, y: mine.y });
    const events = world.tick(TICK_DT);
    expect(bob.hull).toBe(bob.stats.maxHull - MINE_DAMAGE);
    expect(bob.lastHitBy).toBe(alice.id);
    expect(events.hits).toContainEqual(expect.objectContaining({ shipId: bob.id, shield: false }));
    world.tick(TICK_DT);
    expect(bob.hull).toBe(bob.stats.maxHull - MINE_DAMAGE);
    expect(mines(world)).toHaveLength(0);
  });

  it('is absorbed by a raised shield', () => {
    const { world, alice, bob } = minefield();
    const mine = armedMine(world, alice);
    world.setInput(bob.id, 1, { ...IDLE_INPUT, shield: true });
    world.tick(TICK_DT);
    Object.assign(bob, { x: mine.x, y: mine.y });
    const events = world.tick(TICK_DT);
    expect(bob.hull).toBe(bob.stats.maxHull);
    expect(events.hits).toContainEqual(expect.objectContaining({ shipId: bob.id, shield: true }));
    world.tick(TICK_DT);
    expect(mines(world)).toHaveLength(0);
  });

  it('never triggers for its owner', () => {
    const { world, alice } = minefield();
    const mine = armedMine(world, alice);
    Object.assign(alice, { x: mine.x, y: mine.y });
    ticks(world, 1);
    expect(alice.hull).toBe(alice.stats.maxHull);
    expect(mines(world)).toHaveLength(1);
  });

  it('keeps only the newest mines per pilot', () => {
    const { world, alice } = minefield();
    world.setInput(alice.id, 1, { ...IDLE_INPUT, rocket: true });
    ticks(world, 4);
    expect(alice.rockets).toBeLessThanOrEqual(10 - MAX_ACTIVE_MINES - 1);
    expect(mines(world)).toHaveLength(MAX_ACTIVE_MINES);
  });

  it('expires after its lifetime', () => {
    const { world, alice } = minefield();
    armedMine(world, alice);
    ticks(world, MINE_LIFETIME);
    expect(mines(world)).toHaveLength(0);
  });
});
