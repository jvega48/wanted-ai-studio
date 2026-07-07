import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@wanted/database';

const queueItemSchema = z.object({
  type: z.enum(['LONG_VIDEO', 'SHORT', 'TIKTOK', 'CLIP', 'THUMBNAIL', 'POST']),
  platform: z.enum(['TWITCH', 'YOUTUBE', 'KICK', 'TIKTOK']),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  thumbnailPath: z.string().optional(),
  filePath: z.string().optional(),
  scheduledAt: z.string().optional(),
  sourceClipId: z.string().optional(),
});

async function listItems(req: import('fastify').FastifyRequest) {
  const query = req.query as { platform?: string; type?: string; status?: string; limit?: string };
  return prisma.contentQueueItem.findMany({
    where: {
      platform: query.platform as 'TWITCH' | undefined,
      type: query.type as 'SHORT' | undefined,
      status: query.status as 'PENDING' | undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(parseInt(query.limit ?? '50', 10), 100),
  });
}

export const contentRoutes: FastifyPluginAsync = async (app) => {
  // Root-level aliases (used by dashboard)
  app.get('/', { schema: { description: 'List content queue items', tags: ['content'] } }, listItems);

  app.post('/', {
    schema: { description: 'Add item to content queue', tags: ['content'] },
  }, async (req, reply) => {
    const body = queueItemSchema.parse(req.body);
    const item = await prisma.contentQueueItem.create({
      data: {
        ...body,
        tags: body.tags ?? [],
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        status: 'PENDING',
      },
    });
    return reply.status(201).send(item);
  });

  app.post('/:id/cancel', {
    schema: { description: 'Cancel a queued content item', tags: ['content'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return prisma.contentQueueItem.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  });

  app.post('/:id/retry', {
    schema: { description: 'Retry a failed content item', tags: ['content'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    const item = await prisma.contentQueueItem.update({
      where: { id },
      data: { status: 'PENDING', errorMessage: null, retryCount: { increment: 1 } },
    });
    await app.bus.emit('content:retry_requested', { itemId: id });
    return item;
  });

  // /queue sub-path aliases
  app.get('/queue', { schema: { description: 'List content queue items (alias)', tags: ['content'] } }, listItems);

  app.patch('/queue/:id/approve', {
    schema: { description: 'Approve a content queue item', tags: ['content'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return prisma.contentQueueItem.update({ where: { id }, data: { status: 'APPROVED' } });
  });

  app.patch('/queue/:id/reject', {
    schema: { description: 'Reject a content queue item', tags: ['content'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return prisma.contentQueueItem.update({ where: { id }, data: { status: 'REJECTED' } });
  });

  app.delete('/queue/:id', {
    schema: { description: 'Delete a content queue item', tags: ['content'] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.contentQueueItem.delete({ where: { id } });
    return reply.status(204).send();
  });
};
