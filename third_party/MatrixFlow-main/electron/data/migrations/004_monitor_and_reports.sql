CREATE TABLE IF NOT EXISTS monitor_plans (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('speed', 'account', 'video')),
  name TEXT NOT NULL,
  account_ids TEXT NOT NULL,
  metric TEXT NOT NULL CHECK(metric IN ('views', 'likes', 'comments', 'shares')),
  threshold INTEGER NOT NULL,
  condition TEXT NOT NULL CHECK(condition IN ('above', 'below')),
  interval_min INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_triggered_at TEXT
);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  summary TEXT NOT NULL,
  trends TEXT NOT NULL,
  insights TEXT NOT NULL,
  top_content TEXT NOT NULL,
  platform_breakdown TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitor_plans_enabled ON monitor_plans(enabled);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_date ON weekly_reports(generated_at);
