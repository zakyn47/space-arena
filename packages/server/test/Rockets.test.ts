import { IDLE_INPUT, ROCKET_COOLDOWN, ROCKET_MAX_SPEED, ROCKET_TURN_RATE } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip } from '../src/world/entities';
import { acquireTarget, launchRocket, steerRocket, tryLaunch } from '../src/world/Rockets';
import { shipRecord } from './support/fixtures';

const at = (id: number, x: number, y: number) => createShip(id, id, `p${id}`, shipRecord(x, y, id));

describe('tryLaunch', () => {
  it('spends ammo and applies the cooldown', () => {
    const ship = at(1, 1_000, 1_000);
    ship.input = { ...IDLE_INPUT, rocket: true };
    expect(tryLaunch(ship, 0.1, false)).toBe(true);
    expect(ship.rockets).toBe(9);
    expect(ship.rocketCooldown).toBe(ROCKET_COOLDOWN);
    expect(tryLaunch(ship, 0.5, false)).toBe(false);
    expect(tryLaunch(ship, 0.6, false)).toBe(true);
  });

  it('refuses without ammo, while shielded or in a safe zone', () => {
    const ship = at(1, 1_000, 1_000);
    ship.input = { ...IDLE_INPUT, rocket: true };
    ship.rockets = 0;
    expect(tryLaunch(ship, 0.1, false)).toBe(false);
    ship.rockets = 5;
    ship.shieldUp = true;
    expect(tryLaunch(ship, 0.1, false)).toBe(false);
    ship.shieldUp = false;
    expect(tryLaunch(ship, 0.1, true)).toBe(false);
  });
});

describe('acquireTarget', () => {
  it('locks the nearest ship inside the forward cone and range', () => {
    const shooter = at(1, 1_000, 1_000);
    const ahead = at(2, 1_000, 500);
    const closerAhead = at(3, 1_100, 800);
    const behind = at(4, 1_000, 1_100);
    const wide = at(5, 1_200, 1_000);
    const far = at(6, 1_000, -500);
    expect(acquireTarget(shooter, [shooter, ahead, closerAhead, behind, wide, far])?.id).toBe(3);
    expect(acquireTarget(shooter, [shooter, behind, wide, far])).toBeNull();
  });
});

describe('steerRocket', () => {
  it('turns toward the target no faster than the turn rate and accelerates', () => {
    const shooter = at(1, 1_000, 1_000);
    const rocket = launchRocket(shooter, 50, 0, null);
    steerRocket(rocket, { x: 2_000, y: 1_000 }, 0.1);
    expect(rocket.angle).toBeCloseTo(ROCKET_TURN_RATE * 0.1);
    expect(rocket.speed).toBeCloseTo(340);
    for (let i = 0; i < 100; i += 1) steerRocket(rocket, undefined, 0.1);
    expect(rocket.speed).toBe(ROCKET_MAX_SPEED);
  });

  it('flies straight without a target', () => {
    const rocket = launchRocket(at(1, 1_000, 1_000), 50, 0, null);
    steerRocket(rocket, undefined, 0.1);
    expect(rocket.angle).toBe(0);
    expect(rocket.y).toBeLessThan(rocket.prevY);
  });
});

describe('npc targeting', () => {
  it('pirate rockets ignore other pirates', () => {
    const shooter = at(1, 1_000, 1_000);
    shooter.npc = 'raider';
    const pirate = at(2, 1_000, 800);
    pirate.npc = 'raider';
    const player = at(3, 1_000, 600);
    expect(acquireTarget(shooter, [pirate, player])?.id).toBe(3);
  });
});
