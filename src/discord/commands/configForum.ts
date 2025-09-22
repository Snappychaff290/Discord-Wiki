import { ChannelType, PermissionsBitField } from 'discord.js';
import { guildSettingsRepository } from '../../database/repositories/guildSettings';
import { CommandDefinition } from '../types';

const sanitizeChannelId = (input: string) => input.replace(/[^0-9]/g, '');

export const configForumCommand: CommandDefinition = {
  name: 'config',
  description: 'Configure the forum channel used for dossiers.',
  usage: '?config forum #channel',
  adminOnly: true,
  async execute({ message, args, guildId }) {
    const member = message.member;
    if (!member) {
      await message.reply({
        content: 'This command can only be used in a guild channel.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply({
        content: 'You need the **Manage Guild** permission to run this command.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const [subcommand, channelMention] = args.trim().split(/\s+/);
    if (!subcommand || subcommand.toLowerCase() !== 'forum' || !channelMention) {
      await message.reply({
        content: 'Usage: `?config forum #forum-channel`',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const channelId = sanitizeChannelId(channelMention);
    if (!channelId) {
      await message.reply({
        content: 'Please mention a valid forum channel.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const forumChannel = await message.guild?.channels.fetch(channelId).catch(() => null);
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
      await message.reply({
        content: 'That channel is not a forum. Choose a forum channel for dossiers.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await guildSettingsRepository.setForumChannel(guildId, channelId);

    try {
      await forumChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: false,
        SendMessagesInThreads: false,
      });

      const botId = message.client.user?.id;
      if (botId) {
        await forumChannel.permissionOverwrites.edit(botId, {
          SendMessages: true,
          SendMessagesInThreads: true,
          ManageThreads: true,
          ManageMessages: true,
          CreatePublicThreads: true,
          CreatePrivateThreads: true,
        });
      }
    } catch (error) {
      console.error('Failed to update forum permissions', error);
    }

    await message.reply({
      content: `Configured forum to ${forumChannel}. Users can’t post; the bot will manage threads.`,
      allowedMentions: { repliedUser: false },
    });
  },
};
