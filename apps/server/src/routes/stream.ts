import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@wanted/database';
import { generateId } from '@wanted/shared';

const startStreamSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional().default(''),
  platforms: z.array(z.enum(['twitch', 'youtube', 'kick', 'tiktok'])).min(1),
  gameTitle: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
});

const endStreamSchema = z.object({
  sessionId: z.string(),
});

export const streamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sessions', {
    schema: { description: 'List stream sessions', tags: ['stream'] },
  }, async (req) => {
    const query = req.query as { limit?: string; status?: string };
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);

    return prisma.streamSession.findMany({
      take: limit,
      where: query.status ? { status: query.status as 'LIVE' | 'OFFLINE' } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  });

  app.get('/sessions/:id', {
    schema: {
      description: 'Get a stream session by ID',
      tags: ['stream'],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (req) => {
    const { id } = req.params as { id: string };
    const session = await prisma.streamSession.findUnique({
      where: { id },
      include: {
        clips: { take: 20, orderBy: { triggerScore: 'desc' } },
        moments: { take: 50, orderBy: { timestamp: 'asc' } },
      },
    });
    if (!session) throw new Error('Session not found');
    return session;
  });

  app.post('/start', {
    schema: { description: 'Start a new stream session', tags: ['stream'] },
  }, async (req, reply) => {
    const body = startStreamSchema.parse(req.body);

    const session = await prisma.streamSession.create({
      data: {
        title: body.title,
        description: body.description ?? '',
        platforms: body.platforms.map((p) => p.toUpperCase()) as ('TWITCH' | 'YOUTUBE' | 'KICK' | 'TIKTOK')[],
        gameTitle: body.gameTitle,
        tags: body.tags ?? [],
        status: 'LIVE',
        startedAt: new Date(),
      },
    });

    await app.bus.emit(
      'stream:started',
      {
        sessionId: session.id,
        platforms: body.platforms,
        timestamp: new Date(),
      },
    );

    return reply.status(201).send(session);
  });

  app.post('/end', {
    schema: { description: 'End an active stream session', tags: ['stream'] },
  }, async (req) => {
    const body = endStreamSchema.parse(req.body);

    const session = await prisma.streamSession.update({
      where: { id: body.sessionId },
      data: {
        status: 'OFFLINE',
        endedAt: new Date(),
      },
    });

    const duration = session.startedAt
      ? Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
      : 0;

    await app.bus.emit('stream:ended', {
      sessionId: session.id,
      duration,
      timestamp: new Date(),
    });

    return session;
  });

  app.get('/live', {
    schema: { description: 'Get current live sessions', tags: ['stream'] },
  }, async () => {
    return prisma.streamSession.findMany({
      where: { status: 'LIVE' },
      orderBy: { startedAt: 'desc' },
    });
  });
};
