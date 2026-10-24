import type { EntityState, SelfState, SnapshotMessage } from '@arena/shared';
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
      };
    case 'bullet':
      return { kind: 'bullet', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, weaponId: entity.weaponId, mk: entity.mk };
    case 'rocket':
      return { kind: 'rocket', id: entity.id, x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy, angle: entity.angle };
    case 'asteroid':
      return { kind: 'asteroid', id: entity.id, x: entity.x, y: entity.y, radius: entity.radius, variant: entity.variant };
    case 'ore':
      return { kind: 'ore', id: entity.id, x: entity.x, y: entity.y };
    case 'crate':
      return { kind: 'crate', id: entity.id, x: entity.x, y: entity.y, hasGear: false };
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
    ore: ship.ore,
    cargoCapacity: ship.stats.cargoCapacity,
    carriedCredits: ship.carriedCredits,
    bankedCredits: ship.bankedCredits,
    build: ship.build,
    rockets: ship.rockets,
    maxRockets: ship.stats.maxRockets,
    docked: ship.docked,
    canDock: canDock(ship, time),
    dockCooldown: dockCooldownRemaining(ship, time),
    salvage: ship.salvage,
    miningTargetId: ship.miningTargetId,
  };
}

export function buildSnapshot(self: ShipEntity, nearby: readonly WorldEntity[], tick: number, time: number): SnapshotMessage {
  return {
    type: 'snapshot',
    tick,
    lastSeq: self.lastSeq,
    self: toSelfState(self, time),
    entities: nearby.filter((entity) => entity.id !== self.id).map(toEntityState),
  };
}
