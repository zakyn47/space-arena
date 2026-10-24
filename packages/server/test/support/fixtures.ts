import { BASE_LOADOUT } from '@arena/shared';
import type { ShipRecord } from '../../src/db/PlayerRepository';

export const OPEN_SPACE = { x: 8_000, y: 8_000 } as const;

export function shipRecord(x: number, y: number, accountId = 0): ShipRecord {
  return { accountId, bankedCredits: 0, loadout: BASE_LOADOUT, x, y };
}

export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
