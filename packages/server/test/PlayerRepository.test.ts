import { NEW_CAPTAIN, NEW_ACCOUNT_ROCKETS, SAFE_ZONES, STARTER_BUILD } from '@arena/shared';
import Database from 'better-sqlite3';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerRepository, UsernameTakenError } from '../src/db/PlayerRepository';

let repo: PlayerRepository;

beforeEach(() => {
  repo = PlayerRepository.open(':memory:');
});

afterEach(() => {
  repo.close();
});

describe('accounts and sessions', () => {
  it('creates and finds an account', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    expect(repo.findAccountByUsername('alice')).toEqual({ id, username: 'alice', passwordHash: 'hash' });
    expect(() => repo.createAccount('ALICE', 'hash', 1)).toThrow(UsernameTakenError);
  });

  it('finds a session before expiry only', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    repo.createSession('tokenhash', id, 1_000);
    expect(repo.findSession('tokenhash', 999)).toEqual({ accountId: id, username: 'alice' });
    expect(repo.findSession('tokenhash', 1_000)).toBeUndefined();
  });
});

describe('ships', () => {
  it('defaults to the starter build with new-account rockets', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    expect(repo.loadShip(id)).toEqual({
      accountId: id,
      bankedCredits: 0,
      build: STARTER_BUILD,
      captain: NEW_CAPTAIN,
      ordnance: 'rockets',
      rockets: NEW_ACCOUNT_ROCKETS,
      pvpKills: 0,
      salvage: [],
      x: SAFE_ZONES[0]?.x,
      y: SAFE_ZONES[0]?.y,
    });
  });

  it('round-trips builds and rockets', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    const build = { ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, utility: [{ gearId: 'armor' as const, mk: 2 as const }] } };
    const record = { captain: NEW_CAPTAIN, accountId: id, bankedCredits: 500, build, ordnance: 'rockets' as const, pvpKills: 0, rockets: 3, salvage: [{ gearId: 'armor' as const, mk: 2 as const }], x: 10, y: 20 };
    repo.saveShips([record], 5);
    expect(repo.loadShip(id)).toEqual(record);
  });
});

describe('migration from version 1', () => {
  async function legacyDatabase(version = 0): Promise<string> {
    const path = join(await mkdtemp(join(tmpdir(), 'legacy-')), 'arena.db');
    const db = new Database(path);
    db.exec(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
      CREATE TABLE ships (account_id INTEGER PRIMARY KEY REFERENCES accounts(id), banked_credits INTEGER NOT NULL, hull_tier INTEGER NOT NULL, engine_tier INTEGER NOT NULL, weapon_tier INTEGER NOT NULL, shield_tier INTEGER NOT NULL, cargo_tier INTEGER NOT NULL, pos_x REAL NOT NULL, pos_y REAL NOT NULL, updated_at INTEGER NOT NULL);
      INSERT INTO accounts (username, password_hash, created_at) VALUES ('alice', 'hash', 1);
      INSERT INTO ships VALUES (1, 100, 2, 0, 1, 0, 1, 50, 60, 1);
    `);
    db.pragma(`user_version = ${version}`);
    db.close();
    return path;
  }

  it.each([0, 1])('migrates legacy version %i, refunds upgrades and preserves the ship', async (version) => {
    const legacy = PlayerRepository.open(await legacyDatabase(version));
    expect(legacy.loadShip(1)).toEqual({
      accountId: 1,
      bankedCredits: 100 + 200 + 400 + 250 + 150,
      build: STARTER_BUILD,
      captain: NEW_CAPTAIN,
      ordnance: 'rockets',
      rockets: 10,
      pvpKills: 0,
      salvage: [],
      x: 50,
      y: 60,
    });
    legacy.close();
  });

  it('runs only once', async () => {
    const path = await legacyDatabase();
    PlayerRepository.open(path).close();
    const reopened = PlayerRepository.open(path);
    expect(reopened.loadShip(1).bankedCredits).toBe(1_100);
    reopened.close();
  });
});

describe('invalid stored builds', () => {
  it('falls back to the starter build and warns', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'bad-')), 'arena.db');
    const warnings: string[] = [];
    const first = PlayerRepository.open(path);
    const id = first.createAccount('alice', 'hash', 1);
    first.saveShips([{ captain: NEW_CAPTAIN, accountId: id, bankedCredits: 0, build: STARTER_BUILD, ordnance: 'rockets' as const, pvpKills: 0, rockets: 4, salvage: [], x: 1, y: 2 }], 1);
    first.close();
    const db = new Database(path);
    db.prepare("UPDATE ships SET gear_json = '{\"weapon\":[{\"gearId\":\"laser9000\",\"mk\":1}]}'").run();
    db.close();
    const second = PlayerRepository.open(path, (message) => warnings.push(message));
    expect(second.loadShip(id).build).toEqual(STARTER_BUILD);
    expect(second.loadShip(id).rockets).toBe(4);
    expect(warnings[0]).toContain(`account ${id}`);
    second.close();
  });
});

describe('migration to version 3', () => {
  it('adds an empty salvage hold to version-2 ships', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'v2-')), 'arena.db');
    const db = new Database(path);
    db.exec(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
      CREATE TABLE ships (account_id INTEGER PRIMARY KEY REFERENCES accounts(id), banked_credits INTEGER NOT NULL, hull_id TEXT NOT NULL, gear_json TEXT NOT NULL, rockets INTEGER NOT NULL, pos_x REAL NOT NULL, pos_y REAL NOT NULL, updated_at INTEGER NOT NULL);
      INSERT INTO accounts (username, password_hash, created_at) VALUES ('alice', 'hash', 1);
      PRAGMA user_version = 2;
    `);
    db.prepare('INSERT INTO ships VALUES (1, 77, ?, ?, 3, 5, 6, 1)').run('scout', JSON.stringify(STARTER_BUILD.slots));
    db.close();
    const repo3 = PlayerRepository.open(path);
    expect(repo3.loadShip(1)).toMatchObject({ bankedCredits: 77, rockets: 3, salvage: [] });
    repo3.close();
  });

  it('falls back to an empty hold for invalid salvage', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'bad-salvage-')), 'arena.db');
    const warnings: string[] = [];
    const first = PlayerRepository.open(path);
    const id = first.createAccount('alice', 'hash', 1);
    first.saveShips([{ captain: NEW_CAPTAIN, accountId: id, bankedCredits: 0, build: STARTER_BUILD, ordnance: 'rockets' as const, pvpKills: 0, rockets: 4, salvage: [], x: 1, y: 2 }], 1);
    first.close();
    const db = new Database(path);
    db.prepare("UPDATE ships SET salvage_json = '[{\"gearId\":\"x\",\"mk\":9}]'").run();
    db.close();
    const second = PlayerRepository.open(path, (message) => warnings.push(message));
    expect(second.loadShip(id).salvage).toEqual([]);
    expect(warnings.some((w) => w.includes('salvage'))).toBe(true);
    second.close();
  });
});


describe('captain persistence', () => {
  it('preserves captain XP and skills on save and reload', () => {
    const id = repo.createAccount('captain', 'hash', 1);
    const captain = { xp: 300, skills: { gunnery: 2, engineering: 1, piloting: 1, mining: 0 } };
    repo.saveShips([{ ...repo.loadShip(id), captain }], 5);
    expect(repo.loadShip(id).captain).toEqual(captain);
  });

  it('migrates version 3 without changing ship data and runs only once', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'v3-')), 'arena.db');
    const first = PlayerRepository.open(path);
    const id = first.createAccount('captain', 'hash', 1);
    first.saveShips([{ ...first.loadShip(id), bankedCredits: 700 }], 1);
    first.close();
    const db = new Database(path);
    db.exec('ALTER TABLE ships DROP COLUMN captain_json; ALTER TABLE ships DROP COLUMN ordnance; ALTER TABLE ships DROP COLUMN pvp_kills; PRAGMA user_version = 3');
    db.close();
    const migrated = PlayerRepository.open(path);
    expect(migrated.loadShip(id)).toMatchObject({ bankedCredits: 700, captain: NEW_CAPTAIN });
    const captain = { xp: 100, skills: { gunnery: 3, engineering: 1, piloting: 0, mining: 0 } };
    migrated.saveShips([{ ...migrated.loadShip(id), captain }], 2);
    migrated.close();
    const reopened = PlayerRepository.open(path);
    expect(reopened.loadShip(id).captain).toEqual(captain);
    reopened.close();
  });

  it('warns and safely defaults corrupt captain data without losing the ship', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'bad-captain-')), 'arena.db');
    const first = PlayerRepository.open(path);
    const id = first.createAccount('captain', 'hash', 1);
    first.saveShips([{ ...first.loadShip(id), bankedCredits: 500 }], 1);
    first.close();
    const db = new Database(path);
    db.prepare('UPDATE ships SET captain_json = ?').run('{"xp":-100}');
    db.close();
    const warnings: string[] = [];
    const second = PlayerRepository.open(path, (message) => warnings.push(message));
    expect(second.loadShip(id)).toMatchObject({ captain: NEW_CAPTAIN, bankedCredits: 500 });
    expect(warnings[0]).toContain(`captain for account ${id}`);
    second.close();
  });
});

describe('ordnance persistence', () => {
  it('stores the ordnance type with the ammo count', () => {
    const id = repo.createAccount('miner', 'hash', 1);
    expect(repo.loadShip(id).ordnance).toBe('rockets');
    repo.saveShips([{ ...repo.loadShip(id), ordnance: 'mines', rockets: 4 }], 5);
    expect(repo.loadShip(id)).toMatchObject({ ordnance: 'mines', rockets: 4 });
  });

  it('migrates version 4 ships to rockets without changing ship data', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'v4-')), 'arena.db');
    const first = PlayerRepository.open(path);
    const id = first.createAccount('pilot', 'hash', 1);
    first.saveShips([{ ...first.loadShip(id), bankedCredits: 900, rockets: 3 }], 1);
    first.close();
    const db = new Database(path);
    db.exec('ALTER TABLE ships DROP COLUMN ordnance; ALTER TABLE ships DROP COLUMN pvp_kills; PRAGMA user_version = 4');
    db.close();
    const migrated = PlayerRepository.open(path);
    expect(migrated.loadShip(id)).toMatchObject({ bankedCredits: 900, rockets: 3, ordnance: 'rockets' });
    migrated.close();
  });

  it('warns and falls back to rockets for an unknown stored ordnance', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'bad-ordnance-')), 'arena.db');
    const first = PlayerRepository.open(path);
    const id = first.createAccount('pilot', 'hash', 1);
    first.saveShips([{ ...first.loadShip(id), ordnance: 'mines', rockets: 2 }], 1);
    first.close();
    const db = new Database(path);
    db.prepare('UPDATE ships SET ordnance = ?').run('nukes');
    db.close();
    const warnings: string[] = [];
    const second = PlayerRepository.open(path, (message) => warnings.push(message));
    expect(second.loadShip(id)).toMatchObject({ ordnance: 'rockets', rockets: 0 });
    expect(warnings[0]).toContain(`ordnance for account ${id}`);
    second.close();
  });
});

describe('pvp highscores', () => {
  function pilot(name: string, pvpKills: number): void {
    const id = repo.createAccount(name, 'hash', 1);
    repo.saveShips([{ ...repo.loadShip(id), pvpKills }], 1);
  }

  it('round-trips the kill count', () => {
    const id = repo.createAccount('ace', 'hash', 1);
    repo.saveShips([{ ...repo.loadShip(id), pvpKills: 7 }], 1);
    expect(repo.loadShip(id).pvpKills).toBe(7);
  });

  it('ranks pilots by kills, shares tied ranks and skips pilots without kills', () => {
    pilot('carol', 3);
    pilot('alice', 5);
    pilot('bob', 3);
    pilot('dave', 1);
    pilot('erin', 0);
    repo.createAccount('frank', 'hash', 1);
    expect(repo.highscores(10)).toEqual([
      { rank: 1, username: 'alice', kills: 5 },
      { rank: 2, username: 'bob', kills: 3 },
      { rank: 2, username: 'carol', kills: 3 },
      { rank: 4, username: 'dave', kills: 1 },
    ]);
  });

  it('limits the list', () => {
    for (let i = 0; i < 12; i += 1) pilot(`pilot${i}`, 20 - i);
    expect(repo.highscores(10)).toHaveLength(10);
  });

  it('migrates version 5 ships to zero kills', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'v5-')), 'arena.db');
    const first = PlayerRepository.open(path);
    const id = first.createAccount('pilot', 'hash', 1);
    first.saveShips([{ ...first.loadShip(id), bankedCredits: 300 }], 1);
    first.close();
    const db = new Database(path);
    db.exec('ALTER TABLE ships DROP COLUMN pvp_kills; PRAGMA user_version = 5');
    db.close();
    const migrated = PlayerRepository.open(path);
    expect(migrated.loadShip(id)).toMatchObject({ bankedCredits: 300, pvpKills: 0 });
    migrated.close();
  });
});
