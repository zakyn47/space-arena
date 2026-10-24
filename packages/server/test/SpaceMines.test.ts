import { MINE_ARM_TIME, MINE_BLAST_RADIUS, MINE_TRIGGER_RADIUS, SHIP_RADIUS } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createLeviathan, createShip } from '../src/world/entities';
import { blastVictims, dropMine, triggeredBy } from '../src/world/SpaceMines';
import { shipRecord } from './support/fixtures';

const at = (id: number, x: number, y: number) => createShip(id, id, `p${id}`, shipRecord(x, y, id));

describe('dropMine', () => {
  it('places a still mine behind the ship', () => {
    const ship = at(1, 1_000, 1_000);
    const mine = dropMine(ship, 50, 10);
    expect(mine).toMatchObject({ kind: 'spaceMine', id: 50, ownerId: 1, armedAt: 10 + MINE_ARM_TIME });
    expect(mine.x).toBeCloseTo(1_000);
    expect(mine.y).toBeGreaterThan(1_000 + SHIP_RADIUS);
  });
});

describe('triggeredBy', () => {
  const mine = dropMine(at(1, 1_000, 1_000), 50, 0);

  it('fires for an enemy in range once armed', () => {
    const enemy = at(2, mine.x + MINE_TRIGGER_RADIUS - 1, mine.y);
    expect(triggeredBy(mine, enemy, MINE_ARM_TIME - 0.1)).toBe(false);
    expect(triggeredBy(mine, enemy, MINE_ARM_TIME)).toBe(true);
  });

  it('ignores the owner, docked ships and ships out of range', () => {
    expect(triggeredBy(mine, at(1, mine.x, mine.y), MINE_ARM_TIME)).toBe(false);
    const docked = at(2, mine.x, mine.y);
    docked.docked = true;
    expect(triggeredBy(mine, docked, MINE_ARM_TIME)).toBe(false);
    expect(triggeredBy(mine, at(3, mine.x + MINE_TRIGGER_RADIUS + 1, mine.y), MINE_ARM_TIME)).toBe(false);
  });
});

describe('blastVictims', () => {
  it('hits every ship in the blast except the owner', () => {
    const mine = dropMine(at(1, 1_000, 1_000), 50, 0);
    const owner = at(1, mine.x, mine.y);
    const near = at(2, mine.x + MINE_BLAST_RADIUS - 1, mine.y);
    const far = at(3, mine.x + MINE_BLAST_RADIUS + 1, mine.y);
    expect(blastVictims(mine, [owner, near, far])).toEqual([near]);
  });
});

describe('large ships', () => {
  it('trigger and take blasts by their edge, not their center', () => {
    const mine = dropMine(at(1, 1_000, 1_000), 50, 0);
    const boss = createLeviathan(9, mine.x + MINE_TRIGGER_RADIUS + 50, mine.y);
    expect(triggeredBy(mine, boss, MINE_ARM_TIME)).toBe(true);
    const farBoss = createLeviathan(10, mine.x + MINE_BLAST_RADIUS + 50, mine.y);
    expect(blastVictims(mine, [farBoss])).toEqual([farBoss]);
  });
});
