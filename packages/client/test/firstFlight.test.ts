import { describe, expect, it } from 'vitest';
import { hasUndockedBefore, markUndocked, showUndockGuide } from '../src/ui/firstFlight';
import { selfState } from './support/self';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

const trained = { xp: 0, skills: { gunnery: 1, engineering: 1, piloting: 1, mining: 0 } };

describe('first flight guide', () => {
  it('points at undock for a docked, trained pilot who has never undocked', () => {
    expect(showUndockGuide(selfState({ docked: true, captain: trained }), false)).toBe(true);
  });

  it('waits until the starting captain skills are chosen', () => {
    expect(showUndockGuide(selfState({ docked: true }), false)).toBe(false);
  });

  it('never shows again after the first undock or in flight', () => {
    expect(showUndockGuide(selfState({ docked: true, captain: trained }), true)).toBe(false);
    expect(showUndockGuide(selfState({ docked: false, captain: trained }), false)).toBe(false);
  });

  it('remembers the first undock', () => {
    const storage = memoryStorage();
    expect(hasUndockedBefore(storage)).toBe(false);
    markUndocked(storage);
    expect(hasUndockedBefore(storage)).toBe(true);
  });
});
