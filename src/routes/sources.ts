import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { segmentSource } from '../services/segmentation';

const createSourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['CHAT', 'MEETING', 'LOG', 'TRANSCRIPT', 'OTHER']),
  metaJson: z.record(z.any()).optional(),
});

const addChunksSchema = z.object({
  chunks: z.array(z.object({
    text: z.string().min(1),
    index: z.number().int().nonnegative().optional(),
  })).min(1),
});

const segmentOptionsSchema = z.object({
  mode: z.enum(['heuristic', 'llm']).optional(),
  minChunks: z.number().int().positive().optional(),
  maxChunks: z.number().int().positive().optional(),
});

export async function sourcesRoutes(server: FastifyInstance) {
  // Create a new source stream
  server.post('/sources', async (request, reply) => {
    const body = createSourceSchema.parse(request.body);

    const source = await prisma.sourceStream.create({
      data: {
        name: body.name,
        type: body.type,
        metaJson: body.metaJson || {},
      },
    });

    return reply.status(201).send(source);
  });

  // List all sources
  server.get('/sources', async () => {
    const sources = await prisma.sourceStream.findMany({
      include: {
        _count: {
          select: {
            chunks: true,
            episodes: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sources;
  });

  // Get a specific source
  server.get('/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await prisma.sourceStream.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            chunks: true,
            episodes: true,
          },
        },
      },
    });

    if (!source) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    return source;
  });

  // Add chunks to a source
  server.post('/sources/:id/chunks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = addChunksSchema.parse(request.body);

    // Verify source exists
    const source = await prisma.sourceStream.findUnique({
      where: { id },
    });

    if (!source) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    // Get the current max index
    const maxChunk = await prisma.rawChunk.findFirst({
      where: { sourceId: id },
      orderBy: { index: 'desc' },
      select: { index: true },
    });

    const startIndex = maxChunk ? maxChunk.index + 1 : 0;

    // Create chunks with auto-incrementing indices
    const chunks = await prisma.$transaction(
      body.chunks.map((chunk, i) =>
        prisma.rawChunk.create({
          data: {
            sourceId: id,
            index: chunk.index !== undefined ? chunk.index : startIndex + i,
            text: chunk.text,
          },
        })
      )
    );

    return reply.status(201).send({
      message: `Added ${chunks.length} chunks`,
      chunks,
    });
  });

  // Trigger segmentation for a source
  server.post('/sources/:id/segment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = segmentOptionsSchema.parse(request.body || {});

    // Verify source exists
    const source = await prisma.sourceStream.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { index: 'asc' },
        },
      },
    });

    if (!source) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    if (source.chunks.length === 0) {
      return reply.status(400).send({ error: 'Source has no chunks to segment' });
    }

    // Run segmentation
    const episodes = await segmentSource(source, {
      mode: body.mode,
      minChunks: body.minChunks,
      maxChunks: body.maxChunks,
    });

    return reply.status(200).send({
      message: `Created ${episodes.length} episodes`,
      episodes,
    });
  });

  // Get chunks for a source
  server.get('/sources/:id/chunks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { offset = '0', limit = '100' } = request.query as { offset?: string; limit?: string };

    const chunks = await prisma.rawChunk.findMany({
      where: { sourceId: id },
      orderBy: { index: 'asc' },
      skip: parseInt(offset),
      take: parseInt(limit),
    });

    return chunks;
  });
}
