CREATE TABLE IF NOT EXISTS links (
  slug TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  clicked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  referrer TEXT,
  country TEXT,
  device TEXT,
  browser TEXT,
  FOREIGN KEY (slug) REFERENCES links(slug)
);

CREATE INDEX IF NOT EXISTS idx_clicks_slug_time ON clicks(slug, clicked_at);
CREATE INDEX IF NOT EXISTS idx_clicks_time ON clicks(clicked_at);
