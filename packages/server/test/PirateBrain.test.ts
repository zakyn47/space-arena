import { SAFE_ZONES } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip, type ShipEntity } from '../src/world/entities';
import { isValidTarget, pirateInput } from '../src/world/pirates/PirateBrain';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

function pirate(x: number = OPEN_SPACE.x, y: number = OPEN_SPACE.y): ShipEntity {
  const ship = createShip(1, -1, 'Raider', shipRecord(x, y, -1));
  ship.npc = 'raider';
  return ship;
}

const player = (x: number, y: number) => createShip(2, 2, 'alice', shipRecord(x, y, 2));

describe('pirateInput', () => {
  it('turns toward the waypoint and thrusts while slow', () => {
    const input = pirateInput(pirate(), { target: null, waypoint: { x: OPEN_SPACE.x + 1_000, y: OPEN_SPACE.y } });
    expect(input.right).toBe(true);
    expect(input.fire).toBe(false);
  });

  it('caps patrol speed at 60% of max speed', () => {
    const ship = pirate();
    ship.vy = -0.7 * ship.stats.maxSpeed;
    const input = pirateInput(ship, { target: null, waypoint: { x: OPEN_SPACE.x, y: OPEN_SPACE.y - 2_000 } });
    expect(input.thrust).toBe(false);
  });

  it('fires when facing a target in attack range', () => {
    const input = pirateInput(pirate(), { target: player(OPEN_SPACE.x, OPEN_SPACE.y - 300), waypoint: { x: 0, y: 0 } });
    expect(input.fire).toBe(true);
  });

  it('does not fire while badly aimed', () => {
    const input = pirateInput(pirate(), { target: player(OPEN_SPACE.x + 300, OPEN_SPACE.y), waypoint: { x: 0, y: 0 } });
    expect(input.fire).toBe(false);
    expect(input.right).toBe(true);
  });

  it('fires rockets when it has them and is roughly aimed', () => {
    const ship = pirate();
    ship.rockets = 5;
    const input = pirateInput(ship, { target: player(OPEN_SPACE.x + 100, OPEN_SPACE.y - 300), waypoint: { x: 0, y: 0 } });
    expect(input.rocket).toBe(true);
  });

  it('raises the shield instead of firing when badly hurt', () => {
    const ship = pirate();
    ship.hull = ship.stats.maxHull * 0.3;
    const input = pirateInput(ship, { target: player(OPEN_SPACE.x, OPEN_SPACE.y - 300), waypoint: { x: 0, y: 0 } });
    expect(input.shield).toBe(true);
    expect(input.fire).toBe(false);
  });

  it('steers away from a safe zone', () => {
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0, radius: 800 };
    const ship = pirate(zone.x, zone.y - zone.radius - 100);
    ship.angle = Math.PI;
    const input = pirateInput(ship, { target: null, waypoint: { x: zone.x, y: zone.y } });
    expect(input.left || input.right).toBe(true);
    expect(input.thrust).toBe(false);
  });
});

describe('isValidTarget', () => {
  it('accepts players in open space only', () => {
    expect(isValidTarget(player(OPEN_SPACE.x, OPEN_SPACE.y))).toBe(true);
    expect(isValidTarget(pirate())).toBe(false);
    const docked = player(OPEN_SPACE.x, OPEN_SPACE.y);
    docked.docked = true;
    expect(isValidTarget(docked)).toBe(false);
    const zone = SAFE_ZONES[0] ?? { x: 0, y: 0 };
    expect(isValidTarget(player(zone.x, zone.y))).toBe(false);
  });
});
