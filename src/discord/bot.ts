import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { registerCommandHandler } from './commandHandler';
import { RateLimiter } from '../services/rateLimiter';

export class DossierBot {
  public readonly client: Client;
  public readonly rateLimiter: RateLimiter;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
    this.rateLimiter = new RateLimiter();

    registerCommandHandler(this.client, this.rateLimiter);

    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user?.tag ?? 'bot'}`);
    });
  }

  async start(token: string) {
    await this.client.login(token);
  }
}
