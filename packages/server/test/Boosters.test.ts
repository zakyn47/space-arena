import { SAFE_ZONES, SPEED_BOOST_DURATION, zoneAt } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { applyBooster, randomBoosterSpot } from '../src/world/Boosters';
import { createShip } from '../src/world/entities';
import { seeded, shipRecord } from './support/fixtures';

const pilot = () => createShip(1, 1, 'alice', shipRecord(1_000, 1_000, 1));

describe('applyBooster', () => {
  it('repairs half of max hull, capped at full', () => {
    const ship = pilot();
    ship.hull = 10;
    applyBooster(ship, 'repair', 0);
    expect(ship.hull).toBe(10 + ship.stats.maxHull / 2);
    ship.hull = ship.stats.maxHull - 5;
    applyBooster(ship, 'repair', 0);
    expect(ship.hull).toBe(ship.stats.maxHull);
  });

  it('heals nothing past max hull at full health', () => {
    const ship = pilot();
    applyBooster(ship, 'repair', 0);
    expect(ship.hull).toBe(ship.stats.maxHull);
  });

  it('starts or restarts a ten second speed boost', () => {
    const ship = pilot();
    applyBooster(ship, 'speed', 5);
    expect(ship.speedBoostUntil).toBe(5 + SPEED_BOOST_DURATION);
    applyBooster(ship, 'speed', 8);
    expect(ship.speedBoostUntil).toBe(8 + SPEED_BOOST_DURATION);
  });
});

describe('randomBoosterSpot', () => {
  it('never lands in a safe zone', () => {
    const rng = seeded(4);
    for (let i = 0; i < 500; i += 1) {
      const spot = randomBoosterSpot(rng);
      expect(zoneAt(spot.x, spot.y)).toBeUndefined();
    }
    expect(SAFE_ZONES.length).toBeGreaterThan(0);
  });
});
