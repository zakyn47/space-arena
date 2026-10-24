import { NEW_ACCOUNT_ROCKETS, SAFE_ZONES, STARTER_BUILD } from '@arena/shared';
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
      rockets: NEW_ACCOUNT_ROCKETS,
      x: SAFE_ZONES[0]?.x,
      y: SAFE_ZONES[0]?.y,
    });
  });

  it('round-trips builds and rockets', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    const build = { ...STARTER_BUILD, slots: { ...STARTER_BUILD.slots, utility: [{ gearId: 'armor' as const, mk: 2 as const }] } };
    const record = { accountId: id, bankedCredits: 500, build, rockets: 3, x: 10, y: 20 };
    repo.saveShips([record], 5);
    expect(repo.loadShip(id)).toEqual(record);
  });
});

describe('migration from version 1', () => {
  async function legacyDatabase(): Promise<string> {
    const path = join(await mkdtemp(join(tmpdir(), 'legacy-')), 'arena.db');
    const db = new Database(path);
    db.exec(`
      CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
      CREATE TABLE ships (account_id INTEGER PRIMARY KEY REFERENCES accounts(id), banked_credits INTEGER NOT NULL, hull_tier INTEGER NOT NULL, engine_tier INTEGER NOT NULL, weapon_tier INTEGER NOT NULL, shield_tier INTEGER NOT NULL, cargo_tier INTEGER NOT NULL, pos_x REAL NOT NULL, pos_y REAL NOT NULL, updated_at INTEGER NOT NULL);
      INSERT INTO accounts (username, password_hash, created_at) VALUES ('alice', 'hash', 1);
      INSERT INTO ships VALUES (1, 100, 2, 0, 1, 0, 1, 50, 60, 1);
    `);
    db.close();
    return path;
  }

  it('refunds old upgrades, sets the starter build and 10 rockets', async () => {
    const legacy = PlayerRepository.open(await legacyDatabase());
    expect(legacy.loadShip(1)).toEqual({
      accountId: 1,
      bankedCredits: 100 + 200 + 400 + 250 + 150,
      build: STARTER_BUILD,
      rockets: 10,
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
    first.saveShips([{ accountId: id, bankedCredits: 0, build: STARTER_BUILD, rockets: 4, x: 1, y: 2 }], 1);
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
