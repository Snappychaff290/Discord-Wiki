import { personService } from '../../services/personService';
import { CommandDefinition } from '../types';

const maxSummaryLength = 250;

const formatSummary = (summary: string) =>
  summary
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxSummaryLength);

export const whoCommand: CommandDefinition = {
  name: 'who',
  description: 'Look up a person dossier.',
  usage: '?who Person Name',
  async execute({ message, args, guildId, rateLimiter }) {
    const query = args.trim();
    if (!query) {
      await message.reply({
        content: 'Tell me who to look up. Example: `?who Elena Ruiz`',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const limiterKey = `${guildId}:${message.channelId}:who`;
    if (!rateLimiter.tryConsume(limiterKey)) {
      await message.react('⏳').catch(() => null);
      return;
    }

    const person = personService.fuzzyFind(guildId, query) ?? personService.getPerson(guildId, query);
    if (!person) {
      await message.reply({
        content: 'No dossier found for that name.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!person.discord_thread_id) {
      await message.reply({
        content: `I have a record for **${person.name}**, but it is missing a thread link. Ask an admin to fix it.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const summary = person.summary_md ? formatSummary(person.summary_md) : '(summary pending)';
    const link = `https://discord.com/channels/${guildId}/${person.discord_thread_id}`;

    await message.reply({
      content: `**${person.name}** — ${summary}\n${link}`,
      allowedMentions: { repliedUser: false },
    });
  },
};
