import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip, type AsteroidEntity } from '../src/world/entities';
import { canMine, findMiningTarget, mineStep } from '../src/world/Mining';
import { shipRecord } from './support/fixtures';

const miner = () => {
  const ship = createShip(1, 1, 'alice', shipRecord(1_000, 1_000, 1));
  ship.input = { ...IDLE_INPUT, mine: true };
  return ship;
};

const rock = (id: number, x: number, y: number, ore = 6): AsteroidEntity => ({
  kind: 'asteroid', id, x, y, radius: 40, hp: 80, oreYield: 3, ore, variant: 1,
});

describe('canMine', () => {
  it('requires F, a laser, free cargo, no firing, no shield, not docked, not in a zone', () => {
    expect(canMine(miner(), false)).toBe(true);
    expect(canMine(miner(), true)).toBe(false);
    const firing = miner();
    firing.input = { ...firing.input, fire: true };
    expect(canMine(firing, false)).toBe(false);
    const full = miner();
    full.ore = full.stats.cargoCapacity;
    expect(canMine(full, false)).toBe(false);
    const idle = miner();
    idle.input = IDLE_INPUT;
    expect(canMine(idle, false)).toBe(false);
  });
});

describe('findMiningTarget', () => {
  it('picks the nearest asteroid surface in range and in the forward cone', () => {
    const ship = miner();
    const near = rock(2, 1_000, 850);
    const farther = rock(3, 1_050, 820);
    const behind = rock(4, 1_000, 1_100);
    const outOfRange = rock(5, 1_000, 700);
    expect(findMiningTarget(ship, [farther, near, behind, outOfRange])?.id).toBe(2);
    expect(findMiningTarget(ship, [behind, outOfRange])).toBeNull();
  });
});

describe('mineStep', () => {
  it('moves whole ore units into cargo at the laser rate', () => {
    const ship = miner();
    const asteroid = rock(2, 1_000, 850);
    mineStep(ship, asteroid, 0.6);
    expect(ship.ore).toBe(0);
    mineStep(ship, asteroid, 0.6);
    expect(ship.ore).toBe(1);
    expect(asteroid.ore).toBe(5);
    expect(ship.miningTargetId).toBe(2);
  });

  it('resets progress when the target changes', () => {
    const ship = miner();
    mineStep(ship, rock(2, 1_000, 850), 0.6);
    mineStep(ship, rock(3, 1_000, 850), 0.6);
    expect(ship.ore).toBe(0);
  });
});
