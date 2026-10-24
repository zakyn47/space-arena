import { BASE_LOADOUT, IDLE_INPUT, type SelfState } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { Predictor } from '../src/sim/Predictor';

const self = (overrides: Partial<SelfState> = {}): SelfState => ({
  id: 1, x: 1_000, y: 1_000, vx: 0, vy: 0, angle: 0,
  hull: 100, maxHull: 100, shieldEnergy: 100, maxShield: 100, shieldUp: false,
  ore: 0, cargoCapacity: 20, carriedCredits: 0, bankedCredits: 0,
  loadout: BASE_LOADOUT, docked: false, ...overrides,
});

const thrust = { ...IDLE_INPUT, thrust: true };

describe('Predictor', () => {
  it('has no motion before the first snapshot', () => {
    const predictor = new Predictor();
    expect(predictor.predict(thrust)).toBe(1);
    expect(predictor.current).toBeNull();
  });

  it('moves immediately after a snapshot', () => {
    const predictor = new Predictor();
    predictor.reconcile(self(), 0);
    predictor.predict(thrust);
    expect(predictor.current?.vy).toBeLessThan(0);
  });

  it('replays unacknowledged inputs on reconcile', () => {
    const predictor = new Predictor();
    predictor.reconcile(self(), 0);
    predictor.predict(thrust);
    predictor.predict(thrust);
    const predicted = predictor.current;
    predictor.reconcile(self(), 0);
    expect(predictor.current?.y).toBeCloseTo(predicted?.y ?? 0);
  });

  it('drops acknowledged inputs', () => {
    const predictor = new Predictor();
    predictor.reconcile(self(), 0);
    predictor.predict(thrust);
    predictor.predict(thrust);
    predictor.reconcile(self({ y: 500 }), 2);
    expect(predictor.current?.y).toBe(500);
  });
});
