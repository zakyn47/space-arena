import type { SlotType } from './hulls';

export const GEAR_IDS = [
  'pulse_laser',
  'heavy_cannon',
  'shield_gen',
  'thruster',
  'armor',
  'cargo_pod',
  'rocket_rack',
  'mining_laser',
] as const;

export type GearId = (typeof GEAR_IDS)[number];

export const MK_LEVELS = [1, 2, 3] as const;

export type Mk = (typeof MK_LEVELS)[number];

export interface WeaponEffect {
  readonly kind: 'weapon';
  readonly damage: number;
  readonly fireRate: number;
  readonly bulletSpeed: number;
}

export interface ShieldEffect {
  readonly kind: 'shield';
  readonly energy: number;
  readonly regen: number;
}

export interface EngineEffect {
  readonly kind: 'engine';
  readonly motionFactor: number;
  readonly turnFactor: number;
}

export interface UtilityEffect {
  readonly kind: 'utility';
  readonly hull: number;
  readonly cargo: number;
  readonly rockets: number;
}

export interface MiningEffect {
  readonly kind: 'mining';
  readonly rate: number;
  readonly range: number;
}

export type GearEffect = WeaponEffect | ShieldEffect | EngineEffect | UtilityEffect | MiningEffect;

export interface GearTier {
  readonly cost: number;
  readonly effect: GearEffect;
}

export interface GearSpec {
  readonly id: GearId;
  readonly name: string;
  readonly slot: SlotType;
  readonly tiers: readonly [GearTier, GearTier, GearTier];
}

function weapon(cost: number, damage: number, fireRate: number, bulletSpeed: number): GearTier {
  return { cost, effect: { kind: 'weapon', damage, fireRate, bulletSpeed } };
}

function shield(cost: number, energy: number, regen: number): GearTier {
  return { cost, effect: { kind: 'shield', energy, regen } };
}

function engine(cost: number, motionFactor: number, turnFactor: number): GearTier {
  return { cost, effect: { kind: 'engine', motionFactor, turnFactor } };
}

function utility(cost: number, bonus: Partial<Omit<UtilityEffect, 'kind'>>): GearTier {
  return {
    cost,
    effect: { kind: 'utility', hull: bonus.hull ?? 0, cargo: bonus.cargo ?? 0, rockets: bonus.rockets ?? 0 },
  };
}

function mining(cost: number, rate: number, range: number): GearTier {
  return { cost, effect: { kind: 'mining', rate, range } };
}

export const GEAR: Readonly<Record<GearId, GearSpec>> = {
  pulse_laser: {
    id: 'pulse_laser',
    name: 'Pulse Laser',
    slot: 'weapon',
    tiers: [weapon(250, 10, 4, 800), weapon(700, 14, 4.5, 900), weapon(1_600, 19, 5, 1_000)],
  },
  heavy_cannon: {
    id: 'heavy_cannon',
    name: 'Heavy Cannon',
    slot: 'weapon',
    tiers: [weapon(400, 25, 1.5, 650), weapon(1_000, 34, 1.5, 650), weapon(2_200, 45, 1.5, 650)],
  },
  shield_gen: {
    id: 'shield_gen',
    name: 'Shield Generator',
    slot: 'shield',
    tiers: [shield(250, 100, 15), shield(700, 150, 20), shield(1_600, 220, 28)],
  },
  thruster: {
    id: 'thruster',
    name: 'Thruster',
    slot: 'engine',
    tiers: [engine(250, 1, 1), engine(700, 1.15, 1.1), engine(1_600, 1.3, 1.2)],
  },
  armor: {
    id: 'armor',
    name: 'Armor Plating',
    slot: 'utility',
    tiers: [utility(200, { hull: 30 }), utility(600, { hull: 60 }), utility(1_400, { hull: 100 })],
  },
  cargo_pod: {
    id: 'cargo_pod',
    name: 'Cargo Pod',
    slot: 'utility',
    tiers: [utility(150, { cargo: 10 }), utility(450, { cargo: 20 }), utility(1_000, { cargo: 35 })],
  },
  rocket_rack: {
    id: 'rocket_rack',
    name: 'Rocket Rack',
    slot: 'utility',
    tiers: [utility(200, { rockets: 5 }), utility(600, { rockets: 10 }), utility(1_300, { rockets: 15 })],
  },
  mining_laser: {
    id: 'mining_laser',
    name: 'Mining Laser',
    slot: 'utility',
    tiers: [mining(300, 1, 150), mining(800, 2, 200), mining(1_800, 3.5, 250)],
  },
};

export function gearTier(gearId: GearId, mk: Mk): GearTier {
  return GEAR[gearId].tiers[mk - 1];
}
