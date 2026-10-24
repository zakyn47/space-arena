import { describe, expect, it } from 'vitest';
import { buildSnapshot, toEntityState } from '../src/net/snapshot';
import { createShip, type WorldEntity } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

describe.skip('snapshot', () => {
  it('excludes self and maps entities to public state', () => {
    const self = createShip(1, 1, 'alice', shipRecord(10, 20, 1));
    self.lastSeq = 42;
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    const ore: WorldEntity = { kind: 'ore', id: 3, x: 5, y: 6, expiresAt: 99 };
    const snapshot = buildSnapshot(self, [self, other, ore], 7);
    expect(snapshot.tick).toBe(7);
    expect(snapshot.lastSeq).toBe(42);
    expect(snapshot.self).toMatchObject({ id: 1, x: 10, y: 20, hull: 100, docked: false });
    expect(snapshot.entities).toEqual([
      { kind: 'ship', id: 2, name: 'bob', x: 30, y: 40, vx: 0, vy: 0, angle: 0, shieldUp: false, hullTier: 0 },
      { kind: 'ore', id: 3, x: 5, y: 6 },
    ]);
  });

  it('does not leak private fields of other ships', () => {
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    other.carriedCredits = 500;
    expect(Object.keys(toEntityState(other))).not.toContain('carriedCredits');
  });
});
