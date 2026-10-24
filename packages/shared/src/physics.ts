import { LATERAL_GRIP, REVERSE_THRUST_FACTOR } from './constants';
import type { ShipStats } from './build';
import { clampToWorld } from './world';

export interface ShipInput {
  readonly thrust: boolean;
  readonly reverse: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly fire: boolean;
  readonly shield: boolean;
  readonly rocket: boolean;
  readonly mine: boolean;
}

export const IDLE_INPUT: ShipInput = {
  thrust: false,
  reverse: false,
  left: false,
  right: false,
  fire: false,
  shield: false,
  rocket: false,
  mine: false,
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

// Engines fight sideways slide only while firing, so coasting stays fully inertial for strafing.
function applyGrip(vx: number, vy: number, direction: { readonly x: number; readonly y: number }, dt: number): [number, number] {
  const along = vx * direction.x + vy * direction.y;
  const keep = Math.exp(-LATERAL_GRIP * dt);
  return [
    direction.x * along + (vx - direction.x * along) * keep,
    direction.y * along + (vy - direction.y * along) * keep,
  ];
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
  const pushedX = motion.vx + direction.x * accel * dt;
  const pushedY = motion.vy + direction.y * accel * dt;
  const [grippedX, grippedY] = accel === 0 ? [pushedX, pushedY] : applyGrip(pushedX, pushedY, direction, dt);
  const [vx, vy] = limitSpeed(grippedX, grippedY, stats.maxSpeed);
  const rawX = motion.x + vx * dt;
  const rawY = motion.y + vy * dt;
  const x = clampToWorld(rawX);
  const y = clampToWorld(rawY);
  return { x, y, vx: x === rawX ? vx : 0, vy: y === rawY ? vy : 0, angle };
}
