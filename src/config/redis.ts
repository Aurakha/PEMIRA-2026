import Redis from 'ioredis';
import { env } from './env';

export const redisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Wajib null untuk kompatibilitas BullMQ
  enableReadyCheck: false,
};

export const redis = new Redis(redisConfig);

redis.on('connect', () => {
  console.log('[REDIS] Connected successfully to Redis server');
});

redis.on('error', (err) => {
  console.error('[REDIS ERROR]:', err);
});
