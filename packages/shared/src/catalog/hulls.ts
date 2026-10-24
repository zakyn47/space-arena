export const SLOT_TYPES = ['weapon', 'shield', 'engine', 'utility'] as const;

export type SlotType = (typeof SLOT_TYPES)[number];

export const HULL_IDS = ['scout', 'fighter', 'freighter', 'gunship'] as const;

export type HullId = (typeof HULL_IDS)[number];

export interface HullSpec {
  readonly id: HullId;
  readonly name: string;
  readonly cost: number;
  readonly maxHull: number;
  readonly thrust: number;
  readonly maxSpeed: number;
  readonly turnRate: number;
  readonly cargoCapacity: number;
  readonly slots: Readonly<Record<SlotType, number>>;
}

export const HULLS: Readonly<Record<HullId, HullSpec>> = {
  scout: {
    id: 'scout',
    name: 'Scout',
    cost: 0,
    maxHull: 80,
    thrust: 168,
    maxSpeed: 322,
    turnRate: 3.6,
    cargoCapacity: 15,
    slots: { weapon: 1, shield: 1, engine: 1, utility: 1 },
  },
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    cost: 1_500,
    maxHull: 120,
    thrust: 154,
    maxSpeed: 294,
    turnRate: 3.2,
    cargoCapacity: 20,
    slots: { weapon: 2, shield: 1, engine: 1, utility: 1 },
  },
  freighter: {
    id: 'freighter',
    name: 'Freighter',
    cost: 3_000,
    maxHull: 160,
    thrust: 112,
    maxSpeed: 224,
    turnRate: 2.2,
    cargoCapacity: 60,
    slots: { weapon: 1, shield: 1, engine: 1, utility: 3 },
  },
  gunship: {
    id: 'gunship',
    name: 'Gunship',
    cost: 5_000,
    maxHull: 200,
    thrust: 119,
    maxSpeed: 238,
    turnRate: 2.4,
    cargoCapacity: 25,
    slots: { weapon: 3, shield: 2, engine: 1, utility: 1 },
  },
};
