import { RADAR_PLAYER_RANGE, type RadarBlip } from '@arena/shared';
import type { ShipEntity } from '../world/entities';

function blipKind(ship: ShipEntity): RadarBlip['kind'] {
  if (ship.npc === null) return 'player';
  return ship.npc === 'leviathan' ? 'boss' : 'pirate';
}

function visible(self: ShipEntity, ship: ShipEntity): boolean {
  if (ship.id === self.id) return false;
  if (ship.npc !== null) return true;
  return Math.hypot(ship.x - self.x, ship.y - self.y) <= RADAR_PLAYER_RANGE;
}

export function buildRadar(self: ShipEntity, ships: Iterable<ShipEntity>): RadarBlip[] {
  const blips: RadarBlip[] = [];
  for (const ship of ships) {
    if (!visible(self, ship)) continue;
    blips.push({ x: Math.round(ship.x), y: Math.round(ship.y), kind: blipKind(ship) });
  }
  return blips;
}
