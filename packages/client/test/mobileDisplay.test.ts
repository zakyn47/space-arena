import { describe, expect, it, vi } from 'vitest';
import { enterLandscape } from '../src/ui/MobileDisplay';
import { cameraScale } from '../src/render/Renderer';
import { VIEW_RADIUS } from '@arena/shared';

describe('mobile display', () => {
  it('enters fullscreen before requesting landscape', async () => {
    const calls: string[] = [];
    const host = { requestFullscreen: async () => { calls.push('fullscreen'); } };
    const orientation = { lock: async (mode: 'landscape') => { calls.push(mode); } };
    expect(await enterLandscape(host, orientation)).toBe(true);
    expect(calls).toEqual(['fullscreen', 'landscape']);
  });

  it('keeps fullscreen available when orientation locking is unsupported or rejected', async () => {
    const host = { requestFullscreen: async () => {} };
    expect(await enterLandscape(host, {})).toBe(false);
    expect(await enterLandscape(host, { lock: async () => { throw new Error('unsupported'); } })).toBe(false);
  });

  it('does not request orientation when fullscreen is denied', async () => {
    const lock = vi.fn();
    await expect(enterLandscape({ requestFullscreen: async () => { throw new Error('denied'); } }, { lock })).rejects.toThrow('denied');
    expect(lock).not.toHaveBeenCalled();
  });

  it('zooms out mobile world rendering in both orientations without changing desktop scale', () => {
    expect(cameraScale(393, 873, true)).toBe(0.4);
    expect(cameraScale(873, 393, true)).toBe(0.4);
    expect(cameraScale(1920, 1080, false)).toBe(0.75);
  });

  it('keeps the visible world inside the server snapshot radius on large displays', () => {
    const width = 2400;
    const height = 1600;
    expect(Math.hypot(width, height) / (2 * cameraScale(width, height, true))).toBeLessThanOrEqual(VIEW_RADIUS);
    expect(Math.hypot(width, height) / (2 * cameraScale(width, height, false))).toBeLessThanOrEqual(VIEW_RADIUS);
  });
});
