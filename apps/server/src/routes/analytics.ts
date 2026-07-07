import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@wanted/database';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /analytics/session/:id — full aggregated summary (used by dashboard AnalyticsPage)
  app.get('/session/:id', {
    schema: { description: 'Get aggregated analytics summary for a session', tags: ['analytics'] },
  }, async (req) => {
    const { id } = req.params as { id: string };

    const [session, metrics, clips] = await Promise.all([
      prisma.streamSession.findUniqueOrThrow({ where: { id } }),
      prisma.streamMetricSnapshot.findMany({
        where: { sessionId: id },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true, totalViewers: true },
      }),
      prisma.clip.findMany({
        where: { sessionId: id },
        select: { status: true },
      }),
    ]);

    const durationSeconds = session.endedAt && session.startedAt
      ? Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
      : session.duration;

    const APPROVED_STATUSES = new Set(['APPROVED', 'PROCESSING', 'READY', 'PUBLISHED', 'UPLOADED']);
    const approvedClips = clips.filter((c) => APPROVED_STATUSES.has(c.status)).length;
    const clipApprovalRate = clips.length > 0 ? approvedClips / clips.length : 0;

    const chatRate = durationSeconds > 0 ? (session.chatMessages / durationSeconds) * 60 : 0;

    return {
      sessionId: session.id,
      title: session.title,
      duration: durationSeconds,
      gameTitle: session.gameTitle ?? null,
      platforms: session.platforms,
      viewerPeak: session.viewerPeak,
      viewerAvg: session.viewerAverage,
      chatTotal: session.chatMessages,
      chatRate: parseFloat(chatRate.toFixed(2)),
      clipsCreated: clips.length,
      clipApprovalRate,
      subscribersGained: session.newSubscribers,
      donationsTotal: Number(session.donationAmount),
      donationCount: session.donations,
      bitsTotal: 0,
      viewerTimeSeries: metrics.map((m) => ({
        timestamp: m.timestamp.toISOString(),
        viewers: m.totalViewers,
      })),
    };
  });

  // POST /analytics/compare — compare multiple sessions (POST with body, matching dashboard API)
  app.post('/compare', {
    schema: {
      description: 'Compare metrics across multiple sessions',
      tags: ['analytics'],
      body: {
        type: 'object',
        required: ['sessionIds'],
        properties: { sessionIds: { type: 'array', items: { type: 'string' } } },
      },
    },
  }, async (req) => {
    const { sessionIds } = req.body as { sessionIds: string[] };
    if (sessionIds.length === 0) return { sessionIds: [], metrics: [], insights: [], recommendations: [] };

    const sessions = await prisma.streamSession.findMany({
      where: { id: { in: sessionIds } },
      select: {
        id: true, title: true, viewerPeak: true, viewerAverage: true,
        chatMessages: true, donationAmount: true, clipCount: true, duration: true,
      },
    });

    const metricDefs = [
      { metric: 'viewerPeak', label: 'Peak Viewers' },
      { metric: 'viewerAverage', label: 'Avg Viewers' },
      { metric: 'chatMessages', label: 'Chat Messages' },
      { metric: 'clipCount', label: 'Clips Created' },
    ] as const;

    const metrics = metricDefs.map(({ metric, label }) => {
      const values = sessions.map((s) => Number(s[metric] ?? 0));
      const maxVal = Math.max(...values);
      const winner = values.indexOf(maxVal);
      const sorted = [...values].sort((a, b) => b - a);
      const improvement = sorted[1] != null && sorted[1] > 0
        ? parseFloat(((sorted[0] - sorted[1]) / sorted[1] * 100).toFixed(1))
        : 0;
      return { metric: label, values, winner, improvement };
    });

    const insights: string[] = [];
    const bestViewers = sessions.reduce((a, b) => a.viewerPeak > b.viewerPeak ? a : b, sessions[0]!);
    if (bestViewers) insights.push(`"${bestViewers.title}" had the highest peak viewers (${bestViewers.viewerPeak}).`);

    const recommendations: string[] = [];
    const avgPeaks = sessions.reduce((sum, s) => sum + s.viewerPeak, 0) / sessions.length;
    if (avgPeaks < 100) recommendations.push('Consider cross-promoting streams on social media to grow viewership.');
    recommendations.push('Clip highlights from your best-performing moments and post to TikTok/Shorts.');

    return { sessionIds, metrics, insights, recommendations };
  });

  // GET /analytics/trends — high-level trend metrics for the dashboard
  app.get('/trends', {
    schema: { description: 'Get trend metrics across recent sessions', tags: ['analytics'] },
  }, async () => {
    const sessions = await prisma.streamSession.findMany({
      where: { endedAt: { not: null } },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { viewerPeak: true, viewerAverage: true, chatMessages: true, donationAmount: true, clipCount: true },
    });

    if (sessions.length < 2) {
      return [
        { metric: 'viewerPeak', trend: 0, label: 'Peak Viewers' },
        { metric: 'viewerAvg', trend: 0, label: 'Avg Viewers' },
        { metric: 'chatMessages', trend: 0, label: 'Chat Messages' },
        { metric: 'revenue', trend: 0, label: 'Revenue' },
      ];
    }

    const recent = sessions.slice(0, Math.ceil(sessions.length / 2));
    const older = sessions.slice(Math.ceil(sessions.length / 2));

    function avg(arr: typeof sessions, key: keyof typeof sessions[0]): number {
      if (arr.length === 0) return 0;
      return arr.reduce((s, r) => s + Number(r[key] ?? 0), 0) / arr.length;
    }

    function trendPct(r: number, o: number): number {
      if (o === 0) return 0;
      return parseFloat(((r - o) / o * 100).toFixed(1));
    }

    return [
      { metric: 'viewerPeak', trend: trendPct(avg(recent, 'viewerPeak'), avg(older, 'viewerPeak')), label: 'Peak Viewers' },
      { metric: 'viewerAvg', trend: trendPct(avg(recent, 'viewerAverage'), avg(older, 'viewerAverage')), label: 'Avg Viewers' },
      { metric: 'chatMessages', trend: trendPct(avg(recent, 'chatMessages'), avg(older, 'chatMessages')), label: 'Chat Messages' },
      { metric: 'revenue', trend: trendPct(avg(recent, 'donationAmount'), avg(older, 'donationAmount')), label: 'Revenue' },
    ];
  });

  // Original endpoints kept for backwards compat
  app.get('/sessions/:id/metrics', {
    schema: { description: 'Raw metric snapshots for a session', tags: ['analytics'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return prisma.streamMetricSnapshot.findMany({
      where: { sessionId: id },
      orderBy: { timestamp: 'asc' },
    });
  });

  app.get('/sessions/:id/moments', {
    schema: { description: 'Stream moments for a session', tags: ['analytics'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return prisma.streamMoment.findMany({
      where: { sessionId: id },
      orderBy: { timestamp: 'asc' },
    });
  });

  app.get('/summary', {
    schema: { description: 'Analytics summary across all sessions', tags: ['analytics'] },
  }, async () => {
    const [totalSessions, topSessions] = await Promise.all([
      prisma.streamSession.count(),
      prisma.streamSession.findMany({
        take: 5,
        orderBy: { viewerPeak: 'desc' },
        select: {
          id: true, title: true, viewerPeak: true, viewerAverage: true,
          chatMessages: true, donationAmount: true, startedAt: true,
        },
      }),
    ]);
    return { totalSessions, topSessions };
  });
};
