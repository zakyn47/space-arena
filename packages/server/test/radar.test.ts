import { RADAR_PLAYER_RANGE } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { buildRadar } from '../src/net/radar';
import { createPirateShip, createShip } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

const player = (id: number, x: number, y: number) => createShip(id, id, `p${id}`, shipRecord(x, y, id));

describe('buildRadar', () => {
  it('shows every pirate, nearby players only, and never yourself', () => {
    const self = player(1, 1_000, 1_000);
    const near = player(2, 1_000 + RADAR_PLAYER_RANGE, 1_000);
    const far = player(3, 1_001 + RADAR_PLAYER_RANGE, 1_000);
    const pirate = createPirateShip(4, 'warlord', 19_000.4, 19_000.6);
    expect(buildRadar(self, [self, near, far, pirate])).toEqual([
      { x: 1_000 + RADAR_PLAYER_RANGE, y: 1_000, kind: 'player' },
      { x: 19_000, y: 19_001, kind: 'pirate' },
    ]);
  });
});
