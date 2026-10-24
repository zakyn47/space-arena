import { IDLE_INPUT, LEVIATHAN_MAX_HULL, LEVIATHAN_RADIUS, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createLeviathan } from '../src/world/entities';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function fireFor(world: World, shipId: number, seconds: number): void {
  world.setInput(shipId, 1, { ...IDLE_INPUT, fire: true });
  for (let i = 0; i < Math.ceil(seconds / TICK_DT); i += 1) world.tick(TICK_DT);
}

describe('Leviathan entity', () => {
  it('has fixed boss stats and a large hit radius', () => {
    const boss = createLeviathan(5, 100, 200);
    expect(boss).toMatchObject({ npc: 'leviathan', name: 'Void Leviathan', radius: LEVIATHAN_RADIUS, hull: LEVIATHAN_MAX_HULL, shieldEnergy: 0 });
    expect(boss.stats.maxShield).toBe(0);
    expect(boss.stats.weapons).toEqual([]);
  });

  it('is hit by bullets passing 80 px from its center, unlike a normal ship', () => {
    const world = new World({ asteroidTarget: 0 });
    const shooter = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const boss = world.addLeviathan(OPEN_SPACE.x + 80, OPEN_SPACE.y - 400);
    fireFor(world, shooter.id, 1);
    expect(boss.hull).toBeLessThan(LEVIATHAN_MAX_HULL);
    expect(boss.lastHitBy).toBe(shooter.id);
  });

  it('a normal ship 80 px off the line of fire is not hit', () => {
    const world = new World({ asteroidTarget: 0 });
    const shooter = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    const bystander = world.addShip(2, 'bob', shipRecord(OPEN_SPACE.x + 80, OPEN_SPACE.y - 400, 2));
    fireFor(world, shooter.id, 1);
    expect(bystander.hull).toBe(bystander.stats.maxHull);
  });
});
