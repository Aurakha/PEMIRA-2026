import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://postgres:postgrespassword123@localhost:6432/pemira_db'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default('redispassword123'),
  JWT_SECRET: z.string().default('super_secure_pemira_jwt_secret_key_2026_xyz'),
  VOTING_SECRET_KEY: z.string().default('server_blinded_receipt_salt_hash_key_2026'),
  GOOGLE_CLIENT_ID: z.string().default('mock_google_client_id_for_dev'),
  ALLOWED_EMAIL_DOMAINS: z.string().default('mahasiswa.ac.id,campus.ac.id,gmail.com'),
  CLOUDFLARE_TURNSTILE_SECRET_KEY: z.string().default('1x0000000000000000000000000000000AA'),
  ENABLE_TURNSTILE: z.string().transform((val) => val === 'true').default('false'),
});

export const env = envSchema.parse(process.env);
