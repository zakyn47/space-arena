import { HULLS, MINE_PRICE, PLASMA_PRICE, ROCKET_PRICE, SAFE_ZONES, STARTER_BUILD, type ShopAction } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip } from '../src/world/entities';
import { applyShopAction } from '../src/world/Shop';
import { shipRecord } from './support/fixtures';

const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };

function dockedShip(banked: number) {
  const ship = createShip(1, 1, 'alice', { ...shipRecord(zone.x, zone.y, 1), bankedCredits: banked });
  ship.docked = true;
  return ship;
}

const buy = (action: ShopAction) => action;

describe('shop guards', () => {
  it('requires docking', () => {
    const ship = dockedShip(10_000);
    ship.docked = false;
    expect(applyShopAction(ship, buy({ type: 'buyOrdnance', ordnance: 'rockets', count: 1 }))).toEqual({ ok: false, reason: 'not_docked' });
  });
});

describe('buyGear', () => {
  it('replaces installed gear with a 50% refund and recomputes stats', () => {
    const ship = dockedShip(600);
    const outcome = applyShopAction(ship, buy({ type: 'buyGear', gearId: 'pulse_laser', mk: 2, slot: { type: 'weapon', index: 0 } }));
    expect(outcome).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(600 + 125 - 700);
    expect(ship.stats.weapons[0]?.damage).toBe(14);
  });

  it('fills an empty utility slot and raises max hull', () => {
    const ship = dockedShip(200);
    applyShopAction(ship, buy({ type: 'buyGear', gearId: 'armor', mk: 1, slot: { type: 'utility', index: 0 } }));
    expect(ship.stats.maxHull).toBe(210);
    expect(ship.hull).toBe(210);
    expect(ship.bankedCredits).toBe(150);
  });

  it('rejects mismatched slots and leaves state unchanged', () => {
    const ship = dockedShip(10_000);
    expect(applyShopAction(ship, buy({ type: 'buyGear', gearId: 'armor', mk: 1, slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: false, reason: 'slot_mismatch' });
    expect(applyShopAction(ship, buy({ type: 'buyGear', gearId: 'armor', mk: 1, slot: { type: 'utility', index: 3 } }))).toEqual({ ok: false, reason: 'slot_mismatch' });
    expect(ship.build).toEqual(STARTER_BUILD);
    expect(ship.bankedCredits).toBe(10_000);
  });

  it('rejects when credits plus refund are short', () => {
    const ship = dockedShip(100);
    expect(applyShopAction(ship, buy({ type: 'buyGear', gearId: 'heavy_cannon', mk: 1, slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: false, reason: 'insufficient_credits' });
    expect(ship.build).toEqual(STARTER_BUILD);
  });
});

describe('sellGear', () => {
  it('empties the slot and refunds half', () => {
    const ship = dockedShip(0);
    expect(applyShopAction(ship, buy({ type: 'sellGear', slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(125);
    expect(ship.stats.weapons).toEqual([]);
    expect(applyShopAction(ship, buy({ type: 'sellGear', slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: false, reason: 'slot_mismatch' });
  });
});

describe('buyHull', () => {
  it('moves gear to the new hull and charges the price', () => {
    const ship = dockedShip(HULLS.fighter.cost);
    expect(applyShopAction(ship, buy({ type: 'buyHull', hullId: 'fighter' }))).toEqual({ ok: true });
    expect(ship.build.hullId).toBe('fighter');
    expect(ship.build.slots.weapon).toEqual([{ gearId: 'pulse_laser', mk: 1 }, null]);
    expect(ship.bankedCredits).toBe(0);
    expect(ship.hull).toBe(220);
  });

  it('sells gear that does not fit a smaller hull', () => {
    const ship = dockedShip(HULLS.gunship.cost);
    applyShopAction(ship, buy({ type: 'buyHull', hullId: 'gunship' }));
    ship.bankedCredits = 1_000;
    applyShopAction(ship, buy({ type: 'buyGear', gearId: 'heavy_cannon', mk: 1, slot: { type: 'weapon', index: 1 } }));
    const before = ship.bankedCredits;
    applyShopAction(ship, buy({ type: 'buyHull', hullId: 'scout' }));
    expect(ship.build.slots.weapon).toEqual([{ gearId: 'pulse_laser', mk: 1 }]);
    expect(ship.bankedCredits).toBe(before + 2_500 + 200);
  });

  it('rejects the current hull and unaffordable hulls', () => {
    const ship = dockedShip(100);
    expect(applyShopAction(ship, buy({ type: 'buyHull', hullId: 'scout' }))).toEqual({ ok: false, reason: 'unknown_item' });
    expect(applyShopAction(ship, buy({ type: 'buyHull', hullId: 'gunship' }))).toEqual({ ok: false, reason: 'insufficient_credits' });
    expect(ship.build).toEqual(STARTER_BUILD);
  });
});

describe('buyOrdnance', () => {
  it('buys up to the cap', () => {
    const ship = dockedShip(1_000);
    ship.rockets = 7;
    expect(applyShopAction(ship, buy({ type: 'buyOrdnance', ordnance: 'rockets', count: 3 }))).toEqual({ ok: true });
    expect(ship.rockets).toBe(10);
    expect(ship.bankedCredits).toBe(1_000 - 3 * ROCKET_PRICE);
    expect(applyShopAction(ship, buy({ type: 'buyOrdnance', ordnance: 'rockets', count: 1 }))).toEqual({ ok: false, reason: 'ammo_cap' });
  });

  it('sells plasma bolts like any other ordnance', () => {
    const ship = dockedShip(1_000);
    ship.rockets = 0;
    expect(applyShopAction(ship, buy({ type: 'buyOrdnance', ordnance: 'plasma', count: 2 }))).toEqual({ ok: true });
    expect(ship).toMatchObject({ ordnance: 'plasma', rockets: 2, bankedCredits: 1_000 - 2 * PLASMA_PRICE });
  });

  it('swaps ordnance type and refunds leftover ammo at 50%', () => {
    const ship = dockedShip(1_000);
    ship.rockets = 4;
    expect(applyShopAction(ship, buy({ type: 'buyOrdnance', ordnance: 'mines', count: 2 }))).toEqual({ ok: true });
    expect(ship.ordnance).toBe('mines');
    expect(ship.rockets).toBe(2);
    expect(ship.bankedCredits).toBe(1_000 + 4 * ROCKET_PRICE * 0.5 - 2 * MINE_PRICE);
  });

  it('keeps the current ordnance when a swap is unaffordable', () => {
    const ship = dockedShip(0);
    ship.rockets = 2;
    expect(applyShopAction(ship, buy({ type: 'buyOrdnance', ordnance: 'mines', count: 2 }))).toEqual({ ok: false, reason: 'insufficient_credits' });
    expect(ship.ordnance).toBe('rockets');
    expect(ship.rockets).toBe(2);
    expect(ship.bankedCredits).toBe(0);
  });

  it('clamps rockets when a rack is sold', () => {
    const ship = dockedShip(1_000);
    applyShopAction(ship, buy({ type: 'buyGear', gearId: 'rocket_rack', mk: 1, slot: { type: 'utility', index: 0 } }));
    ship.rockets = 15;
    applyShopAction(ship, buy({ type: 'sellGear', slot: { type: 'utility', index: 0 } }));
    expect(ship.rockets).toBe(10);
  });
});

describe('salvage', () => {
  it('installs salvage for free and refunds the replaced gear', () => {
    const ship = dockedShip(0);
    ship.salvage = [{ gearId: 'pulse_laser', mk: 3 }];
    expect(applyShopAction(ship, buy({ type: 'installSalvage', index: 0, slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: true });
    expect(ship.salvage).toEqual([]);
    expect(ship.stats.weapons[0]?.damage).toBe(19);
    expect(ship.bankedCredits).toBe(125);
  });

  it('rejects wrong slots and bad indexes without changes', () => {
    const ship = dockedShip(0);
    ship.salvage = [{ gearId: 'armor', mk: 1 }];
    expect(applyShopAction(ship, buy({ type: 'installSalvage', index: 0, slot: { type: 'weapon', index: 0 } }))).toEqual({ ok: false, reason: 'slot_mismatch' });
    expect(applyShopAction(ship, buy({ type: 'sellSalvage', index: 2 }))).toEqual({ ok: false, reason: 'unknown_item' });
    expect(ship.salvage).toHaveLength(1);
  });

  it('sells salvage for half its value', () => {
    const ship = dockedShip(0);
    ship.salvage = [{ gearId: 'armor', mk: 2 }];
    expect(applyShopAction(ship, buy({ type: 'sellSalvage', index: 0 }))).toEqual({ ok: true });
    expect(ship.bankedCredits).toBe(300);
    expect(ship.salvage).toEqual([]);
  });
});
