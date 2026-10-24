import { DOCK_COOLDOWN, ORE_PRICE, SAFE_ZONES } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { canDock, dockCooldownRemaining, toggleDock } from '../src/world/Docking';
import { createShip } from '../src/world/entities';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
const nearStation = () => createShip(1, 1, 'alice', shipRecord(zone.x + 150, zone.y, 1));

describe('toggleDock', () => {
  it('snaps to the station, freezes, sells ore, banks credits and repairs', () => {
    const ship = nearStation();
    ship.vx = 30;
    ship.ore = 3;
    ship.carriedCredits = 40;
    ship.hull = 10;
    expect(toggleDock(ship, 100)).toEqual({ ok: true, docked: true });
    expect([ship.x, ship.y, ship.vx, ship.vy]).toEqual([zone.x, zone.y, 0, 0]);
    expect(ship.bankedCredits).toBe(40 + 3 * ORE_PRICE);
    expect(ship.hull).toBe(ship.stats.maxHull);
    expect(ship.docked).toBe(true);
  });

  it('refuses out of range, too fast, or after recent damage', () => {
    const far = createShip(1, 1, 'alice', shipRecord(zone.x + 250, zone.y, 1));
    expect(toggleDock(far, 100)).toEqual({ ok: false, reason: 'out_of_range' });
    const fast = nearStation();
    fast.vx = 100;
    expect(toggleDock(fast, 100)).toEqual({ ok: false, reason: 'too_fast' });
    const hurt = nearStation();
    hurt.lastDamagedAt = 98;
    expect(toggleDock(hurt, 100)).toEqual({ ok: false, reason: 'recent_damage' });
    expect(hurt.docked).toBe(false);
  });

  it('undocks and enforces the 30 s cooldown', () => {
    const ship = nearStation();
    toggleDock(ship, 100);
    expect(toggleDock(ship, 110)).toEqual({ ok: true, docked: false });
    expect(dockCooldownRemaining(ship, 120)).toBe(DOCK_COOLDOWN - 10);
    expect(toggleDock(ship, 120)).toEqual({ ok: false, reason: 'cooldown' });
    expect(canDock(ship, 120)).toBe(false);
    expect(canDock(ship, 110 + DOCK_COOLDOWN)).toBe(true);
  });

  it('reports canDock false while docked or in open space', () => {
    const ship = nearStation();
    expect(canDock(ship, 0)).toBe(true);
    toggleDock(ship, 0);
    expect(canDock(ship, 0)).toBe(false);
    expect(canDock(createShip(2, 2, 'bob', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 2)), 0)).toBe(false);
  });
});
