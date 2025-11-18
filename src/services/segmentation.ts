import { SourceStream, RawChunk, Episode } from '@prisma/client';
import { prisma } from '../lib/db';
import { config } from '../lib/config';
import { HeuristicSegmenter } from './heuristic-segmenter';
import { LLMSegmenter } from './llm-segmenter';

export interface SegmentationOptions {
  mode?: 'heuristic' | 'llm';
  minChunks?: number;
  maxChunks?: number;
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

  if (chunks.length === 0) {
    throw new Error('Source has no chunks to segment');
  }

  console.log(`Segmenting source ${source.id} with ${chunks.length} chunks using ${mode} mode`);

  let segments;

  try {
    if (mode === 'llm') {
      // Try LLM first
      segments = await segmentWithLLM(chunks, options);
    } else {
      // Use heuristic
      segments = segmentWithHeuristic(chunks, options);
    }
  } catch (error) {
    console.error(`Segmentation failed with ${mode} mode:`, error);

    // Fallback to heuristic if LLM fails
    if (mode === 'llm') {
      console.log('Falling back to heuristic segmentation');
      segments = segmentWithHeuristic(chunks, options);
    } else {
      throw error;
    }
  }

  // Delete existing episodes for this source
  await prisma.episode.deleteMany({
    where: { sourceId: source.id },
  });

  // Create new episodes
  const episodes = await prisma.$transaction(
    segments.map((segment, index) =>
      prisma.episode.create({
        data: {
          sourceId: source.id,
          episodeIndex: index,
          title: segment.title,
          summary: segment.summary,
          startChunkIndex: segment.startChunkIndex,
          endChunkIndex: segment.endChunkIndex,
          metaJson: {
            chunkCount: segment.chunks.length,
            segmentationMode: mode,
          },
        },
      })
    )
  );

  console.log(`Created ${episodes.length} episodes for source ${source.id}`);

  return episodes;
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

// Utility function to re-segment a source by ID
export async function resegmentSource(sourceId: string, options: SegmentationOptions = {}): Promise<Episode[]> {
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
