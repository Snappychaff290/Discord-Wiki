import Fuse from 'fuse.js';
import { personRepository, PersonRow, EntryRow } from '../database/repositories/persons';
import { slugify } from '../utils/slugify';

export interface PersonRecord extends PersonRow {
  aliases: string[];
  tags: string[];
}

const mapRow = (row: PersonRow, aliases: string[]): PersonRecord => ({
  ...row,
  aliases,
  tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [],
});

export const personService = {
  createPerson(params: { guildId: string; name: string; summaryMd?: string; tags?: string[]; createdBy?: string | null; }) {
    const record = personRepository.createPerson({
      guildId: params.guildId,
      name: params.name,
      summaryMd: params.summaryMd,
      tags: params.tags,
      createdBy: params.createdBy,
    });
    const aliases = record ? personRepository.listAliasesForPerson(record.id).map((a) => a.alias_text) : [];
    return record ? mapRow(record, aliases) : null;
  },

  attachThread(personId: number, threadId: string, starterMsgId: string) {
    const record = personRepository.attachDiscordThread(personId, threadId, starterMsgId);
    if (!record) return null;
    const aliases = personRepository.listAliasesForPerson(record.id).map((a) => a.alias_text);
    return mapRow(record, aliases);
  },

  clearThread(personId: number) {
    const record = personRepository.clearThread(personId);
    if (!record) return null;
    const aliases = personRepository.listAliasesForPerson(record.id).map((a) => a.alias_text);
    return mapRow(record, aliases);
  },

  updateSummary(personId: number, summary: string, updatedBy: string | null) {
    const record = personRepository.updateSummary(personId, summary, updatedBy);
    if (!record) return null;
    const aliases = personRepository.listAliasesForPerson(record.id).map((a) => a.alias_text);
    return mapRow(record, aliases);
  },

  addAlias(personId: number, alias: string) {
    return personRepository.addAlias(personId, alias);
  },

  addEntry(params: { personId: number; title: string; bodyMd: string; createdBy?: string | null; messageId?: string | null; }) {
    return personRepository.addEntry(params);
  },

  updateEntry(params: { personId: number; entryId: number; title: string; bodyMd: string; updatedBy?: string | null; messageId?: string | null; }): EntryRow | null {
    const existing = personRepository.getEntryById(params.entryId);
    if (!existing || existing.person_id !== params.personId) return null;
    const updatedBy = params.updatedBy ?? existing.updated_by ?? existing.created_by ?? null;
    return personRepository.updateEntry({
      entryId: params.entryId,
      title: params.title,
      bodyMd: params.bodyMd,
      updatedBy,
      messageId: params.messageId ?? existing.discord_message_id ?? null,
    }) ?? null;
  },

  getEntry(personId: number, entryId: number): EntryRow | null {
    const entry = personRepository.getEntryById(entryId);
    if (!entry || entry.person_id !== personId) return null;
    return entry;
  },

  listEntries(personId: number): EntryRow[] {
    return personRepository.listEntriesForPerson(personId);
  },

  getById(personId: number): PersonRecord | null {
    const row = personRepository.getById(personId);
    if (!row) return null;
    const aliases = personRepository.listAliasesForPerson(row.id).map((a) => a.alias_text);
    return mapRow(row, aliases);
  },

  listPersons(guildId: string): PersonRecord[] {
    const persons = personRepository.listPersons(guildId);
    const aliases = personRepository.listAliasesForGuild(guildId);
    const aliasByPerson = new Map<number, string[]>();

    for (const alias of aliases) {
      const existing = aliasByPerson.get(alias.person_id) ?? [];
      existing.push(alias.alias_text);
      aliasByPerson.set(alias.person_id, existing);
    }

    return persons.map((person) =>
      mapRow(person, aliasByPerson.get(person.id) ?? [])
    );
  },

  getPerson(guildId: string, slugOrName: string): PersonRecord | null {
    const trimmed = slugOrName.trim();
    const slug = slugify(trimmed);
    const bySlug = personRepository.getBySlug(guildId, slug);
    if (bySlug) {
      const aliases = personRepository.listAliasesForPerson(bySlug.id).map((a) => a.alias_text);
      return mapRow(bySlug, aliases);
    }

    const byName = personRepository.getByName(guildId, trimmed);
    if (byName) {
      const aliases = personRepository.listAliasesForPerson(byName.id).map((a) => a.alias_text);
      return mapRow(byName, aliases);
    }

    const byAlias = personRepository.getByAlias(guildId, trimmed);
    if (byAlias) {
      const aliases = personRepository.listAliasesForPerson(byAlias.id).map((a) => a.alias_text);
      return mapRow(byAlias, aliases);
    }

    return null;
  },

  fuzzyFind(guildId: string, query: string): PersonRecord | null {
    const persons = personService.listPersons(guildId);
    if (!persons.length) return null;

    const fuse = new Fuse(persons, {
      keys: [
        { name: 'name', weight: 0.7 },
        { name: 'aliases', weight: 0.3 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      distance: 100,
    });

    const results = fuse.search(query);
    return results.length ? results[0].item : null;
  },

  ensureUniqueName(guildId: string, name: string): boolean {
    if (!name.trim()) return false;
    if (personRepository.getByName(guildId, name)) return false;
    const normalized = name.trim().toLowerCase();
    const slug = slugify(name);
    const persons = personRepository.listPersons(guildId);
    if (persons.some((person) => person.slug === slug)) return false;
    const aliases = personRepository.listAliasesForGuild(guildId);
    if (aliases.some((alias) => alias.alias_text.toLowerCase() === normalized)) return false;
    return true;
  },
};
