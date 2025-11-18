import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './lib/config';
import { prisma } from './lib/db';
import { sourcesRoutes } from './routes/sources';
import { episodesRoutes } from './routes/episodes';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: config.NODE_ENV === 'development' ? 'debug' : 'info',
      transport: config.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
  });

  // Plugins
  await server.register(cors, {
    origin: true,
  });

  // Health check
  server.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      server.log.error(error);
      return { status: 'unhealthy', error: 'Database connection failed' };
    }
  });

  // API routes
  await server.register(sourcesRoutes, { prefix: '/api' });
  await server.register(episodesRoutes, { prefix: '/api' });

  // Root
  server.get('/', async () => {
    return {
      name: 'Episode Chunker Service',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        sources: '/api/sources',
        episodes: '/api/episodes',
      },
    };
  });

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: error.name,
      message: error.message,
      statusCode: error.statusCode || 500,
    });
  });

  return server;
}
