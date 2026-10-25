import { distanceToNearestZone, type PirateTier } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createPirateShip, createShip, type ShipEntity } from '../src/world/entities';
import { PATROL_RESPAWN, PirateDirector, randomPointInBand, type PirateHost } from '../src/world/pirates/PirateDirector';
import { PIRATE_SPECS } from '../src/world/pirates/tiers';
import { seeded, shipRecord } from './support/fixtures';

class FakeHost implements PirateHost {
  readonly ships = new Map<number, ShipEntity>();
  private nextId = 1;
  spawnPirate(tier: PirateTier, x: number, y: number): ShipEntity {
    const ship = createPirateShip(this.nextId++, tier, x, y);
    this.ships.set(ship.id, ship);
    return ship;
  }
  ship(id: number): ShipEntity | undefined {
    return this.ships.get(id);
  }
  *players(): Iterable<ShipEntity> {
    for (const ship of this.ships.values()) if (ship.npc === null) yield ship;
  }
  addPlayer(x: number, y: number): ShipEntity {
    const ship = createShip(this.nextId++, 99, 'alice', shipRecord(x, y, 99));
    this.ships.set(ship.id, ship);
    return ship;
  }
}

const twoRaiders = [{ band: 'raider' as const, composition: (): PirateTier[] => ['raider', 'raider'] }];

describe('randomPointInBand', () => {
  it('stays inside the band', () => {
    const rng = seeded(9);
    for (let i = 0; i < 200; i += 1) {
      const point = randomPointInBand(rng, PIRATE_SPECS.marauder.band);
      const gap = distanceToNearestZone(point.x, point.y);
      expect(gap).toBeGreaterThanOrEqual(4_000);
      expect(gap).toBeLessThanOrEqual(8_000);
    }
  });
});

describe('PirateDirector', () => {
  it('spawns the default population', () => {
    const host = new FakeHost();
    new PirateDirector(seeded(1)).step(host, 0);
    const tiers = [...host.ships.values()].map((s) => s.npc);
    expect(tiers.filter((t) => t === 'raider')).toHaveLength(8);
    expect(tiers.filter((t) => t === 'warlord')).toHaveLength(1);
    expect(tiers.filter((t) => t === 'marauder').length).toBeGreaterThanOrEqual(8);
    expect(tiers.filter((t) => t === 'marauder').length).toBeLessThanOrEqual(11);
  });

  it('respawns a wiped patrol after 60 s', () => {
    const host = new FakeHost();
    const director = new PirateDirector(seeded(2), twoRaiders);
    director.step(host, 0);
    host.ships.clear();
    director.step(host, 1);
    director.step(host, 1 + PATROL_RESPAWN - 0.1);
    expect(host.ships.size).toBe(0);
    director.step(host, 1 + PATROL_RESPAWN);
    expect(host.ships.size).toBe(2);
  });

  it('shares a target across the patrol and attacks it', () => {
    const host = new FakeHost();
    const director = new PirateDirector(seeded(3), twoRaiders);
    director.step(host, 0);
    const [first, second] = [...host.ships.values()];
    if (!first || !second) throw new Error('missing pirates');
    const victim = host.addPlayer(first.x, first.y - 300);
    second.x = first.x + 600;
    second.y = first.y;
    director.step(host, 0.1);
    expect(first.input.fire || first.input.left || first.input.right).toBe(true);
    expect(second.input.thrust || second.input.left || second.input.right).toBe(true);
    victim.docked = true;
    director.step(host, 0.2);
    expect(first.input.fire).toBe(false);
  });

  it('rolls loot from the tier table', () => {
    const director = new PirateDirector(seeded(4), twoRaiders);
    const loot = director.pirateLoot('warlord');
    expect(loot.credits).toBe(350);
    expect(loot.ore).toBe(6);
  });
});
