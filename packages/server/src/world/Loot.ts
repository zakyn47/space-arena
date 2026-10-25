import {
  DARK_MATTER_SHIELD,
  GEAR_IDS,
  LOOT_CREDIT_SHARE,
  SALVAGE_CAPACITY,
  type InstalledGear,
  type Mk,
} from '@arena/shared';
import type { ShipEntity } from './entities';

export interface CrateDrop {
  readonly ore: number;
  readonly credits: number;
  readonly gear: InstalledGear | null;
  readonly darkMatter: boolean;
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
  if (item === undefined) throw new RangeError('cannot pick from an empty list');
  return item;
}

export function randomGear(rng: () => number, mks: readonly Mk[]): InstalledGear {
  return { gearId: pick(rng, GEAR_IDS), mk: pick(rng, mks) };
}

export function playerDeathCrates(ship: ShipEntity): CrateDrop[] {
  const credits = Math.floor(ship.carriedCredits * LOOT_CREDIT_SHARE);
  const [first = null, ...rest] = ship.salvage;
  const main: CrateDrop = { ore: ship.ore, credits, gear: first, darkMatter: false };
  const extras: CrateDrop[] = rest.map((gear) => ({ ore: 0, credits: 0, gear, darkMatter: false }));
  const hasMain = main.ore > 0 || main.credits > 0 || main.gear !== null;
  return hasMain ? [main, ...extras] : extras;
}

export function takeCrate(ship: ShipEntity, crate: CrateDrop): CrateDrop | null {
  ship.carriedCredits += crate.credits;
  ship.ore = Math.min(ship.stats.cargoCapacity, ship.ore + crate.ore);
  if (crate.darkMatter) ship.darkMatter = DARK_MATTER_SHIELD;
  if (crate.gear === null) return null;
  if (ship.salvage.length < SALVAGE_CAPACITY) {
    ship.salvage.push(crate.gear);
    return null;
  }
  return { ore: 0, credits: 0, gear: crate.gear, darkMatter: false };
}
