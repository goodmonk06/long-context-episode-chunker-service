import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './lib/config';
import { prisma } from './lib/db';
import { logger } from './lib/logger';
import { Metrics, startMetricTimer } from './lib/metrics';
import { sourcesRoutes } from './routes/sources';
import { episodesRoutes } from './routes/episodes';
import { tagsRoutes } from './routes/tags';
import { jobsRoutes } from './routes/jobs';
import { analyticsRoutes } from './routes/analytics';

export async function buildServer() {
  const server = Fastify({
    logger,
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
  });

  // Plugins
  await server.register(cors, {
    origin: true,
  });

  // Request timing and metrics hook
  server.addHook('onRequest', async (request) => {
    (request as any).startTime = Date.now();
  });

  server.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - ((request as any).startTime || Date.now());
    const method = request.method;
    const url = request.url;
    const statusCode = reply.statusCode;

    // Record metrics
    Metrics.apiRequest(method, url);
    Metrics.apiLatency(method, url, duration);

    if (statusCode >= 400) {
      Metrics.apiError(statusCode);
    }

    server.log.info({
      method,
      url,
      statusCode,
      duration,
    }, 'Request completed');
  });

  // Error tracking hook
  server.addHook('onError', async (request, reply, error) => {
    server.log.error({
      method: request.method,
      url: request.url,
      error: error.message,
      stack: error.stack,
    }, 'Request error');
  });

  // Health check
  server.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    } catch (error) {
      server.log.error(error);
      return {
        status: 'unhealthy',
        error: 'Database connection failed',
        timestamp: new Date().toISOString(),
      };
    }
  });

  // Readiness check
  server.get('/ready', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        ready: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      server.log.error(error);
      throw error;
    }
  });

  // API routes
  await server.register(sourcesRoutes, { prefix: '/api' });
  await server.register(episodesRoutes, { prefix: '/api' });
  await server.register(tagsRoutes, { prefix: '/api' });
  await server.register(jobsRoutes, { prefix: '/api' });
  await server.register(analyticsRoutes, { prefix: '/api' });

  // Root
  server.get('/', async () => {
    return {
      name: 'Episode Chunker Service',
      version: '1.0.0',
      environment: config.NODE_ENV,
      endpoints: {
        health: '/health',
        ready: '/ready',
        sources: '/api/sources',
        episodes: '/api/episodes',
        tags: '/api/tags',
        jobs: '/api/jobs',
        analytics: '/api/analytics',
      },
      documentation: {
        readme: 'https://github.com/your-org/episode-chunker/blob/main/README.md',
        api: '/api/docs',
      },
    };
  });

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);

    // Handle validation errors
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.message,
        statusCode: 400,
      });
    }

    // Handle Prisma errors
    if (error.name === 'PrismaClientKnownRequestError') {
      return reply.status(400).send({
        error: 'Database Error',
        message: error.message,
        statusCode: 400,
      });
    }

    // Generic error
    reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
    });
  });

  // 404 handler
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404,
    });
  });

  return server;
}
