import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 chars'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('scheduler'),
  DB_PASSWORD: z.string().default('scheduler'),
  DB_NAME: z.string().default('email_scheduler'),

  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  ELASTICSEARCH_URL: z.string().default('http://127.0.0.1:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(50),
  SEND_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  RUN_WORKER_IN_API: bool,

  SMTP_SENDERS: z.string().optional().default(''),
  ETHEREAL_AUTO_SENDERS: z.coerce.number().int().min(1).default(2),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:5173/api/auth/google/callback'),

  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().optional().default(''),

  BULL_BOARD_USER: z.string().optional().default(''),
  BULL_BOARD_PASSWORD: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
