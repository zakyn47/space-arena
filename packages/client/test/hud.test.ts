import { STARTER_BUILD } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { abilityStates, dockPrompt, edgeWarning, hudLines, minimapDots } from '../src/ui/Hud';
import { selfState } from './support/self';

describe('edgeWarning', () => {
  it('warns when the ship nears the arena edge', () => {
    expect(edgeWarning(selfState({ x: 10_000, y: 10_000 }), 20_000)).toBeNull();
    expect(edgeWarning(selfState({ x: 600, y: 10_000 }), 20_000)).toBe('⚠ Arena edge ahead — 600 px');
    expect(edgeWarning(selfState({ x: 10_000, y: 19_700 }), 20_000)).toBe('⚠ Arena edge ahead — 300 px');
    expect(edgeWarning(selfState({ x: 0, y: 5_000 }), 20_000)).toBe("⚠ Arena edge — you can't fly further");
  });
});

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
      { x: 80, y: 40, color: '#ffffff', size: 2 },
      { x: 0, y: 160, color: '#ff4d4d', size: 2 },
    ]);
  });

  it('draws the boss larger and purple', () => {
    expect(minimapDots([{ x: 10_000, y: 10_000, kind: 'boss' }], 160 / 20_000)).toEqual([{ x: 80, y: 80, color: '#c04bff', size: 6 }]);
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

  it('shows the remaining speed boost', () => {
    expect(hudLines(selfState({ speedBoost: 6.2 }), null)).toContain('Speed boost 7s');
    expect(hudLines(selfState(), null).some((line) => line.startsWith('Speed boost'))).toBe(false);
  });

  it('draws boosters on the minimap by kind', () => {
    expect(minimapDots([{ x: 0, y: 0, kind: 'repair' }, { x: 0, y: 0, kind: 'speed' }], 1)).toEqual([
      { x: 0, y: 0, color: '#3cffb0', size: 4 },
      { x: 0, y: 0, color: '#ffb23c', size: 4 },
    ]);
  });

  it('shows a disrupted shield with its remaining time', () => {
    const self = selfState({ shieldDisrupted: 3.2, ordnance: 'plasma' });
    expect(hudLines(self, null)).toContain('Shield 100 / 100 (DISABLED 4s)');
    expect(abilityStates(self, false)[1]).toMatchObject({ status: 'Disabled 4s', unavailable: true });
    expect(abilityStates(self, false)[2]).toMatchObject({ label: 'Plasma', icon: '/ui/icon_plasma.png', status: 'Hold to fire' });
  });

  it('names the carried ordnance', () => {
    const self = selfState({ ordnance: 'mines', rockets: 3 });
    expect(hudLines(self, null)).toContain('Mines 3 / 10');
    expect(abilityStates(self, false)[2]).toMatchObject({ label: 'Mines', key: 'R', icon: '/ui/icon_mine.png', status: 'Hold to drop' });
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
