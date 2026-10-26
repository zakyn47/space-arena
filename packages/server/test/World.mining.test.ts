import { IDLE_INPUT, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { OPEN_SPACE, seeded, shipRecord } from './support/fixtures';

function ticks(world: World, count: number): void {
  for (let i = 0; i < count; i += 1) world.tick(TICK_DT);
}

function count(world: World, kind: string): number {
  return world.entitiesNear(10_000, 10_000, 30_000).filter((e) => e.kind === kind).length;
}

function minerOnAsteroid(oreYield: number, hp = 1) {
  const world = new World({ asteroidTarget: 0, rng: seeded(7) });
  const asteroid = world.addAsteroid({ x: OPEN_SPACE.x, y: OPEN_SPACE.y, radius: 40, hp, oreYield, variant: 1 });
  const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
  world.setInput(ship.id, 1, { ...IDLE_INPUT, fire: true });
  return { world, ship, asteroid };
}

describe('World mining', () => {
  it('fills the asteroid field to the target', () => {
    const world = new World({ asteroidTarget: 50, rng: seeded(3) });
    world.tick(TICK_DT);
    expect(count(world, 'asteroid')).toBe(50);
  });

  it('breaks an asteroid into ore that a nearby ship collects', () => {
    const { world, ship } = minerOnAsteroid(3);
    ticks(world, 30);
    expect(count(world, 'asteroid')).toBe(0);
    expect(ship.ore).toBe(3);
  });

  it('makes guns a slow way to break rock compared to the mining laser', () => {
    const { world } = minerOnAsteroid(3, 20);
    ticks(world, 30);
    expect(count(world, 'asteroid')).toBe(1);
  });

  it('reports where shots strike rock so clients can show the impact', () => {
    const { world, asteroid } = minerOnAsteroid(3, 20);
    const hits = Array.from({ length: 30 }, () => world.tick(TICK_DT).hits).flat();
    expect(hits).toContainEqual(expect.objectContaining({ targetId: asteroid.id, block: 'rock' }));
  });

  it('respects cargo capacity', () => {
    const { world, ship } = minerOnAsteroid(3);
    ship.ore = ship.stats.cargoCapacity - 1;
    ticks(world, 30);
    expect(ship.ore).toBe(ship.stats.cargoCapacity);
    expect(count(world, 'ore')).toBe(2);
  });

  it('expires uncollected ore', () => {
    const { world, ship } = minerOnAsteroid(3);
    ship.ore = ship.stats.cargoCapacity;
    ticks(world, 30);
    expect(count(world, 'ore')).toBe(3);
    ticks(world, Math.ceil(60 / TICK_DT));
    expect(count(world, 'ore')).toBe(0);
  });

  it('lets a ship collect a loot crate', () => {
    const world = new World({ asteroidTarget: 0 });
    const alice = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bob = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 2));
    bob.ore = 4;
    bob.carriedCredits = 100;
    world.setInput(alice.id, 1, { ...IDLE_INPUT, fire: true });
    for (let i = 0; i < 200 && world.tick(TICK_DT).died.length === 0; i += 1);
    world.setInput(alice.id, 2, IDLE_INPUT);
    const carol = world.addShip(3, 'carol', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 200, 3));
    ticks(world, 2);
    expect(carol.ore).toBe(4);
    expect(carol.carriedCredits).toBe(50);
  });
});

describe('World mining laser', () => {
  it('drills ore into cargo and crumbles an empty asteroid', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    world.addAsteroid({ x: OPEN_SPACE.x, y: OPEN_SPACE.y - 150, radius: 40, hp: 80, oreYield: 1, variant: 1 });
    world.setInput(ship.id, 1, { ...IDLE_INPUT, mine: true });
    ticks(world, Math.ceil(2.5 / TICK_DT));
    expect(ship.ore).toBe(2);
    expect(count(world, 'asteroid')).toBe(0);
    expect(count(world, 'ore')).toBe(0);
  });
});
