import { IDLE_INPUT } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { InputSampler } from '../src/input/InputSampler';

describe('InputSampler', () => {
  it('maps WASD, Space and Shift', () => {
    const sampler = new InputSampler();
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) sampler.setKey(code, true);
    expect(sampler.sample()).toEqual({ thrust: true, reverse: true, left: true, right: true, fire: true, shield: true });
  });

  it('releases keys', () => {
    const sampler = new InputSampler();
    sampler.setKey('KeyW', true);
    sampler.setKey('KeyW', false);
    expect(sampler.sample()).toEqual(IDLE_INPUT);
  });

  it('ignores unmapped keys', () => {
    expect(new InputSampler().setKey('KeyQ', true)).toBe(false);
  });
});
