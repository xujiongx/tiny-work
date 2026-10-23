// SQLite schema for 案头 / Deskwork.
// Kept as a JS module (not .sql) so the whole module graph is bundled in builds.

export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'moss',
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'archived')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id           TEXT PRIMARY KEY,
  entry_date   TEXT NOT NULL,
  occurred_at  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'log'
               CHECK (kind IN ('log','done','blocker','idea','meeting','learning')),
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  duration_min INTEGER CHECK (duration_min IS NULL OR duration_min >= 0),
  source       TEXT NOT NULL DEFAULT 'manual'
               CHECK (source IN ('manual','task','focus','import')),
  task_id      TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_entries_date
  ON entries(entry_date, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entries_project
  ON entries(project_id, entry_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entries_kind
  ON entries(kind, entry_date DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'inbox'
                CHECK (status IN ('inbox','todo','doing','done','dropped')),
  priority      INTEGER NOT NULL DEFAULT 1
                CHECK (priority BETWEEN 0 AND 3),
  planned_date  TEXT,
  due_date      TEXT,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  estimate_min  INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  completed_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_view
  ON tasks(status, planned_date, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project
  ON tasks(project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due
  ON tasks(due_date) WHERE deleted_at IS NULL AND status NOT IN ('done','dropped');

CREATE TABLE IF NOT EXISTS daily (
  date        TEXT PRIMARY KEY,
  summary     TEXT NOT NULL DEFAULT '',
  highlights  TEXT NOT NULL DEFAULT '[]',
  blockers    TEXT NOT NULL DEFAULT '[]',
  plan_next   TEXT NOT NULL DEFAULT '[]',
  mood        INTEGER CHECK (mood IS NULL OR mood BETWEEN 1 AND 5),
  energy      INTEGER CHECK (energy IS NULL OR energy BETWEEN 1 AND 5),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snippets (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'snippet'
              CHECK (kind IN ('snippet','command','link')),
  language    TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id           TEXT PRIMARY KEY,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  planned_min  INTEGER NOT NULL DEFAULT 25,
  actual_min   INTEGER NOT NULL DEFAULT 0,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  entry_id     TEXT REFERENCES entries(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','done','abandoned')),
  note         TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_focus_started
  ON focus_sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS performance_reviews (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  employee_name      TEXT NOT NULL DEFAULT '',
  period             TEXT NOT NULL DEFAULT '',
  grade              TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','final')),
  manager_signature  TEXT NOT NULL DEFAULT '',
  employee_signature TEXT NOT NULL DEFAULT '',
  source             TEXT NOT NULL DEFAULT 'manual',
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  deleted_at         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_performance_reviews_updated
  ON performance_reviews(updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS performance_dimensions (
  id          TEXT PRIMARY KEY,
  review_id   TEXT NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_performance_dimensions_review
  ON performance_dimensions(review_id, sort_order);

CREATE TABLE IF NOT EXISTS performance_items (
  id            TEXT PRIMARY KEY,
  dimension_id  TEXT NOT NULL REFERENCES performance_dimensions(id) ON DELETE CASCADE,
  comment       TEXT NOT NULL DEFAULT '',
  expectation   TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_performance_items_dimension
  ON performance_items(dimension_id, sort_order);
`;

export const SCHEMA_VERSION = 2;
