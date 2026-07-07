import type { StreamPlatform } from './stream.js';

export interface AnalyticsSummary {
  sessionId: string;
  platform: StreamPlatform;
  period: DateRange;
  viewers: ViewerAnalytics;
  engagement: EngagementAnalytics;
  revenue: RevenueAnalytics;
  content: ContentAnalytics;
  technical: TechnicalAnalytics;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ViewerAnalytics {
  peak: number;
  average: number;
  total: number;
  uniqueUsers: number;
  newUsers: number;
  returningUsers: number;
  retentionRate: number;
  watchTimeMinutes: number;
  averageWatchTimeMinutes: number;
}

export interface EngagementAnalytics {
  chatMessages: number;
  chatRate: number;
  follows: number;
  subscriptions: number;
  giftsGiven: number;
  clipCreations: number;
  shares: number;
  reactions: number;
  pollVotes: number;
}

export interface RevenueAnalytics {
  subscriptions: number;
  donations: number;
  bits: number;
  adRevenue: number;
  sponsorRevenue: number;
  total: number;
  currency: string;
  revenuePerViewer: number;
  revenuePerHour: number;
}

export interface ContentAnalytics {
  gameTitle?: string;
  category: string;
  topMoments: Moment[];
  topClips: ClipMetric[];
  sentimentScore: number;
  toxicityRate: number;
  highlightTimestamps: number[];
}

export interface TechnicalAnalytics {
  streamDuration: number;
  averageBitrate: number;
  droppedFramesPercent: number;
  averageCpuUsage: number;
  averageGpuUsage: number;
  streamInterruptions: number;
}

export interface Moment {
  timestamp: number;
  type: 'kill' | 'death' | 'donation' | 'subscriber' | 'raid' | 'highlight' | 'clip' | 'custom';
  description: string;
  intensity: number;
  viewerCount?: number;
}

export interface ClipMetric {
  clipId: string;
  views: number;
  shares: number;
  likes: number;
  createdAt: Date;
  platform: string;
}

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface TimeSeriesData {
  metric: string;
  unit: string;
  interval: 'second' | 'minute' | 'hour' | 'day';
  points: TimeSeriesPoint[];
}

export interface ComparisonReport {
  sessions: string[];
  metrics: Record<string, number[]>;
  insights: string[];
  recommendations: string[];
}
