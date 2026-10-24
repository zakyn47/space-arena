import { NEW_CAPTAIN, ORDNANCE_TYPES, parseCaptain, type Captain, NEW_ACCOUNT_ROCKETS, SAFE_ZONES, STARTER_BUILD, parseBuild, parseSalvage, type Build, type InstalledGear, type Ordnance } from '@arena/shared';
import Database from 'better-sqlite3';
import { migrate } from './migrations';

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
  readonly build: Build;
  readonly captain: Captain;
  readonly ordnance: Ordnance;
  readonly rockets: number;
  readonly salvage: readonly InstalledGear[];
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
  hull_id: string;
  gear_json: string;
  captain_json: string;
  ordnance: string;
  rockets: number;
  salvage_json: string;
  pos_x: number;
  pos_y: number;
}

type ShipParams = [number, number, string, string, string, number, string, string, number, number, number];

const UPSERT_SHIP = `
INSERT INTO ships (account_id, banked_credits, hull_id, gear_json, ordnance, rockets, salvage_json, captain_json, pos_x, pos_y, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(account_id) DO UPDATE SET
  banked_credits = excluded.banked_credits,
  hull_id = excluded.hull_id,
  gear_json = excluded.gear_json,
  ordnance = excluded.ordnance,
  rockets = excluded.rockets,
  salvage_json = excluded.salvage_json,
  captain_json = excluded.captain_json,
  pos_x = excluded.pos_x,
  pos_y = excluded.pos_y,
  updated_at = excluded.updated_at
`;

function safeJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}

function defaultShip(accountId: number): ShipRecord {
  const spawn = SAFE_ZONES[0];
  return {
    accountId,
    bankedCredits: 0,
    build: STARTER_BUILD,
    captain: NEW_CAPTAIN,
    ordnance: 'rockets',
    rockets: NEW_ACCOUNT_ROCKETS,
    salvage: [],
    x: spawn?.x ?? 0,
    y: spawn?.y ?? 0,
  };
}

function shipParams(record: ShipRecord, now: number): ShipParams {
  return [
    record.accountId,
    record.bankedCredits,
    record.build.hullId,
    JSON.stringify(record.build.slots),
    record.ordnance,
    record.rockets,
    JSON.stringify(record.salvage),
    JSON.stringify(record.captain),
    record.x,
    record.y,
    now,
  ];
}

export class PlayerRepository {
  private readonly saveMany: (records: readonly ShipRecord[], now: number) => void;

  private constructor(
    private readonly db: Database.Database,
    private readonly warn: (message: string) => void,
  ) {
    const upsert = db.prepare<ShipParams>(UPSERT_SHIP);
    this.saveMany = db.transaction((records: readonly ShipRecord[], now: number) => {
      for (const record of records) upsert.run(...shipParams(record, now));
    });
  }

  static open(path: string, warn: (message: string) => void = console.warn): PlayerRepository {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    migrate(db);
    return new PlayerRepository(db, warn);
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
        'SELECT banked_credits, hull_id, gear_json, ordnance, rockets, salvage_json, captain_json, pos_x, pos_y FROM ships WHERE account_id = ?',
      )
      .get(accountId);
    if (!row) return defaultShip(accountId);
    return {
      accountId,
      bankedCredits: row.banked_credits,
      build: this.decodeBuild(accountId, row),
      captain: this.decodeCaptain(accountId, row),
      ...this.decodeOrdnance(accountId, row),
      salvage: this.decodeSalvage(accountId, row),
      x: row.pos_x,
      y: row.pos_y,
    };
  }

  // Ammo only makes sense for its own type, so an unreadable type drops the ammo too.
  private decodeOrdnance(accountId: number, row: ShipDbRow): Pick<ShipRecord, 'ordnance' | 'rockets'> {
    const ordnance = ORDNANCE_TYPES.find((type) => type === row.ordnance);
    if (ordnance) return { ordnance, rockets: row.rockets };
    this.warn(`invalid stored ordnance for account ${accountId}; using rockets`);
    return { ordnance: 'rockets', rockets: 0 };
  }

  private decodeCaptain(accountId: number, row: ShipDbRow): Captain {
    const captain = parseCaptain(safeJson(row.captain_json));
    if (captain) return captain;
    this.warn(`invalid stored captain for account ${accountId}; using new captain`);
    return NEW_CAPTAIN;
  }

  private decodeBuild(accountId: number, row: ShipDbRow): Build {
    const build = parseBuild({ hullId: row.hull_id, slots: safeJson(row.gear_json) });
    if (build) return build;
    this.warn(`invalid stored build for account ${accountId}; using starter build`);
    return STARTER_BUILD;
  }

  private decodeSalvage(accountId: number, row: ShipDbRow): InstalledGear[] {
    const salvage = parseSalvage(safeJson(row.salvage_json));
    if (salvage) return salvage;
    this.warn(`invalid stored salvage for account ${accountId}; using empty hold`);
    return [];
  }

  saveShips(records: readonly ShipRecord[], now: number): void {
    this.saveMany(records, now);
  }
}
