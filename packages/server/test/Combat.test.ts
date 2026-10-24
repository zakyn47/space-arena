import { BOUNTY_BASE, IDLE_INPUT, SHIELD_LOCKOUT, SHIP_RADIUS } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { applyHit, bountyFor, tryFire, updateShield } from '../src/world/Combat';
import { createShip } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

const newShip = () => createShip(1, 1, 'alice', shipRecord(1_000, 1_000));
const ids = () => 99;

describe('updateShield', () => {
  it('drains energy while held', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 1, false);
    expect(ship.shieldUp).toBe(true);
    expect(ship.shieldEnergy).toBeCloseTo(70);
  });

  it('drops with a lockout when empty', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, shield: true };
    ship.shieldEnergy = 10;
    updateShield(ship, 1, false);
    expect(ship.shieldUp).toBe(false);
    expect(ship.shieldLockout).toBe(SHIELD_LOCKOUT);
    updateShield(ship, 0.5, false);
    expect(ship.shieldUp).toBe(false);
  });

  it('regenerates when lowered and never exceeds max', () => {
    const ship = newShip();
    ship.shieldEnergy = 50;
    updateShield(ship, 1, false);
    expect(ship.shieldEnergy).toBeCloseTo(65);
    updateShield(ship, 10, false);
    expect(ship.shieldEnergy).toBe(100);
  });

  it('cannot be raised inside a safe zone', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 0.1, true);
    expect(ship.shieldUp).toBe(false);
  });
});

describe('tryFire', () => {
  it('fires from the nose and applies cooldown', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, fire: true };
    const bullet = tryFire(ship, 0.1, false, 0, ids);
    expect(bullet).toMatchObject({ ownerId: 1, x: 1_000, y: 1_000 - SHIP_RADIUS, vy: -800, damage: 10 });
    expect(tryFire(ship, 0.1, false, 0, ids)).toBeNull();
    expect(tryFire(ship, 0.2, false, 0, ids)).not.toBeNull();
  });

  it('does not fire while shielded or in a safe zone', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, fire: true };
    ship.shieldUp = true;
    expect(tryFire(ship, 0.1, false, 0, ids)).toBeNull();
    ship.shieldUp = false;
    expect(tryFire(ship, 0.1, true, 0, ids)).toBeNull();
  });
});

describe('applyHit', () => {
  it('damages hull and records the attacker', () => {
    const ship = newShip();
    const bullet = { kind: 'bullet', id: 5, ownerId: 7, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, damage: 10, tier: 0, expiresAt: 1 } as const;
    applyHit(ship, bullet, 3);
    expect(ship.hull).toBe(90);
    expect(ship.lastHitBy).toBe(7);
    expect(ship.lastDamagedAt).toBe(3);
  });

  it('is absorbed by a raised shield', () => {
    const ship = newShip();
    ship.shieldUp = true;
    applyHit(ship, { kind: 'bullet', id: 5, ownerId: 7, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, damage: 10, tier: 0, expiresAt: 1 }, 3);
    expect(ship.hull).toBe(100);
  });
});

describe('bountyFor', () => {
  it('adds a share of the victim loadout value', () => {
    expect(bountyFor({ hull: 1, engine: 0, weapon: 0, shield: 0, cargo: 0 })).toBe(BOUNTY_BASE + 50);
  });
});
