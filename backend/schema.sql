
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
CREATE TABLE IF NOT EXISTS identity_bindings (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  PRIMARY KEY(provider, subject),
  UNIQUE(provider, player_id)
);
-- Separate table keeps old databases compatible. Unscoped legacy sessions are Demo only.
CREATE TABLE IF NOT EXISTS identity_sessions (
  token TEXT PRIMARY KEY REFERENCES sessions(token) ON DELETE CASCADE,
  provider TEXT NOT NULL
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
CREATE TABLE IF NOT EXISTS player_careers (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  rank INTEGER NOT NULL DEFAULT 0 CHECK (rank BETWEEN 0 AND 4),
  performance INTEGER NOT NULL DEFAULT 0 CHECK (performance >= 0),
  completed_projects INTEGER NOT NULL DEFAULT 0 CHECK (completed_projects >= 0)
);
CREATE TABLE IF NOT EXISTS player_years (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  year INTEGER NOT NULL DEFAULT 1,
  rounds INTEGER NOT NULL DEFAULT 0 CHECK(rounds BETWEEN 0 AND 3),
  rank INTEGER NOT NULL DEFAULT 0,
  team_points INTEGER NOT NULL DEFAULT 0,
  play_points INTEGER NOT NULL DEFAULT 0,
  friend_pct INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS year_awards (
  player_id TEXT NOT NULL REFERENCES players(id),
  year INTEGER NOT NULL,
  award TEXT NOT NULL,
  PRIMARY KEY(player_id,year)
);
CREATE TABLE IF NOT EXISTS player_items (
  player_id TEXT NOT NULL REFERENCES players(id),
  item_id TEXT NOT NULL,
  PRIMARY KEY(player_id,item_id)
);
CREATE TABLE IF NOT EXISTS player_styles (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  shirt TEXT NOT NULL DEFAULT '',accessory TEXT NOT NULL DEFAULT '',aura TEXT NOT NULL DEFAULT '',
  boss_shirt TEXT NOT NULL DEFAULT '',boss_accessory TEXT NOT NULL DEFAULT '',boss_aura TEXT NOT NULL DEFAULT ''
);

-- Milk-tea mainline: independent shops and immutable runs share the player wallet.
CREATE TABLE IF NOT EXISTS tea_shops (
 player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
 level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 3),
 best INTEGER NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tea_avatars (
 player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS tea_runs (
 id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL, request_body TEXT NOT NULL, mode TEXT NOT NULL,
 day TEXT NOT NULL, completed INTEGER NOT NULL, bonus INTEGER NOT NULL, result TEXT NOT NULL,
 created_at INTEGER NOT NULL, UNIQUE(player_id,request_key)
);
CREATE INDEX IF NOT EXISTS idx_tea_runs_player_day ON tea_runs(player_id,day,mode);
CREATE TABLE IF NOT EXISTS tea_jobs (
 run_id TEXT NOT NULL REFERENCES tea_runs(id) ON DELETE CASCADE,
 employee_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 employer_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 worker_name TEXT NOT NULL, role TEXT NOT NULL, salary INTEGER NOT NULL,
 completed INTEGER NOT NULL, day TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(run_id,employee_id)
);
CREATE INDEX IF NOT EXISTS idx_tea_jobs_employee_day ON tea_jobs(employee_id,day);

-- tea.2: durable interactive services; the immutable run is written only on close.
CREATE TABLE IF NOT EXISTS tea_chapters (
 player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
 stage INTEGER NOT NULL DEFAULT 0, solo_best INTEGER NOT NULL DEFAULT 0,
 duo_best INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tea_sessions (
 id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL, request_body TEXT NOT NULL, mode TEXT NOT NULL,
 day TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL,
 UNIQUE(player_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tea_one_active ON tea_sessions(player_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS tea_live_jobs (
 session_id TEXT NOT NULL REFERENCES tea_sessions(id) ON DELETE CASCADE,
 employee_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 day TEXT NOT NULL, PRIMARY KEY(session_id,employee_id)
);
CREATE INDEX IF NOT EXISTS idx_tea_live_jobs_day ON tea_live_jobs(employee_id,day);

-- tea.3: an optional, persistent phone mission in the walkable town.
CREATE TABLE IF NOT EXISTS tea_missions (
 player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
 accepted_at INTEGER NOT NULL, completed_at INTEGER NOT NULL DEFAULT 0,
 income INTEGER NOT NULL DEFAULT 0, run_id TEXT REFERENCES tea_runs(id)
);

-- tea.4: durable business goals, separate from old teaching records.
CREATE TABLE IF NOT EXISTS tea_business_progress (
 player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
 regular_best INTEGER NOT NULL DEFAULT 0,
 flagship_best INTEGER NOT NULL DEFAULT 0
);
