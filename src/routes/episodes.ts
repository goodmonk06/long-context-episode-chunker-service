import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db';

export async function episodesRoutes(server: FastifyInstance) {
  // Get all episodes for a source
  server.get('/sources/:id/episodes', async (request, reply) => {
    const { id } = request.params as { id: string };

    const episodes = await prisma.episode.findMany({
      where: { sourceId: id },
      orderBy: { episodeIndex: 'asc' },
    });

    return episodes;
  });

  // Get a specific episode
  server.get('/episodes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const episode = await prisma.episode.findUnique({
      where: { id },
      include: {
        source: true,
      },
    });

    if (!episode) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    return episode;
  });

  // Get episode with its chunks
  server.get('/episodes/:id/chunks', async (request, reply) => {
    const { id } = request.params as { id: string };

    const episode = await prisma.episode.findUnique({
      where: { id },
    });

    if (!episode) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    const chunks = await prisma.rawChunk.findMany({
      where: {
        sourceId: episode.sourceId,
        index: {
          gte: episode.startChunkIndex,
          lte: episode.endChunkIndex,
        },
      },
      orderBy: { index: 'asc' },
    });

    return {
      episode,
      chunks,
      fullText: chunks.map(c => c.text).join('\n'),
    };
  });

  // List all episodes (paginated)
  server.get('/episodes', async (request) => {
    const { offset = '0', limit = '50' } = request.query as { offset?: string; limit?: string };

    const episodes = await prisma.episode.findMany({
      include: {
        source: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: [
        { sourceId: 'asc' },
        { episodeIndex: 'asc' },
      ],
      skip: parseInt(offset),
      take: parseInt(limit),
    });

    return episodes;
  });
}
