import { SAFE_ZONES, TICK_DT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { shipRecord } from './support/fixtures';

describe('World economy', () => {
  it('emits a docked event once and allows buying', () => {
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'alice', { ...shipRecord(zone.x, zone.y, 1), bankedCredits: 500 });
    expect(world.tick(TICK_DT).docked.map((s) => s.id)).toEqual([ship.id]);
    expect(world.tick(TICK_DT).docked).toEqual([]);
    expect(world.buy(ship.id, 'hull')).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(300);
  });

  it('returns not_docked for unknown ships', () => {
    expect(new World({ asteroidTarget: 0 }).buy(999, 'hull')).toEqual({ ok: false, reason: 'not_docked' });
  });
});
