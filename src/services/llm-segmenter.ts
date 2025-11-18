import OpenAI from 'openai';
import { RawChunk } from '@prisma/client';
import { config } from '../lib/config';
import { EpisodeSegment } from './heuristic-segmenter';

export class LLMSegmenter {
  private client: OpenAI;
  private model: string;
  private minChunks: number;
  private maxChunks: number;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    minChunks?: number;
    maxChunks?: number;
  }) {
    const apiKey = options?.apiKey || config.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required for LLM segmentation');
    }

    this.client = new OpenAI({ apiKey });
    this.model = options?.model || config.OPENAI_MODEL;
    this.minChunks = options?.minChunks || config.MIN_EPISODE_CHUNKS;
    this.maxChunks = options?.maxChunks || config.MAX_EPISODE_CHUNKS;
  }

  async segment(chunks: RawChunk[]): Promise<EpisodeSegment[]> {
    if (chunks.length === 0) return [];

    // For very long documents, we may need to chunk the analysis
    const boundaries = await this.findBoundaries(chunks);
    return this.createSegments(chunks, boundaries);
  }

  private async findBoundaries(chunks: RawChunk[]): Promise<number[]> {
    // Prepare text for analysis
    const text = chunks.map((chunk, i) => `[${i}] ${chunk.text}`).join('\n\n');

    const prompt = `You are analyzing a long text document to segment it into meaningful episodes or topics.

Here is the document with chunk indices:

${text}

Please identify natural breakpoints where the topic, speaker, or context significantly changes.
Return ONLY a JSON array of chunk indices where new episodes should begin.

Constraints:
- Minimum chunks per episode: ${this.minChunks}
- Maximum chunks per episode: ${this.maxChunks}
- First episode should start at index 0 (don't include it in the array)

Example response: [3, 7, 12]

Your response (JSON array only):`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing text and identifying natural topic boundaries. Respond only with valid JSON arrays.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // Parse the boundaries
      const boundaries = JSON.parse(content) as number[];

      // Validate boundaries
      return boundaries.filter(b =>
        typeof b === 'number' &&
        b > 0 &&
        b < chunks.length
      ).sort((a, b) => a - b);
    } catch (error) {
      console.error('LLM segmentation failed:', error);
      throw new Error('Failed to segment using LLM: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  private async createSegments(chunks: RawChunk[], boundaries: number[]): Promise<EpisodeSegment[]> {
    const segments: EpisodeSegment[] = [];
    const allBoundaries = [0, ...boundaries, chunks.length];

    for (let i = 0; i < allBoundaries.length - 1; i++) {
      const startIdx = allBoundaries[i];
      const endIdx = allBoundaries[i + 1];
      const segmentChunks = chunks.slice(startIdx, endIdx);

      if (segmentChunks.length === 0) continue;

      const { title, summary } = await this.generateMetadata(segmentChunks);

      segments.push({
        startChunkIndex: segmentChunks[0].index,
        endChunkIndex: segmentChunks[segmentChunks.length - 1].index,
        chunks: segmentChunks,
        title,
        summary,
      });
    }

    return segments;
  }

  private async generateMetadata(chunks: RawChunk[]): Promise<{ title: string; summary: string }> {
    const text = chunks.map(c => c.text).join('\n\n');
    const preview = text.slice(0, 2000); // Limit for cost control

    const prompt = `Analyze this text segment and provide:
1. A concise title (max 80 characters)
2. A brief summary (max 200 characters)

Text:
${preview}

Respond in JSON format:
{
  "title": "...",
  "summary": "..."
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You create concise titles and summaries for text segments. Respond only with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.5,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const metadata = JSON.parse(content) as { title: string; summary: string };
      return {
        title: metadata.title || 'Untitled Episode',
        summary: metadata.summary || 'No summary available',
      };
    } catch (error) {
      console.error('Failed to generate metadata:', error);
      // Fallback to simple extraction
      const firstLine = chunks[0].text.split('\n')[0];
      return {
        title: firstLine.slice(0, 80) + (firstLine.length > 80 ? '...' : ''),
        summary: `Episode with ${chunks.length} chunks`,
      };
    }
  }
}
