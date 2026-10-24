import type { Build, Mk, PirateTier } from '@arena/shared';

export interface PirateTierSpec {
  readonly build: Build;
  readonly rockets: number;
  readonly band: { readonly min: number; readonly max: number };
  readonly credits: number;
  readonly ore: number;
  readonly dropChance: number;
  readonly dropMks: readonly Mk[];
}

export const PIRATE_SPECS: Readonly<Record<PirateTier, PirateTierSpec>> = {
  raider: {
    build: {
      hullId: 'scout',
      slots: {
        weapon: [{ gearId: 'pulse_laser', mk: 1 }],
        shield: [{ gearId: 'shield_gen', mk: 1 }],
        engine: [{ gearId: 'thruster', mk: 1 }],
        utility: [null],
      },
    },
    rockets: 0,
    band: { min: 1_000, max: 4_000 },
    credits: 40,
    ore: 2,
    dropChance: 0.02,
    dropMks: [1],
  },
  marauder: {
    build: {
      hullId: 'fighter',
      slots: {
        weapon: [{ gearId: 'pulse_laser', mk: 2 }, { gearId: 'pulse_laser', mk: 2 }],
        shield: [{ gearId: 'shield_gen', mk: 2 }],
        engine: [{ gearId: 'thruster', mk: 2 }],
        utility: [null],
      },
    },
    rockets: 5,
    band: { min: 4_000, max: 8_000 },
    credits: 120,
    ore: 4,
    dropChance: 0.05,
    dropMks: [1, 2],
  },
  warlord: {
    build: {
      hullId: 'gunship',
      slots: {
        weapon: [{ gearId: 'heavy_cannon', mk: 2 }, { gearId: 'heavy_cannon', mk: 2 }, { gearId: 'pulse_laser', mk: 3 }],
        shield: [{ gearId: 'shield_gen', mk: 2 }, { gearId: 'shield_gen', mk: 2 }],
        engine: [{ gearId: 'thruster', mk: 2 }],
        utility: [{ gearId: 'armor', mk: 2 }],
      },
    },
    rockets: 5,
    band: { min: 8_000, max: Number.POSITIVE_INFINITY },
    credits: 350,
    ore: 6,
    dropChance: 0.12,
    dropMks: [2, 3],
  },
};
