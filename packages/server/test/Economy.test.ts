import { DOCK_COMBAT_COOLDOWN, ORE_PRICE, SAFE_ZONES } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { buyUpgrade, updateDocking } from '../src/world/Economy';
import { createShip } from '../src/world/entities';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
const dockedShip = () => createShip(1, 1, 'alice', shipRecord(zone.x, zone.y, 1));

describe('updateDocking', () => {
  it('docks, sells ore, banks credits and repairs', () => {
    const ship = dockedShip();
    ship.ore = 3;
    ship.carriedCredits = 40;
    ship.hull = 10;
    expect(updateDocking(ship, 100)).toBe(true);
    expect(ship.docked).toBe(true);
    expect(ship.bankedCredits).toBe(40 + 3 * ORE_PRICE);
    expect(ship.ore).toBe(0);
    expect(ship.carriedCredits).toBe(0);
    expect(ship.hull).toBe(ship.stats.maxHull);
  });

  it('reports docking only once', () => {
    const ship = dockedShip();
    updateDocking(ship, 100);
    expect(updateDocking(ship, 101)).toBe(false);
  });

  it('refuses when moving fast', () => {
    const ship = dockedShip();
    ship.vx = 100;
    expect(updateDocking(ship, 100)).toBe(false);
    expect(ship.docked).toBe(false);
  });

  it('refuses shortly after taking damage', () => {
    const ship = dockedShip();
    ship.lastDamagedAt = 100 - DOCK_COMBAT_COOLDOWN + 1;
    expect(updateDocking(ship, 100)).toBe(false);
  });

  it('undocks outside a zone', () => {
    const ship = createShip(1, 1, 'alice', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y, 1));
    ship.docked = true;
    updateDocking(ship, 100);
    expect(ship.docked).toBe(false);
  });
});

describe('buyUpgrade', () => {
  it('requires docking', () => {
    expect(buyUpgrade(dockedShip(), 'weapon')).toEqual({ ok: false, reason: 'not_docked' });
  });

  it('requires enough banked credits', () => {
    const ship = dockedShip();
    ship.docked = true;
    expect(buyUpgrade(ship, 'weapon')).toEqual({ ok: false, reason: 'insufficient_credits' });
  });

  it('deducts credits and applies new stats', () => {
    const ship = dockedShip();
    ship.docked = true;
    ship.bankedCredits = 300;
    expect(buyUpgrade(ship, 'weapon')).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(50);
    expect(ship.loadout.weapon).toBe(1);
    expect(ship.stats.damage).toBeCloseTo(12.2);
  });

  it('stops at max tier', () => {
    const ship = dockedShip();
    ship.docked = true;
    ship.bankedCredits = 1_000_000;
    ship.loadout = { ...ship.loadout, cargo: 3 };
    expect(buyUpgrade(ship, 'cargo')).toEqual({ ok: false, reason: 'max_tier' });
  });
});
