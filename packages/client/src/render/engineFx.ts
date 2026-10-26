import { SKIN_IDS } from '@arena/shared';
import type { Point } from './miningFx';

const SPOOL_UP_PER_SECOND = 9;
const SKIN_SUFFIX = new RegExp(`_(?:${SKIN_IDS.join('|')})$`);
const SPOOL_DOWN_PER_SECOND = 4;

// Offsets from the sprite centre, measured on the nozzles painted into each 64×64 hull sprite; skins keep them.
const ENGINE_MOUNTS: Readonly<Record<string, readonly Point[]>> = {
  ship_scout: [{ x: -6, y: 26 }, { x: 6, y: 26 }],
  ship_fighter: [{ x: -5, y: 27 }, { x: 5, y: 27 }],
  ship_freighter: [{ x: -5, y: 22 }, { x: 0, y: 22 }, { x: 5, y: 22 }],
  ship_gunship: [{ x: -11, y: 22 }, { x: 0, y: 26 }, { x: 11, y: 22 }],
  pirate_raider: [{ x: 0, y: 17 }],
  pirate_marauder: [{ x: -5, y: 20 }, { x: 5, y: 20 }],
  pirate_warlord: [{ x: -8, y: 24 }, { x: 0, y: 27 }, { x: 8, y: 24 }],
};

export function engineMountsFor(spriteId: string): readonly Point[] {
  return ENGINE_MOUNTS[spriteId.replace(SKIN_SUFFIX, '')] ?? [];
}

export function stepThrottle(current: number, thrusting: boolean, dtSeconds: number): number {
  if (thrusting) return Math.min(1, current + SPOOL_UP_PER_SECOND * dtSeconds);
  return Math.max(0, current - SPOOL_DOWN_PER_SECOND * dtSeconds);
}
