import { IDLE_INPUT, forward, nearestZone, zoneAt, type ShipInput } from '@arena/shared';
import type { ShipEntity } from '../entities';

export const AGGRO_RANGE = 800;
export const ATTACK_RANGE = 450;
export const LOSE_RANGE = 1_600;
export const WAYPOINT_REACHED = 150;

const ZONE_MARGIN = 200;
const LOOKAHEAD_SECONDS = 0.5;
const PATROL_SPEED_SHARE = 0.6;
const ATTACK_HOLD_DISTANCE = 250;
const TURN_DEADBAND = 0.05;
const THRUST_ALIGNMENT = 1;
const BRAKE_TOLERANCE = 40;
const GUN_AIM = 0.2;
const ROCKET_AIM = 0.4;
const SHIELD_HULL_SHARE = 0.4;
const SHIELD_MIN_ENERGY = 30;
const ESCAPE_DISTANCE = 1_000;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BrainContext {
  readonly target: ShipEntity | null;
  readonly waypoint: Point;
}

interface Steering {
  readonly thrust: boolean;
  readonly reverse: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly error: number;
}

function headingTo(from: Point, to: Point): number {
  return Math.atan2(to.x - from.x, from.y - to.y);
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function steer(ship: ShipEntity, goal: Point, desiredSpeed: number): Steering {
  const error = angleDelta(ship.angle, headingTo(ship, goal));
  const direction = forward(ship.angle);
  const speedAlong = ship.vx * direction.x + ship.vy * direction.y;
  return {
    left: error < -TURN_DEADBAND,
    right: error > TURN_DEADBAND,
    thrust: Math.abs(error) < THRUST_ALIGNMENT && speedAlong < desiredSpeed,
    reverse: speedAlong > desiredSpeed + BRAKE_TOLERANCE,
    error,
  };
}

function zoneEscape(ship: ShipEntity): Point | null {
  const ahead = { x: ship.x + ship.vx * LOOKAHEAD_SECONDS, y: ship.y + ship.vy * LOOKAHEAD_SECONDS };
  const zone = nearestZone(ahead.x, ahead.y);
  const gap = distance(ahead, zone);
  if (gap >= zone.radius + ZONE_MARGIN) return null;
  const awayX = (ship.x - zone.x) / Math.max(1, distance(ship, zone));
  const awayY = (ship.y - zone.y) / Math.max(1, distance(ship, zone));
  return { x: ship.x + awayX * ESCAPE_DISTANCE, y: ship.y + awayY * ESCAPE_DISTANCE };
}

function wantsShield(ship: ShipEntity): boolean {
  return ship.hull < ship.stats.maxHull * SHIELD_HULL_SHARE && ship.shieldEnergy > SHIELD_MIN_ENERGY;
}

function movement(steering: Steering): ShipInput {
  return { ...IDLE_INPUT, thrust: steering.thrust, reverse: steering.reverse, left: steering.left, right: steering.right };
}

function attack(ship: ShipEntity, target: ShipEntity): ShipInput {
  const holding = distance(ship, target) < ATTACK_HOLD_DISTANCE;
  const steering = steer(ship, target, holding ? 0 : ship.stats.maxSpeed);
  const shield = wantsShield(ship);
  const aim = Math.abs(steering.error);
  return {
    ...movement(steering),
    shield,
    fire: !shield && aim <= GUN_AIM,
    rocket: !shield && ship.rockets > 0 && aim <= ROCKET_AIM,
  };
}

export function steerToward(ship: ShipEntity, goal: Point, desiredSpeed: number): ShipInput {
  return movement(steer(ship, goal, desiredSpeed));
}

export function isValidTarget(candidate: ShipEntity): boolean {
  return candidate.npc === null && !candidate.docked && zoneAt(candidate.x, candidate.y) === undefined;
}

export function pirateInput(ship: ShipEntity, context: BrainContext): ShipInput {
  const escape = zoneEscape(ship);
  if (escape) return movement(steer(ship, escape, ship.stats.maxSpeed));
  const { target } = context;
  if (target && distance(ship, target) <= ATTACK_RANGE) return attack(ship, target);
  if (target) return movement(steer(ship, target, ship.stats.maxSpeed));
  return movement(steer(ship, context.waypoint, ship.stats.maxSpeed * PATROL_SPEED_SHARE));
}
