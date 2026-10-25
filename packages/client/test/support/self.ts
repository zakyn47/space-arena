import { NEW_CAPTAIN, STARTER_BUILD, type SelfState } from '@arena/shared';

export function selfState(overrides: Partial<SelfState> = {}): SelfState {
  return {
    id: 1, x: 1_000, y: 1_000, vx: 0, vy: 0, angle: 0,
    hull: 80, maxHull: 80, shieldEnergy: 100, maxShield: 100, shieldUp: false,
    ore: 0, cargoCapacity: 15, carriedCredits: 0, bankedCredits: 0,
    captain: NEW_CAPTAIN, build: STARTER_BUILD, ordnance: 'rockets', shieldDisrupted: 0, rockets: 10, maxRockets: 10,
    docked: false, canDock: false, dockCooldown: 0,
    salvage: [], miningTargetId: null,
    ...overrides,
  };
}
