import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

export async function cleanDatabase() {
  // Delete in correct order to respect foreign keys
  await testPrisma.episode.deleteMany({});
  await testPrisma.rawChunk.deleteMany({});
  await testPrisma.sourceStream.deleteMany({});
}

export async function disconnectTestDb() {
  await testPrisma.$disconnect();
}
