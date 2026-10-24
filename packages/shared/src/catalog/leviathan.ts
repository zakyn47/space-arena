import { PIRATE_NAMES, type PirateTier } from './pirates';

export type NpcKind = PirateTier | 'leviathan';

export const NPC_NAMES: Readonly<Record<NpcKind, string>> = { ...PIRATE_NAMES, leviathan: 'Void Leviathan' };

export const LEVIATHAN_RADIUS = 90;
export const LEVIATHAN_MAX_HULL = 3_000;
export const LEVIATHAN_MAX_SPEED = 60;
export const LEVIATHAN_THRUST = 40;
export const LEVIATHAN_TURN_RATE = 0.6;
export const LEVIATHAN_PATROL_RADIUS = 2_000;
export const LEVIATHAN_AGGRO_RANGE = 1_400;
export const LEVIATHAN_REGEN = 5;
export const LEVIATHAN_REGEN_CLEAR_RANGE = 1_500;
export const LEVIATHAN_FIRE_INTERVAL = 2.5;
export const LEVIATHAN_SPREAD = (20 * Math.PI) / 180;
export const LEVIATHAN_RESPAWN = 600;
export const LEVIATHAN_CREDITS = 1_500;
export const LEVIATHAN_ORE = 15;
export const ORB_SPEED = 220;
export const ORB_LIFETIME = 6;
export const ORB_DAMAGE = 40;
