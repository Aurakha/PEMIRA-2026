import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env';
import { authRoutes } from './modules/auth/auth.controller';
import { voteRoutes } from './modules/vote/vote.controller';
import { tallyRoutes } from './modules/admin/tally.controller';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    trustProxy: true,
  });

  // 1. Helmet Security Headers
  server.register(helmet, {
    contentSecurityPolicy: false, // Di-handle oleh Nginx reverse proxy
  });

  // 2. CORS
  server.register(cors, {
    origin: true,
    credentials: true,
  });

  // 3. In-Memory / Redis Rate Limiter
  server.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  // 4. JWT Authentication
  server.register(jwt, {
    secret: env.JWT_SECRET,
  });

  server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Token otentikasi tidak valid atau telah usang.' });
    }
  });

  // 5. Health Check Endpoint
  server.get('/health', async () => {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // 6. Registrasi Routes API
  server.register(authRoutes, { prefix: '/api/auth' });
  server.register(voteRoutes, { prefix: '/api/vote' });
  server.register(tallyRoutes, { prefix: '/api/admin' });

  return server;
}

async function start() {
  const server = buildServer();

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    console.log(`[PEMIRA API] Server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
