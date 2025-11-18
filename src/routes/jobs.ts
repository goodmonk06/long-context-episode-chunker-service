import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db';
import { recordCounter } from '../lib/metrics';

export async function jobsRoutes(server: FastifyInstance) {
  // List all segmentation jobs
  server.get('/jobs', async (request) => {
    const { status, sourceId, limit = '50', offset = '0' } = request.query as {
      status?: string;
      sourceId?: string;
      limit?: string;
      offset?: string;
    };

    const jobs = await prisma.segmentationJob.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(sourceId && { sourceId }),
      },
      include: {
        source: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    return jobs;
  });

  // Get specific job
  server.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await prisma.segmentationJob.findUnique({
      where: { id },
      include: {
        source: {
          include: {
            _count: {
              select: {
                chunks: true,
                episodes: true,
              },
            },
          },
        },
      },
    });

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return job;
  });

  // Get jobs for a source
  server.get('/sources/:sourceId/jobs', async (request) => {
    const { sourceId } = request.params as { sourceId: string };

    const jobs = await prisma.segmentationJob.findMany({
      where: { sourceId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return jobs;
  });

  // Cancel a job (if it's pending)
  server.post('/jobs/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await prisma.segmentationJob.findUnique({
      where: { id },
    });

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (job.status !== 'PENDING' && job.status !== 'RUNNING') {
      return reply.status(400).send({ error: 'Can only cancel pending or running jobs' });
    }

    const updated = await prisma.segmentationJob.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    recordCounter('job.cancelled');
    return updated;
  });

  // Delete a job
  server.delete('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.segmentationJob.delete({
      where: { id },
    });

    recordCounter('job.deleted');
    return reply.status(204).send();
  });

  // Get job statistics
  server.get('/jobs/stats/summary', async () => {
    const [total, pending, running, completed, failed, cancelled] = await Promise.all([
      prisma.segmentationJob.count(),
      prisma.segmentationJob.count({ where: { status: 'PENDING' } }),
      prisma.segmentationJob.count({ where: { status: 'RUNNING' } }),
      prisma.segmentationJob.count({ where: { status: 'COMPLETED' } }),
      prisma.segmentationJob.count({ where: { status: 'FAILED' } }),
      prisma.segmentationJob.count({ where: { status: 'CANCELLED' } }),
    ]);

    // Average duration for completed jobs
    const completedJobs = await prisma.segmentationJob.findMany({
      where: {
        status: 'COMPLETED',
        duration: { not: null },
      },
      select: {
        duration: true,
      },
    });

    const avgDuration = completedJobs.length > 0
      ? completedJobs.reduce((sum, job) => sum + (job.duration || 0), 0) / completedJobs.length
      : 0;

    return {
      total,
      byStatus: {
        pending,
        running,
        completed,
        failed,
        cancelled,
      },
      avgDurationMs: Math.round(avgDuration),
    };
  });
}
