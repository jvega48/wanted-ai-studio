export type StreamPlatform = 'twitch' | 'youtube' | 'kick' | 'tiktok';

export type StreamStatus = 'offline' | 'starting' | 'live' | 'ending' | 'error';

export interface StreamSession {
  id: string;
  title: string;
  description: string;
  platforms: StreamPlatform[];
  status: StreamStatus;
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  viewerPeak: number;
  viewerAverage: number;
  chatMessages: number;
  newFollowers: number;
  newSubscribers: number;
  donations: number;
  donationAmount: number;
  clipCount: number;
  duration: number;
  tags: string[];
  gameTitle?: string;
  thumbnailUrl?: string;
  vodUrls: Partial<Record<StreamPlatform, string>>;
  metadata: Record<string, unknown>;
}

export interface PlatformCredentials {
  platform: StreamPlatform;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  channelId: string;
  channelName: string;
  scopes: string[];
}

export interface StreamTarget {
  platform: StreamPlatform;
  rtmpUrl: string;
  streamKey: string;
  enabled: boolean;
  bitrateKbps: number;
}

export interface ChatMessage {
  id: string;
  platform: StreamPlatform;
  channelId: string;
  userId: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: Date;
  badges: string[];
  color?: string;
  isSubscriber: boolean;
  isModerator: boolean;
  isBroadcaster: boolean;
  isHighlighted: boolean;
  bits?: number;
  replyToMessageId?: string;
  emotes: ChatEmote[];
  deleted: boolean;
  deletedReason?: string;
}

export interface ChatEmote {
  id: string;
  name: string;
  positions: Array<{ start: number; end: number }>;
}

export interface Donation {
  id: string;
  platform: StreamPlatform;
  userId: string;
  username: string;
  amount: number;
  currency: string;
  message?: string;
  timestamp: Date;
}

export interface SubscriptionEvent {
  id: string;
  platform: StreamPlatform;
  userId: string;
  username: string;
  tier: string;
  months: number;
  streak?: number;
  giftedBy?: string;
  message?: string;
  timestamp: Date;
}

export interface ViewerStats {
  platform: StreamPlatform;
  count: number;
  timestamp: Date;
}

export interface StreamMetrics {
  sessionId: string;
  timestamp: Date;
  viewers: ViewerStats[];
  totalViewers: number;
  chatRate: number;
  followRate: number;
  clipRate: number;
  bitrate: number;
  droppedFrames: number;
  cpuUsage: number;
  gpuUsage: number;
  ramUsageMb: number;
}
