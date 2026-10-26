import type { EntityState, HitEvent, RadarBlip, SelfState, SnapshotMessage } from '@arena/shared';
import { canDock, dockCooldownRemaining } from '../world/Docking';
import type { ShipEntity, WorldEntity } from '../world/entities';

export function toEntityState(entity: WorldEntity): EntityState {
  switch (entity.kind) {
    case 'ship':
      return {
        kind: 'ship',
        id: entity.id,
        name: entity.name,
        x: entity.x,
        y: entity.y,
        vx: entity.vx,
        vy: entity.vy,
        angle: entity.angle,
        shieldUp: entity.shieldUp,
        hullId: entity.build.hullId,
        npc: entity.npc,
        miningTargetId: entity.miningTargetId,
        ...(entity.npc === 'leviathan' ? { health: Math.round((entity.hull / entity.stats.maxHull) * 100) / 100 } : {}),
        ...(entity.darkMatter > 0 ? { darkMatter: true as const } : {}),
        ...(entity.input.thrust ? { thrusting: true as const } : {}),
        ...(entity.skin !== 'standard' ? { skin: entity.skin } : {}),
      };
    case 'bullet':
      return { kind: 'bullet', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, weaponId: entity.weaponId, mk: entity.mk };
    case 'rocket':
      return { kind: 'rocket', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, angle: entity.angle };
    case 'orb':
      return { kind: 'orb', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy };
    case 'plasma':
      return { kind: 'plasma', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, angle: entity.angle };
    case 'spaceMine':
      return { kind: 'spaceMine', id: entity.id, x: entity.x, y: entity.y };
    case 'asteroid':
      return { kind: 'asteroid', id: entity.id, x: entity.x, y: entity.y, radius: entity.radius, variant: entity.variant };
    case 'ore':
      return { kind: 'ore', id: entity.id, x: entity.x, y: entity.y };
    case 'booster':
      return { kind: 'booster', id: entity.id, x: entity.x, y: entity.y, boost: entity.boost };
    case 'crate':
      return { kind: 'crate', id: entity.id, x: entity.x, y: entity.y, hasGear: entity.gear !== null };
  }
}

export function toSelfState(ship: ShipEntity, time: number): SelfState {
  return {
    id: ship.id,
    x: ship.x,
    y: ship.y,
    vx: ship.vx,
    vy: ship.vy,
    angle: ship.angle,
    hull: ship.hull,
    maxHull: ship.stats.maxHull,
    shieldEnergy: ship.shieldEnergy,
    maxShield: ship.stats.maxShield,
    shieldUp: ship.shieldUp,
    shieldDisrupted: Math.max(0, Math.round((ship.shieldDisruptedUntil - time) * 10) / 10),
    darkMatter: Math.round(ship.darkMatter),
    speedBoost: Math.max(0, Math.round((ship.speedBoostUntil - time) * 10) / 10),
    ore: ship.ore,
    cargoCapacity: ship.stats.cargoCapacity,
    carriedCredits: ship.carriedCredits,
    bankedCredits: ship.bankedCredits,
    build: ship.build,
    captain: ship.captain,
    ordnance: ship.ordnance,
    rockets: ship.rockets,
    maxRockets: ship.stats.maxRockets,
    docked: ship.docked,
    canDock: canDock(ship, time),
    dockCooldown: dockCooldownRemaining(ship, time),
    salvage: ship.salvage,
    miningTargetId: ship.miningTargetId,
    pvpKills: ship.pvpKills,
    skin: ship.skin,
  };
}

export function buildSnapshot(
  self: ShipEntity,
  nearby: readonly WorldEntity[],
  tick: number,
  time: number,
  radar?: readonly RadarBlip[],
  hits: readonly HitEvent[] = [],
): SnapshotMessage {
  const visible = hitsInView(nearby, hits);
  return {
    type: 'snapshot',
    tick,
    lastSeq: self.lastSeq,
    self: toSelfState(self, time),
    entities: nearby.filter((entity) => entity.id !== self.id).map(toEntityState),
    ...(radar ? { radar } : {}),
    ...(visible.length > 0 ? { hits: visible } : {}),
  };
}

function hitsInView(nearby: readonly WorldEntity[], hits: readonly HitEvent[]): HitEvent[] {
  const ids = new Set(nearby.map((entity) => entity.id));
  return hits
    .filter((hit) => ids.has(hit.targetId))
    .map((hit) => ({ ...hit, angle: Math.round(hit.angle * 100) / 100 }));
}
