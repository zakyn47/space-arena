import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { flightStickInput } from '../src/input/InputSampler';

describe('flightStickInput', () => {
  it('leaves the ship idle in the center dead zone', () => {
    expect(flightStickInput(0, 0)).toEqual(IDLE_INPUT);
    expect(flightStickInput(0.1, -0.1)).toEqual(IDLE_INPUT);
  });

  it('always thrusts outside the radial dead zone and points toward the held direction', () => {
    expect(flightStickInput(0, -1, 0, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true });
    expect(flightStickInput(1, 0, 0, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true, right: true });
    expect(flightStickInput(-1, 0, 0, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true, left: true });
    expect(flightStickInput(0, 1, Math.PI, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true });
    expect(flightStickInput(0.15, 0.15, 0, 0.12).thrust).toBe(true);
  });

  it('steers using the current ship angle, including wraparound', () => {
    expect(flightStickInput(1, 0, Math.PI / 2, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true });
    expect(flightStickInput(0, -1, Math.PI / 2, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true, left: true });
    expect(flightStickInput(0, -1, Math.PI * 2 - 0.2, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true, right: true });
    expect(flightStickInput(0.7, 0.7, 0, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true, right: true });
  });

  it('stops turning within half a physics step instead of oscillating past the target', () => {
    expect(flightStickInput(0, -1, 0.04, 0.12)).toEqual({ ...IDLE_INPUT, thrust: true });
  });
});
