import {
  GEAR,
  MAX_SKILL_RANK,
  trainCaptain,
  type CaptainSkill,
  HULLS,
  ROCKET_PRICE,
  gearAt,
  gearCost,
  refitToHull,
  resaleValue,
  slotExists,
  statsFor,
  withGear,
  type Build,
  type GearId,
  type HullId,
  type Mk,
  type ShopAction,
  type ShopFailure,
  type SlotRef,
} from '@arena/shared';
import type { ShipEntity } from './entities';

export type ShopOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: ShopFailure };

const OK: ShopOutcome = { ok: true };

function fail(reason: ShopFailure): ShopOutcome {
  return { ok: false, reason };
}

function charge(ship: ShipEntity, price: number, refund: number): boolean {
  if (ship.bankedCredits + refund < price) return false;
  ship.bankedCredits += refund - price;
  return true;
}

function equip(ship: ShipEntity, build: Build): void {
  ship.build = build;
  ship.stats = statsFor(build, ship.captain);
  ship.hull = ship.stats.maxHull;
  ship.shieldEnergy = Math.min(ship.shieldEnergy, ship.stats.maxShield);
  ship.rockets = Math.min(ship.rockets, ship.stats.maxRockets);
}

function trainSkill(ship: ShipEntity, skill: CaptainSkill): ShopOutcome {
  if (ship.captain.skills[skill] >= MAX_SKILL_RANK) return fail('skill_maxed');
  const captain = trainCaptain(ship.captain, skill);
  if (!captain) return fail('no_skill_points');
  ship.captain = captain;
  equip(ship, ship.build);
  return OK;
}

function buyHull(ship: ShipEntity, hullId: HullId): ShopOutcome {
  if (hullId === ship.build.hullId) return fail('unknown_item');
  const refit = refitToHull(ship.build, hullId);
  const refund =
    resaleValue(HULLS[ship.build.hullId].cost) +
    refit.leftovers.reduce((sum, gear) => sum + resaleValue(gearCost(gear)), 0);
  if (!charge(ship, HULLS[hullId].cost, refund)) return fail('insufficient_credits');
  equip(ship, refit.build);
  return OK;
}

function buyGear(ship: ShipEntity, gearId: GearId, mk: Mk, slot: SlotRef): ShopOutcome {
  if (!slotExists(ship.build, slot) || GEAR[gearId].slot !== slot.type) return fail('slot_mismatch');
  const current = gearAt(ship.build, slot);
  const refund = current ? resaleValue(gearCost(current)) : 0;
  if (!charge(ship, gearCost({ gearId, mk }), refund)) return fail('insufficient_credits');
  equip(ship, withGear(ship.build, slot, { gearId, mk }));
  return OK;
}

function sellGear(ship: ShipEntity, slot: SlotRef): ShopOutcome {
  const current = slotExists(ship.build, slot) ? gearAt(ship.build, slot) : null;
  if (!current) return fail('slot_mismatch');
  ship.bankedCredits += resaleValue(gearCost(current));
  equip(ship, withGear(ship.build, slot, null));
  return OK;
}

function buyRockets(ship: ShipEntity, count: number): ShopOutcome {
  if (ship.rockets + count > ship.stats.maxRockets) return fail('rocket_cap');
  if (!charge(ship, count * ROCKET_PRICE, 0)) return fail('insufficient_credits');
  ship.rockets += count;
  return OK;
}

function installSalvage(ship: ShipEntity, index: number, slot: SlotRef): ShopOutcome {
  const item = ship.salvage[index];
  if (!item) return fail('unknown_item');
  if (!slotExists(ship.build, slot) || GEAR[item.gearId].slot !== slot.type) return fail('slot_mismatch');
  const current = gearAt(ship.build, slot);
  if (current) ship.bankedCredits += resaleValue(gearCost(current));
  ship.salvage.splice(index, 1);
  equip(ship, withGear(ship.build, slot, item));
  return OK;
}

function sellSalvage(ship: ShipEntity, index: number): ShopOutcome {
  const item = ship.salvage[index];
  if (!item) return fail('unknown_item');
  ship.salvage.splice(index, 1);
  ship.bankedCredits += resaleValue(gearCost(item));
  return OK;
}

export function applyShopAction(ship: ShipEntity, action: ShopAction): ShopOutcome {
  if (!ship.docked) return fail('not_docked');
  switch (action.type) {
    case 'trainCaptain':
      return trainSkill(ship, action.skill);
    case 'buyHull':
      return buyHull(ship, action.hullId);
    case 'buyGear':
      return buyGear(ship, action.gearId, action.mk, action.slot);
    case 'sellGear':
      return sellGear(ship, action.slot);
    case 'buyRockets':
      return buyRockets(ship, action.count);
    case 'installSalvage':
      return installSalvage(ship, action.index, action.slot);
    case 'sellSalvage':
      return sellSalvage(ship, action.index);
  }
}
