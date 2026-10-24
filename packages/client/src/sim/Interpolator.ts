import type { EntityState } from '@arena/shared';

export const INTERPOLATION_DELAY_MS = 100;

const MAX_BUFFERED = 30;

interface TimedSnapshot {
  readonly time: number;
  readonly entities: ReadonlyMap<number, EntityState>;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function lerpAngle(from: number, to: number, t: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

function blend(from: EntityState | undefined, to: EntityState, t: number): EntityState {
  if (!from || from.kind !== to.kind) return to;
  const moved = { ...to, x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
  if (moved.kind === 'ship' && from.kind === 'ship') return { ...moved, angle: lerpAngle(from.angle, moved.angle, t) };
  return moved;
}

export class Interpolator {
  private readonly buffer: TimedSnapshot[] = [];

  push(entities: readonly EntityState[], time: number): void {
    this.buffer.push({ time, entities: new Map(entities.map((entity) => [entity.id, entity])) });
    if (this.buffer.length > MAX_BUFFERED) this.buffer.shift();
  }

  sample(renderTime: number): EntityState[] {
    const newest = this.buffer.at(-1);
    if (!newest) return [];
    const nextIndex = this.buffer.findIndex((snapshot) => snapshot.time > renderTime);
    if (nextIndex === -1) return [...newest.entities.values()];
    const to = this.buffer[nextIndex];
    const from = this.buffer[nextIndex - 1];
    if (!to) return [...newest.entities.values()];
    if (!from) return [...to.entities.values()];
    const t = (renderTime - from.time) / (to.time - from.time);
    return [...to.entities.values()].map((entity) => blend(from.entities.get(entity.id), entity, t));
  }
}
