import { db } from '../client';
import { isoNow } from '../../utils/time';

const upsertStmt = db.prepare<[
  string,
  string,
  string
]>(
  `INSERT INTO guild_settings (guild_id, forum_channel_id, updated_at)
   VALUES (?, ?, ?)
   ON CONFLICT(guild_id) DO UPDATE SET
     forum_channel_id = excluded.forum_channel_id,
     updated_at = excluded.updated_at`
);

const selectStmt = db.prepare<[string]>(
  'SELECT forum_channel_id FROM guild_settings WHERE guild_id = ?'
);

export const guildSettingsRepository = {
  setForumChannel(guildId: string, channelId: string) {
    upsertStmt.run(guildId, channelId, isoNow());
  },

  getForumChannel(guildId: string) {
    const row = selectStmt.get(guildId) as { forum_channel_id: string } | undefined;
    return row?.forum_channel_id ?? null;
  },
};
