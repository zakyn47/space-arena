import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/world/SpatialGrid';

const item = (id: number, x: number, y: number) => ({ id, x, y });

describe('SpatialGrid', () => {
  it('returns items within radius across cells', () => {
    const grid = new SpatialGrid(100);
    grid.insert(item(1, 50, 50));
    grid.insert(item(2, 140, 50));
    grid.insert(item(3, 400, 400));
    expect(grid.queryRadius(100, 50, 60).map((e) => e.id).sort()).toEqual([1, 2]);
  });

  it('excludes items in scanned cells but outside radius', () => {
    const grid = new SpatialGrid(100);
    grid.insert(item(1, 0, 0));
    expect(grid.queryRadius(90, 90, 100)).toEqual([]);
  });

  it('clears all items', () => {
    const grid = new SpatialGrid(100);
    grid.insert(item(1, 10, 10));
    grid.clear();
    expect(grid.queryRadius(10, 10, 50)).toEqual([]);
  });
});
