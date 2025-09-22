import { env } from './config/env';
import { runMigrations } from './database/migrations';

const main = async () => {
  runMigrations();

  const { DossierBot } = await import('./discord/bot');
  const { startHttpServer } = await import('./http/server');

  const bot = new DossierBot();
  await bot.start(env.DISCORD_TOKEN);
  await startHttpServer(bot);
};

main().catch((error) => {
  console.error('Failed to start bot', error);
  process.exit(1);
});
