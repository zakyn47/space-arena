import { WORLD_SIZE, distanceToNearestZone, type PirateTier } from '@arena/shared';
import type { ShipEntity } from '../entities';
import { randomGear, type CrateDrop } from '../Loot';
import { AGGRO_RANGE, LOSE_RANGE, WAYPOINT_REACHED, isValidTarget, pirateInput, type Point } from './PirateBrain';
import { PIRATE_SPECS, type PirateTierSpec } from './tiers';

export const PATROL_RESPAWN = 60;

const WAYPOINT_COUNT = 4;
const FORMATION_SPACING = 120;
const MAX_PLACEMENT_TRIES = 2_000;

export interface PatrolSpec {
  readonly band: PirateTier;
  readonly composition: (rng: () => number) => PirateTier[];
}

export interface PirateHost {
  spawnPirate(tier: PirateTier, x: number, y: number): ShipEntity;
  ship(id: number): ShipEntity | undefined;
  players(): Iterable<ShipEntity>;
}

interface Patrol {
  readonly spec: PatrolSpec;
  members: number[];
  waypoints: Point[];
  waypointIndex: number;
  targetId: number | null;
  respawnAt: number;
}

function repeat(count: number, spec: PatrolSpec): PatrolSpec[] {
  return Array.from({ length: count }, () => spec);
}

export const DEFAULT_PATROLS: readonly PatrolSpec[] = [
  ...repeat(4, { band: 'raider', composition: () => ['raider', 'raider'] }),
  ...repeat(3, {
    band: 'marauder',
    composition: (rng) => (rng() < 0.5 ? ['marauder', 'marauder'] : ['marauder', 'marauder', 'marauder']),
  }),
  ...repeat(1, { band: 'warlord', composition: () => ['warlord', 'marauder', 'marauder'] }),
];

export function randomPointInBand(rng: () => number, band: PirateTierSpec['band']): Point {
  for (let attempt = 0; attempt < MAX_PLACEMENT_TRIES; attempt += 1) {
    const point = { x: rng() * WORLD_SIZE, y: rng() * WORLD_SIZE };
    const gap = distanceToNearestZone(point.x, point.y);
    if (gap >= band.min && gap <= band.max) return point;
  }
  throw new RangeError(`no point found in band ${band.min}-${band.max}`);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class PirateDirector {
  private readonly patrols: Patrol[];

  constructor(
    private readonly rng: () => number,
    specs: readonly PatrolSpec[] = DEFAULT_PATROLS,
  ) {
    this.patrols = specs.map((spec) => ({ spec, members: [], waypoints: [], waypointIndex: 0, targetId: null, respawnAt: 0 }));
  }

  step(host: PirateHost, time: number): void {
    for (const patrol of this.patrols) this.stepPatrol(host, patrol, time);
  }

  pirateLoot(tier: PirateTier): CrateDrop {
    const spec = PIRATE_SPECS[tier];
    const gear = this.rng() < spec.dropChance ? randomGear(this.rng, spec.dropMks) : null;
    return { credits: spec.credits, ore: spec.ore, gear, darkMatter: false };
  }

  private stepPatrol(host: PirateHost, patrol: Patrol, time: number): void {
    const members = patrol.members.map((id) => host.ship(id)).filter((ship): ship is ShipEntity => ship !== undefined);
    patrol.members = members.map((ship) => ship.id);
    if (members.length === 0) {
      this.handleEmptyPatrol(host, patrol, time);
      return;
    }
    const target = this.updateTarget(host, patrol, members);
    const leader = members[0];
    const waypoint = patrol.waypoints[patrol.waypointIndex];
    if (!leader || !waypoint) return;
    if (distance(leader, waypoint) <= WAYPOINT_REACHED) patrol.waypointIndex = (patrol.waypointIndex + 1) % patrol.waypoints.length;
    members.forEach((ship, index) => {
      const goal = patrol.waypoints[patrol.waypointIndex] ?? waypoint;
      ship.input = pirateInput(ship, { target, waypoint: { x: goal.x + index * FORMATION_SPACING, y: goal.y } });
    });
  }

  private handleEmptyPatrol(host: PirateHost, patrol: Patrol, time: number): void {
    if (patrol.respawnAt < 0) patrol.respawnAt = time + PATROL_RESPAWN;
    if (time < patrol.respawnAt) return;
    this.spawnPatrol(host, patrol);
    patrol.respawnAt = -1;
  }

  private spawnPatrol(host: PirateHost, patrol: Patrol): void {
    const band = PIRATE_SPECS[patrol.spec.band].band;
    const origin = randomPointInBand(this.rng, band);
    patrol.waypoints = Array.from({ length: WAYPOINT_COUNT }, () => randomPointInBand(this.rng, band));
    patrol.waypointIndex = 0;
    patrol.targetId = null;
    patrol.members = patrol.spec
      .composition(this.rng)
      .map((tier, index) => host.spawnPirate(tier, origin.x + index * FORMATION_SPACING, origin.y).id);
  }

  private updateTarget(host: PirateHost, patrol: Patrol, members: readonly ShipEntity[]): ShipEntity | null {
    const current = patrol.targetId === null ? undefined : host.ship(patrol.targetId);
    const nearestMember = (ship: ShipEntity): number => Math.min(...members.map((member) => distance(member, ship)));
    if (current && isValidTarget(current) && nearestMember(current) <= LOSE_RANGE) return current;
    let best: ShipEntity | null = null;
    let bestDistance = AGGRO_RANGE;
    for (const candidate of host.players()) {
      if (!isValidTarget(candidate)) continue;
      const gap = nearestMember(candidate);
      if (gap > bestDistance) continue;
      best = candidate;
      bestDistance = gap;
    }
    patrol.targetId = best?.id ?? null;
    return best;
  }
}
