const TOKEN_KEY = 'arena.token';
const PILOT_KEY = 'arena.pilot';

export interface SavedPilot {
  readonly username: string;
  readonly token: string;
}

export function loadPilot(storage: Pick<Storage, 'getItem'>): SavedPilot | null {
  const token = storage.getItem(TOKEN_KEY);
  const username = storage.getItem(PILOT_KEY);
  return token && username ? { username, token } : null;
}

export function savePilot(storage: Pick<Storage, 'setItem'>, pilot: SavedPilot): void {
  storage.setItem(TOKEN_KEY, pilot.token);
  storage.setItem(PILOT_KEY, pilot.username);
}

export function forgetPilot(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(PILOT_KEY);
}
