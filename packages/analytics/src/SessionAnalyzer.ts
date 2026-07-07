import { prisma } from '@wanted/database';
import { createLogger } from '@wanted/shared';
import type { AnalyticsSummary, ComparisonReport, TimeSeriesData } from '@wanted/shared';

export class SessionAnalyzer {
  private readonly log = createLogger('SessionAnalyzer');

  async analyze(sessionId: string): Promise<AnalyticsSummary | null> {
    const session = await prisma.streamSession.findUnique({
      where: { id: sessionId },
      include: {
        metrics: { orderBy: { timestamp: 'asc' } },
        chatLogs: true,
        moments: true,
        clips: true,
      },
    });

    if (!session) return null;

    const duration = session.startedAt && session.endedAt
      ? (session.endedAt.getTime() - session.startedAt.getTime()) / 1000
      : 0;

    const durationHours = duration / 3600;
    const chatMessages = session.chatLogs.length;
    const chatRate = durationHours > 0 ? chatMessages / durationHours : 0;

    return {
      sessionId,
      platform: 'twitch',
      period: {
        start: session.startedAt ?? new Date(),
        end: session.endedAt ?? new Date(),
      },
      viewers: {
        peak: session.viewerPeak,
        average: session.viewerAverage,
        total: session.viewerPeak,
        uniqueUsers: 0,
        newUsers: 0,
        returningUsers: 0,
        retentionRate: 0,
        watchTimeMinutes: session.viewerAverage * (duration / 60),
        averageWatchTimeMinutes: duration / 60,
      },
      engagement: {
        chatMessages,
        chatRate,
        follows: session.newFollowers,
        subscriptions: session.newSubscribers,
        giftsGiven: 0,
        clipCreations: session.clipCount,
        shares: 0,
        reactions: 0,
        pollVotes: 0,
      },
      revenue: {
        subscriptions: 0,
        donations: session.donationAmount,
        bits: 0,
        adRevenue: 0,
        sponsorRevenue: 0,
        total: session.donationAmount,
        currency: 'USD',
        revenuePerViewer: session.viewerAverage > 0 ? session.donationAmount / session.viewerAverage : 0,
        revenuePerHour: durationHours > 0 ? session.donationAmount / durationHours : 0,
      },
      content: {
        gameTitle: session.gameTitle ?? undefined,
        category: 'gaming',
        topMoments: session.moments.slice(0, 5).map((m) => ({
          timestamp: m.timestamp,
          type: m.type as 'clip',
          description: m.description,
          intensity: m.intensity,
          viewerCount: m.viewerCount ?? undefined,
        })),
        topClips: session.clips.slice(0, 5).map((c) => ({
          clipId: c.id,
          views: 0,
          shares: 0,
          likes: 0,
          createdAt: c.createdAt,
          platform: 'twitch',
        })),
        sentimentScore: 0.7,
        toxicityRate: 0.02,
        highlightTimestamps: session.moments.filter((m) => m.intensity > 0.8).map((m) => m.timestamp),
      },
      technical: {
        streamDuration: duration,
        averageBitrate: 0,
        droppedFramesPercent: 0,
        averageCpuUsage: 0,
        averageGpuUsage: 0,
        streamInterruptions: 0,
      },
    };
  }

  async compare(sessionIds: string[]): Promise<ComparisonReport> {
    const sessions = await prisma.streamSession.findMany({
      where: { id: { in: sessionIds } },
      orderBy: { startedAt: 'asc' },
    });

    const metrics: Record<string, number[]> = {
      viewerPeak: sessions.map((s) => s.viewerPeak),
      viewerAverage: sessions.map((s) => s.viewerAverage),
      chatMessages: sessions.map((s) => s.chatMessages),
      donationAmount: sessions.map((s) => s.donationAmount),
      clipCount: sessions.map((s) => s.clipCount),
      newFollowers: sessions.map((s) => s.newFollowers),
    };

    const avgViewers = metrics['viewerPeak']?.reduce((a, b) => a + b, 0) ?? 0;
    const trend = sessions.length > 1
      ? ((sessions[sessions.length - 1]?.viewerPeak ?? 0) - (sessions[0]?.viewerPeak ?? 0)) > 0
        ? 'growing'
        : 'declining'
      : 'stable';

    return {
      sessions: sessionIds,
      metrics,
      insights: [
        `Average peak viewers: ${(avgViewers / sessions.length).toFixed(0)}`,
        `Viewer trend: ${trend}`,
        `Best performing stream: ${sessions.sort((a, b) => b.viewerPeak - a.viewerPeak)[0]?.title ?? 'N/A'}`,
      ],
      recommendations: [
        'Stream consistency drives audience growth — aim for same time every week',
        'Clips from your best moments drive new follower acquisition',
        'Chat engagement rate correlates strongly with retention',
      ],
    };
  }

  async getViewerTimeSeries(sessionId: string): Promise<TimeSeriesData> {
    const snapshots = await prisma.streamMetricSnapshot.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });

    return {
      metric: 'viewers',
      unit: 'count',
      interval: 'minute',
      points: snapshots.map((s) => ({ timestamp: s.timestamp, value: s.totalViewers })),
    };
  }
}
