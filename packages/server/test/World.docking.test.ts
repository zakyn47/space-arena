import { IDLE_INPUT, SAFE_ZONES, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { shipRecord } from './support/fixtures';

const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };

describe('World docking', () => {
  it('does not auto-dock', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(zone.x, zone.y, 1));
    world.tick(TICK_DT);
    expect(ship.docked).toBe(false);
  });

  it('freezes a docked ship but still acknowledges its inputs', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(zone.x, zone.y, 1));
    expect(world.dock(ship.id)).toEqual({ ok: true, docked: true });
    world.setInput(ship.id, 1, { ...IDLE_INPUT, thrust: true });
    for (let i = 0; i < 10; i += 1) world.tick(TICK_DT);
    expect([ship.x, ship.y]).toEqual([zone.x, zone.y]);
    expect(ship.lastSeq).toBe(1);
  });

  it('flies again after undocking', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(zone.x, zone.y, 1));
    world.dock(ship.id);
    world.dock(ship.id);
    world.setInput(ship.id, 1, { ...IDLE_INPUT, thrust: true });
    for (let i = 0; i < 10; i += 1) world.tick(TICK_DT);
    expect(ship.y).toBeLessThan(zone.y);
  });

  it('clears the dock state on death', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', shipRecord(zone.x, zone.y, 1));
    world.dock(ship.id);
    ship.hull = 0;
    world.tick(TICK_DT);
    expect(ship.docked).toBe(false);
    expect(ship.dockCooldownUntil).toBe(-Infinity);
  });
});
