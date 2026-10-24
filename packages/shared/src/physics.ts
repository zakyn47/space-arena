import { REVERSE_THRUST_FACTOR } from './constants';
import type { ShipStats } from './upgrades';
import { clampToWorld } from './world';

export interface ShipInput {
  readonly thrust: boolean;
  readonly reverse: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly fire: boolean;
  readonly shield: boolean;
}

export const IDLE_INPUT: ShipInput = {
  thrust: false,
  reverse: false,
  left: false,
  right: false,
  fire: false,
  shield: false,
};

export interface ShipMotion {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
}

export function forward(angle: number): { readonly x: number; readonly y: number } {
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

function acceleration(input: ShipInput, stats: ShipStats): number {
  const push = input.thrust ? stats.thrust : 0;
  const pull = input.reverse ? stats.thrust * REVERSE_THRUST_FACTOR : 0;
  return push - pull;
}

function limitSpeed(vx: number, vy: number, maxSpeed: number): [number, number] {
  const speed = Math.hypot(vx, vy);
  if (speed <= maxSpeed) return [vx, vy];
  const factor = maxSpeed / speed;
  return [vx * factor, vy * factor];
}

export function stepMotion(
  motion: ShipMotion,
  input: ShipInput,
  stats: ShipStats,
  dt: number,
): ShipMotion {
  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const angle = motion.angle + turn * stats.turnRate * dt;
  const direction = forward(angle);
  const accel = acceleration(input, stats);
  const [vx, vy] = limitSpeed(
    motion.vx + direction.x * accel * dt,
    motion.vy + direction.y * accel * dt,
    stats.maxSpeed,
  );
  const rawX = motion.x + vx * dt;
  const rawY = motion.y + vy * dt;
  const x = clampToWorld(rawX);
  const y = clampToWorld(rawY);
  return { x, y, vx: x === rawX ? vx : 0, vy: y === rawY ? vy : 0, angle };
}
