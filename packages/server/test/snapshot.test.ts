import { STARTER_BUILD } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, toEntityState } from '../src/net/snapshot';
import { createLeviathan, createPirateShip, createShip, type WorldEntity } from '../src/world/entities';
import { shipRecord } from './support/fixtures';

describe('snapshot', () => {
  it('maps ships, bullets and rockets and excludes self', () => {
    const self = createShip(1, 1, 'alice', shipRecord(10, 20, 1));
    self.lastSeq = 42;
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    const bullet: WorldEntity = { kind: 'bullet', id: 3, ownerId: 2, x: 1, y: 2, prevX: 1, prevY: 2, vx: 0, vy: -800, damage: 10, weaponId: 'pulse_laser', mk: 1, fromNpc: false, expiresAt: 9 };
    const rocket: WorldEntity = { kind: 'rocket', id: 4, ownerId: 2, targetId: 1, x: 5, y: 6, prevX: 5, prevY: 6, vx: 0, vy: -300, angle: 0.5, speed: 300, damage: 30, fromNpc: false, expiresAt: 9 };
    const mine: WorldEntity = { kind: 'spaceMine', id: 5, ownerId: 2, x: 7, y: 8, armedAt: 1, expiresAt: 60 };
    const orb: WorldEntity = { kind: 'orb', id: 6, ownerId: 2, x: 9, y: 10, prevX: 9, prevY: 10, vx: 0, vy: -220, damage: 40, fromNpc: true, expiresAt: 9 };
    const snapshot = buildSnapshot(self, [self, other, bullet, rocket, mine, orb], 7, 100);
    expect(snapshot.lastSeq).toBe(42);
    expect(snapshot.entities).toEqual([
      { kind: 'ship', id: 2, name: 'bob', x: 30, y: 40, vx: 0, vy: 0, angle: 0, shieldUp: false, hullId: 'scout', npc: null, miningTargetId: null },
      { kind: 'bullet', id: 3, x: 1, y: 2, vx: 0, vy: -800, weaponId: 'pulse_laser', mk: 1 },
      { kind: 'rocket', id: 4, x: 5, y: 6, vx: 0, vy: -300, angle: 0.5 },
      { kind: 'spaceMine', id: 5, x: 7, y: 8 },
      { kind: 'orb', id: 6, x: 9, y: 10, vx: 0, vy: -220 },
    ]);
  });

  it('reports build, rockets and dock availability for self', () => {
    const self = createShip(1, 1, 'alice', shipRecord(4_000, 4_000, 1));
    self.dockCooldownUntil = 112;
    const state = buildSnapshot(self, [], 1, 100).self;
    expect(state).toMatchObject({ build: STARTER_BUILD, ordnance: 'rockets', rockets: 10, maxRockets: 10, canDock: false, dockCooldown: 12, docked: false });
  });

  it('sends hits only for ships in view with rounded angles', () => {
    const self = createShip(1, 1, 'alice', shipRecord(10, 20, 1));
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    const hits = [
      { shipId: 1, angle: 1.23456, shield: false },
      { shipId: 2, angle: -3.14159, shield: true },
      { shipId: 9, angle: 0, shield: false },
    ];
    expect(buildSnapshot(self, [self, other], 1, 100, undefined, hits).hits).toEqual([
      { shipId: 1, angle: 1.23, shield: false },
      { shipId: 2, angle: -3.14, shield: true },
    ]);
    expect(buildSnapshot(self, [self, other], 1, 100).hits).toBeUndefined();
  });

  it('does not leak private fields of other ships', () => {
    const other = createShip(2, 2, 'bob', shipRecord(30, 40, 2));
    expect(Object.keys(toEntityState(other))).not.toContain('rockets');
  });

  it('sends health only for the leviathan', () => {
    const boss = createLeviathan(3, 50, 60);
    boss.hull = 1_000;
    expect(toEntityState(boss)).toMatchObject({ npc: 'leviathan', health: 0.33 });
    expect(toEntityState(createShip(2, 2, 'bob', shipRecord(30, 40, 2)))).not.toHaveProperty('health');
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
