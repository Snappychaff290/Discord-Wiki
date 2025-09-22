import escapeStringRegexp from 'escape-string-regexp';
import { personService } from './personService';

export interface WikiLinkIndexEntry {
  personId: number;
  name: string;
  aliases: string[];
  threadId: string;
}

const escape = (value: string) => escapeStringRegexp(value);

const isInsideInlineCode = (text: string, index: number) => {
  const before = text.slice(0, index);
  const backtickCount = (before.match(/`/g) || []).length;
  return backtickCount % 2 === 1;
};

const isInsideMarkdownLink = (text: string, index: number) => {
  const opening = text.lastIndexOf('[', index);
  if (opening === -1) return false;
  const bracketClose = text.indexOf(']', opening);
  if (bracketClose === -1 || bracketClose < index) return false;
  const parenOpen = text.indexOf('(', bracketClose);
  if (parenOpen === -1) return false;
  const parenClose = text.indexOf(')', parenOpen);
  if (parenClose === -1 || parenClose < index) return false;
  return true;
};

export const buildWikiIndex = (guildId: string): WikiLinkIndexEntry[] => {
  const persons = personService.listPersons(guildId);
  return persons
    .filter((person) => Boolean(person.discord_thread_id))
    .map((person) => ({
      personId: person.id,
      name: person.name,
      aliases: person.aliases,
      threadId: person.discord_thread_id as string,
    }));
};

export const wikiLinkMarkdown = (markdown: string, guildId: string, maxLinks = 15): string => {
  if (!markdown.trim()) return markdown;
  const index = buildWikiIndex(guildId);
  if (!index.length) return markdown;

  const tokenSet = new Set<string>();
  const lookup = new Map<string, WikiLinkIndexEntry>();

  for (const entry of index) {
    const names = new Set<string>([entry.name, ...entry.aliases]);
    for (const name of names) {
      const normalized = name.toLowerCase();
      lookup.set(normalized, entry);
      tokenSet.add(name);
    }
  }

  const tokens = Array.from(tokenSet).sort((a, b) => b.length - a.length);
  if (!tokens.length) return markdown;

  const escapedTokens = tokens.map((token) => escape(token));
  const pattern = new RegExp(`\\b(${escapedTokens.join('|')})\\b`, 'gi');

  let linkCount = 0;
  const seenOffsets = new Set<number>();

  return markdown.replace(pattern, (match, _token, offset) => {
    if (linkCount >= maxLinks) return match;
    if (seenOffsets.has(offset)) return match;
    if (isInsideInlineCode(markdown, offset)) return match;
    if (isInsideMarkdownLink(markdown, offset)) return match;

    const normalized = match.toLowerCase();
    const entry = lookup.get(normalized);
    if (!entry) return match;

    seenOffsets.add(offset);
    linkCount += 1;
    return `[${match}](https://discord.com/channels/${guildId}/${entry.threadId})`;
  });
};
