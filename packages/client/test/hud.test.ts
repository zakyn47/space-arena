import { describe, expect, it } from 'vitest';
import { dockPrompt, hudLines } from '../src/ui/Hud';
import { selfState } from './support/self';

describe('dockPrompt', () => {
  it('explains each dock state', () => {
    expect(dockPrompt(selfState({ docked: true }), true)).toBe('Docked — press E to undock');
    expect(dockPrompt(selfState({ canDock: true }), true)).toBe('Press E to dock');
    expect(dockPrompt(selfState({ dockCooldown: 12.3 }), true)).toBe('Dock available in 13s');
    expect(dockPrompt(selfState({ dockCooldown: 12.3 }), false)).toBeNull();
    expect(dockPrompt(selfState(), false)).toBeNull();
  });
});

describe('hudLines', () => {
  it('summarises ship state with rockets and the prompt', () => {
    const lines = hudLines(selfState({ hull: 62.4, shieldEnergy: 33.3, shieldUp: true, ore: 4, carriedCredits: 150, bankedCredits: 900, rockets: 7 }), 'Press E to dock');
    expect(lines).toEqual([
      'Hull 63 / 80',
      'Shield 33 / 100 (UP)',
      'Rockets 7 / 10',
      'Cargo 4 / 15 ore',
      'Salvage 0 / 3',
      'Carried 150 cr (at risk)',
      'Banked 900 cr',
      'Press E to dock',
    ]);
  });

  it('omits an empty prompt', () => {
    expect(hudLines(selfState(), null)).toHaveLength(7);
  });
});
