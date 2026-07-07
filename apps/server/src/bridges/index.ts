import { prisma } from '@wanted/database';
import type { EventBus } from '@wanted/agent-core';
import { createLogger } from '@wanted/shared';

const log = createLogger('EventBridge');

/**
 * Registers server-side listeners that persist agent-emitted events to the
 * database. This is the bridge between the in-memory EventBus and Prisma.
 */
export function registerEventBridges(bus: EventBus): void {
  // ── Clip lifecycle ────────────────────────────────────────────────────────

  bus.on('clip:created', async (candidate) => {
    try {
      await prisma.clip.upsert({
        where: { id: candidate.id },
        update: {},
        create: {
          id: candidate.id,
          sessionId: candidate.sessionId,
          triggerType: candidate.triggerType,
          triggerScore: candidate.triggerScore,
          title: candidate.title ?? `${candidate.triggerType.replace(/_/g, ' ')} clip`,
          description: candidate.description,
          status: 'PENDING',
          sourcePath: candidate.sourcePath,
          format: (candidate.format.toUpperCase() as 'LANDSCAPE' | 'PORTRAIT' | 'SQUARE'),
          tags: candidate.tags,
          aiGenerated: candidate.aiGenerated,
          manuallyApproved: candidate.manuallyApproved,
          viewerCountAtTime: candidate.viewerCountAtTime,
          chatRateAtTime: candidate.chatRateAtTime,
        },
      });

      // Update session clip count
      await prisma.streamSession.update({
        where: { id: candidate.sessionId },
        data: { clipCount: { increment: 1 } },
      });
    } catch (err) {
      log.error('Failed to persist clip:created', err);
    }
  });

  bus.on('clip:processing:started', async ({ clipId }) => {
    try {
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'PROCESSING' },
      });
    } catch (err) {
      log.error('Failed to update clip status to PROCESSING', err);
    }
  });

  bus.on('clip:processing:complete', async ({ clipId, outputPath }) => {
    try {
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'READY', outputPath },
      });
    } catch (err) {
      log.error('Failed to update clip status to READY', err);
    }
  });

  bus.on('clip:processing:failed', async ({ clipId, error }) => {
    try {
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'FAILED' },
      });
      log.error(`Clip processing failed: ${clipId}`, error);
    } catch (err) {
      log.error('Failed to update clip status to FAILED', err);
    }
  });

  bus.on('clip:uploaded', async ({ clipId }) => {
    try {
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'PUBLISHED' },
      });
    } catch (err) {
      log.error('Failed to update clip status to PUBLISHED', err);
    }
  });

  // ── Viewer metrics ────────────────────────────────────────────────────────

  bus.on('viewer:stats:updated', async (stats) => {
    try {
      // stats is ViewerStats[] or a single snapshot from the analytics agent
      const viewers = Array.isArray(stats) ? stats : [stats];
      const totalViewers = viewers.reduce((s, v) => s + v.count, 0);

      // We need an active session to store against
      const activeSession = await prisma.streamSession.findFirst({
        where: { status: 'LIVE' },
        select: { id: true },
      });
      if (!activeSession) return;

      await prisma.streamMetricSnapshot.create({
        data: {
          sessionId: activeSession.id,
          timestamp: new Date(),
          totalViewers,
          viewers: viewers,
        },
      });

      // Update session viewer average (running update — peak handled by metrics bridge)
      if (totalViewers > 0) {
        const session = await prisma.streamSession.findUnique({
          where: { id: activeSession.id },
          select: { viewerPeak: true },
        });
        if (session && totalViewers > session.viewerPeak) {
          await prisma.streamSession.update({
            where: { id: activeSession.id },
            data: { viewerPeak: totalViewers },
          });
        }
      }
    } catch (err) {
      log.error('Failed to persist viewer stats', err);
    }
  });

  bus.on('stream:metrics:updated', async (metrics) => {
    try {
      await prisma.streamMetricSnapshot.create({
        data: {
          sessionId: metrics.sessionId,
          timestamp: metrics.timestamp,
          totalViewers: metrics.totalViewers,
          viewers: metrics.viewers,
          chatRate: metrics.chatRate,
          followRate: metrics.followRate,
          clipRate: metrics.clipRate,
          bitrate: metrics.bitrate,
          droppedFrames: metrics.droppedFrames,
          cpuUsage: metrics.cpuUsage,
          gpuUsage: metrics.gpuUsage,
          ramUsageMb: metrics.ramUsageMb,
        },
      });
    } catch (err) {
      log.error('Failed to persist stream metrics', err);
    }
  });

  // ── Chat logging ──────────────────────────────────────────────────────────

  bus.on('chat:message:received', async (msg) => {
    try {
      const activeSession = await prisma.streamSession.findFirst({
        where: { status: 'LIVE' },
        select: { id: true },
      });
      if (!activeSession) return;

      await prisma.chatLog.create({
        data: {
          sessionId: activeSession.id,
          platform: msg.platform.toUpperCase() as 'TWITCH',
          userId: msg.userId,
          username: msg.username,
          displayName: msg.displayName,
          message: msg.message,
          isSubscriber: msg.isSubscriber,
          isModerator: msg.isModerator,
          isBroadcaster: msg.isBroadcaster,
          isHighlighted: msg.isHighlighted,
          bits: msg.bits,
          badges: msg.badges,
          color: msg.color,
          timestamp: msg.timestamp,
        },
      });

      await prisma.streamSession.update({
        where: { id: activeSession.id },
        data: { chatMessages: { increment: 1 } },
      });
    } catch (err) {
      log.error('Failed to persist chat message', err);
    }
  });

  // ── Donations & subs ──────────────────────────────────────────────────────

  bus.on('donation:received', async (donation) => {
    try {
      const activeSession = await prisma.streamSession.findFirst({
        where: { status: 'LIVE' },
        select: { id: true },
      });
      if (!activeSession) return;

      await prisma.streamSession.update({
        where: { id: activeSession.id },
        data: {
          donations: { increment: 1 },
          donationAmount: { increment: donation.amount },
        },
      });
    } catch (err) {
      log.error('Failed to persist donation', err);
    }
  });

  bus.on('subscriber:received', async () => {
    try {
      const activeSession = await prisma.streamSession.findFirst({
        where: { status: 'LIVE' },
        select: { id: true },
      });
      if (!activeSession) return;

      await prisma.streamSession.update({
        where: { id: activeSession.id },
        data: { newSubscribers: { increment: 1 } },
      });
    } catch (err) {
      log.error('Failed to persist subscriber event', err);
    }
  });

  log.info('Event bridges registered');
}
