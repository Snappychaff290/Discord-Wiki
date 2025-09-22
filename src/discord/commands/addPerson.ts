import { ChannelType, ForumChannel, Message } from 'discord.js';
import { personService } from '../../services/personService';
import { personRepository } from '../../database/repositories/persons';
import { CommandDefinition } from '../types';

const stripWrappingQuotes = (value: string) => value.replace(/^['"]|['"]$/g, '');

const parseArguments = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return { name: '', summary: undefined as string | undefined };

  const lower = trimmed.toLowerCase();
  const summaryFlags = ['--summary', '—summary'];
  let summary: string | undefined;
  let namePart = trimmed;

  for (const flag of summaryFlags) {
    const idx = lower.indexOf(flag);
    if (idx >= 0) {
      namePart = trimmed.slice(0, idx).trim();
      summary = trimmed.slice(idx + flag.length).trim();
      break;
    }
  }

  const name = stripWrappingQuotes(namePart).trim();
  const summaryClean = summary ? stripWrappingQuotes(summary).trim() : undefined;
  return { name, summary: summaryClean };
};

const ensureSummaryWithinLimit = (summary: string | undefined): { ok: boolean; message?: string } => {
  if (!summary) return { ok: true };
  if (summary.length > 600) {
    return { ok: false, message: 'Summaries must be 600 characters or less.' };
  }
  return { ok: true };
};

const getForumChannel = async (message: Message<true>, forumChannelId: string | null) => {
  if (!forumChannelId) return null;
  const guild = message.guild;
  if (!guild) return null;
  const channel = await guild.channels.fetch(forumChannelId).catch(() => null);
  if (channel && channel.type === ChannelType.GuildForum) {
    return channel as ForumChannel;
  }
  return null;
};

export const addPersonCommand: CommandDefinition = {
  name: 'add',
  description: 'Create a new dossier thread for a person.',
  usage: '?add "Person Name" --summary "Concise summary"',
  async execute({ message, args, guildId, forumChannelId }) {
    const { name, summary } = parseArguments(args);

    if (!name) {
      await message.reply({
        content: 'Please provide a person name. Example: `?add "Elena Ruiz" --summary "CEO at Flux"`',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (name.length > 100) {
      await message.reply({
        content: 'The name looks too long. Keep it under 100 characters.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const summaryCheck = ensureSummaryWithinLimit(summary);
    if (!summaryCheck.ok) {
      await message.reply({
        content: summaryCheck.message ?? 'Summary is too long.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!forumChannelId) {
      await message.reply({
        content: 'No dossier forum is configured yet. An admin must run `?config forum #channel` first.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const existing = personService.getPerson(guildId, name);
    if (existing) {
      if (existing.discord_thread_id) {
        const resolved = await message.client.channels.fetch(existing.discord_thread_id).catch(() => null);
        if (resolved) {
          const link = `https://discord.com/channels/${guildId}/${existing.discord_thread_id}`;
          await message.reply({
            content: `A dossier already exists for **${existing.name}**. ${link}`,
            allowedMentions: { repliedUser: false },
          });
          return;
        }

        personService.clearThread(existing.id);
      }

      if (!personService.ensureUniqueName(guildId, name)) {
        await message.reply({
          content: 'That name or alias is already in use. Add an alias or pick a distinct label.',
          allowedMentions: { repliedUser: false },
        });
        return;
      }
    }

    const forumChannel = await getForumChannel(message, forumChannelId);
    if (!forumChannel) {
      await message.reply({
        content: 'Configured forum channel is missing or not accessible. Ask an admin to re-run `?config`.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const summaryContent = summary && summary.length > 0
      ? summary
      : `**${name}** — (summary pending)`;

    try {
      const thread = await forumChannel.threads.create({
        name,
        message: { content: summaryContent },
      });

      const starterMessage = await thread.fetchStarterMessage();
      if (!starterMessage) {
        await message.reply({
          content: 'Created the thread but could not fetch the starter message. Please try again.',
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      await starterMessage.pin().catch(() => null);

      const person = personService.createPerson({
        guildId,
        name,
        summaryMd: summaryContent,
        createdBy: message.author.id,
      });

      if (!person) {
        await message.reply({
          content: 'Failed to store the dossier record. Please contact an admin.',
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      personService.attachThread(person.id, thread.id, starterMessage.id);

      await message.reply({
        content: `Dossier created → https://discord.com/channels/${guildId}/${thread.id}\nUse the web editor to add details.`,
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      console.error('Failed to create dossier thread', error);
      await message.reply({
        content: 'Unable to create the dossier thread. Check the bot permissions and try again.',
        allowedMentions: { repliedUser: false },
      });
    }
  },
};
