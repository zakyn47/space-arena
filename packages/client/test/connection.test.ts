import { describe, expect, it } from 'vitest';
import { isServerMessage } from '../src/net/Connection';

describe('isServerMessage', () => {
  it('accepts known message types', () => {
    expect(isServerMessage({ type: 'died', killer: null })).toBe(true);
  });

  it('rejects unknown shapes', () => {
    expect(isServerMessage({ type: 'nope' })).toBe(false);
    expect(isServerMessage(null)).toBe(false);
    expect(isServerMessage('snapshot')).toBe(false);
  });
});
