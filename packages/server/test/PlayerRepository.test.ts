import { BASE_LOADOUT, SAFE_ZONES } from '@arena/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlayerRepository, UsernameTakenError } from '../src/db/PlayerRepository';

let repo: PlayerRepository;

beforeEach(() => {
  repo = PlayerRepository.open(':memory:');
});

afterEach(() => {
  repo.close();
});

describe('accounts', () => {
  it('creates and finds an account', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    expect(repo.findAccountByUsername('alice')).toEqual({ id, username: 'alice', passwordHash: 'hash' });
  });

  it('rejects duplicate usernames case-insensitively', () => {
    repo.createAccount('alice', 'hash', 1);
    expect(() => repo.createAccount('ALICE', 'hash', 1)).toThrow(UsernameTakenError);
  });

  it('returns undefined for unknown users', () => {
    expect(repo.findAccountByUsername('nobody')).toBeUndefined();
  });
});

describe('sessions', () => {
  it('finds a session before expiry only', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    repo.createSession('tokenhash', id, 1_000);
    expect(repo.findSession('tokenhash', 999)).toEqual({ accountId: id, username: 'alice' });
    expect(repo.findSession('tokenhash', 1_000)).toBeUndefined();
  });
});

describe('ships', () => {
  it('defaults to a base ship at the first safe zone', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    expect(repo.loadShip(id)).toEqual({
      accountId: id,
      bankedCredits: 0,
      loadout: BASE_LOADOUT,
      x: SAFE_ZONES[0]?.x,
      y: SAFE_ZONES[0]?.y,
    });
  });

  it('round-trips saved ships', () => {
    const id = repo.createAccount('alice', 'hash', 1);
    const record = { accountId: id, bankedCredits: 500, loadout: { ...BASE_LOADOUT, weapon: 2 }, x: 10, y: 20 };
    repo.saveShips([record], 5);
    repo.saveShips([{ ...record, bankedCredits: 700 }], 6);
    expect(repo.loadShip(id)).toEqual({ ...record, bankedCredits: 700 });
  });
});
