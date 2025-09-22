import { Client } from 'discord.js';
import { env } from '../config/env';
import { guildSettingsRepository } from '../database/repositories/guildSettings';
import { RateLimiter } from '../services/rateLimiter';
import { commands } from './commands';
import { CommandDefinition } from './types';

const COMMAND_PREFIX = '?';

const commandMap = new Map<string, CommandDefinition>();
commands.forEach((command) => {
  commandMap.set(command.name, command);
});

const isGuildAllowed = (guildId: string) => {
  if (!env.GUILD_ID_ALLOWLIST.length) return true;
  return env.GUILD_ID_ALLOWLIST.includes(guildId);
};

export const registerCommandHandler = (client: Client, rateLimiter: RateLimiter) => {
  client.on('messageCreate', async (message) => {
    if (!message.inGuild()) return;
    if (message.author.bot) return;
    if (!message.content.startsWith(COMMAND_PREFIX)) return;
    if (!isGuildAllowed(message.guild.id)) return;

    const withoutPrefix = message.content.slice(COMMAND_PREFIX.length).trim();
    if (!withoutPrefix) return;

    const [commandNameRaw] = withoutPrefix.split(/\s+/);
    const commandName = commandNameRaw.toLowerCase();
    const command = commandMap.get(commandName);
    if (!command) return;

    const args = withoutPrefix.slice(commandNameRaw.length).trim();
    const forumChannelId = guildSettingsRepository.getForumChannel(message.guild.id);

    try {
      await command.execute({
        client,
        message,
        args,
        guildId: message.guild.id,
        forumChannelId,
        rateLimiter,
      });
    } catch (error) {
      console.error('Command execution failed', { command: command.name, error });
      await message.reply({
        content: 'Something went wrong while running that command.',
        allowedMentions: { repliedUser: false },
      });
    }
  });
};
