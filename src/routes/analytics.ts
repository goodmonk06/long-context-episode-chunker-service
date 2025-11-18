import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db';
import { getMetricsAdapter } from '../lib/metrics';

export async function analyticsRoutes(server: FastifyInstance) {
  // Get overall system analytics
  server.get('/analytics/overview', async () => {
    const [
      totalSources,
      totalChunks,
      totalEpisodes,
      totalJobs,
      sourcesByType,
      sourcesByStatus,
      recentSources,
      recentEpisodes,
    ] = await Promise.all([
      prisma.sourceStream.count(),
      prisma.rawChunk.count(),
      prisma.episode.count(),
      prisma.segmentationJob.count(),

      // Group by type
      prisma.sourceStream.groupBy({
        by: ['type'],
        _count: true,
      }),

      // Group by status
      prisma.sourceStream.groupBy({
        by: ['status'],
        _count: true,
      }),

      // Recent activity
      prisma.sourceStream.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          type: true,
          createdAt: true,
        },
      }),

      prisma.episode.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          sourceId: true,
          createdAt: true,
        },
      }),
    ]);

    // Average episodes per source
    const avgEpisodesPerSource =
      totalSources > 0 ? Math.round((totalEpisodes / totalSources) * 100) / 100 : 0;

    // Average chunks per source
    const avgChunksPerSource =
      totalSources > 0 ? Math.round((totalChunks / totalSources) * 100) / 100 : 0;

    return {
      totals: {
        sources: totalSources,
        chunks: totalChunks,
        episodes: totalEpisodes,
        jobs: totalJobs,
      },
      averages: {
        episodesPerSource: avgEpisodesPerSource,
        chunksPerSource: avgChunksPerSource,
      },
      distribution: {
        sourcesByType: sourcesByType.map((item) => ({
          type: item.type,
          count: item._count,
        })),
        sourcesByStatus: sourcesByStatus.map((item) => ({
          status: item.status,
          count: item._count,
        })),
      },
      recent: {
        sources: recentSources,
        episodes: recentEpisodes,
      },
    };
  });

  // Get source-specific analytics
  server.get('/analytics/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await prisma.sourceStream.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            chunks: true,
            episodes: true,
            segmentationJobs: true,
            tags: true,
          },
        },
        episodes: {
          select: {
            confidence: true,
            qualityScore: true,
            startChunkIndex: true,
            endChunkIndex: true,
          },
        },
      },
    });

    if (!source) {
      return reply.status(404).send({ error: 'Source not found' });
    }

    // Calculate episode size stats
    const episodeSizes = source.episodes.map(
      (ep) => ep.endChunkIndex - ep.startChunkIndex + 1
    );
    const avgEpisodeSize =
      episodeSizes.length > 0
        ? episodeSizes.reduce((a, b) => a + b, 0) / episodeSizes.length
        : 0;
    const minEpisodeSize = episodeSizes.length > 0 ? Math.min(...episodeSizes) : 0;
    const maxEpisodeSize = episodeSizes.length > 0 ? Math.max(...episodeSizes) : 0;

    // Calculate confidence and quality stats
    const confidences = source.episodes
      .map((ep) => ep.confidence)
      .filter((c): c is number => c !== null);
    const avgConfidence =
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

    const qualityScores = source.episodes
      .map((ep) => ep.qualityScore)
      .filter((q): q is number => q !== null);
    const avgQuality =
      qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : null;

    return {
      sourceId: source.id,
      sourceName: source.name,
      counts: {
        chunks: source._count.chunks,
        episodes: source._count.episodes,
        jobs: source._count.segmentationJobs,
        tags: source._count.tags,
      },
      episodeStats: {
        avgSize: Math.round(avgEpisodeSize * 100) / 100,
        minSize: minEpisodeSize,
        maxSize: maxEpisodeSize,
      },
      quality: {
        avgConfidence: avgConfidence ? Math.round(avgConfidence * 1000) / 1000 : null,
        avgQualityScore: avgQuality ? Math.round(avgQuality * 1000) / 1000 : null,
      },
    };
  });

  // Get tag analytics
  server.get('/analytics/tags', async () => {
    const tags = await prisma.tag.findMany({
      include: {
        category: true,
        _count: {
          select: {
            sources: true,
            episodes: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const tagsByCategory = tags.reduce((acc, tag) => {
      const categoryName = tag.category?.name || 'Uncategorized';
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push({
        id: tag.id,
        name: tag.name,
        sourceCount: tag._count.sources,
        episodeCount: tag._count.episodes,
      });
      return acc;
    }, {} as Record<string, any[]>);

    const mostUsedTags = tags
      .sort((a, b) => b._count.sources + b._count.episodes - (a._count.sources + a._count.episodes))
      .slice(0, 10)
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        category: tag.category?.name,
        totalUsage: tag._count.sources + tag._count.episodes,
        sources: tag._count.sources,
        episodes: tag._count.episodes,
      }));

    return {
      totalTags: tags.length,
      tagsByCategory,
      mostUsedTags,
    };
  });

  // Get metrics (from metrics adapter)
  server.get('/analytics/metrics', async () => {
    const metricsAdapter = getMetricsAdapter();

    // If it's the in-memory adapter, we can get all metrics
    if ('getAllMetrics' in metricsAdapter) {
      return (metricsAdapter as any).getAllMetrics();
    }

    return {
      message: 'Metrics adapter does not support direct retrieval',
    };
  });

  // Create analytics snapshot
  server.post('/analytics/snapshots', async (request, reply) => {
    const { type = 'on_demand' } = request.body as { type?: string };

    const now = new Date();
    const [totalSources, totalChunks, totalEpisodes, totalJobs] = await Promise.all([
      prisma.sourceStream.count(),
      prisma.rawChunk.count(),
      prisma.episode.count(),
      prisma.segmentationJob.count(),
    ]);

    const snapshot = await prisma.analyticsSnapshot.create({
      data: {
        snapshotType: type,
        startDate: now,
        endDate: now,
        metrics: {
          totalSources,
          totalChunks,
          totalEpisodes,
          totalJobs,
          timestamp: now.toISOString(),
        },
      },
    });

    return reply.status(201).send(snapshot);
  });

  // List analytics snapshots
  server.get('/analytics/snapshots', async (request) => {
    const { type, limit = '50' } = request.query as { type?: string; limit?: string };

    const snapshots = await prisma.analyticsSnapshot.findMany({
      where: type ? { snapshotType: type } : undefined,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });

    return snapshots;
  });

  // Get specific snapshot
  server.get('/analytics/snapshots/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const snapshot = await prisma.analyticsSnapshot.findUnique({
      where: { id },
    });

    if (!snapshot) {
      return reply.status(404).send({ error: 'Snapshot not found' });
    }

    return snapshot;
  });
}
