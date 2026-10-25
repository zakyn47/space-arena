import { captainNeedsTraining, type SelfState } from '@arena/shared';

const UNDOCKED_KEY = 'arena.hasUndocked';

export function hasUndockedBefore(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(UNDOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markUndocked(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(UNDOCKED_KEY, '1');
  } catch {
    // Without storage the guide simply shows again next session.
  }
}

export function showUndockGuide(self: SelfState, hasUndocked: boolean): boolean {
  return self.docked && !hasUndocked && !captainNeedsTraining(self.captain);
}
