import { IDLE_INPUT, TICK_DT } from '@arena/shared';
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

  it('renders motion between input ticks without advancing the simulation', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState({ vx: 240 }), 0);
    predictor.predict(IDLE_INPUT, 1_000);
    const current = predictor.current;
    expect(predictor.sample(1_000)?.x).toBe(current?.x);
    expect(predictor.sample(1_000 + TICK_DT * 500)?.x).toBeCloseTo((current?.x ?? 0) + 4);
    expect(predictor.sample(1_000 + TICK_DT * 1_000)?.x).toBeCloseTo((current?.x ?? 0) + 8);
    expect(predictor.current).toEqual(current);
  });

  it('smooths turning but never extrapolates farther than one tick during a stall', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState(), 0);
    predictor.predict({ ...IDLE_INPUT, right: true }, 1_000);
    const angle = predictor.current?.angle ?? 0;
    expect(predictor.sample(1_000 + TICK_DT * 500)?.angle).toBeCloseTo(angle + predictor.turnRate * TICK_DT / 2);
    expect(predictor.sample(5_000)?.angle).toBeCloseTo(angle + predictor.turnRate * TICK_DT);
    expect(predictor.sample(999)?.angle).toBe(angle);
  });

  it('does not extrapolate before prediction or after docking', () => {
    const predictor = new Predictor();
    expect(predictor.sample(1_000)).toBeNull();
    predictor.reconcile(selfState({ vx: 240 }), 0);
    expect(predictor.sample(1_000)).toEqual(predictor.current);
    predictor.predict(thrust, 1_000);
    predictor.reconcile(selfState({ docked: true }), 1);
    expect(predictor.sample(1_016)).toEqual(predictor.current);
  });

  it('stays frozen at the server position while docked', () => {
    const predictor = new Predictor();
    predictor.reconcile(selfState({ docked: true }), 0);
    predictor.predict(thrust);
    expect(predictor.current).toMatchObject({ x: 1_000, y: 1_000, vx: 0, vy: 0 });
  });
});


it('predicts with the same captain motion bonuses as the server', () => {
  const baseline = new Predictor();
  const skilled = new Predictor();
  const captain = { xp: 0, skills: { gunnery: 0, engineering: 0, piloting: 3, mining: 0 } };
  baseline.reconcile(selfState(), 0);
  skilled.reconcile(selfState({ captain }), 0);
  baseline.predict(thrust);
  skilled.predict(thrust);
  expect(skilled.current?.vy).toBeCloseTo((baseline.current?.vy ?? 0) * 1.09);
});
