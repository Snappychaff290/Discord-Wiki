import { db } from './client';

type TableColumn = { name: string };

const tableHasColumn = (table: string, column: string) => {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const columns = stmt.all() as TableColumn[];
  return columns.some((col) => col.name === column);
};

export const runMigrations = () => {
  const createPersons = `
    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      discord_thread_id TEXT,
      starter_msg_id TEXT,
      summary_md TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      created_by TEXT,
      last_updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(guild_id, slug)
    );
  `;

  const createAliases = `
    CREATE TABLE IF NOT EXISTS aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      alias_text TEXT NOT NULL,
      UNIQUE(person_id, alias_text)
    );
  `;

  const createEntries = `
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body_md TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      discord_message_id TEXT
    );
  `;

  const createGuildSettings = `
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      forum_channel_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;

  const createIndices = `
    CREATE INDEX IF NOT EXISTS idx_alias_text ON aliases (alias_text);
    CREATE INDEX IF NOT EXISTS idx_person_name ON persons (name);
  `;

  db.exec('BEGIN');
  try {
    db.exec(createPersons);
    db.exec(createAliases);
    db.exec(createEntries);
    db.exec(createGuildSettings);
    db.exec(createIndices);

    if (!tableHasColumn('entries', 'updated_at')) {
      db.exec("ALTER TABLE entries ADD COLUMN updated_at TEXT");
      db.exec("UPDATE entries SET updated_at = created_at WHERE updated_at IS NULL");
    }

    if (!tableHasColumn('entries', 'updated_by')) {
      db.exec("ALTER TABLE entries ADD COLUMN updated_by TEXT");
    }

    if (!tableHasColumn('entries', 'discord_message_id')) {
      db.exec("ALTER TABLE entries ADD COLUMN discord_message_id TEXT");
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
