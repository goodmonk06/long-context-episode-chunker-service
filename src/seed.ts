import { prisma } from './lib/db';
import { segmentSource } from './services/segmentation';
import { logInfo } from './lib/logger';

// ============================================================================
// DEMO TRANSCRIPTS
// ============================================================================

const TECH_SUPPORT_TRANSCRIPT = [
  'User: Hi! I\'m trying to understand how to set up a PostgreSQL database for my new project.',
  'Assistant: I\'d be happy to help you set up PostgreSQL! First, let me ask a few questions to better understand your needs. What operating system are you using, and is this for development or production?',
  'User: I\'m on macOS, and this is just for local development right now. Eventually, I\'ll deploy to a cloud platform.',
  'Assistant: Great! For macOS, I recommend using Homebrew to install PostgreSQL.',
  'User: That\'s helpful! I actually already have Postgres installed. My main question is about database design. I\'m building a task management app.',
  'Assistant: Excellent! Let\'s talk about database design for a task management app. Here are the core tables you\'ll likely need: Users, Projects, Tasks, Tags, and TaskTags junction table.',
  'User: Yes, please! Especially the Tasks table with proper foreign keys.',
  'Assistant: Here\'s a sample schema for the Tasks table with proper foreign key constraints and cascade rules.',
];

const SALES_CALL_TRANSCRIPT = [
  'Sales Rep: Good morning! This is Jennifer from CloudTech Solutions. I\'m calling to follow up on your inquiry about our enterprise data platform.',
  'Client: Hi Jennifer, yes, I\'m the CTO at MegaCorp. We\'re evaluating solutions for our data warehouse modernization project.',
  'Sales Rep: Perfect! Can you tell me a bit about your current setup and what challenges you\'re facing?',
  'Client: We\'re currently running an on-premise Oracle warehouse with about 50TB of data. Main issues are cost, performance, and difficulty integrating with our modern cloud applications.',
  'Sales Rep: I see. Those are common pain points we help solve. Our platform offers 10x better performance at 60% lower cost. How many users would need access?',
  'Client: We have about 200 data analysts and engineers who need regular access.',
  'Sales Rep: Great! For that size, I\'d recommend our Enterprise tier at $50k per month.',
  'Client: That\'s within our budget range. What about data migration?',
  'Sales Rep: Excellent question! We provide a dedicated migration team at no extra cost. Typically takes 6-8 weeks for your data size.',
  'Client: Can you send me a detailed proposal and some customer references?',
  'Sales Rep: Absolutely! I\'ll send you a customized proposal by end of day. Would next Tuesday work for a follow-up call?',
  'Client: Yes, Tuesday at 2pm works perfectly.',
];

// ============================================================================
// SEED FUNCTION
// ============================================================================

async function seed() {
  logInfo('Starting comprehensive seed process...');

  try {
    // Clean up existing data
    logInfo('Cleaning up existing data...');
    await prisma.analyticsSnapshot.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.episodeReference.deleteMany({});
    await prisma.episodeTag.deleteMany({});
    await prisma.sourceTag.deleteMany({});
    await prisma.tag.deleteMany({});
    await prisma.tagCategory.deleteMany({});
    await prisma.episodeVersion.deleteMany({});
    await prisma.episode.deleteMany({});
    await prisma.segmentationJob.deleteMany({});
    await prisma.rawChunk.deleteMany({});
    await prisma.sourceStream.deleteMany({});

    // ============================================================================
    // CREATE TAG SYSTEM
    // ============================================================================
    logInfo('Creating tag categories and tags...');

    const topicCategory = await prisma.tagCategory.create({
      data: {
        name: 'Topic',
        description: 'Content topic or subject matter',
        color: '#3B82F6',
      },
    });

    const techTag = await prisma.tag.create({
      data: { name: 'Technical', categoryId: topicCategory.id },
    });

    const salesTag = await prisma.tag.create({
      data: { name: 'Sales', categoryId: topicCategory.id },
    });

    const supportTag = await prisma.tag.create({
      data: { name: 'Support', categoryId: topicCategory.id },
    });

    // ============================================================================
    // SCENARIO 1: TECH SUPPORT CONVERSATION
    // ============================================================================
    logInfo('Creating Scenario 1: Tech Support Conversation...');

    const techSupportSource = await prisma.sourceStream.create({
      data: {
        name: 'Tech Support - PostgreSQL Setup',
        type: 'CHAT',
        status: 'READY',
        description: 'Customer seeking help with PostgreSQL database design',
        metaJson: {
          participants: ['User', 'Assistant'],
          topics: ['PostgreSQL', 'Database Design'],
        },
      },
    });

    await prisma.rawChunk.createMany({
      data: TECH_SUPPORT_TRANSCRIPT.map((text, index) => ({
        sourceId: techSupportSource.id,
        index,
        text,
        speakerName: text.split(':')[0],
      })),
    });

    await prisma.sourceStream.update({
      where: { id: techSupportSource.id },
      data: { totalChunks: TECH_SUPPORT_TRANSCRIPT.length },
    });

    await prisma.sourceTag.createMany({
      data: [
        { sourceId: techSupportSource.id, tagId: techTag.id },
        { sourceId: techSupportSource.id, tagId: supportTag.id },
      ],
    });

    // ============================================================================
    // SCENARIO 2: SALES CALL
    // ============================================================================
    logInfo('Creating Scenario 2: Sales Call...');

    const salesCallSource = await prisma.sourceStream.create({
      data: {
        name: 'Sales Call - CloudTech Enterprise',
        type: 'MEETING',
        status: 'READY',
        description: 'Enterprise sales call with potential customer',
        metaJson: {
          participants: ['Sales Rep', 'Client'],
          company: 'MegaCorp',
        },
      },
    });

    await prisma.rawChunk.createMany({
      data: SALES_CALL_TRANSCRIPT.map((text, index) => ({
        sourceId: salesCallSource.id,
        index,
        text,
        speakerName: text.split(':')[0],
      })),
    });

    await prisma.sourceStream.update({
      where: { id: salesCallSource.id },
      data: { totalChunks: SALES_CALL_TRANSCRIPT.length },
    });

    await prisma.sourceTag.create({
      data: { sourceId: salesCallSource.id, tagId: salesTag.id },
    });

    // ============================================================================
    // RUN SEGMENTATION ON ALL SOURCES
    // ============================================================================
    logInfo('Running segmentation on all sources...');

    const sources = [techSupportSource, salesCallSource];

    for (const source of sources) {
      const sourceWithChunks = await prisma.sourceStream.findUnique({
        where: { id: source.id },
        include: {
          chunks: {
            orderBy: { index: 'asc' },
          },
        },
      });

      if (sourceWithChunks) {
        await segmentSource(sourceWithChunks, {
          mode: 'heuristic',
          minChunks: 2,
          maxChunks: 10,
        });
      }
    }

    // ============================================================================
    // CREATE ANALYTICS SNAPSHOT
    // ============================================================================
    logInfo('Creating analytics snapshot...');

    const [totalSources, totalChunks, totalEpisodes, totalJobs] = await Promise.all([
      prisma.sourceStream.count(),
      prisma.rawChunk.count(),
      prisma.episode.count(),
      prisma.segmentationJob.count(),
    ]);

    await prisma.analyticsSnapshot.create({
      data: {
        snapshotType: 'seed',
        startDate: new Date(),
        endDate: new Date(),
        metrics: {
          totalSources,
          totalChunks,
          totalEpisodes,
          totalJobs,
          timestamp: new Date().toISOString(),
        },
      },
    });

    // ============================================================================
    // SUMMARY
    // ============================================================================
    logInfo('\n' + '='.repeat(80));
    logInfo('SEED COMPLETED SUCCESSFULLY!');
    logInfo('='.repeat(80));
    logInfo(`\nCreated:
  - ${totalSources} source streams
  - ${totalChunks} raw chunks
  - ${totalEpisodes} episodes
  - ${totalJobs} segmentation jobs
  - ${await prisma.tag.count()} tags
`);

    logInfo('\nNext Steps:');
    logInfo('  1. Start the server: npm run dev');
    logInfo('  2. View analytics: GET http://localhost:3000/api/analytics/overview');
    logInfo('  3. List episodes: GET http://localhost:3000/api/episodes');
    logInfo('='.repeat(80) + '\n');

  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
