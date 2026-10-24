import { describe, expect, it } from 'vitest';
import { loadingLabel } from '../src/ui/Loader';

describe('loadingLabel', () => {
  it('counts loaded sprites', () => {
    expect(loadingLabel(12, 48)).toBe('Loading sprites 12 / 48');
  });

  it('falls back to a generic message without a manifest', () => {
    expect(loadingLabel(0, 0)).toBe('Preparing the hangar…');
  });
});
