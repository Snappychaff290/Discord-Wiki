import { Client, Message } from 'discord.js';
import { RateLimiter } from '../services/rateLimiter';

export interface CommandContext {
  client: Client;
  message: Message<true>;
  args: string;
  guildId: string;
  forumChannelId: string | null;
  rateLimiter: RateLimiter;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  adminOnly?: boolean;
  execute: (ctx: CommandContext) => Promise<void>;
}
