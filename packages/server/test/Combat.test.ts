import { BOUNTY_BASE, IDLE_INPUT, SHIELD_LOCKOUT, SHIP_RADIUS, STARTER_BUILD, type Build } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { applyDamage, bountyFor, fireWeapons, updateShield } from '../src/world/Combat';
import { createShip } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

const newShip = (build: Build = STARTER_BUILD) => createShip(1, 1, 'alice', { ...shipRecord(1_000, 1_000), build });
let nextId = 100;
const ids = () => (nextId += 1);

const twinFighter: Build = {
  hullId: 'fighter',
  slots: {
    weapon: [{ gearId: 'pulse_laser', mk: 1 }, { gearId: 'heavy_cannon', mk: 1 }],
    shield: [{ gearId: 'shield_gen', mk: 1 }],
    engine: [{ gearId: 'thruster', mk: 1 }],
    utility: [null],
  },
};

describe('updateShield', () => {
  it('drains while held and locks out when empty', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 1, false);
    expect(ship.shieldEnergy).toBeCloseTo(70);
    ship.shieldEnergy = 10;
    updateShield(ship, 1, false);
    expect(ship.shieldUp).toBe(false);
    expect(ship.shieldLockout).toBe(SHIELD_LOCKOUT);
  });

  it('cannot be raised without a shield generator', () => {
    const ship = newShip({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, shield: [null] } });
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 0.1, false);
    expect(ship.shieldUp).toBe(false);
  });
});

describe('fireWeapons', () => {
  it('fires the starter laser from the nose with its own cooldown', () => {
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, fire: true };
    const [bullet] = fireWeapons(ship, 0.1, false, 0, ids);
    expect(bullet).toMatchObject({ ownerId: 1, x: 1_000, y: 1_000 - SHIP_RADIUS, vy: -800, damage: 10, weaponId: 'pulse_laser', mk: 1, fromNpc: false });
    expect(fireWeapons(ship, 0.1, false, 0, ids)).toEqual([]);
    expect(fireWeapons(ship, 0.2, false, 0, ids)).toHaveLength(1);
  });

  it('fires each weapon from its own lateral offset and cooldown', () => {
    const ship = newShip(twinFighter);
    ship.input = { ...IDLE_INPUT, fire: true };
    const volley = fireWeapons(ship, 0.1, false, 0, ids);
    expect(volley.map((b) => b.x)).toEqual([990, 1_010]);
    expect(volley.map((b) => b.weaponId)).toEqual(['pulse_laser', 'heavy_cannon']);
    expect(fireWeapons(ship, 0.3, false, 0, ids).map((b) => b.weaponId)).toEqual(['pulse_laser']);
  });

  it('does not fire without weapons, while shielded or in a safe zone', () => {
    const unarmed = newShip({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, weapon: [null] } });
    unarmed.input = { ...IDLE_INPUT, fire: true };
    expect(fireWeapons(unarmed, 0.1, false, 0, ids)).toEqual([]);
    const ship = newShip();
    ship.input = { ...IDLE_INPUT, fire: true };
    ship.shieldUp = true;
    expect(fireWeapons(ship, 0.1, false, 0, ids)).toEqual([]);
    ship.shieldUp = false;
    expect(fireWeapons(ship, 0.1, true, 0, ids)).toEqual([]);
  });
});

describe('applyDamage', () => {
  it('damages hull unless shielded', () => {
    const ship = newShip();
    applyDamage(ship, 30, 7, 3);
    expect(ship.hull).toBe(50);
    expect(ship.lastHitBy).toBe(7);
    ship.shieldUp = true;
    applyDamage(ship, 30, 7, 4);
    expect(ship.hull).toBe(50);
  });
});

describe('bountyFor', () => {
  it('pays base plus a quarter of the build value', () => {
    expect(bountyFor(STARTER_BUILD)).toBe(BOUNTY_BASE + 262);
  });
});
