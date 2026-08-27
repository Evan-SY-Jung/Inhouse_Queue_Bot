import type { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    channel_id TEXT UNIQUE,
    message_id TEXT,
    creator_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('CREATING', 'ACTIVE', 'CLOSED')),
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_panels_active_category
    ON panels(guild_id, category_id)
    WHERE status IN ('CREATING', 'ACTIVE');

  CREATE TABLE IF NOT EXISTS recruitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL REFERENCES panels(id),
    guild_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    channel_id TEXT UNIQUE,
    message_id TEXT,
    creator_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('RIFT_NOW', 'ARAM_NOW', 'RESERVATION')),
    game_type TEXT NOT NULL CHECK (game_type IN ('RIFT', 'ARAM')),
    channel_number INTEGER,
    description TEXT,
    scheduled_at INTEGER,
    timezone_input TEXT,
    status TEXT NOT NULL CHECK (status IN ('CREATING', 'OPEN', 'CLOSED')),
    summon_state TEXT NOT NULL DEFAULT 'AVAILABLE'
      CHECK (summon_state IN ('AVAILABLE', 'CLAIMED', 'USED')),
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_recruitments_active_creator_kind
    ON recruitments(guild_id, creator_id, kind)
    WHERE status IN ('CREATING', 'OPEN');

  CREATE TABLE IF NOT EXISTS queue_members (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    recruitment_id INTEGER NOT NULL REFERENCES recruitments(id),
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    UNIQUE(recruitment_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS ix_queue_members_recruitment_sequence
    ON queue_members(recruitment_id, sequence);

  CREATE TABLE IF NOT EXISTS guild_cooldowns (
    guild_id TEXT NOT NULL,
    cooldown_key TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY(guild_id, cooldown_key)
  );
`;

const CHANNEL_NUMBER_MIGRATION = `
  DROP INDEX IF EXISTS uq_recruitments_channel_number;
  DROP INDEX IF EXISTS uq_recruitments_active_channel_number;

  UPDATE recruitments
  SET channel_number = NULL
  WHERE status != 'OPEN' OR kind = 'RESERVATION';

  WITH numbered AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY guild_id, category_id, game_type
             ORDER BY id
           ) AS next_number
    FROM recruitments
    WHERE kind IN ('RIFT_NOW', 'ARAM_NOW') AND status = 'OPEN'
  )
  UPDATE recruitments
  SET channel_number = (
    SELECT next_number FROM numbered WHERE numbered.id = recruitments.id
  )
  WHERE id IN (SELECT id FROM numbered);

  CREATE UNIQUE INDEX uq_recruitments_active_channel_number
    ON recruitments(guild_id, category_id, game_type, channel_number)
    WHERE channel_number IS NOT NULL AND status IN ('CREATING', 'OPEN');
`;

export function initializeSqliteSchema(db: DatabaseSync): void {
  db.exec(SCHEMA);
  const columns = db
    .prepare("PRAGMA table_info(recruitments)")
    .all()
    .map((row) => String((row as { name: unknown }).name));
  if (!columns.includes("channel_number")) {
    db.exec("ALTER TABLE recruitments ADD COLUMN channel_number INTEGER");
  }
  db.exec(CHANNEL_NUMBER_MIGRATION);
}
