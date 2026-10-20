
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  color TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins >= 0),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS colleagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  bio TEXT NOT NULL,
  look TEXT NOT NULL,
  skill_kind TEXT NOT NULL,
  skill_value INTEGER NOT NULL,
  self_player_id TEXT REFERENCES players(id),
  owner_id TEXT REFERENCES players(id),
  desk_slot INTEGER,
  last_price INTEGER,
  trades INTEGER NOT NULL DEFAULT 0,
  earnings INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  acquired_at INTEGER,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_desk ON colleagues(owner_id, desk_slot) WHERE owner_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  colleague_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  seller_id TEXT,
  self_player_id TEXT,
  price INTEGER NOT NULL,
  owner_share INTEGER NOT NULL,
  self_share INTEGER NOT NULL,
  system_share INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,          -- 'player:<id>' | 'colleague:<id>' | 'system'
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger(account);
CREATE TABLE IF NOT EXISTS project_runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  skills TEXT NOT NULL,
  status TEXT NOT NULL,            -- active | claimed | expired
  reward INTEGER,
  result TEXT,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_player ON project_runs(player_id, status);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,                  -- NULL = 全服动态
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_player ON messages(player_id, id);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS social_rewards (
  pair_key TEXT PRIMARY KEY,
  claimed_at INTEGER NOT NULL
);
