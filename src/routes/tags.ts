import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { emitSourceTagged, emitEpisodeTagged } from '../lib/events';
import { recordCounter } from '../lib/metrics';

const createTagCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const createTagSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional(),
  description: z.string().optional(),
});

const applyTagSchema = z.object({
  tagId: z.string(),
});

export async function tagsRoutes(server: FastifyInstance) {
  // ============================================================================
  // TAG CATEGORIES
  // ============================================================================

  // Create tag category
  server.post('/tags/categories', async (request, reply) => {
    const body = createTagCategorySchema.parse(request.body);

    const category = await prisma.tagCategory.create({
      data: body,
    });

    recordCounter('tag_category.created');
    return reply.status(201).send(category);
  });

  // List tag categories
  server.get('/tags/categories', async () => {
    const categories = await prisma.tagCategory.findMany({
      include: {
        _count: {
          select: { tags: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return categories;
  });

  // Get tag category
  server.get('/tags/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const category = await prisma.tagCategory.findUnique({
      where: { id },
      include: {
        tags: {
          include: {
            _count: {
              select: {
                sources: true,
                episodes: true,
              },
            },
          },
        },
      },
    });

    if (!category) {
      return reply.status(404).send({ error: 'Tag category not found' });
    }

    return category;
  });

  // Delete tag category
  server.delete('/tags/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.tagCategory.delete({
      where: { id },
    });

    recordCounter('tag_category.deleted');
    return reply.status(204).send();
  });

  // ============================================================================
  // TAGS
  // ============================================================================

  // Create tag
  server.post('/tags', async (request, reply) => {
    const body = createTagSchema.parse(request.body);

    const tag = await prisma.tag.create({
      data: body,
      include: {
        category: true,
      },
    });

    recordCounter('tag.created');
    return reply.status(201).send(tag);
  });

  // List tags
  server.get('/tags', async (request) => {
    const { category } = request.query as { category?: string };

    const tags = await prisma.tag.findMany({
      where: category ? { categoryId: category } : undefined,
      include: {
        category: true,
        _count: {
          select: {
            sources: true,
            episodes: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return tags;
  });

  // Get tag
  server.get('/tags/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const tag = await prisma.tag.findUnique({
      where: { id },
      include: {
        category: true,
        _count: {
          select: {
            sources: true,
            episodes: true,
          },
        },
      },
    });

    if (!tag) {
      return reply.status(404).send({ error: 'Tag not found' });
    }

    return tag;
  });

  // Delete tag
  server.delete('/tags/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.tag.delete({
      where: { id },
    });

    recordCounter('tag.deleted');
    return reply.status(204).send();
  });

  // ============================================================================
  // SOURCE TAGGING
  // ============================================================================

  // Apply tag to source
  server.post('/sources/:sourceId/tags', async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const body = applyTagSchema.parse(request.body);

    // Verify source and tag exist
    const [source, tag] = await Promise.all([
      prisma.sourceStream.findUnique({ where: { id: sourceId } }),
      prisma.tag.findUnique({ where: { id: body.tagId } }),
    ]);

    if (!source) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    if (!tag) {
      return reply.status(404).send({ error: 'Tag not found' });
    }

    // Create tag association
    const sourceTag = await prisma.sourceTag.create({
      data: {
        sourceId,
        tagId: body.tagId,
      },
      include: {
        tag: {
          include: { category: true },
        },
      },
    });

    emitSourceTagged(sourceId, body.tagId, tag.name);
    recordCounter('source.tagged');

    return reply.status(201).send(sourceTag);
  });

  // List tags for source
  server.get('/sources/:sourceId/tags', async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };

    const sourceTags = await prisma.sourceTag.findMany({
      where: { sourceId },
      include: {
        tag: {
          include: { category: true },
        },
      },
      orderBy: {
        tag: { name: 'asc' },
      },
    });

    return sourceTags.map((st) => st.tag);
  });

  // Remove tag from source
  server.delete('/sources/:sourceId/tags/:tagId', async (request, reply) => {
    const { sourceId, tagId } = request.params as { sourceId: string; tagId: string };

    await prisma.sourceTag.delete({
      where: {
        sourceId_tagId: {
          sourceId,
          tagId,
        },
      },
    });

    recordCounter('source.untagged');
    return reply.status(204).send();
  });

  // ============================================================================
  // EPISODE TAGGING
  // ============================================================================

  // Apply tag to episode
  server.post('/episodes/:episodeId/tags', async (request, reply) => {
    const { episodeId } = request.params as { episodeId: string };
    const body = applyTagSchema.parse(request.body);

    // Verify episode and tag exist
    const [episode, tag] = await Promise.all([
      prisma.episode.findUnique({ where: { id: episodeId } }),
      prisma.tag.findUnique({ where: { id: body.tagId } }),
    ]);

    if (!episode) {
      return reply.status(404).send({ error: 'Episode not found' });
    }

    if (!tag) {
      return reply.status(404).send({ error: 'Tag not found' });
    }

    // Create tag association
    const episodeTag = await prisma.episodeTag.create({
      data: {
        episodeId,
        tagId: body.tagId,
      },
      include: {
        tag: {
          include: { category: true },
        },
      },
    });

    emitEpisodeTagged(episodeId, body.tagId, tag.name);
    recordCounter('episode.tagged');

    return reply.status(201).send(episodeTag);
  });

  // List tags for episode
  server.get('/episodes/:episodeId/tags', async (request, reply) => {
    const { episodeId } = request.params as { episodeId: string };

    const episodeTags = await prisma.episodeTag.findMany({
      where: { episodeId },
      include: {
        tag: {
          include: { category: true },
        },
      },
      orderBy: {
        tag: { name: 'asc' },
      },
    });

    return episodeTags.map((et) => et.tag);
  });

  // Remove tag from episode
  server.delete('/episodes/:episodeId/tags/:tagId', async (request, reply) => {
    const { episodeId, tagId } = request.params as { episodeId: string; tagId: string };

    await prisma.episodeTag.delete({
      where: {
        episodeId_tagId: {
          episodeId,
          tagId,
        },
      },
    });

    recordCounter('episode.untagged');
    return reply.status(204).send();
  });

  // ============================================================================
  // QUERY BY TAGS
  // ============================================================================

  // Find sources by tag
  server.get('/tags/:tagId/sources', async (request, reply) => {
    const { tagId } = request.params as { tagId: string };

    const sourceTags = await prisma.sourceTag.findMany({
      where: { tagId },
      include: {
        source: {
          include: {
            _count: {
              select: {
                chunks: true,
                episodes: true,
              },
            },
          },
        },
      },
    });

    return sourceTags.map((st) => st.source);
  });

  // Find episodes by tag
  server.get('/tags/:tagId/episodes', async (request, reply) => {
    const { tagId } = request.params as { tagId: string };

    const episodeTags = await prisma.episodeTag.findMany({
      where: { tagId },
      include: {
        episode: {
          include: {
            source: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    return episodeTags.map((et) => et.episode);
  });
}
