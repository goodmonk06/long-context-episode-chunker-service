import { buildServer } from './server';
import { config } from './lib/config';
import { prisma } from './lib/db';

async function start() {
  try {
    const server = await buildServer();

    // Test database connection
    await prisma.$connect();
    server.log.info('Database connected successfully');

    // Start server
    await server.listen({
      port: config.PORT,
      host: config.HOST,
    });

    server.log.info(`Server listening on http://${config.HOST}:${config.PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
