import { BASE_LOADOUT, SAFE_ZONES, type Loadout } from '@arena/shared';
import Database from 'better-sqlite3';

export interface AccountRow {
  readonly id: number;
  readonly username: string;
  readonly passwordHash: string;
}

export interface SessionInfo {
  readonly accountId: number;
  readonly username: string;
}

export interface ShipRecord {
  readonly accountId: number;
  readonly bankedCredits: number;
  readonly loadout: Loadout;
  readonly x: number;
  readonly y: number;
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`username taken: ${username}`);
  }
}

interface AccountDbRow {
  id: number;
  username: string;
  password_hash: string;
}

interface SessionDbRow {
  account_id: number;
  username: string;
}

interface ShipDbRow {
  banked_credits: number;
  hull_tier: number;
  engine_tier: number;
  weapon_tier: number;
  shield_tier: number;
  cargo_tier: number;
  pos_x: number;
  pos_y: number;
}

type ShipParams = [number, number, number, number, number, number, number, number, number, number];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ships (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  banked_credits INTEGER NOT NULL,
  hull_tier INTEGER NOT NULL,
  engine_tier INTEGER NOT NULL,
  weapon_tier INTEGER NOT NULL,
  shield_tier INTEGER NOT NULL,
  cargo_tier INTEGER NOT NULL,
  pos_x REAL NOT NULL,
  pos_y REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const UPSERT_SHIP = `
INSERT INTO ships (account_id, banked_credits, hull_tier, engine_tier, weapon_tier, shield_tier, cargo_tier, pos_x, pos_y, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(account_id) DO UPDATE SET
  banked_credits = excluded.banked_credits,
  hull_tier = excluded.hull_tier,
  engine_tier = excluded.engine_tier,
  weapon_tier = excluded.weapon_tier,
  shield_tier = excluded.shield_tier,
  cargo_tier = excluded.cargo_tier,
  pos_x = excluded.pos_x,
  pos_y = excluded.pos_y,
  updated_at = excluded.updated_at
`;

function defaultShip(accountId: number): ShipRecord {
  const spawn = SAFE_ZONES[0];
  return { accountId, bankedCredits: 0, loadout: BASE_LOADOUT, x: spawn?.x ?? 0, y: spawn?.y ?? 0 };
}

function shipParams(record: ShipRecord, now: number): ShipParams {
  const { loadout } = record;
  return [
    record.accountId,
    record.bankedCredits,
    loadout.hull,
    loadout.engine,
    loadout.weapon,
    loadout.shield,
    loadout.cargo,
    record.x,
    record.y,
    now,
  ];
}

export class PlayerRepository {
  private readonly saveMany: (records: readonly ShipRecord[], now: number) => void;

  private constructor(private readonly db: Database.Database) {
    const upsert = db.prepare<ShipParams>(UPSERT_SHIP);
    this.saveMany = db.transaction((records: readonly ShipRecord[], now: number) => {
      for (const record of records) upsert.run(...shipParams(record, now));
    });
  }

  static open(path: string): PlayerRepository {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA);
    return new PlayerRepository(db);
  }

  close(): void {
    this.db.close();
  }

  createAccount(username: string, passwordHash: string, now: number): number {
    try {
      const result = this.db
        .prepare<[string, string, number]>('INSERT INTO accounts (username, password_hash, created_at) VALUES (?, ?, ?)')
        .run(username, passwordHash, now);
      return Number(result.lastInsertRowid);
    } catch (error) {
      if (error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new UsernameTakenError(username);
      }
      throw error;
    }
  }

  findAccountByUsername(username: string): AccountRow | undefined {
    const row = this.db
      .prepare<[string], AccountDbRow>('SELECT id, username, password_hash FROM accounts WHERE username = ?')
      .get(username);
    return row && { id: row.id, username: row.username, passwordHash: row.password_hash };
  }

  createSession(tokenHash: string, accountId: number, expiresAt: number): void {
    this.db
      .prepare<[string, number, number]>('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, accountId, expiresAt);
  }

  findSession(tokenHash: string, now: number): SessionInfo | undefined {
    const row = this.db
      .prepare<[string, number], SessionDbRow>(
        `SELECT s.account_id, a.username FROM sessions s
         JOIN accounts a ON a.id = s.account_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, now);
    return row && { accountId: row.account_id, username: row.username };
  }

  loadShip(accountId: number): ShipRecord {
    const row = this.db
      .prepare<[number], ShipDbRow>(
        `SELECT banked_credits, hull_tier, engine_tier, weapon_tier, shield_tier, cargo_tier, pos_x, pos_y
         FROM ships WHERE account_id = ?`,
      )
      .get(accountId);
    if (!row) return defaultShip(accountId);
    return {
      accountId,
      bankedCredits: row.banked_credits,
      loadout: {
        hull: row.hull_tier,
        engine: row.engine_tier,
        weapon: row.weapon_tier,
        shield: row.shield_tier,
        cargo: row.cargo_tier,
      },
      x: row.pos_x,
      y: row.pos_y,
    };
  }

  saveShips(records: readonly ShipRecord[], now: number): void {
    this.saveMany(records, now);
  }
}
