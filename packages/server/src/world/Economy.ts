import {
  DOCK_COMBAT_COOLDOWN,
  DOCK_MAX_SPEED,
  ORE_PRICE,
  nextTierCost,
  statsFor,
  withUpgrade,
  zoneAt,
  type BuyFailure,
  type UpgradeLine,
} from '@arena/shared';
import type { ShipEntity } from './entities';

export type BuyOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: BuyFailure };

function canDock(ship: ShipEntity, time: number): boolean {
  return (
    zoneAt(ship.x, ship.y) !== undefined &&
    Math.hypot(ship.vx, ship.vy) <= DOCK_MAX_SPEED &&
    time - ship.lastDamagedAt >= DOCK_COMBAT_COOLDOWN
  );
}

export function updateDocking(ship: ShipEntity, time: number): boolean {
  if (!canDock(ship, time)) {
    ship.docked = false;
    return false;
  }
  const newlyDocked = !ship.docked;
  ship.docked = true;
  ship.bankedCredits += ship.carriedCredits + ship.ore * ORE_PRICE;
  ship.carriedCredits = 0;
  ship.ore = 0;
  ship.hull = ship.stats.maxHull;
  return newlyDocked;
}

export function buyUpgrade(ship: ShipEntity, line: UpgradeLine): BuyOutcome {
  if (!ship.docked) return { ok: false, reason: 'not_docked' };
  const cost = nextTierCost(ship.loadout, line);
  if (cost === null) return { ok: false, reason: 'max_tier' };
  if (ship.bankedCredits < cost) return { ok: false, reason: 'insufficient_credits' };
  ship.bankedCredits -= cost;
  ship.loadout = withUpgrade(ship.loadout, line);
  ship.stats = statsFor(ship.loadout);
  ship.hull = ship.stats.maxHull;
  ship.shieldEnergy = Math.min(ship.shieldEnergy, ship.stats.maxShield);
  return { ok: true };
}
