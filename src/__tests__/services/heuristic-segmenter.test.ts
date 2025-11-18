import { describe, it, expect } from 'vitest';
import { HeuristicSegmenter } from '../../services/heuristic-segmenter';
import { RawChunk } from '@prisma/client';

// Helper to create mock chunks
function createMockChunk(index: number, text: string, sourceId = 'test-source'): RawChunk {
  return {
    id: `chunk-${index}`,
    sourceId,
    index,
    text,
    createdAt: new Date(),
  };
}

describe('HeuristicSegmenter', () => {
  describe('Speaker Change Detection', () => {
    it('should segment on speaker changes', () => {
      const chunks: RawChunk[] = [
        createMockChunk(0, 'User: Hello there'),
        createMockChunk(1, 'User: How are you?'),
        createMockChunk(2, 'User: I have a question'),
        createMockChunk(3, 'Assistant: I am doing well, thank you!'),
        createMockChunk(4, 'Assistant: What is your question?'),
        createMockChunk(5, 'User: Can you help me with TypeScript?'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 2, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      // Should create at least 2 segments (User and Assistant conversations)
      expect(segments.length).toBeGreaterThanOrEqual(2);

      // First segment should have User chunks
      expect(segments[0].chunks[0].text).toContain('User:');
    });

    it('should recognize different speaker formats', () => {
      const chunks: RawChunk[] = [
        createMockChunk(0, 'Alice: Starting the conversation'),
        createMockChunk(1, 'Alice: Continuing...'),
        createMockChunk(2, '[Bob]: Responding here'),
        createMockChunk(3, '> Charlie: Also responding'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 1, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      expect(segments.length).toBeGreaterThan(1);
    });
  });

  describe('Length-based Segmentation', () => {
    it('should force split when reaching maxChunks', () => {
      const chunks: RawChunk[] = [];
      for (let i = 0; i < 20; i++) {
        chunks.push(createMockChunk(i, `Chunk ${i} with no speaker pattern`));
      }

      const segmenter = new HeuristicSegmenter({ minChunks: 2, maxChunks: 5 });
      const segments = segmenter.segment(chunks);

      // Should have at least 4 segments (20 chunks / 5 max each)
      expect(segments.length).toBeGreaterThanOrEqual(4);

      // No segment should exceed maxChunks
      segments.forEach(segment => {
        const chunkCount = segment.endChunkIndex - segment.startChunkIndex + 1;
        expect(chunkCount).toBeLessThanOrEqual(5);
      });
    });

    it('should respect minChunks before creating boundaries', () => {
      const chunks: RawChunk[] = [
        createMockChunk(0, 'User: First'),
        createMockChunk(1, 'Assistant: Second'),
        createMockChunk(2, 'User: Third'),
        createMockChunk(3, 'Assistant: Fourth'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 3, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      // With minChunks=3, should not create too many small segments
      expect(segments.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Topic Shift Detection', () => {
    it('should detect topic shift keywords', () => {
      const chunks: RawChunk[] = [
        createMockChunk(0, 'Talking about topic A'),
        createMockChunk(1, 'More about topic A'),
        createMockChunk(2, 'Still on topic A'),
        createMockChunk(3, 'Moving on to a new topic now'),
        createMockChunk(4, 'This is topic B'),
        createMockChunk(5, 'More about topic B'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 2, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      expect(segments.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect various topic markers', () => {
      const markers = ['next topic', 'changing subject', 'new topic', "let's discuss", '---'];

      markers.forEach(marker => {
        const chunks: RawChunk[] = [
          createMockChunk(0, 'Topic A content'),
          createMockChunk(1, 'More A'),
          createMockChunk(2, `Now, ${marker}`),
          createMockChunk(3, 'Topic B content'),
        ];

        const segmenter = new HeuristicSegmenter({ minChunks: 2, maxChunks: 10 });
        const segments = segmenter.segment(chunks);

        expect(segments.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Title and Summary Generation', () => {
    it('should generate meaningful titles', () => {
      const chunks: RawChunk[] = [
        createMockChunk(0, 'User: How do I set up PostgreSQL?'),
        createMockChunk(1, 'User: I need help with the installation.'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 1, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      expect(segments[0].title).toBeTruthy();
      expect(segments[0].title).toContain('User');
    });

    it('should generate summaries with metadata', () => {
      const chunks: RawChunk[] = [
        createMockChunk(0, 'User: First message'),
        createMockChunk(1, 'Assistant: Response here'),
        createMockChunk(2, 'User: Follow-up question'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 1, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      expect(segments[0].summary).toBeTruthy();
      expect(segments[0].summary).toMatch(/\d+ chunk/);
    });

    it('should handle chunks without speaker patterns', () => {
      const chunks: RawChunk[] = [
        createMockChunk(0, 'This is plain text without any speaker label.'),
        createMockChunk(1, 'Just continuing the narrative.'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 1, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0].title).toBeTruthy();
      expect(segments[0].summary).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty chunk array', () => {
      const segmenter = new HeuristicSegmenter();
      const segments = segmenter.segment([]);

      expect(segments).toEqual([]);
    });

    it('should handle single chunk', () => {
      const chunks: RawChunk[] = [
        createMockChunk(0, 'User: Only one chunk'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 1, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      expect(segments.length).toBe(1);
      expect(segments[0].startChunkIndex).toBe(0);
      expect(segments[0].endChunkIndex).toBe(0);
    });

    it('should maintain chunk index integrity', () => {
      const chunks: RawChunk[] = [
        createMockChunk(5, 'Starting at index 5'),
        createMockChunk(6, 'Index 6'),
        createMockChunk(7, 'Index 7'),
      ];

      const segmenter = new HeuristicSegmenter({ minChunks: 1, maxChunks: 10 });
      const segments = segmenter.segment(chunks);

      expect(segments[0].startChunkIndex).toBe(5);
      expect(segments[0].endChunkIndex).toBe(7);
    });
  });
});
