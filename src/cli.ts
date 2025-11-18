#!/usr/bin/env node
import { Command } from 'commander';
import { prisma } from './lib/db';
import { resegmentSource } from './services/segmentation';
import { readFileSync } from 'fs';

const program = new Command();

program
  .name('episode-chunker')
  .description('CLI for the Episode Chunker Service')
  .version('1.0.0');

// Create a new source
program
  .command('create-source')
  .description('Create a new source stream')
  .requiredOption('-n, --name <name>', 'Name of the source')
  .option('-t, --type <type>', 'Type of source (CHAT, MEETING, LOG, TRANSCRIPT, OTHER)', 'OTHER')
  .action(async (options) => {
    try {
      const source = await prisma.sourceStream.create({
        data: {
          name: options.name,
          type: options.type.toUpperCase(),
        },
      });

      console.log('Created source:');
      console.log(JSON.stringify(source, null, 2));
    } catch (error) {
      console.error('Error creating source:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// List sources
program
  .command('list-sources')
  .description('List all sources')
  .action(async () => {
    try {
      const sources = await prisma.sourceStream.findMany({
        include: {
          _count: {
            select: {
              chunks: true,
              episodes: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      console.log(`Found ${sources.length} source(s):\n`);
      sources.forEach(source => {
        console.log(`ID: ${source.id}`);
        console.log(`Name: ${source.name}`);
        console.log(`Type: ${source.type}`);
        console.log(`Chunks: ${source._count.chunks}`);
        console.log(`Episodes: ${source._count.episodes}`);
        console.log(`Created: ${source.createdAt.toISOString()}`);
        console.log('---');
      });
    } catch (error) {
      console.error('Error listing sources:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Ingest chunks from file
program
  .command('ingest')
  .description('Ingest chunks from a text file')
  .requiredOption('-s, --source <sourceId>', 'Source ID')
  .requiredOption('-f, --file <path>', 'Path to text file')
  .option('-d, --delimiter <delimiter>', 'Delimiter to split chunks (default: double newline)', '\n\n')
  .action(async (options) => {
    try {
      const content = readFileSync(options.file, 'utf-8');
      const chunks = content.split(options.delimiter).filter(c => c.trim().length > 0);

      console.log(`Found ${chunks.length} chunks in file`);

      // Get current max index
      const maxChunk = await prisma.rawChunk.findFirst({
        where: { sourceId: options.source },
        orderBy: { index: 'desc' },
        select: { index: true },
      });

      const startIndex = maxChunk ? maxChunk.index + 1 : 0;

      // Create chunks
      await prisma.$transaction(
        chunks.map((text, i) =>
          prisma.rawChunk.create({
            data: {
              sourceId: options.source,
              index: startIndex + i,
              text: text.trim(),
            },
          })
        )
      );

      console.log(`Successfully ingested ${chunks.length} chunks`);
    } catch (error) {
      console.error('Error ingesting chunks:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Segment a source
program
  .command('segment')
  .description('Segment a source into episodes')
  .requiredOption('-s, --source <sourceId>', 'Source ID')
  .option('-m, --mode <mode>', 'Segmentation mode (heuristic or llm)', 'heuristic')
  .option('--min-chunks <number>', 'Minimum chunks per episode', '3')
  .option('--max-chunks <number>', 'Maximum chunks per episode', '50')
  .action(async (options) => {
    try {
      console.log(`Segmenting source ${options.source} with ${options.mode} mode...`);

      const episodes = await resegmentSource(options.source, {
        mode: options.mode as 'heuristic' | 'llm',
        minChunks: parseInt(options.minChunks),
        maxChunks: parseInt(options.maxChunks),
      });

      console.log(`\nCreated ${episodes.length} episodes:\n`);
      episodes.forEach(ep => {
        console.log(`Episode ${ep.episodeIndex}: ${ep.title}`);
        console.log(`  Chunks: ${ep.startChunkIndex} - ${ep.endChunkIndex}`);
        console.log(`  Summary: ${ep.summary}`);
        console.log('---');
      });
    } catch (error) {
      console.error('Error segmenting source:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// List episodes
program
  .command('list-episodes')
  .description('List episodes for a source')
  .requiredOption('-s, --source <sourceId>', 'Source ID')
  .action(async (options) => {
    try {
      const episodes = await prisma.episode.findMany({
        where: { sourceId: options.source },
        orderBy: { episodeIndex: 'asc' },
      });

      console.log(`Found ${episodes.length} episode(s):\n`);
      episodes.forEach(ep => {
        console.log(`Episode ${ep.episodeIndex}: ${ep.title}`);
        console.log(`  ID: ${ep.id}`);
        console.log(`  Chunks: ${ep.startChunkIndex} - ${ep.endChunkIndex}`);
        console.log(`  Summary: ${ep.summary}`);
        console.log('---');
      });
    } catch (error) {
      console.error('Error listing episodes:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Show episode details
program
  .command('show-episode')
  .description('Show episode details with full text')
  .requiredOption('-e, --episode <episodeId>', 'Episode ID')
  .action(async (options) => {
    try {
      const episode = await prisma.episode.findUnique({
        where: { id: options.episode },
        include: { source: true },
      });

      if (!episode) {
        console.error('Episode not found');
        process.exit(1);
      }

      const chunks = await prisma.rawChunk.findMany({
        where: {
          sourceId: episode.sourceId,
          index: {
            gte: episode.startChunkIndex,
            lte: episode.endChunkIndex,
          },
        },
        orderBy: { index: 'asc' },
      });

      console.log(`Episode ${episode.episodeIndex}: ${episode.title}`);
      console.log(`Source: ${episode.source.name}`);
      console.log(`Summary: ${episode.summary}`);
      console.log(`\nFull Text (${chunks.length} chunks):\n`);
      console.log('='.repeat(80));
      chunks.forEach(chunk => {
        console.log(chunk.text);
        console.log('-'.repeat(80));
      });
    } catch (error) {
      console.error('Error showing episode:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

program.parse();
