import { config as loadEnv } from 'dotenv';
import { z, ZodIssue } from 'zod';

loadEnv();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_APP_ID: z.string().min(1, 'DISCORD_APP_ID is required'),
  GUILD_ID_ALLOWLIST: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  DB_PATH: z.string().default('data/bot.sqlite'),
  WEBHOOK_PORT: z.coerce.number().default(25570),
  WEBHOOK_SECRET: z.string().min(1, 'WEBHOOK_SECRET is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues.map((issue: ZodIssue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${formatted.join('\n')}`);
}

export const env = parsed.data;
