import {
  DOCK_COMBAT_COOLDOWN,
  ORE_EXPERIENCE,
  captainNeedsTraining,
  gainExperience,
  DOCK_COOLDOWN,
  DOCK_MAX_SPEED,
  DOCK_RANGE,
  IDLE_INPUT,
  ORE_PRICE,
  nearestZone,
} from '@arena/shared';
import type { ShipEntity } from './entities';

export type DockFailure = 'out_of_range' | 'too_fast' | 'recent_damage' | 'cooldown' | 'captain_untrained';

export type DockOutcome =
  | { readonly ok: true; readonly docked: boolean }
  | { readonly ok: false; readonly reason: DockFailure };

export function dockCooldownRemaining(ship: ShipEntity, time: number): number {
  return Math.max(0, ship.dockCooldownUntil - time);
}

export function dockCheck(ship: ShipEntity, time: number): DockFailure | null {
  const zone = nearestZone(ship.x, ship.y);
  if (Math.hypot(ship.x - zone.x, ship.y - zone.y) > DOCK_RANGE) return 'out_of_range';
  if (Math.hypot(ship.vx, ship.vy) > DOCK_MAX_SPEED) return 'too_fast';
  if (time - ship.lastDamagedAt < DOCK_COMBAT_COOLDOWN) return 'recent_damage';
  if (dockCooldownRemaining(ship, time) > 0) return 'cooldown';
  return null;
}

export function canDock(ship: ShipEntity, time: number): boolean {
  return !ship.docked && dockCheck(ship, time) === null;
}

function undock(ship: ShipEntity, time: number): DockOutcome {
  if (captainNeedsTraining(ship.captain)) return { ok: false, reason: 'captain_untrained' };
  ship.docked = false;
  ship.dockCooldownUntil = time + DOCK_COOLDOWN;
  return { ok: true, docked: false };
}

function dock(ship: ShipEntity): DockOutcome {
  const station = nearestZone(ship.x, ship.y);
  ship.x = station.x;
  ship.y = station.y;
  ship.vx = 0;
  ship.vy = 0;
  ship.input = IDLE_INPUT;
  ship.shieldUp = false;
  ship.bankedCredits += ship.carriedCredits + ship.ore * ORE_PRICE;
  ship.captain = gainExperience(ship.captain, ship.ore * ORE_EXPERIENCE);
  ship.carriedCredits = 0;
  ship.ore = 0;
  ship.hull = ship.stats.maxHull;
  ship.docked = true;
  return { ok: true, docked: true };
}

export function toggleDock(ship: ShipEntity, time: number): DockOutcome {
  if (ship.docked) return undock(ship, time);
  const failure = dockCheck(ship, time);
  return failure ? { ok: false, reason: failure } : dock(ship);
}


export function dockForCaptainSetup(ship: ShipEntity): void {
  if (captainNeedsTraining(ship.captain)) dock(ship);
}
