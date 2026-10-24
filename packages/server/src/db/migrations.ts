import { NEW_CAPTAIN, NEW_ACCOUNT_ROCKETS, STARTER_BUILD } from '@arena/shared';
import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 4;

export const BASE_SCHEMA = `
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
`;

const SHIPS_V2 = `
CREATE TABLE IF NOT EXISTS ships (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  banked_credits INTEGER NOT NULL,
  hull_id TEXT NOT NULL,
  gear_json TEXT NOT NULL,
  rockets INTEGER NOT NULL,
  pos_x REAL NOT NULL,
  pos_y REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const LEGACY_BASE_COST = {
  hull_tier: 200,
  engine_tier: 200,
  weapon_tier: 250,
  shield_tier: 200,
  cargo_tier: 150,
} as const;

type LegacyColumn = keyof typeof LEGACY_BASE_COST;

const LEGACY_COLUMNS: readonly LegacyColumn[] = ['hull_tier', 'engine_tier', 'weapon_tier', 'shield_tier', 'cargo_tier'];

type LegacyTiers = Readonly<Record<LegacyColumn, number>>;

interface LegacyShipRow extends LegacyTiers {
  readonly account_id: number;
  readonly banked_credits: number;
  readonly pos_x: number;
  readonly pos_y: number;
  readonly updated_at: number;
}

export function legacyUpgradeValue(tiers: LegacyTiers): number {
  let total = 0;
  for (const column of LEGACY_COLUMNS) {
    for (let level = 1; level <= tiers[column]; level += 1) total += LEGACY_BASE_COST[column] * 2 ** (level - 1);
  }
  return total;
}

function userVersion(db: Database.Database): number {
  const value: unknown = db.pragma('user_version', { simple: true });
  return typeof value === 'number' ? value : 0;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return db
    .prepare<[string], { name: string }>('SELECT name FROM pragma_table_info(?)')
    .all(table)
    .some((row) => row.name === column);
}

function migrateTierShips(db: Database.Database): void {
  const rows = db.prepare<[], LegacyShipRow>('SELECT * FROM ships').all();
  db.exec('ALTER TABLE ships RENAME TO ships_v1');
  db.exec(SHIPS_V2);
  const insert = db.prepare<[number, number, string, string, number, number, number, number]>(
    'INSERT INTO ships (account_id, banked_credits, hull_id, gear_json, rockets, pos_x, pos_y, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const row of rows) {
    insert.run(
      row.account_id,
      row.banked_credits + legacyUpgradeValue(row),
      STARTER_BUILD.hullId,
      JSON.stringify(STARTER_BUILD.slots),
      NEW_ACCOUNT_ROCKETS,
      row.pos_x,
      row.pos_y,
      row.updated_at,
    );
  }
  db.exec('DROP TABLE ships_v1');
}

function toVersion2(db: Database.Database): void {
  if (hasColumn(db, 'ships', 'hull_tier')) migrateTierShips(db);
  else db.exec(SHIPS_V2);
}

function toVersion3(db: Database.Database): void {
  db.exec("ALTER TABLE ships ADD COLUMN salvage_json TEXT NOT NULL DEFAULT '[]'");
}

function toVersion4(db: Database.Database): void {
  db.exec(`ALTER TABLE ships ADD COLUMN captain_json TEXT NOT NULL DEFAULT '${JSON.stringify(NEW_CAPTAIN)}'`);
}

export function migrate(db: Database.Database): void {
  db.exec(BASE_SCHEMA);
  const from = userVersion(db);
  if (from >= SCHEMA_VERSION) return;
  db.transaction(() => {
    if (from < 2) toVersion2(db);
    if (from < 3) toVersion3(db);
    if (from < 4) toVersion4(db);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}
