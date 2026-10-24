import { STARTER_BUILD } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, toEntityState } from '../src/net/snapshot';
import { createPirateShip, createShip, type WorldEntity } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

describe('snapshot', () => {
  it('maps ships, bullets and rockets and excludes self', () => {
    const self = createShip(1, 1, 'alice', shipRecord(10, 20, 1));
    self.lastSeq = 42;
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    const bullet: WorldEntity = { kind: 'bullet', id: 3, ownerId: 2, x: 1, y: 2, prevX: 1, prevY: 2, vx: 0, vy: -800, damage: 10, weaponId: 'pulse_laser', mk: 1, fromNpc: false, expiresAt: 9 };
    const rocket: WorldEntity = { kind: 'rocket', id: 4, ownerId: 2, targetId: 1, x: 5, y: 6, prevX: 5, prevY: 6, vx: 0, vy: -300, angle: 0.5, speed: 300, damage: 30, fromNpc: false, expiresAt: 9 };
    const snapshot = buildSnapshot(self, [self, other, bullet, rocket], 7, 100);
    expect(snapshot.lastSeq).toBe(42);
    expect(snapshot.entities).toEqual([
      { kind: 'ship', id: 2, name: 'bob', x: 30, y: 40, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout', npc: null, miningTargetId: null },
      { kind: 'bullet', id: 3, x: 1, y: 2, vx: 0, vy: -800, weaponId: 'pulse_laser', mk: 1 },
      { kind: 'rocket', id: 4, x: 5, y: 6, vx: 0, vy: -300, angle: 0.5 },
    ]);
  });

  it('reports build, rockets and dock availability for self', () => {
    const self = createShip(1, 1, 'alice', shipRecord(4_000, 4_000, 1));
    self.dockCooldownUntil = 112;
    const state = buildSnapshot(self, [], 1, 100).self;
    expect(state).toMatchObject({ build: STARTER_BUILD, rockets: 10, maxRockets: 10, canDock: false, dockCooldown: 12, docked: false });
  });

  it('does not leak private fields of other ships', () => {
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    expect(Object.keys(toEntityState(other))).not.toContain('rockets');
  });

  it('marks pirates, mining targets, salvage and crate gear', () => {
    const self = createShip(1, 1, 'alice', { ...shipRecord(10, 20, 1), salvage: [{ gearId: 'armor', mk: 1 }] });
    self.miningTargetId = 7;
    const pirate = createPirateShip(5, 'marauder', 30, 40);
    const crate: WorldEntity = { kind: 'crate', id: 6, x: 0, y: 0, ore: 0, credits: 0, gear: { gearId: 'armor', mk: 1 }, expiresAt: 9 };
    const snapshot = buildSnapshot(self, [pirate, crate], 1, 0);
    expect(snapshot.self).toMatchObject({ salvage: [{ gearId: 'armor', mk: 1 }], miningTargetId: 7 });
    expect(snapshot.entities[0]).toMatchObject({ kind: 'ship', npc: 'marauder', name: 'Marauder', hullId: 'fighter' });
    expect(snapshot.entities[1]).toEqual({ kind: 'crate', id: 6, x: 0, y: 0, hasGear: true });
  });
});
