import { db } from '../client';
import { isoNow } from '../../utils/time';
import { slugify } from '../../utils/slugify';

export interface PersonRow {
  id: number;
  guild_id: string;
  name: string;
  slug: string;
  discord_thread_id: string | null;
  starter_msg_id: string | null;
  summary_md: string;
  tags_json: string;
  created_by: string | null;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AliasRow {
  id: number;
  person_id: number;
  alias_text: string;
}

export interface EntryRow {
  id: number;
  person_id: number;
  title: string;
  body_md: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  discord_message_id: string | null;
}

const insertPerson = db.prepare<[
  string,
  string,
  string,
  string | null,
  string | null,
  string,
  string,
  string | null,
  string | null,
  string,
  string
], {
  lastInsertRowid: number;
  changes: number;
}>(
  `INSERT INTO persons (
     guild_id,
     name,
     slug,
     discord_thread_id,
     starter_msg_id,
     summary_md,
     tags_json,
     created_by,
     last_updated_by,
     created_at,
     updated_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const updatePersonThreadStmt = db.prepare<[
  string,
  string,
  string,
  number
]>(
  `UPDATE persons
     SET discord_thread_id = ?,
         starter_msg_id = ?,
         updated_at = ?
   WHERE id = ?`
);

const updatePersonSummaryStmt = db.prepare<[
  string,
  string,
  string | null,
  number
]>(
  `UPDATE persons
     SET summary_md = ?,
         updated_at = ?,
         last_updated_by = ?
   WHERE id = ?`
);

const clearThreadStmt = db.prepare<[
  string,
  number
]>(
  `UPDATE persons
     SET discord_thread_id = NULL,
         starter_msg_id = NULL,
         updated_at = ?
   WHERE id = ?`
);

const insertAliasStmt = db.prepare<[
  number,
  string
]>(
  `INSERT OR IGNORE INTO aliases (person_id, alias_text)
   VALUES (?, ?)`
);

const insertEntryStmt = db.prepare<[
  number,
  string,
  string,
  string | null,
  string,
  string,
  string | null,
  string | null
]>(
  `INSERT INTO entries (person_id, title, body_md, created_by, created_at, updated_at, updated_by, discord_message_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const updateEntryStmt = db.prepare<[
  string,
  string,
  string | null,
  string,
  string | null,
  number
]>(
  `UPDATE entries
     SET title = ?,
         body_md = ?,
         updated_by = ?,
         updated_at = ?,
         discord_message_id = ?
   WHERE id = ?`
);

const selectPersonByIdStmt = db.prepare<[number]>(
  'SELECT * FROM persons WHERE id = ?'
);

const selectPersonBySlugStmt = db.prepare<[string, string]>(
  'SELECT * FROM persons WHERE guild_id = ? AND slug = ?'
);

const selectPersonByNameStmt = db.prepare<[string, string]>(
  'SELECT * FROM persons WHERE guild_id = ? AND LOWER(name) = LOWER(?)'
);

const selectPersonByAliasStmt = db.prepare<[string, string]>(
  `SELECT p.* FROM persons p
   JOIN aliases a ON a.person_id = p.id
   WHERE p.guild_id = ? AND LOWER(a.alias_text) = LOWER(?)`
);

const selectPersonByThreadStmt = db.prepare<[string, string]>(
  'SELECT * FROM persons WHERE guild_id = ? AND discord_thread_id = ?'
);

const listPersonsStmt = db.prepare<[string]>(
  'SELECT * FROM persons WHERE guild_id = ? ORDER BY name COLLATE NOCASE'
);

const listGuildIdsStmt = db.prepare('SELECT DISTINCT guild_id FROM persons ORDER BY guild_id');

const listAliasesByGuildStmt = db.prepare<[string]>(
  `SELECT a.* FROM aliases a
   JOIN persons p ON p.id = a.person_id
   WHERE p.guild_id = ?`
);

const listAliasesForPersonStmt = db.prepare<[number]>(
  'SELECT * FROM aliases WHERE person_id = ? ORDER BY alias_text COLLATE NOCASE'
);

const selectEntryByPersonStmt = db.prepare<[number]>(
  'SELECT * FROM entries WHERE person_id = ? ORDER BY created_at ASC'
);

const selectEntryByIdStmt = db.prepare<[number]>(
  'SELECT * FROM entries WHERE id = ?'
);

export const personRepository = {
  createPerson: (params: {
    guildId: string;
    name: string;
    summaryMd?: string;
    tags?: string[];
    createdBy?: string | null;
  }) => {
    const now = isoNow();
    const slug = slugify(params.name);
    const info = insertPerson.run(
      params.guildId,
      params.name,
      slug,
      null,
      null,
      params.summaryMd ?? '',
      JSON.stringify(params.tags ?? []),
      params.createdBy ?? null,
      params.createdBy ?? null,
      now,
      now
    );

    return personRepository.getById(Number(info.lastInsertRowid));
  },

  attachDiscordThread: (personId: number, threadId: string, starterMsgId: string) => {
    updatePersonThreadStmt.run(threadId, starterMsgId, isoNow(), personId);
    return personRepository.getById(personId);
  },

  updateSummary: (personId: number, summary: string, updatedBy: string | null) => {
    updatePersonSummaryStmt.run(summary, isoNow(), updatedBy, personId);
    return personRepository.getById(personId);
  },

  addAlias: (personId: number, alias: string) => {
    insertAliasStmt.run(personId, alias.trim());
    return personRepository.listAliasesForPerson(personId);
  },

  addEntry: (params: { personId: number; title: string; bodyMd: string; createdBy?: string | null; messageId?: string | null; }) => {
    const now = isoNow();
    const info = insertEntryStmt.run(
      params.personId,
      params.title,
      params.bodyMd,
      params.createdBy ?? null,
      now,
      now,
      params.createdBy ?? null,
      params.messageId ?? null
    );
    return personRepository.getEntryById(Number(info.lastInsertRowid));
  },

  updateEntry: (params: { entryId: number; title: string; bodyMd: string; updatedBy?: string | null; messageId?: string | null; }) => {
    const now = isoNow();
    updateEntryStmt.run(
      params.title,
      params.bodyMd,
      params.updatedBy ?? null,
      now,
      params.messageId ?? null,
      params.entryId
    );
    return personRepository.getEntryById(params.entryId);
  },

  getEntryById: (entryId: number) =>
    selectEntryByIdStmt.get(entryId) as EntryRow | undefined,

  getById: (id: number) => selectPersonByIdStmt.get(id) as PersonRow | undefined,

  getBySlug: (guildId: string, slug: string) =>
    selectPersonBySlugStmt.get(guildId, slug) as PersonRow | undefined,

  getByName: (guildId: string, name: string) =>
    selectPersonByNameStmt.get(guildId, name) as PersonRow | undefined,

  getByAlias: (guildId: string, alias: string) =>
    selectPersonByAliasStmt.get(guildId, alias) as PersonRow | undefined,

  getByThreadId: (guildId: string, threadId: string) =>
    selectPersonByThreadStmt.get(guildId, threadId) as PersonRow | undefined,

  clearThread: (personId: number) => {
    clearThreadStmt.run(isoNow(), personId);
    return personRepository.getById(personId);
  },

  listPersons: (guildId: string) => listPersonsStmt.all(guildId) as PersonRow[],

  listAliasesForGuild: (guildId: string) =>
    listAliasesByGuildStmt.all(guildId) as AliasRow[],

  listAliasesForPerson: (personId: number) =>
    listAliasesForPersonStmt.all(personId) as AliasRow[],

  listEntriesForPerson: (personId: number) =>
    selectEntryByPersonStmt.all(personId) as EntryRow[],

  listGuildIds: () =>
    (listGuildIdsStmt.all() as { guild_id: string }[]).map((row) => row.guild_id),
};
