import { DARK_MATTER_SHIELD, IDLE_INPUT, LEVIATHAN_MAX_HULL, LEVIATHAN_RADIUS, ORB_DAMAGE, ORB_LIFETIME, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createLeviathan } from '../src/world/entities';
import { World } from '../src/world/World';
import { OPEN_SPACE, seeded, shipRecord } from './support/fixtures';

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

describe('plasma orbs', () => {
  function orbsNear(world: World): number {
    return world.entitiesNear(OPEN_SPACE.x, OPEN_SPACE.y, 3_000).filter((entity) => entity.kind === 'orb').length;
  }

  it('fly slowly and deal 40 damage', () => {
    const world = new World({ asteroidTarget: 0 });
    const boss = world.addLeviathan(OPEN_SPACE.x, OPEN_SPACE.y);
    const target = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 400, 1));
    world.fireOrb(boss, 0);
    const events = Array.from({ length: Math.ceil(2 / TICK_DT) }, () => world.tick(TICK_DT));
    expect(target.hull).toBe(target.stats.maxHull - ORB_DAMAGE);
    expect(target.lastHitBy).toBe(boss.id);
    expect(events.flatMap((tick) => tick.hits)).toContainEqual(expect.objectContaining({ shipId: target.id, block: 'hull' }));
  });

  it('hit pilots hugging the boss inside its radius', () => {
    const world = new World({ asteroidTarget: 0 });
    const boss = world.addLeviathan(OPEN_SPACE.x, OPEN_SPACE.y);
    const target = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 40, 1));
    world.fireOrb(boss, 0);
    for (let i = 0; i < Math.ceil(1 / TICK_DT); i += 1) world.tick(TICK_DT);
    expect(target.hull).toBe(target.stats.maxHull - ORB_DAMAGE);
    expect(target.lastHitBy).toBe(boss.id);
  });

  it('are blocked by a raised shield', () => {
    const world = new World({ asteroidTarget: 0 });
    const boss = world.addLeviathan(OPEN_SPACE.x, OPEN_SPACE.y);
    const target = world.addShip(1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y - 400, 1));
    world.setInput(target.id, 1, { ...IDLE_INPUT, shield: true });
    world.fireOrb(boss, 0);
    for (let i = 0; i < Math.ceil(2 / TICK_DT); i += 1) world.tick(TICK_DT);
    expect(target.hull).toBe(target.stats.maxHull);
  });

  it('pass through pirates and expire after their lifetime', () => {
    const world = new World({ asteroidTarget: 0, rng: seeded(3), pirates: [{ band: 'raider', composition: () => ['raider'] }] });
    world.tick(TICK_DT);
    const pirate = world.npcShips().find((ship) => ship.npc === 'raider');
    if (!pirate) throw new Error('no pirate');
    Object.assign(pirate, { x: OPEN_SPACE.x, y: OPEN_SPACE.y - 400, vx: 0, vy: 0, input: IDLE_INPUT });
    const boss = world.addLeviathan(OPEN_SPACE.x, OPEN_SPACE.y);
    world.fireOrb(boss, 0);
    world.tick(TICK_DT);
    expect(orbsNear(world)).toBe(1);
    for (let i = 0; i < Math.ceil(ORB_LIFETIME / TICK_DT); i += 1) world.tick(TICK_DT);
    expect(pirate.hull).toBe(pirate.stats.maxHull);
    expect(orbsNear(world)).toBe(0);
  });
});

describe('Leviathan in the world', () => {
  it('spawns at the center when the boss is enabled', () => {
    const world = new World({ asteroidTarget: 0, boss: true });
    world.tick(TICK_DT);
    expect(world.npcShips().filter((ship) => ship.npc === 'leviathan')).toHaveLength(1);
  });

  it('drops loot and grants XP on death without a died event or pvp kill', () => {
    const world = new World({ asteroidTarget: 0, boss: true, rng: seeded(8) });
    world.tick(TICK_DT);
    const boss = world.npcShips().find((ship) => ship.npc === 'leviathan');
    if (!boss) throw new Error('no boss');
    const hunter = world.addShip(1, 'alice', shipRecord(boss.x, boss.y + 300, 1));
    boss.hull = 0;
    boss.lastHitBy = hunter.id;
    const events = world.tick(TICK_DT);
    expect(events.died).toEqual([]);
    expect(hunter.pvpKills).toBe(0);
    expect(hunter.captain.xp).toBe(500);
    world.tick(TICK_DT);
    expect(world.entitiesNear(boss.x, boss.y, 200).some((entity) => entity.kind === 'crate' && entity.credits === 1_500)).toBe(true);
  });

  it('drops a crate that grants the dark matter barrier', () => {
    const world = new World({ asteroidTarget: 0, boss: true, rng: seeded(8) });
    world.tick(TICK_DT);
    const boss = world.npcShips().find((ship) => ship.npc === 'leviathan');
    if (!boss) throw new Error('no boss');
    const looter = world.addShip(1, 'alice', shipRecord(boss.x, boss.y, 1));
    boss.hull = 0;
    for (let i = 0; i < 3; i += 1) world.tick(TICK_DT);
    expect(looter.darkMatter).toBe(DARK_MATTER_SHIELD);
  });
});
