import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { segmentSource } from '../../services/segmentation';
import { testPrisma, cleanDatabase, disconnectTestDb } from '../helpers/test-db';

describe('Segmentation Service', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe('segmentSource', () => {
    it('should create episodes from a source with chunks', async () => {
      // Create a test source
      const source = await testPrisma.sourceStream.create({
        data: {
          name: 'Test Conversation',
          type: 'CHAT',
        },
      });

      // Create test chunks
      await testPrisma.rawChunk.createMany({
        data: [
          { sourceId: source.id, index: 0, text: 'User: Hello' },
          { sourceId: source.id, index: 1, text: 'User: How are you?' },
          { sourceId: source.id, index: 2, text: 'User: I have a question' },
          { sourceId: source.id, index: 3, text: 'Assistant: Hello! I am doing well.' },
          { sourceId: source.id, index: 4, text: 'Assistant: What is your question?' },
        ],
      });

      // Fetch source with chunks
      const sourceWithChunks = await testPrisma.sourceStream.findUnique({
        where: { id: source.id },
        include: {
          chunks: {
            orderBy: { index: 'asc' },
          },
        },
      });

      expect(sourceWithChunks).not.toBeNull();

      // Run segmentation
      const episodes = await segmentSource(sourceWithChunks!, {
        mode: 'heuristic',
        minChunks: 2,
        maxChunks: 10,
      });

      // Verify episodes were created
      expect(episodes.length).toBeGreaterThan(0);

      // Verify episodes have required fields
      episodes.forEach((episode) => {
        expect(episode.sourceId).toBe(source.id);
        expect(episode.title).toBeTruthy();
        expect(episode.summary).toBeTruthy();
        expect(episode.startChunkIndex).toBeGreaterThanOrEqual(0);
        expect(episode.endChunkIndex).toBeGreaterThanOrEqual(episode.startChunkIndex);
        expect(episode.episodeIndex).toBeGreaterThanOrEqual(0);
      });

      // Verify episodes are stored in database
      const storedEpisodes = await testPrisma.episode.findMany({
        where: { sourceId: source.id },
        orderBy: { episodeIndex: 'asc' },
      });

      expect(storedEpisodes.length).toBe(episodes.length);
    });

    it('should replace existing episodes when re-segmenting', async () => {
      // Create a test source with chunks
      const source = await testPrisma.sourceStream.create({
        data: {
          name: 'Test Source',
          type: 'CHAT',
          chunks: {
            create: [
              { index: 0, text: 'User: First' },
              { index: 1, text: 'User: Second' },
              { index: 2, text: 'User: Third' },
            ],
          },
        },
        include: { chunks: true },
      });

      // First segmentation
      const firstEpisodes = await segmentSource(source, {
        mode: 'heuristic',
        minChunks: 1,
      });

      expect(firstEpisodes.length).toBeGreaterThan(0);

      // Re-segment with different parameters
      const sourceWithChunks = await testPrisma.sourceStream.findUnique({
        where: { id: source.id },
        include: { chunks: { orderBy: { index: 'asc' } } },
      });

      const secondEpisodes = await segmentSource(sourceWithChunks!, {
        mode: 'heuristic',
        minChunks: 2,
      });

      // Verify old episodes were replaced
      const allEpisodes = await testPrisma.episode.findMany({
        where: { sourceId: source.id },
      });

      expect(allEpisodes.length).toBe(secondEpisodes.length);
    });

    it('should handle sources with single chunk', async () => {
      const source = await testPrisma.sourceStream.create({
        data: {
          name: 'Single Chunk Source',
          type: 'LOG',
          chunks: {
            create: [{ index: 0, text: 'Single log entry' }],
          },
        },
        include: { chunks: true },
      });

      const episodes = await segmentSource(source, {
        mode: 'heuristic',
        minChunks: 1,
      });

      expect(episodes.length).toBe(1);
      expect(episodes[0].startChunkIndex).toBe(0);
      expect(episodes[0].endChunkIndex).toBe(0);
    });

    it('should include metadata in episodes', async () => {
      const source = await testPrisma.sourceStream.create({
        data: {
          name: 'Metadata Test',
          type: 'CHAT',
          chunks: {
            create: [
              { index: 0, text: 'First chunk' },
              { index: 1, text: 'Second chunk' },
            ],
          },
        },
        include: { chunks: true },
      });

      const episodes = await segmentSource(source, { mode: 'heuristic' });

      expect(episodes.length).toBeGreaterThan(0);
      expect(episodes[0].metaJson).toBeTruthy();

      const meta = episodes[0].metaJson as any;
      expect(meta.segmentationMode).toBe('heuristic');
      expect(meta.chunkCount).toBeGreaterThan(0);
    });

    it('should reject sources without chunks', async () => {
      const source = await testPrisma.sourceStream.create({
        data: {
          name: 'Empty Source',
          type: 'CHAT',
        },
        include: { chunks: true },
      });

      await expect(
        segmentSource(source, { mode: 'heuristic' })
      ).rejects.toThrow('no chunks');
    });
  });
});
