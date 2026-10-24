import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, stepMotion, type ShipMotion } from '../src/physics';
import { BASE_LOADOUT, statsFor } from '../src/upgrades';

const stats = statsFor(BASE_LOADOUT);
const at = (x = 1_000, y = 1_000): ShipMotion => ({ x, y, vx: 0, vy: 0, angle: 0 });

describe('stepMotion', () => {
  it('thrusts toward the nose, which points up at angle 0', () => {
    const next = stepMotion(at(), { ...IDLE_INPUT, thrust: true }, stats, 0.1);
    expect(next.vx).toBeCloseTo(0);
    expect(next.vy).toBeCloseTo(-20);
    expect(next.y).toBeCloseTo(998);
  });

  it('reverse thrust pushes backward at half strength', () => {
    const next = stepMotion(at(), { ...IDLE_INPUT, reverse: true }, stats, 0.1);
    expect(next.vy).toBeCloseTo(10);
  });

  it('rotates clockwise with D', () => {
    const next = stepMotion(at(), { ...IDLE_INPUT, right: true }, stats, 0.1);
    expect(next.angle).toBeCloseTo(Math.PI * 0.1);
  });

  it('rotates counter-clockwise with A', () => {
    const next = stepMotion(at(), { ...IDLE_INPUT, left: true }, stats, 0.1);
    expect(next.angle).toBeCloseTo(-Math.PI * 0.1);
  });

  it('keeps drifting without input', () => {
    const next = stepMotion({ ...at(), vx: 50 }, IDLE_INPUT, stats, 0.1);
    expect(next.vx).toBe(50);
    expect(next.x).toBeCloseTo(1_005);
  });

  it('clamps speed to maxSpeed', () => {
    const next = stepMotion({ ...at(), vy: -400 }, { ...IDLE_INPUT, thrust: true }, stats, 1);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(400);
  });

  it('stops at world walls', () => {
    const next = stepMotion({ ...at(5, 1_000), vx: -100 }, IDLE_INPUT, stats, 0.1);
    expect(next.x).toBe(0);
    expect(next.vx).toBe(0);
  });

  it('is deterministic', () => {
    const input = { ...IDLE_INPUT, thrust: true, right: true };
    expect(stepMotion(at(), input, stats, 1 / 30)).toEqual(stepMotion(at(), input, stats, 1 / 30));
  });
});
