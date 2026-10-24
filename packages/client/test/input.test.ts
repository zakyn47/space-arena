import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { InputSampler } from '../src/input/InputSampler';

describe('InputSampler', () => {
  it('maps WASD, Space, Shift, R and F', () => {
    const sampler = new InputSampler();
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'KeyR', 'KeyF']) sampler.handleKey(code, true, false);
    expect(sampler.sample()).toEqual({ thrust: true, reverse: true, left: true, right: true, fire: true, shield: true, rocket: true, mine: true });
  });

  it('releases keys', () => {
    const sampler = new InputSampler();
    sampler.handleKey('KeyR', true, false);
    sampler.handleKey('KeyR', false, false);
    expect(sampler.sample()).toEqual(IDLE_INPUT);
  });

  it('fires dock once per E press, ignoring key repeat and release', () => {
    let docks = 0;
    const sampler = new InputSampler(() => (docks += 1));
    expect(sampler.handleKey('KeyE', true, false)).toBe(true);
    sampler.handleKey('KeyE', true, true);
    sampler.handleKey('KeyE', false, false);
    expect(docks).toBe(1);
    expect(sampler.sample()).toEqual(IDLE_INPUT);
  });

  it('ignores unmapped keys', () => {
    expect(new InputSampler().handleKey('KeyQ', true, false)).toBe(false);
  });
});
