import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@wanted/database';

const approveSchema = z.object({ clipId: z.string() });
const rejectSchema = z.object({ clipId: z.string(), reason: z.string().optional() });

export const clipsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', {
    schema: { description: 'List all clips', tags: ['clips'] },
  }, async (req) => {
    const query = req.query as { status?: string; sessionId?: string; limit?: string };
    return prisma.clip.findMany({
      take: Math.min(parseInt(query.limit ?? '50', 10), 100),
      where: {
        status: query.status as 'PENDING' | undefined,
        sessionId: query.sessionId,
      },
      orderBy: { triggerScore: 'desc' },
    });
  });

  app.get('/:id', {
    schema: { description: 'Get a clip by ID', tags: ['clips'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    const clip = await prisma.clip.findUnique({ where: { id } });
    if (!clip) throw new Error('Clip not found');
    return clip;
  });

  app.post('/:id/approve', {
    schema: { description: 'Approve a clip for processing', tags: ['clips'] },
  }, async (req) => {
    const { id } = req.params as { id: string };

    const clip = await prisma.clip.update({
      where: { id },
      data: { manuallyApproved: true, status: 'APPROVED' },
    });

    await app.bus.emit('clip:approved', { clipId: id, approvedBy: 'user' });
    return clip;
  });

  app.post('/:id/reject', {
    schema: { description: 'Reject a clip', tags: ['clips'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    const body = rejectSchema.parse(req.body);

    const clip = await prisma.clip.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    await app.bus.emit('clip:rejected', { clipId: id, reason: body.reason });
    return clip;
  });

  app.get('/queue/pending', {
    schema: { description: 'Get clips pending approval', tags: ['clips'] },
  }, async () => {
    return prisma.clip.findMany({
      where: { status: 'PENDING', manuallyApproved: false },
      orderBy: { triggerScore: 'desc' },
      take: 20,
    });
  });
};
