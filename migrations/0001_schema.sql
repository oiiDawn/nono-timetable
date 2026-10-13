CREATE TABLE lessons (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL CHECK (date(start_date) IS NOT NULL AND date(start_date) = start_date),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  repeat_rule TEXT CHECK (repeat_rule IS NULL OR json_valid(repeat_rule)),
  location TEXT CHECK (location IS NULL OR json_valid(location)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE lesson_presets (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  location TEXT CHECK (location IS NULL OR json_valid(location)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY NOT NULL,
  metadata TEXT NOT NULL CHECK (json_valid(metadata)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE oauth_requests (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  expires_at TEXT NOT NULL
);
CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id),
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE oauth_tokens (
  hash TEXT PRIMARY KEY NOT NULL,
  grant_id TEXT NOT NULL REFERENCES oauth_grants(id),
  kind TEXT NOT NULL CHECK (kind IN ('code', 'access', 'refresh')),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
  expires_at TEXT
);
CREATE INDEX oauth_tokens_grant ON oauth_tokens(grant_id);
