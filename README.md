# Discord Dossier Bot Manager

A Discord.js + Fastify service that manages dossier threads inside a forum channel. Each person of interest lives in its own forum thread. Summaries stay in the starter message so they surface in the forum preview, and detailed updates are posted by the bot only. A minimal webhook lets your web editor push summary and entry updates while the bot performs wiki-style cross-linking across dossiers.

## Features

- `?config forum #channel` — lock a forum channel for dossiers and grant the bot posting/thread permissions.
- `?add "Person" --summary "Concise blurb"` — create the forum thread, pin the starter summary, and store metadata.
- `?who Person` — fuzzy lookup with per-channel rate limiting; returns the summary and thread jump link.
- `?help` — list commands and the "bot-only threads" rule.
- In-memory wiki-linking that rewrites person names/aliases to Discord thread links on bot-authored posts.
- SQLite data model (`persons`, `aliases`, `entries`, `guild_settings`) with timestamps and last-updated tracking.
- Built-in Fastify server for a browser editor (port 25570) plus the existing signed webhook endpoint for automated integrations.
- Web editor updates edit existing Discord messages (summaries & entries) and auto-recreates missing posts if they were deleted.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Copy `.env.example` to `.env`** and set:
   - `DISCORD_TOKEN` — bot token.
   - `DISCORD_APP_ID` — bot application ID (used for future slash command expansions).
   - `WEBHOOK_SECRET` — shared secret for webhook signing.
   - `WEBHOOK_PORT` — port for the Fastify/web editor server (default `25570`).
   - `DB_PATH` — path to the SQLite file (`data/bot.sqlite` by default).
   - `GUILD_ID_ALLOWLIST` — optional comma-separated guild IDs to service.
3. **Run migrations and start the bot + web editor**
   ```bash
   npm run dev        # hot reload (bot + web UI on port 25570)
   npm run build      # type-check & emit JS
   npm start          # run the compiled build + web UI
   ```
4. **Open the web editor** at `http://localhost:25570` (or your configured host/port).
5. **Configure the forum channel** inside Discord with `?config forum #people-of-interest`.
6. **Create dossiers** using `?add` and retrieve them via `?who`.

## Web Editor

- Visit `http://localhost:25570` after the bot starts.
- Pick a guild from the dropdown (populated from your allow list or existing records).
- Select a person to edit their summary or post entries.
- The UI enforces the 600 character summary limit, edits existing summary/entry messages, and re-links names via the REST API (which mirrors the webhook behaviour). If a Discord message was deleted, the bot will create a fresh one and update the database automatically.
- Optional Discord user IDs can be supplied for summary editors and entry authors; they are stored in the database and echoed back in the timeline.
- Use the **Refresh Links** button to re-run wiki-linking on the timeline after new dossiers are created.

### REST API

The web app talks to JSON endpoints you can reuse from other tools:

- `GET /api/config` → `{ guilds: string[] }`
- `GET /api/persons?guild_id=...` → list persons with summary metadata
- `GET /api/persons/:id` → fetch a person + entries
- `PATCH /api/persons/:id/summary` → update summary (body: `{ summary_md, updated_by? }`)
- `POST /api/persons/:id/entries` → add entry (`{ title, body_md, created_by? }`)
- `PATCH /api/persons/:id/entries/:entryId` → edit entry (`{ title, body_md, updated_by? }`)
- `POST /api/persons/:id/refresh-links` → re-run wiki-linking on all entries

All endpoints return JSON and reuse the same validation as the webhook route.

## Webhook Contract

- Endpoint: `POST /webhook`
- Content-Type: `application/json`
- Payload schema:
  ```json
  {
    "secret": "<hex hmac or shared secret>",
    "type": "poi.update",
    "person_id": 12,
    "summary_md": "Optional new starter summary",
    "updated_by": "discordUserId",
    "new_entry": {
      "title": "Update headline",
      "body_md": "Markdown body with optional names",
      "created_by": "discordUserId"
    }
  }
  ```
- **Signature**: compute `sha256` HMAC using `WEBHOOK_SECRET` and either (a) the canonical JSON string of the payload without `secret`, or (b) the raw request body. Provide the resulting lowercase hex digest in the `secret` field. For local/dev usage, providing the raw `WEBHOOK_SECRET` also passes verification.
- **Summary updates** edit and pin the starter message, then persist `summary_md` and `last_updated_by`.
- **Entries** are saved to the database and posted as:
  ```
  **Title**
  
  Body with wiki-links
  ```
  Names matching existing dossiers are linked automatically (capped at 15 links per message).

## Data Model

```
persons: id, guild_id, name, slug, discord_thread_id, starter_msg_id,
         summary_md, tags_json, created_by, last_updated_by,
         created_at, updated_at
aliases: id, person_id, alias_text
entries: id, person_id, title, body_md, created_by, created_at
guild_settings: guild_id, forum_channel_id, updated_at
```

The SQLite database lives at `DB_PATH` (default `data/bot.sqlite`). Journaling is set to WAL for better concurrency.

## Development Notes

- Commands are message-prefix (`?`) today; the architecture allows transitioning to slash commands later.
- The wiki-link index is rebuilt per message/webhook based on database state to guarantee consistency without caching invalidations.
- Summary length is capped at 600 characters to keep forum previews readable.
- Rate limiting throttles `?who` per channel to one lookup every 5 seconds to prevent spam.
- Fastify is started after the Discord client logs in; any webhook failures are logged and return structured HTTP errors.

## Useful Scripts

- `npm run dev` — run with `tsx` watch for local development.
- `npm run build` — compile TypeScript (fails on type errors).
- `npm start` — run the compiled JS from `dist`.

## Next Steps (Ideas)

1. Add slash-command equivalents and command registration helpers.
2. Extend the webhook contract to manage aliases/tags and perform diff auditing.
3. Expose a lightweight REST API for searching dossiers outside Discord.
4. Add health checks and Prometheus metrics on the Fastify server.
