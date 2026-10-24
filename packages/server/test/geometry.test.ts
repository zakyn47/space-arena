import { describe, expect, it } from 'vitest';
import { distanceToSegment } from '../src/world/geometry';

describe('distanceToSegment', () => {
  it('measures perpendicular distance', () => {
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it('measures to the nearest endpoint beyond the segment', () => {
    expect(distanceToSegment(13, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it('handles zero-length segments', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});
