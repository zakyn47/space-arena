import { z } from 'zod';
import type { ShipStats } from './build';

export const CAPTAIN_SKILLS = ['gunnery', 'engineering', 'piloting', 'mining'] as const;
export type CaptainSkill = (typeof CAPTAIN_SKILLS)[number];
export const MAX_CAPTAIN_LEVEL = 20;
export const MAX_SKILL_RANK = 10;
export const STARTING_SKILL_POINTS = 3;
export const ORE_EXPERIENCE = 10;
export const PLAYER_KILL_EXPERIENCE = 100;
export const PIRATE_EXPERIENCE = { raider: 50, marauder: 100, warlord: 250 } as const;

export interface Captain {
  readonly xp: number;
  readonly skills: Readonly<Record<CaptainSkill, number>>;
}

export const NEW_CAPTAIN: Captain = {
  xp: 0,
  skills: { gunnery: 0, engineering: 0, piloting: 0, mining: 0 },
};

export const CAPTAIN_SKILL_INFO: Readonly<Record<CaptainSkill, { readonly name: string; readonly description: string; readonly icon: string }>> = {
  gunnery: { name: 'Gunnery', description: '+5% gun damage per rank', icon: 'gear_pulse_laser' },
  engineering: { name: 'Engineering', description: '+5% hull, shield capacity and shield regeneration per rank', icon: 'gear_shield_gen' },
  piloting: { name: 'Piloting', description: '+3% thrust, speed and turn rate per rank', icon: 'gear_thruster' },
  mining: { name: 'Mining', description: '+10% mining rate and +5% cargo capacity per rank', icon: 'gear_mining_laser' },
};

export function experienceForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function captainLevel(captain: Captain): number {
  return Math.min(MAX_CAPTAIN_LEVEL, Math.floor((1 + Math.sqrt(1 + captain.xp / 12.5)) / 2));
}

function spentPoints(captain: Captain): number {
  return CAPTAIN_SKILLS.reduce((total, skill) => total + captain.skills[skill], 0);
}

export function captainPoints(captain: Captain): number {
  return STARTING_SKILL_POINTS + captainLevel(captain) - 1 - spentPoints(captain);
}

export function captainNeedsTraining(captain: Captain): boolean {
  return spentPoints(captain) < STARTING_SKILL_POINTS;
}

const rank = z.number().int().min(0).max(MAX_SKILL_RANK);
const CaptainSchema = z.object({
  xp: z.number().int().min(0).max(experienceForLevel(MAX_CAPTAIN_LEVEL)),
  skills: z.object({ gunnery: rank, engineering: rank, piloting: rank, mining: rank }).strict(),
}).strict().refine((captain) => captainPoints(captain) >= 0);

export function parseCaptain(value: unknown): Captain | null {
  const parsed = CaptainSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function gainExperience(captain: Captain, amount: number): Captain {
  if (!Number.isSafeInteger(amount) || amount <= 0) return captain;
  return { ...captain, xp: Math.min(experienceForLevel(MAX_CAPTAIN_LEVEL), captain.xp + amount) };
}

export function trainCaptain(captain: Captain, skill: CaptainSkill): Captain | null {
  if (captainPoints(captain) <= 0 || captain.skills[skill] >= MAX_SKILL_RANK) return null;
  return { ...captain, skills: { ...captain.skills, [skill]: captain.skills[skill] + 1 } };
}

export function captainStats(stats: ShipStats, captain: Captain): ShipStats {
  const { gunnery, engineering, piloting, mining } = captain.skills;
  const engineeringFactor = 1 + engineering * 0.05;
  const pilotingFactor = 1 + piloting * 0.03;
  return {
    ...stats,
    maxHull: Math.round(stats.maxHull * engineeringFactor),
    maxShield: Math.round(stats.maxShield * engineeringFactor),
    shieldRegen: stats.shieldRegen * engineeringFactor,
    thrust: stats.thrust * pilotingFactor,
    maxSpeed: stats.maxSpeed * pilotingFactor,
    turnRate: stats.turnRate * pilotingFactor,
    cargoCapacity: Math.floor(stats.cargoCapacity * (1 + mining * 0.05)),
    miningRate: stats.miningRate * (1 + mining * 0.1),
    weapons: stats.weapons.map((weapon) => ({ ...weapon, damage: weapon.damage * (1 + gunnery * 0.05) })),
  };
}
