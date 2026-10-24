import { describe, expect, it } from 'vitest';
import { forgetPilot, loadPilot, savePilot } from '../src/ui/savedPilot';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe('saved pilot', () => {
  it('round-trips the last pilot and token', () => {
    const storage = memoryStorage();
    expect(loadPilot(storage)).toBeNull();
    savePilot(storage, { username: 'alice', token: 'abc' });
    expect(loadPilot(storage)).toEqual({ username: 'alice', token: 'abc' });
  });

  it('forgets the pilot', () => {
    const storage = memoryStorage();
    savePilot(storage, { username: 'alice', token: 'abc' });
    forgetPilot(storage);
    expect(loadPilot(storage)).toBeNull();
  });

  it('ignores a token saved without a pilot name', () => {
    const storage = memoryStorage();
    storage.setItem('arena.token', 'abc');
    expect(loadPilot(storage)).toBeNull();
  });
});
