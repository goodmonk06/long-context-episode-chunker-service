import { SourceStream, RawChunk, Episode } from '@prisma/client';
import { prisma } from '../lib/db';
import { config } from '../lib/config';
import { logInfo, logError, startTimer } from '../lib/logger';
import { Metrics } from '../lib/metrics';
import {
  emitSegmentationStarted,
  emitSegmentationCompleted,
  emitSegmentationFailed,
  emitEpisodeCreated,
} from '../lib/events';
import { HeuristicSegmenter } from './heuristic-segmenter';
import { LLMSegmenter } from './llm-segmenter';
import { segmenterRegistry } from '../lib/adapters/segmenter.adapter';

export interface SegmentationOptions {
  mode?: string; // 'heuristic', 'llm', or any registered custom adapter
  minChunks?: number;
  maxChunks?: number;
  createJob?: boolean; // Whether to create a SegmentationJob record
  [key: string]: unknown; // Allow additional config for custom segmenters
}

type SourceWithChunks = SourceStream & {
  chunks: RawChunk[];
};

export async function segmentSource(
  source: SourceWithChunks,
  options: SegmentationOptions = {}
): Promise<Episode[]> {
  const mode = options.mode || config.DEFAULT_SEGMENTATION_MODE;
  const chunks = source.chunks;
  const createJob = options.createJob !== false; // Default to true

  if (chunks.length === 0) {
    throw new Error('Source has no chunks to segment');
  }

  logInfo(`Starting segmentation for source ${source.id}`, {
    sourceId: source.id,
    mode,
    chunkCount: chunks.length,
  });

  // Create segmentation job if requested
  let job;
  if (createJob) {
    job = await prisma.segmentationJob.create({
      data: {
        sourceId: source.id,
        mode,
        status: 'RUNNING',
        config: options,
        startedAt: new Date(),
      },
    });

    emitSegmentationStarted(source.id, job.id, mode);
    Metrics.segmentationStarted(mode);
  }

  const timer = startTimer('segmentation');
  let episodes: Episode[] = [];

  try {
    // Get segments using appropriate segmenter
    const segments = await getSegments(chunks, mode, options);

    // Delete existing episodes for this source
    await prisma.episode.deleteMany({
      where: { sourceId: source.id },
    });

    // Create new episodes
    episodes = await prisma.$transaction(
      segments.map((segment, index) =>
        prisma.episode.create({
          data: {
            sourceId: source.id,
            episodeIndex: index,
            title: segment.title,
            summary: segment.summary,
            startChunkIndex: segment.startChunkIndex,
            endChunkIndex: segment.endChunkIndex,
            segmentationMode: mode,
            confidence: calculateConfidence(segment),
            qualityScore: calculateQuality(segment),
            metaJson: {
              chunkCount: segment.chunks.length,
              segmentationMode: mode,
            },
          },
        })
      )
    );

    // Emit events for each episode
    episodes.forEach((episode) => {
      emitEpisodeCreated(episode.id, episode.sourceId, episode.episodeIndex, episode.title || undefined);
      Metrics.episodeCreated(mode);
    });

    // Update source totals
    await prisma.sourceStream.update({
      where: { id: source.id },
      data: {
        totalEpisodes: episodes.length,
        status: 'COMPLETED',
      },
    });

    const duration = timer();

    // Update job if created
    if (job) {
      await prisma.segmentationJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          episodesCreated: episodes.length,
          completedAt: new Date(),
          duration,
        },
      });

      emitSegmentationCompleted(source.id, job.id, mode, episodes.length, duration);
    }

    Metrics.segmentationCompleted(mode, duration);

    logInfo(`Segmentation completed for source ${source.id}`, {
      sourceId: source.id,
      mode,
      episodesCreated: episodes.length,
      duration,
    });

    return episodes;
  } catch (error) {
    const duration = timer();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logError(`Segmentation failed for source ${source.id}`, error as Error, {
      sourceId: source.id,
      mode,
    });

    // Update job if created
    if (job) {
      await prisma.segmentationJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
          duration,
        },
      });

      emitSegmentationFailed(source.id, job.id, mode, errorMessage);
    }

    Metrics.segmentationFailed(mode);

    // Update source status
    await prisma.sourceStream.update({
      where: { id: source.id },
      data: {
        status: 'FAILED',
      },
    });

    throw error;
  }
}

async function getSegments(chunks: RawChunk[], mode: string, options: SegmentationOptions) {
  // Check if there's a custom segmenter registered
  if (segmenterRegistry.has(mode)) {
    const segmenter = segmenterRegistry.get(mode)!;
    logInfo(`Using custom segmenter: ${mode}`);
    return await segmenter.segment(chunks, options);
  }

  // Built-in segmenters
  if (mode === 'llm') {
    try {
      return await segmentWithLLM(chunks, options);
    } catch (error) {
      logError('LLM segmentation failed, falling back to heuristic', error as Error);
      return segmentWithHeuristic(chunks, options);
    }
  } else if (mode === 'heuristic') {
    return segmentWithHeuristic(chunks, options);
  } else {
    throw new Error(`Unknown segmentation mode: ${mode}`);
  }
}

function segmentWithHeuristic(chunks: RawChunk[], options: SegmentationOptions) {
  const segmenter = new HeuristicSegmenter({
    minChunks: options.minChunks,
    maxChunks: options.maxChunks,
  });

  return segmenter.segment(chunks);
}

async function segmentWithLLM(chunks: RawChunk[], options: SegmentationOptions) {
  const segmenter = new LLMSegmenter({
    minChunks: options.minChunks,
    maxChunks: options.maxChunks,
  });

  return await segmenter.segment(chunks);
}

function calculateConfidence(segment: any): number {
  // Simple confidence calculation based on segment characteristics
  // In a real implementation, this could use more sophisticated metrics

  const chunkCount = segment.chunks.length;
  let confidence = 0.5; // Base confidence

  // Higher confidence for segments with clear speaker patterns
  const hasStructuredText = segment.chunks.some((chunk: RawChunk) =>
    /^(User|Assistant|Speaker|[A-Z][a-z]+):/.test(chunk.text)
  );
  if (hasStructuredText) {
    confidence += 0.2;
  }

  // Higher confidence for moderate-sized segments
  if (chunkCount >= 3 && chunkCount <= 20) {
    confidence += 0.2;
  }

  // Lower confidence for very small or very large segments
  if (chunkCount < 2) {
    confidence -= 0.2;
  }
  if (chunkCount > 50) {
    confidence -= 0.1;
  }

  return Math.max(0, Math.min(1, confidence));
}

function calculateQuality(segment: any): number {
  // Simple quality score based on segment characteristics

  const chunkCount = segment.chunks.length;
  const totalLength = segment.chunks.reduce((sum: number, chunk: RawChunk) => sum + chunk.text.length, 0);
  const avgChunkLength = totalLength / chunkCount;

  let quality = 0.5; // Base quality

  // Better quality for well-sized chunks
  if (avgChunkLength >= 50 && avgChunkLength <= 500) {
    quality += 0.2;
  }

  // Better quality for title and summary
  if (segment.title && segment.title.length > 10) {
    quality += 0.15;
  }
  if (segment.summary && segment.summary.length > 50) {
    quality += 0.15;
  }

  return Math.max(0, Math.min(1, quality));
}

// Utility function to re-segment a source by ID
export async function resegmentSource(
  sourceId: string,
  options: SegmentationOptions = {}
): Promise<Episode[]> {
  const source = await prisma.sourceStream.findUnique({
    where: { id: sourceId },
    include: {
      chunks: {
        orderBy: { index: 'asc' },
      },
    },
  });

  if (!source) {
    throw new Error('Source not found');
  }

  return segmentSource(source, options);
}

// Batch segmentation for multiple sources
export async function batchSegment(
  sourceIds: string[],
  options: SegmentationOptions = {}
): Promise<{ sourceId: string; episodeCount: number; success: boolean; error?: string }[]> {
  const results = [];

  for (const sourceId of sourceIds) {
    try {
      const episodes = await resegmentSource(sourceId, options);
      results.push({
        sourceId,
        episodeCount: episodes.length,
        success: true,
      });
    } catch (error) {
      results.push({
        sourceId,
        episodeCount: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
