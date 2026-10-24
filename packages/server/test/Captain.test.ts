import { NEW_CAPTAIN, SAFE_ZONES, captainPoints, captainLevel } from '@arena/shared';
import { describe, expect, it } from 'vitest';
import { createShip, respawnShip, toShipRecord } from '../src/world/entities';
import { applyShopAction } from '../src/world/Shop';
import { toggleDock } from '../src/world/Docking';
import { World } from '../src/world/World';
import { OPEN_SPACE, shipRecord } from './support/fixtures';

const trained = { ...NEW_CAPTAIN, skills: { ...NEW_CAPTAIN.skills, piloting: 3 } };

describe('captain training', () => {
  it('requires docking, spends exactly one point and updates real ship stats', () => {
    const ship = createShip(1, 1, 'captain', shipRecord(0, 0));
    const before = structuredClone(ship);
    expect(applyShopAction(ship, { type: 'trainCaptain', skill: 'engineering' })).toEqual({ ok: false, reason: 'not_docked' });
    expect(ship).toEqual(before);
    ship.docked = true;
    expect(applyShopAction(ship, { type: 'trainCaptain', skill: 'engineering' })).toEqual({ ok: true });
    expect(ship.stats.maxHull).toBe(84);
    expect(ship.stats.maxShield).toBe(105);
    expect(captainPoints(ship.captain)).toBe(2);
    applyShopAction(ship, { type: 'trainCaptain', skill: 'engineering' });
    applyShopAction(ship, { type: 'trainCaptain', skill: 'gunnery' });
    const complete = structuredClone(ship);
    expect(applyShopAction(ship, { type: 'trainCaptain', skill: 'mining' })).toEqual({ ok: false, reason: 'no_skill_points' });
    expect(ship).toEqual(complete);
    ship.captain = { xp: 19_000, skills: { ...NEW_CAPTAIN.skills, engineering: 10 } };
    expect(applyShopAction(ship, { type: 'trainCaptain', skill: 'engineering' })).toEqual({ ok: false, reason: 'skill_maxed' });
  });

  it('requires the three initial choices before undocking', () => {
    const ship = createShip(1, 1, 'captain', shipRecord(SAFE_ZONES[0].x, SAFE_ZONES[0].y));
    ship.docked = true;
    expect(toggleDock(ship, 0)).toEqual({ ok: false, reason: 'captain_untrained' });
    expect(ship.docked).toBe(true);
    ship.captain = trained;
    expect(toggleDock(ship, 0)).toMatchObject({ ok: true, docked: false });
  });

  it('preserves the captain through hull trades, gear changes and ship destruction', () => {
    const ship = createShip(1, 1, 'captain', shipRecord(0, 0));
    ship.docked = true;
    ship.bankedCredits = 10_000;
    applyShopAction(ship, { type: 'trainCaptain', skill: 'engineering' });
    const captain = ship.captain;
    applyShopAction(ship, { type: 'buyHull', hullId: 'fighter' });
    expect(ship.stats.maxHull).toBe(126);
    applyShopAction(ship, { type: 'buyGear', gearId: 'armor', mk: 1, slot: { type: 'utility', index: 0 } });
    expect(ship.stats.maxHull).toBe(158);
    respawnShip(ship, 0, 0);
    expect(ship.captain).toEqual(captain);
    expect(ship.stats.maxHull).toBe(84);
    expect(toShipRecord(ship).captain).toEqual(captain);
  });
});

describe('server-awarded experience', () => {
  it('awards ore XP once on banking and unlocks the next point', () => {
    const ship = createShip(1, 1, 'captain', { ...shipRecord(SAFE_ZONES[0].x, SAFE_ZONES[0].y), captain: trained });
    ship.ore = 10;
    expect(toggleDock(ship, 0).ok).toBe(true);
    expect(ship.captain.xp).toBe(100);
    expect(captainLevel(ship.captain)).toBe(2);
    expect(captainPoints(ship.captain)).toBe(1);
    toggleDock(ship, 0);
    toggleDock(ship, 31);
    expect(ship.captain.xp).toBe(100);
  });

  it('awards pirate and player kill XP exactly once while preserving victim progression', () => {
    const world = new World({ asteroidTarget: 0 });
    const killer = world.addShip(1, 'killer', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y));
    const pirate = world.addShip(-2, 'pirate', shipRecord(OPEN_SPACE.x + 500, OPEN_SPACE.y));
    pirate.npc = 'warlord';
    pirate.hull = 0;
    pirate.lastHitBy = killer.id;
    world.tick(0);
    expect(killer.captain.xp).toBe(250);
    const victim = world.addShip(2, 'victim', { ...shipRecord(OPEN_SPACE.x, OPEN_SPACE.y + 500), captain: trained });
    victim.hull = 0;
    victim.lastHitBy = killer.id;
    world.tick(0);
    expect(killer.captain.xp).toBe(350);
    expect(victim.captain).toEqual(trained);
    world.tick(0);
    expect(killer.captain.xp).toBe(350);
  });

  it('does not award XP to self kills or NPC captains', () => {
    const world = new World({ asteroidTarget: 0 });
    const ship = world.addShip(1, 'self', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y));
    ship.lastHitBy = ship.id;
    ship.hull = 0;
    world.tick(0);
    expect(ship.captain.xp).toBe(0);
    const pirate = world.addShip(-2, 'pirate', shipRecord(OPEN_SPACE.x, OPEN_SPACE.y));
    pirate.npc = 'raider';
    ship.lastHitBy = pirate.id;
    ship.hull = 0;
    world.tick(0);
    expect(pirate.captain.xp).toBe(0);
  });
});
