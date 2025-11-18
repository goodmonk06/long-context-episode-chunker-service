// Segmenter adapter for pluggable segmentation strategies

import { RawChunk } from '@prisma/client';
import { EpisodeSegment } from '../../services/heuristic-segmenter';

export interface SegmenterConfig {
  minChunks?: number;
  maxChunks?: number;
  [key: string]: unknown;
}

export interface ISegmenterAdapter {
  name: string;
  segment(chunks: RawChunk[], config?: SegmenterConfig): Promise<EpisodeSegment[]> | EpisodeSegment[];
}

// Registry for segmenter adapters
class SegmenterRegistry {
  private adapters: Map<string, ISegmenterAdapter> = new Map();

  register(adapter: ISegmenterAdapter) {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): ISegmenterAdapter | undefined {
    return this.adapters.get(name);
  }

  has(name: string): boolean {
    return this.adapters.has(name);
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  clear() {
    this.adapters.clear();
  }
}

export const segmenterRegistry = new SegmenterRegistry();

// Example: Length-based simple segmenter
export class LengthBasedSegmenter implements ISegmenterAdapter {
  name = 'length';

  segment(chunks: RawChunk[], config?: SegmenterConfig): EpisodeSegment[] {
    const maxChunks = config?.maxChunks || 10;
    const segments: EpisodeSegment[] = [];

    for (let i = 0; i < chunks.length; i += maxChunks) {
      const segmentChunks = chunks.slice(i, Math.min(i + maxChunks, chunks.length));
      if (segmentChunks.length === 0) continue;

      segments.push({
        startChunkIndex: segmentChunks[0].index,
        endChunkIndex: segmentChunks[segmentChunks.length - 1].index,
        chunks: segmentChunks,
        title: `Episode ${segments.length + 1}`,
        summary: `Contains ${segmentChunks.length} chunks (${segmentChunks[0].index}-${segmentChunks[segmentChunks.length - 1].index})`,
      });
    }

    return segments;
  }
}

// Example: Timestamp-based segmenter (for chunks with timestamps)
export class TimestampBasedSegmenter implements ISegmenterAdapter {
  name = 'timestamp';

  segment(chunks: RawChunk[], config?: SegmenterConfig): EpisodeSegment[] {
    const timeGapMinutes = (config?.timeGapMinutes as number) || 30; // Default 30 minute gap
    const segments: EpisodeSegment[] = [];
    let currentSegment: RawChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const timestamp = chunk.timestamp;

      if (!timestamp) {
        // No timestamp, add to current segment
        currentSegment.push(chunk);
        continue;
      }

      if (currentSegment.length === 0) {
        currentSegment.push(chunk);
        continue;
      }

      // Check time gap
      const lastTimestamp = currentSegment[currentSegment.length - 1].timestamp;
      if (lastTimestamp) {
        const gapMs = new Date(timestamp).getTime() - new Date(lastTimestamp).getTime();
        const gapMinutes = gapMs / (1000 * 60);

        if (gapMinutes > timeGapMinutes) {
          // Start new segment
          segments.push(this.createSegment(currentSegment, segments.length));
          currentSegment = [chunk];
          continue;
        }
      }

      currentSegment.push(chunk);
    }

    // Add final segment
    if (currentSegment.length > 0) {
      segments.push(this.createSegment(currentSegment, segments.length));
    }

    return segments;
  }

  private createSegment(chunks: RawChunk[], index: number): EpisodeSegment {
    const firstTimestamp = chunks[0].timestamp;
    const lastTimestamp = chunks[chunks.length - 1].timestamp;
    const timeRange = firstTimestamp && lastTimestamp
      ? `${new Date(firstTimestamp).toLocaleString()} - ${new Date(lastTimestamp).toLocaleString()}`
      : 'Unknown time range';

    return {
      startChunkIndex: chunks[0].index,
      endChunkIndex: chunks[chunks.length - 1].index,
      chunks,
      title: `Episode ${index + 1}: ${timeRange}`,
      summary: `${chunks.length} chunks spanning ${timeRange}`,
    };
  }
}

// Example: Speaker-based segmenter (groups by unique speaker)
export class SpeakerBasedSegmenter implements ISegmenterAdapter {
  name = 'speaker';

  segment(chunks: RawChunk[], config?: SegmenterConfig): EpisodeSegment[] {
    const maxChunks = config?.maxChunks || 50;
    const segments: EpisodeSegment[] = [];
    let currentSegment: RawChunk[] = [];
    let currentSpeaker: string | null = null;

    for (const chunk of chunks) {
      const speaker = chunk.speakerName || this.extractSpeaker(chunk.text);

      if (currentSegment.length === 0) {
        currentSegment.push(chunk);
        currentSpeaker = speaker;
        continue;
      }

      // Check if speaker changed or segment too long
      if (speaker !== currentSpeaker || currentSegment.length >= maxChunks) {
        segments.push(this.createSegment(currentSegment, segments.length, currentSpeaker));
        currentSegment = [chunk];
        currentSpeaker = speaker;
      } else {
        currentSegment.push(chunk);
      }
    }

    // Add final segment
    if (currentSegment.length > 0) {
      segments.push(this.createSegment(currentSegment, segments.length, currentSpeaker));
    }

    return segments;
  }

  private extractSpeaker(text: string): string | null {
    const patterns = [
      /^(User|Assistant|System|Speaker \d+|[A-Z][a-z]+):/,
      /^\[[^\]]+\]:/,
      /^>\s*\w+:/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].replace(/[:\[\]>]/g, '').trim();
      }
    }

    return null;
  }

  private createSegment(chunks: RawChunk[], index: number, speaker: string | null): EpisodeSegment {
    const speakerName = speaker || 'Unknown';

    return {
      startChunkIndex: chunks[0].index,
      endChunkIndex: chunks[chunks.length - 1].index,
      chunks,
      title: `${speakerName} (Episode ${index + 1})`,
      summary: `${chunks.length} messages from ${speakerName}`,
    };
  }
}

// Register built-in adapters
segmenterRegistry.register(new LengthBasedSegmenter());
segmenterRegistry.register(new TimestampBasedSegmenter());
segmenterRegistry.register(new SpeakerBasedSegmenter());
