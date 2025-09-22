import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ThreadChannel, Message } from 'discord.js';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../config/env';
import { personService } from '../services/personService';
import type { PersonRecord } from '../services/personService';
import { wikiLinkMarkdown } from '../services/wikiLinkService';
import type { DossierBot } from '../discord/bot';
import { personRepository } from '../database/repositories/persons';

interface UpdatePayload {
  secret: string;
  type: 'poi.update';
  person_id: number | string;
  summary_md?: string;
  updated_by?: string;
  new_entry?: {
    title: string;
    body_md: string;
    created_by?: string;
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const payloadSchema = z.object({
  secret: z.string().min(1),
  type: z.literal('poi.update'),
  person_id: z.union([z.number(), z.string()]),
  summary_md: z.string().max(600).optional(),
  updated_by: z.string().optional(),
  new_entry: z
    .object({
      title: z.string().min(1).max(200),
      body_md: z.string().min(1),
      created_by: z.string().optional(),
    })
    .optional(),
});

const summarySchema = z.object({
  summary_md: z.string().min(1).max(600),
  updated_by: z.string().optional(),
});

const entrySchema = z.object({
  title: z.string().min(1).max(200),
  body_md: z.string().min(1),
  created_by: z.string().optional(),
});

const entryUpdateSchema = z.object({
  title: z.string().min(1).max(200),
  body_md: z.string().min(1),
  updated_by: z.string().optional(),
});

const queryGuildSchema = z.object({
  guild_id: z.string().min(1),
});

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const canonicalize = (payload: UpdatePayload) =>
  JSON.stringify({
    type: payload.type,
    person_id: String(payload.person_id),
    summary_md: payload.summary_md ?? null,
    updated_by: payload.updated_by ?? null,
    new_entry: payload.new_entry
      ? {
          title: payload.new_entry.title,
          body_md: payload.new_entry.body_md,
          created_by: payload.new_entry.created_by ?? null,
        }
      : null,
  });

const verifySignature = (payload: UpdatePayload, rawBody?: string) => {
  const provided = payload.secret.trim();
  const canonical = canonicalize(payload);
  const canonicalDigest = createHmac('sha256', env.WEBHOOK_SECRET)
    .update(canonical)
    .digest('hex');
  if (safeEqual(provided, canonicalDigest)) return true;

  if (rawBody) {
    const rawDigest = createHmac('sha256', env.WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    if (safeEqual(provided, rawDigest)) return true;
  }

  return safeEqual(provided, env.WEBHOOK_SECRET);
};

const isThreadChannel = (channel: unknown): channel is ThreadChannel => {
  if (!channel) return false;
  if (typeof channel !== 'object') return false;
  const maybe = channel as ThreadChannel;
  return typeof maybe.isThread === 'function' && maybe.isThread();
};

const fetchPersonEnsureThreadState = async (bot: DossierBot, personId: number): Promise<PersonRecord> => {
  let person = personService.getById(personId);
  if (!person) {
    throw new HttpError(404, 'Person not found');
  }

  if (person.discord_thread_id) {
    const channel = await bot.client.channels.fetch(person.discord_thread_id).catch(() => null);
    if (!channel) {
      person = personService.clearThread(person.id) ?? person;
    }
  }

  return personService.getById(person.id) ?? person;
};

const ensureThreadChannel = async (bot: DossierBot, personId: number) => {
  const person = personService.getById(personId);
  if (!person) {
    throw new HttpError(404, 'Person not found');
  }

  if (!person.discord_thread_id) {
    throw new HttpError(409, 'Person is missing a Discord thread id');
  }

  const channel = await bot.client.channels
    .fetch(person.discord_thread_id)
    .catch(() => null);

  if (!isThreadChannel(channel)) {
    personService.clearThread(person.id);
    throw new HttpError(404, 'Dossier thread is missing. Recreate it in Discord with ?add.');
  }

  return { person, thread: channel };
};

const ensureStarterMessage = async (person: PersonRecord, thread: ThreadChannel) => {
  const attemptFetch = async (messageId: string | null) => {
    if (!messageId) return null;
    return thread.messages.fetch(messageId).catch(() => null);
  };

  let starterMessage: Message<true> | null = await attemptFetch(person.starter_msg_id ?? null);

  if (!starterMessage) {
    starterMessage = await thread.fetchStarterMessage().catch(() => null);
  }

  if (!starterMessage) {
    const fallback = person.summary_md?.trim().length
      ? person.summary_md
      : `**${person.name}** — (summary pending)`;

    starterMessage = await thread.send({ content: fallback });
    await starterMessage.pin().catch(() => null);
    personService.attachThread(person.id, thread.id, starterMessage.id);
    return starterMessage;
  }

  if (starterMessage.id !== person.starter_msg_id) {
    personService.attachThread(person.id, thread.id, starterMessage.id);
  }

  return starterMessage;
};

const buildEntryContent = (title: string, body: string, guildId: string) => {
  const linkified = wikiLinkMarkdown(body, guildId);
  return `**${title}**\n\n${linkified}`;
};

const handleSummaryUpdate = async (
  bot: DossierBot,
  personId: number,
  summary: string,
  updatedBy?: string
) => {
  const trimmed = summary.trim();
  if (!trimmed) {
    throw new HttpError(400, 'summary_md cannot be empty');
  }

  const { person, thread } = await ensureThreadChannel(bot, personId);
  const starterMessage = await ensureStarterMessage(person, thread);

  await starterMessage.edit(trimmed);
  await starterMessage.pin().catch(() => null);

  const updated = personService.updateSummary(person.id, trimmed, updatedBy ?? null);
  return updated;
};

const handleEntryCreation = async (
  bot: DossierBot,
  personId: number,
  params: { title: string; body_md: string; created_by?: string }
) => {
  const title = params.title.trim();
  const body = params.body_md.trim();

  if (!title || !body) {
    throw new HttpError(400, 'Entry title and body cannot be empty');
  }

  const { person, thread } = await ensureThreadChannel(bot, personId);
  const content = buildEntryContent(title, body, person.guild_id);

  let message: Message<true> | null = null;
  try {
    message = await thread.send({ content });
    const entry = personService.addEntry({
      personId: person.id,
      title,
      bodyMd: body,
      createdBy: params.created_by ?? null,
      messageId: message.id,
    });

    if (!entry) {
      throw new HttpError(500, 'Failed to store entry');
    }

    return { entry, reposted: false };
  } catch (error) {
    if (message) {
      await message.delete().catch(() => null);
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, 'Failed to create entry');
  }
};

const handleEntryUpdate = async (
  bot: DossierBot,
  personId: number,
  entryId: number,
  params: { title: string; body_md: string; updated_by?: string }
) => {
  const title = params.title.trim();
  const body = params.body_md.trim();

  if (!title || !body) {
    throw new HttpError(400, 'Entry title and body cannot be empty');
  }

  const existing = personService.getEntry(personId, entryId);
  if (!existing) {
    throw new HttpError(404, 'Entry not found');
  }

  const { person, thread } = await ensureThreadChannel(bot, personId);
  const content = buildEntryContent(title, body, person.guild_id);

  let message: Message<true> | null = null;
  let reposted = false;

  try {
    if (existing.discord_message_id) {
      message = await thread.messages.fetch(existing.discord_message_id).catch(() => null);
    }

    if (message) {
      await message.edit({ content });
    } else {
      message = await thread.send({ content });
      reposted = true;
    }
  } catch (error) {
    throw new HttpError(500, 'Failed to sync Discord message');
  }

  const updated = personService.updateEntry({
    personId,
    entryId,
    title,
    bodyMd: body,
    updatedBy: params.updated_by ?? null,
    messageId: message?.id ?? existing.discord_message_id ?? null,
  });

  if (!updated) {
    if (reposted && message) {
      await message.delete().catch(() => null);
    }
    throw new HttpError(500, 'Failed to update entry');
  }

  return { entry: updated, reposted };
};

export const startHttpServer = async (bot: DossierBot): Promise<FastifyInstance> => {
  const fastify = Fastify({ logger: false });

  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({ error: error.message });
      return;
    }

    console.error('Unhandled HTTP error', error);
    reply.status(500).send({ error: 'Internal server error' });
  });

  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    try {
      request.rawBody = body as string;
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  const publicDir = path.resolve(__dirname, '../../public');
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  fastify.get('/', async (_request, reply) => {
    return reply.type('text/html').sendFile('index.html');
  });

  fastify.get('/api/config', async () => {
    const guilds = env.GUILD_ID_ALLOWLIST.length
      ? env.GUILD_ID_ALLOWLIST
      : personRepository.listGuildIds();

    return {
      guilds,
      port: env.WEBHOOK_PORT,
    };
  });

  fastify.get('/api/persons', async (request) => {
    const parsed = queryGuildSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new HttpError(400, 'guild_id is required');
    }

    const guildId = parsed.data.guild_id;
    const persons = personService.listPersons(guildId);
    return { persons };
  });

  fastify.get('/api/persons/:id', async (request) => {
    const personId = Number((request.params as { id: string }).id);
    if (Number.isNaN(personId)) {
      throw new HttpError(400, 'Invalid person id');
    }

    const person = await fetchPersonEnsureThreadState(bot, personId);
    const entries = personService.listEntries(person.id);
    return { person, entries };
  });

  fastify.patch('/api/persons/:id/summary', async (request) => {
    const personId = Number((request.params as { id: string }).id);
    if (Number.isNaN(personId)) {
      throw new HttpError(400, 'Invalid person id');
    }

    const parsed = summarySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid summary payload');
    }

    const updated = await handleSummaryUpdate(bot, personId, parsed.data.summary_md, parsed.data.updated_by);
    return { status: 'ok', person: updated };
  });

  fastify.post('/api/persons/:id/entries', async (request, reply) => {
    const personId = Number((request.params as { id: string }).id);
    if (Number.isNaN(personId)) {
      throw new HttpError(400, 'Invalid person id');
    }

    const parsed = entrySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid entry payload');
    }

    const { entry } = await handleEntryCreation(bot, personId, parsed.data);
    reply.status(201);
    return { status: 'ok', entry };
  });

  fastify.patch('/api/persons/:id/entries/:entryId', async (request) => {
    const params = request.params as { id: string; entryId: string };
    const personId = Number(params.id);
    const entryId = Number(params.entryId);

    if (Number.isNaN(personId) || Number.isNaN(entryId)) {
      throw new HttpError(400, 'Invalid identifiers');
    }

    const parsed = entryUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid entry payload');
    }

    const { entry, reposted } = await handleEntryUpdate(bot, personId, entryId, parsed.data);
    return { status: 'ok', entry, reposted };
  });

  fastify.post('/api/persons/:id/refresh-links', async (request) => {
    const personId = Number((request.params as { id: string }).id);
    if (Number.isNaN(personId)) {
      throw new HttpError(400, 'Invalid person id');
    }

    const person = await fetchPersonEnsureThreadState(bot, personId);
    if (!person.discord_thread_id) {
      throw new HttpError(409, 'Dossier thread missing. Recreate it in Discord first.');
    }

    const entries = personService.listEntries(person.id);
    if (!entries.length) {
      return { status: 'ok', updated: 0, reposted: 0 };
    }

    let updatedCount = 0;
    let repostedCount = 0;

    for (const entry of entries) {
      const { reposted } = await handleEntryUpdate(bot, person.id, entry.id, {
        title: entry.title,
        body_md: entry.body_md,
        updated_by: entry.updated_by ?? entry.created_by ?? undefined,
      });
      updatedCount += 1;
      if (reposted) repostedCount += 1;
    }

    return { status: 'ok', updated: updatedCount, reposted: repostedCount };
  });

  fastify.post('/webhook', async (request, reply) => {
    const parsed = payloadSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid payload', details: parsed.error.issues };
    }

    const payload: UpdatePayload = parsed.data;

    if (!verifySignature(payload, request.rawBody)) {
      reply.code(401);
      return { error: 'Invalid signature' };
    }

    const personId = Number(payload.person_id);
    if (Number.isNaN(personId)) {
      reply.code(400);
      return { error: 'person_id must be numeric' };
    }

    if (payload.summary_md !== undefined) {
      await handleSummaryUpdate(bot, personId, payload.summary_md, payload.updated_by);
    }

    if (payload.new_entry) {
      await handleEntryCreation(bot, personId, payload.new_entry);
    }

    return { status: 'ok' };
  });

  await fastify.listen({ port: env.WEBHOOK_PORT, host: '0.0.0.0' });
  console.log(`HTTP server listening on http://0.0.0.0:${env.WEBHOOK_PORT}`);

  return fastify;
};
