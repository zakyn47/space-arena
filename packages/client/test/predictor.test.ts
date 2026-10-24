import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { Predictor } from '../src/sim/Predictor';
import { selfState } from './support/self';

const thrust = { ...IDLE_INPUT, thrust: true };

describe('Predictor', () => {
  it('has no motion before the first snapshot', () => {
    const predictor = new Predictor();
    expect(predictor.predict(thrust)).toBe(1);
    expect(predictor.current).toBeNull();
  });

  it('moves immediately after a snapshot', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState(), 0);
    predictor.predict(thrust);
    expect(predictor.current?.vy).toBeLessThan(0);
  });

  it('replays unacknowledged inputs and drops acknowledged ones', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState(), 0);
    predictor.predict(thrust);
    predictor.predict(thrust);
    const predicted = predictor.current;
    predictor.reconcile(selfState(), 0);
    expect(predictor.current?.y).toBeCloseTo(predicted?.y ?? 0);
    predictor.reconcile(selfState({ y: 500 }), 2);
    expect(predictor.current?.y).toBe(500);
  });

  it('stays frozen at the server position while docked', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState({ docked: true }), 0);
    predictor.predict(thrust);
    expect(predictor.current).toMatchObject({ x: 1_000, y: 1_000, vx: 0, vy: 0 });
  });
});
