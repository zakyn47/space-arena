import { z } from 'zod';
import { GEAR, GEAR_IDS, gearTier, type GearId, type Mk } from './catalog/gear';
import { HULLS, HULL_IDS, SLOT_TYPES, type HullId, type SlotType } from './catalog/hulls';
import { BASE_MAX_ROCKETS, EMPTY_ENGINE_FACTOR, SALVAGE_CAPACITY, SELL_BACK_SHARE, SHIELD_DRAIN } from './constants';

export interface InstalledGear {
  readonly gearId: GearId;
  readonly mk: Mk;
}

export type SlotContents = InstalledGear | null;

export type BuildSlots = Readonly<Record<SlotType, readonly SlotContents[]>>;

export interface Build {
  readonly hullId: HullId;
  readonly slots: BuildSlots;
}

export interface SlotRef {
  readonly type: SlotType;
  readonly index: number;
}

export interface WeaponMount {
  readonly gearId: GearId;
  readonly mk: Mk;
  readonly damage: number;
  readonly fireRate: number;
  readonly bulletSpeed: number;
}

export interface ShipStats {
  readonly maxHull: number;
  readonly thrust: number;
  readonly maxSpeed: number;
  readonly turnRate: number;
  readonly maxShield: number;
  readonly shieldRegen: number;
  readonly shieldDrain: number;
  readonly cargoCapacity: number;
  readonly maxRockets: number;
  readonly miningRate: number;
  readonly miningRange: number;
  readonly weapons: readonly WeaponMount[];
}

export const MkSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const InstalledGearSchema = z.object({ gearId: z.enum(GEAR_IDS), mk: MkSchema }).strict();

const SlotListSchema = z.array(InstalledGearSchema.nullable());

const BuildSchema = z
  .object({
    hullId: z.enum(HULL_IDS),
    slots: z
      .object({ weapon: SlotListSchema, shield: SlotListSchema, engine: SlotListSchema, utility: SlotListSchema })
      .strict(),
  })
  .strict();

const SalvageSchema = z.array(InstalledGearSchema).max(SALVAGE_CAPACITY);

export function parseSalvage(value: unknown): InstalledGear[] | null {
  const parsed = SalvageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const STARTER_BUILD: Build = {
  hullId: 'scout',
  slots: {
    weapon: [{ gearId: 'pulse_laser', mk: 1 }],
    shield: [{ gearId: 'shield_gen', mk: 1 }],
    engine: [{ gearId: 'thruster', mk: 1 }],
    utility: [{ gearId: 'mining_laser', mk: 1 }],
  },
};

function installed(build: Build): InstalledGear[] {
  return SLOT_TYPES.flatMap((type) => build.slots[type].filter((gear): gear is InstalledGear => gear !== null));
}

export function fitsHull(build: Build): boolean {
  const capacity = HULLS[build.hullId].slots;
  return SLOT_TYPES.every(
    (type) =>
      build.slots[type].length === capacity[type] &&
      build.slots[type].every((gear) => gear === null || GEAR[gear.gearId].slot === type),
  );
}

export function parseBuild(value: unknown): Build | null {
  const parsed = BuildSchema.safeParse(value);
  return parsed.success && fitsHull(parsed.data) ? parsed.data : null;
}

export function gearCost(gear: InstalledGear): number {
  return gearTier(gear.gearId, gear.mk).cost;
}

export function buildValue(build: Build): number {
  return HULLS[build.hullId].cost + installed(build).reduce((sum, gear) => sum + gearCost(gear), 0);
}

export function resaleValue(cost: number): number {
  return Math.floor(cost * SELL_BACK_SHARE);
}

export function statsFor(build: Build): ShipStats {
  const hull = HULLS[build.hullId];
  const weapons: WeaponMount[] = [];
  let maxHull = hull.maxHull;
  let cargoCapacity = hull.cargoCapacity;
  let maxRockets = BASE_MAX_ROCKETS;
  let miningRate = 0;
  let miningRange = 0;
  let maxShield = 0;
  let shieldRegen = 0;
  let motionFactor = EMPTY_ENGINE_FACTOR;
  let turnFactor = EMPTY_ENGINE_FACTOR;
  for (const gear of installed(build)) {
    const effect = gearTier(gear.gearId, gear.mk).effect;
    switch (effect.kind) {
      case 'weapon':
        weapons.push({ gearId: gear.gearId, mk: gear.mk, damage: effect.damage, fireRate: effect.fireRate, bulletSpeed: effect.bulletSpeed });
        break;
      case 'shield':
        maxShield += effect.energy;
        shieldRegen += effect.regen;
        break;
      case 'engine':
        motionFactor = effect.motionFactor;
        turnFactor = effect.turnFactor;
        break;
      case 'utility':
        maxHull += effect.hull;
        cargoCapacity += effect.cargo;
        maxRockets += effect.rockets;
        break;
      case 'mining':
        miningRate += effect.rate;
        miningRange = Math.max(miningRange, effect.range);
        break;
    }
  }
  return {
    maxHull,
    thrust: hull.thrust * motionFactor,
    maxSpeed: hull.maxSpeed * motionFactor,
    turnRate: hull.turnRate * turnFactor,
    maxShield,
    shieldRegen,
    shieldDrain: SHIELD_DRAIN,
    cargoCapacity,
    maxRockets,
    miningRate,
    miningRange,
    weapons,
  };
}

export function slotExists(build: Build, slot: SlotRef): boolean {
  return slot.index < build.slots[slot.type].length;
}

export function gearAt(build: Build, slot: SlotRef): SlotContents {
  return build.slots[slot.type][slot.index] ?? null;
}

export function withGear(build: Build, slot: SlotRef, gear: SlotContents): Build {
  const list = build.slots[slot.type].map((current, index) => (index === slot.index ? gear : current));
  return { ...build, slots: { ...build.slots, [slot.type]: list } };
}

export interface Refit {
  readonly build: Build;
  readonly leftovers: readonly InstalledGear[];
}

export function refitToHull(build: Build, hullId: HullId): Refit {
  const capacity = HULLS[hullId].slots;
  const leftovers: InstalledGear[] = [];
  const fit = (type: SlotType): SlotContents[] => {
    const gear = build.slots[type].filter((item): item is InstalledGear => item !== null);
    leftovers.push(...gear.slice(capacity[type]));
    return Array.from({ length: capacity[type] }, (_, index) => gear[index] ?? null);
  };
  return {
    build: { hullId, slots: { weapon: fit('weapon'), shield: fit('shield'), engine: fit('engine'), utility: fit('utility') } },
    leftovers,
  };
}
