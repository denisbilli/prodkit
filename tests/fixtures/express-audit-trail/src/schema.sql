CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TEXT NOT NULL
);
