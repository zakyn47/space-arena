import {
  CAPTAIN_SKILLS,
  CAPTAIN_SKILL_INFO,
  MAX_SKILL_RANK,
  NEW_CAPTAIN,
  captainPoints,
  trainCaptain,
  type Captain,
  type CaptainSkill,
  GEAR,
  GEAR_IDS,
  HULLS,
  HULL_IDS,
  MK_LEVELS,
  ROCKET_PRICE,
  SLOT_TYPES,
  gearAt,
  gearCost,
  resaleValue,
  refitToHull,
  statsFor,
  withGear,
  type Build,
  type GearId,
  type HullId,
  type InstalledGear,
  type Mk,
  type SelfState,
  type ShipStats,
  type SlotRef,
  type SlotType,
} from '@arena/shared';

const SLOT_LABELS: Readonly<Record<SlotType, string>> = {
  weapon: 'Weapon',
  shield: 'Shield',
  engine: 'Engine',
  utility: 'Utility',
};

const SLOT_LETTERS: Readonly<Record<SlotType, string>> = { weapon: 'W', shield: 'S', engine: 'E', utility: 'U' };

interface StatMetric {
  readonly label: string;
  readonly unit?: string;
  readonly decimals?: number;
  readonly value: (stats: ShipStats) => number;
}

const METRICS: readonly StatMetric[] = [
  { label: 'Hull', value: (s) => s.maxHull },
  { label: 'Speed', value: (s) => s.maxSpeed },
  { label: 'Damage/s', value: (s) => s.weapons.reduce((sum, w) => sum + w.damage * w.fireRate, 0) },
  { label: 'Shield', value: (s) => s.maxShield },
  { label: 'Cargo', value: (s) => s.cargoCapacity },
  { label: 'Rockets max', value: (s) => s.maxRockets },
  { label: 'Mining', unit: '/s', decimals: 1, value: (s) => s.miningRate },
];

export function gearLabel(gear: InstalledGear): string {
  return `${GEAR[gear.gearId].name} Mk${gear.mk}`;
}

export function statSummary(stats: ShipStats): string[] {
  return METRICS.map((metric) => `${metric.label} ${Number(metric.value(stats).toFixed(metric.decimals ?? 0))}${metric.unit ?? ''}`);
}

export function describeDelta(before: ShipStats, after: ShipStats): string {
  const changes = METRICS.flatMap((metric) => {
    const delta = Number((metric.value(after) - metric.value(before)).toFixed(metric.decimals ?? 0));
    return delta === 0 ? [] : [`${metric.label} ${delta > 0 ? '+' : ''}${delta}${metric.unit ?? ''}`];
  });
  return changes.length > 0 ? changes.join(', ') : 'no change';
}

export interface SlotRow {
  readonly slot: SlotRef;
  readonly label: string;
  readonly gear: InstalledGear | null;
  readonly code: string;
  readonly position: { readonly x: number; readonly y: number };
}

export function slotRows(build: Build): SlotRow[] {
  return SLOT_TYPES.flatMap((type) =>
    build.slots[type].map((gear, index) => ({
      slot: { type, index },
      label: `${SLOT_LABELS[type]} ${index + 1}: ${gear ? gearLabel(gear) : 'Empty'}`,
      gear,
      code: `${SLOT_LETTERS[type]}${index + 1}`,
      position: {
        x: 20 + ((index + 1) / (build.slots[type].length + 1)) * 60,
        y: { weapon: 22, shield: 43, utility: 64, engine: 85 }[type],
      },
    })),
  );
}

export interface SalvageRow {
  readonly index: number;
  readonly label: string;
  readonly salePrice: number;
  readonly slots: readonly { readonly slot: SlotRef; readonly label: string }[];
}

export function salvageRows(build: Build, salvage: readonly InstalledGear[]): SalvageRow[] {
  return salvage.map((gear, index) => {
    const type = GEAR[gear.gearId].slot;
    return {
      index,
      label: gearLabel(gear),
      salePrice: resaleValue(gearCost(gear)),
      slots: build.slots[type].map((_, slotIndex) => ({
        slot: { type, index: slotIndex },
        label: `${SLOT_LABELS[type]} ${slotIndex + 1}`,
      })),
    };
  });
}

export interface GearOption {
  readonly gearId: GearId;
  readonly mk: Mk;
  readonly label: string;
  readonly price: number;
  readonly affordable: boolean;
  readonly delta: string;
}

export function gearOptions(build: Build, slot: SlotRef, banked: number, captain: Captain = NEW_CAPTAIN): GearOption[] {
  const current = gearAt(build, slot);
  const refund = current ? resaleValue(gearCost(current)) : 0;
  const before = statsFor(build, captain);
  return GEAR_IDS.filter((gearId) => GEAR[gearId].slot === slot.type).flatMap((gearId) =>
    MK_LEVELS.map((mk) => {
      const price = gearCost({ gearId, mk });
      return {
        gearId,
        mk,
        label: gearLabel({ gearId, mk }),
        price,
        affordable: banked + refund >= price,
        delta: describeDelta(before, statsFor(withGear(build, slot, { gearId, mk }), captain)),
      };
    }),
  );
}

export interface HullCard {
  readonly hullId: HullId;
  readonly name: string;
  readonly price: number;
  readonly current: boolean;
  readonly affordable: boolean;
  readonly slots: string;
  readonly stats: readonly string[];
}

export function hullCards(build: Build, banked: number): HullCard[] {
  const refund = resaleValue(HULLS[build.hullId].cost);
  return HULL_IDS.map((hullId) => {
    const hull = HULLS[hullId];
    const current = hullId === build.hullId;
    const overflowRefund = refitToHull(build, hullId).leftovers.reduce((sum, gear) => sum + resaleValue(gearCost(gear)), 0);
    return {
      hullId,
      name: hull.name,
      price: hull.cost,
      current,
      affordable: !current && banked + refund + overflowRefund >= hull.cost,
      slots: SLOT_TYPES.map((type) => `${SLOT_LETTERS[type]}${hull.slots[type]}`).join(' '),
      stats: [`Hull ${hull.maxHull}`, `Speed ${hull.maxSpeed}`, `Thrust ${hull.thrust}`, `Turn ${hull.turnRate} rad/s`, `Cargo ${hull.cargoCapacity}`],
    };
  });
}

export interface RocketOffer {
  readonly missing: number;
  readonly fillPrice: number;
  readonly canBuyOne: boolean;
  readonly canFill: boolean;
}

export function rocketOffer(self: SelfState): RocketOffer {
  const missing = Math.max(0, self.maxRockets - self.rockets);
  const fillPrice = missing * ROCKET_PRICE;
  return {
    missing,
    fillPrice,
    canBuyOne: missing > 0 && self.bankedCredits >= ROCKET_PRICE,
    canFill: missing > 0 && self.bankedCredits >= fillPrice,
  };
}


export interface CaptainRow {
  readonly skill: CaptainSkill;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly rank: number;
  readonly canTrain: boolean;
  readonly delta: string;
}

export function captainRows(self: SelfState): CaptainRow[] {
  const before = statsFor(self.build, self.captain);
  return CAPTAIN_SKILLS.map((skill) => {
    const next = trainCaptain(self.captain, skill);
    return {
      skill,
      ...CAPTAIN_SKILL_INFO[skill],
      rank: self.captain.skills[skill],
      canTrain: self.docked && captainPoints(self.captain) > 0 && self.captain.skills[skill] < MAX_SKILL_RANK,
      delta: next ? describeDelta(before, statsFor(self.build, next)) : 'No upgrade available',
    };
  });
}
