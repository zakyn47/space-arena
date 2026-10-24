export const UPGRADE_LINES = ['hull', 'engine', 'weapon', 'shield', 'cargo'] as const;

export type UpgradeLine = (typeof UPGRADE_LINES)[number];

export type Loadout = Readonly<Record<UpgradeLine, number>>;

export const BASE_LOADOUT: Loadout = { hull: 0, engine: 0, weapon: 0, shield: 0, cargo: 0 };

export const MAX_TIER: Loadout = { hull: 5, engine: 5, weapon: 5, shield: 5, cargo: 3 };

const BASE_COST: Loadout = { hull: 200, engine: 200, weapon: 250, shield: 200, cargo: 150 };

const TIER_STEP = 0.22;

export interface ShipStats {
  readonly maxHull: number;
  readonly thrust: number;
  readonly maxSpeed: number;
  readonly turnRate: number;
  readonly damage: number;
  readonly fireRate: number;
  readonly bulletSpeed: number;
  readonly maxShield: number;
  readonly shieldRegen: number;
  readonly shieldDrain: number;
  readonly cargoCapacity: number;
}

function scale(base: number, tier: number): number {
  return base * (1 + TIER_STEP * tier);
}

export function statsFor(loadout: Loadout): ShipStats {
  return {
    maxHull: scale(100, loadout.hull),
    thrust: scale(200, loadout.engine),
    maxSpeed: scale(400, loadout.engine),
    turnRate: scale(Math.PI, loadout.engine),
    damage: scale(10, loadout.weapon),
    fireRate: scale(4, loadout.weapon),
    bulletSpeed: scale(800, loadout.weapon),
    maxShield: scale(100, loadout.shield),
    shieldRegen: scale(15, loadout.shield),
    shieldDrain: 30,
    cargoCapacity: 20 + 10 * loadout.cargo,
  };
}

export function upgradeCost(line: UpgradeLine, tier: number): number {
  if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER[line]) {
    throw new RangeError(`${line} has no tier ${tier}`);
  }
  return BASE_COST[line] * 2 ** (tier - 1);
}

export function nextTierCost(loadout: Loadout, line: UpgradeLine): number | null {
  const next = loadout[line] + 1;
  return next > MAX_TIER[line] ? null : upgradeCost(line, next);
}

export function loadoutValue(loadout: Loadout): number {
  let total = 0;
  for (const line of UPGRADE_LINES) {
    for (let tier = 1; tier <= loadout[line]; tier += 1) total += upgradeCost(line, tier);
  }
  return total;
}

export function withUpgrade(loadout: Loadout, line: UpgradeLine): Loadout {
  return { ...loadout, [line]: loadout[line] + 1 };
}
