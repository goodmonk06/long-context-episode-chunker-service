import { RawChunk } from '@prisma/client';
import { config } from '../lib/config';

export interface SegmentBoundary {
  chunkIndex: number;
  reason: 'speaker_change' | 'length_limit' | 'topic_shift' | 'force';
}

export interface EpisodeSegment {
  startChunkIndex: number;
  endChunkIndex: number;
  chunks: RawChunk[];
  title: string;
  summary: string;
}

const SPEAKER_PATTERNS = [
  /^(User|Assistant|System|Speaker \d+|[A-Z][a-z]+):/, // "User:", "Alice:", etc.
  /^\[[^\]]+\]:/, // "[John]:", "[System]:", etc.
  /^>\s*\w+:/, // "> User:", "> Bot:", etc.
];

const TOPIC_SHIFT_KEYWORDS = [
  'moving on',
  'next topic',
  'changing subject',
  'new topic',
  'let\'s discuss',
  'switching to',
  'now for',
  '---',
  '===',
];

export class HeuristicSegmenter {
  private minChunks: number;
  private maxChunks: number;

  constructor(options?: { minChunks?: number; maxChunks?: number }) {
    this.minChunks = options?.minChunks || config.MIN_EPISODE_CHUNKS;
    this.maxChunks = options?.maxChunks || config.MAX_EPISODE_CHUNKS;
  }

  segment(chunks: RawChunk[]): EpisodeSegment[] {
    if (chunks.length === 0) return [];

    const boundaries = this.findBoundaries(chunks);
    return this.createSegments(chunks, boundaries);
  }

  private findBoundaries(chunks: RawChunk[]): SegmentBoundary[] {
    const boundaries: SegmentBoundary[] = [];
    let lastBoundary = 0;

    for (let i = 1; i < chunks.length; i++) {
      const currentChunk = chunks[i];
      const prevChunk = chunks[i - 1];
      const chunksSinceLastBoundary = i - lastBoundary;

      // Force boundary if we've hit max chunks
      if (chunksSinceLastBoundary >= this.maxChunks) {
        boundaries.push({ chunkIndex: i, reason: 'length_limit' });
        lastBoundary = i;
        continue;
      }

      // Skip if we haven't reached minimum chunks yet
      if (chunksSinceLastBoundary < this.minChunks) {
        continue;
      }

      // Check for speaker change
      if (this.detectSpeakerChange(prevChunk.text, currentChunk.text)) {
        boundaries.push({ chunkIndex: i, reason: 'speaker_change' });
        lastBoundary = i;
        continue;
      }

      // Check for topic shift markers
      if (this.detectTopicShift(currentChunk.text)) {
        boundaries.push({ chunkIndex: i, reason: 'topic_shift' });
        lastBoundary = i;
        continue;
      }
    }

    return boundaries;
  }

  private detectSpeakerChange(prevText: string, currentText: string): boolean {
    const prevSpeaker = this.extractSpeaker(prevText);
    const currentSpeaker = this.extractSpeaker(currentText);

    if (!prevSpeaker || !currentSpeaker) return false;
    return prevSpeaker !== currentSpeaker;
  }

  private extractSpeaker(text: string): string | null {
    for (const pattern of SPEAKER_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return match[0].replace(/[:\[\]>]/g, '').trim();
      }
    }
    return null;
  }

  private detectTopicShift(text: string): boolean {
    const lowerText = text.toLowerCase();
    return TOPIC_SHIFT_KEYWORDS.some(keyword => lowerText.includes(keyword));
  }

  private createSegments(chunks: RawChunk[], boundaries: SegmentBoundary[]): EpisodeSegment[] {
    const segments: EpisodeSegment[] = [];
    let startIndex = 0;

    // Add boundaries for each segment
    const allBoundaries = [...boundaries.map(b => b.chunkIndex), chunks.length];

    for (const endIndex of allBoundaries) {
      const segmentChunks = chunks.slice(startIndex, endIndex);
      if (segmentChunks.length === 0) continue;

      const segment: EpisodeSegment = {
        startChunkIndex: segmentChunks[0].index,
        endChunkIndex: segmentChunks[segmentChunks.length - 1].index,
        chunks: segmentChunks,
        title: this.generateTitle(segmentChunks),
        summary: this.generateSummary(segmentChunks),
      };

      segments.push(segment);
      startIndex = endIndex;
    }

    return segments;
  }

  private generateTitle(chunks: RawChunk[]): string {
    // Extract first meaningful sentence or speaker
    const firstChunk = chunks[0].text.trim();
    const speaker = this.extractSpeaker(firstChunk);

    if (speaker) {
      const content = firstChunk.replace(SPEAKER_PATTERNS[0], '').trim();
      const firstSentence = content.split(/[.!?]/)[0].trim();
      return `${speaker}: ${firstSentence.slice(0, 50)}${firstSentence.length > 50 ? '...' : ''}`;
    }

    // Fallback: use first line
    const firstLine = firstChunk.split('\n')[0];
    return firstLine.slice(0, 60) + (firstLine.length > 60 ? '...' : '');
  }

  private generateSummary(chunks: RawChunk[]): string {
    const totalText = chunks.map(c => c.text).join(' ');
    const words = totalText.split(/\s+/);

    // Extract key information
    const speakers = new Set<string>();
    chunks.forEach(chunk => {
      const speaker = this.extractSpeaker(chunk.text);
      if (speaker) speakers.add(speaker);
    });

    const speakerList = Array.from(speakers).join(', ') || 'Unknown speaker';
    const wordCount = words.length;
    const chunkCount = chunks.length;

    // Simple summary
    const preview = totalText.slice(0, 200).trim() + (totalText.length > 200 ? '...' : '');

    return `Episode with ${chunkCount} chunk(s), ${wordCount} words. Speakers: ${speakerList}. Preview: "${preview}"`;
  }
}
