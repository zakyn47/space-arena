import { WORLD_SIZE } from './constants';

export interface SafeZone {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export const SAFE_ZONES: readonly SafeZone[] = [
  { id: 'alpha', x: 4_000, y: 4_000, radius: 800 },
  { id: 'beta', x: 16_000, y: 5_000, radius: 800 },
  { id: 'gamma', x: 10_000, y: 16_000, radius: 800 },
];

function centerDistance(zone: SafeZone, x: number, y: number): number {
  return Math.hypot(x - zone.x, y - zone.y);
}

export function zoneAt(x: number, y: number): SafeZone | undefined {
  return SAFE_ZONES.find((zone) => centerDistance(zone, x, y) <= zone.radius);
}

export function nearestZone(x: number, y: number): SafeZone {
  return SAFE_ZONES.reduce((best, zone) =>
    centerDistance(zone, x, y) < centerDistance(best, x, y) ? zone : best,
  );
}

export function distanceToNearestZone(x: number, y: number): number {
  const zone = nearestZone(x, y);
  return centerDistance(zone, x, y) - zone.radius;
}

export function clampToWorld(value: number): number {
  return Math.min(WORLD_SIZE, Math.max(0, value));
}
