import { STARTER_BUILD } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { abilityStates, dockPrompt, hudLines, minimapDots } from '../src/ui/Hud';
import { selfState } from './support/self';

describe('dockPrompt', () => {
  it('explains each dock state', () => {
    expect(dockPrompt(selfState({ docked: true }), true)).toBe('Choose your starting captain skills to undock');
    expect(dockPrompt(selfState({ docked: true, captain: { xp: 0, skills: { gunnery: 0, engineering: 0, piloting: 3, mining: 0 } } }), true)).toBe('Docked — press E to undock');
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

describe('minimapDots', () => {
  it('scales radar blips to the minimap and colors them by kind', () => {
    expect(minimapDots([{ x: 10_000, y: 5_000, kind: 'player' }, { x: 0, y: 20_000, kind: 'pirate' }], 160 / 20_000)).toEqual([
      { x: 80, y: 40, color: '#ffffff' },
      { x: 0, y: 160, color: '#ff4d4d' },
    ]);
  });
});


describe('abilityStates', () => {
  it('shows the existing key bindings and active shield and mining states', () => {
    const states = abilityStates(selfState({ shieldUp: true }), false);
    expect(states.map((ability) => ability.key)).toEqual(['Space', 'Shift', 'R', 'F', 'E']);
    expect(states[1]).toMatchObject({ status: 'Active', active: true, unavailable: false });
    expect(states[0]).toMatchObject({ status: 'Shield up', unavailable: true });
    expect(states[2]).toMatchObject({ status: 'Shield up', unavailable: true });
    expect(states[3]).toMatchObject({ status: 'Shield up', unavailable: true });
    expect(abilityStates(selfState({ miningTargetId: 42 }), false)[3]).toMatchObject({ status: 'Mining', active: true });
  });

  it('shows depleted ammo, missing modules and a full hold', () => {
    const unarmed = { ...STARTER_BUILD, slots: { weapon: [null], shield: [null], engine: [null], utility: [null] } };
    const states = abilityStates(selfState({ build: unarmed, maxShield: 0, rockets: 0 }), false);
    expect(states[0]).toMatchObject({ status: 'No weapon', unavailable: true });
    expect(states[1]).toMatchObject({ status: 'No generator', unavailable: true });
    expect(states[2]).toMatchObject({ status: 'Empty', unavailable: true });
    expect(states[3]).toMatchObject({ status: 'Not installed', unavailable: true });
    expect(abilityStates(selfState({ ore: 15 }), false)[3]).toMatchObject({ status: 'Cargo full', unavailable: true });
    expect(abilityStates(selfState({ shieldEnergy: 0 }), false)[1]).toMatchObject({ status: 'Depleted', unavailable: true });
  });

  it('shows safe-zone restrictions and docking cooldown without inventing weapon cooldowns', () => {
    const safe = abilityStates(selfState(), true);
    expect(safe.slice(0, 4).every((ability) => ability.status === 'Safe zone' && ability.unavailable)).toBe(true);
    expect(abilityStates(selfState({ docked: true }), true)[4]).toMatchObject({ status: 'Choose skills', unavailable: true });
    expect(abilityStates(selfState({ canDock: true }), true)[4]).toMatchObject({ status: 'Dock', unavailable: false });
    expect(abilityStates(selfState({ dockCooldown: 12.3 }), false)[4]).toMatchObject({ status: '13s', unavailable: true });
  });
});
