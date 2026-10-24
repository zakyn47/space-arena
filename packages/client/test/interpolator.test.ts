import type { EntityState } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { Interpolator } from '../src/sim/Interpolator';

const ship = (x: number, angle = 0): EntityState => ({
  kind: 'ship', id: 1, name: 'bob', x, y: 0, vx: 0, vy: 0, angle, shieldUp: false, hullId: 'scout',
});

describe('Interpolator', () => {
  it('returns nothing before any snapshot', () => {
    expect(new Interpolator().sample(0)).toEqual([]);
  });

  it('blends positions between bracketing snapshots', () => {
    const interpolator = new Interpolator();
    interpolator.push([ship(0)], 0);
    interpolator.push([ship(100)], 100);
    expect(interpolator.sample(25)[0]?.x).toBeCloseTo(25);
  });

  it('takes the short way around for angles', () => {
    const interpolator = new Interpolator();
    interpolator.push([ship(0, Math.PI - 0.1)], 0);
    interpolator.push([ship(0, -Math.PI + 0.1)], 100);
    const sampled = interpolator.sample(50)[0];
    expect(sampled?.kind === 'ship' && Math.abs(Math.cos(sampled.angle))).toBeCloseTo(1, 1);
  });

  it('holds the newest snapshot when render time is ahead', () => {
    const interpolator = new Interpolator();
    interpolator.push([ship(0)], 0);
    interpolator.push([ship(100)], 100);
    expect(interpolator.sample(500)[0]?.x).toBe(100);
  });

  it('shows new entities at their latest position', () => {
    const interpolator = new Interpolator();
    interpolator.push([], 0);
    interpolator.push([ship(100)], 100);
    expect(interpolator.sample(50)[0]?.x).toBe(100);
  });

  it('blends rocket angles too', () => {
    const rocket = (angle: number): EntityState => ({ kind: 'rocket', id: 9, x: 0, y: 0, vx: 0, vy: 0, angle });
    const interpolator = new Interpolator();
    interpolator.push([rocket(0)], 0);
    interpolator.push([rocket(1)], 100);
    const sampled = interpolator.sample(50)[0];
    expect(sampled?.kind === 'rocket' && sampled.angle).toBeCloseTo(0.5);
  });
});
