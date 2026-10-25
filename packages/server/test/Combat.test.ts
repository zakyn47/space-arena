import { BOUNTY_BASE, DARK_MATTER_SHIELD, IDLE_INPUT, SHIELD_DISRUPTION, SHIELD_LOCKOUT, SHIP_RADIUS, STARTER_BUILD, type Build } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { applyDamage, bountyFor, disruptShield, fireWeapons, updateShield } from '../src/world/Combat';
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
    updateShield(ship, 1, false, 0);
    expect(ship.shieldEnergy).toBeCloseTo(70);
    ship.shieldEnergy = 10;
    updateShield(ship, 1, false, 0);
    expect(ship.shieldUp).toBe(false);
    expect(ship.shieldLockout).toBe(SHIELD_LOCKOUT);
  });

  it('cannot be raised or regenerate while disrupted', () => {
    const ship = newShip();
    ship.shieldUp = true;
    ship.shieldEnergy = 50;
    disruptShield(ship, 10);
    expect(ship.shieldUp).toBe(false);
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 1, false, 10 + SHIELD_DISRUPTION - 1);
    expect(ship.shieldUp).toBe(false);
    expect(ship.shieldEnergy).toBe(50);
    updateShield(ship, 0.1, false, 10 + SHIELD_DISRUPTION);
    expect(ship.shieldUp).toBe(true);
  });

  it('restarts the disruption timer on a new hit', () => {
    const ship = newShip();
    disruptShield(ship, 10);
    disruptShield(ship, 13);
    expect(ship.shieldDisruptedUntil).toBe(13 + SHIELD_DISRUPTION);
  });

  it('cannot be raised without a shield generator', () => {
    const ship = newShip({ ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, shield: [null] } });
    ship.input = { ...IDLE_INPUT, shield: true };
    updateShield(ship, 0.1, false, 0);
    expect(ship.shieldUp).toBe(false);
  });
});

describe('fireWeapons', () => {
  it('fires while the dark matter barrier is active', () => {
    const ship = newShip();
    ship.darkMatter = DARK_MATTER_SHIELD;
    ship.input = { ...IDLE_INPUT, fire: true };
    expect(fireWeapons(ship, 0.1, false, 0, ids)).toHaveLength(1);
  });

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
  it('damages hull unless shielded and reports which layer took the hit', () => {
    const ship = newShip();
    expect(applyDamage(ship, 30, 7, 3)).toBe('hull');
    expect(ship.hull).toBe(150);
    expect(ship.lastHitBy).toBe(7);
    ship.shieldUp = true;
    expect(applyDamage(ship, 30, 7, 4)).toBe('shield');
    expect(ship.hull).toBe(150);
  });

  it('drains the dark matter barrier before the hull and loses overflow when it breaks', () => {
    const ship = newShip();
    ship.darkMatter = 50;
    expect(applyDamage(ship, 30, 7, 3)).toBe('dark_matter');
    expect(ship.darkMatter).toBe(20);
    expect(applyDamage(ship, 30, 8, 4)).toBe('dark_matter');
    expect(ship.darkMatter).toBe(0);
    expect(ship.hull).toBe(ship.stats.maxHull);
    expect(ship.lastHitBy).toBe(8);
    expect(ship.lastDamagedAt).toBe(4);
    expect(applyDamage(ship, 30, 7, 5)).toBe('hull');
  });

  it('lets a raised normal shield block without draining the barrier', () => {
    const ship = newShip();
    ship.darkMatter = 100;
    ship.shieldUp = true;
    expect(applyDamage(ship, 30, 7, 3)).toBe('shield');
    expect(ship.darkMatter).toBe(100);
  });
});

describe('bountyFor', () => {
  it('pays base plus a quarter of the build value', () => {
    expect(bountyFor(STARTER_BUILD)).toBe(BOUNTY_BASE + 262);
  });
});
