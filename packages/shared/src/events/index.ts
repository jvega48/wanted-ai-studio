import type { ChatMessage, Donation, StreamMetrics, StreamPlatform, SubscriptionEvent, ViewerStats } from '../types/stream.js';
import type { ClipCandidate, ClipTrigger } from '../types/clip.js';
import type { AgentHealthCheck, AgentId, AgentMessage } from '../types/agent.js';

export type EventMap = {
  // Stream lifecycle
  'stream:started': { sessionId: string; platforms: StreamPlatform[]; timestamp: Date };
  'stream:ended': { sessionId: string; duration: number; timestamp: Date };
  'stream:interrupted': { sessionId: string; reason: string; timestamp: Date };
  'stream:platform:connected': { platform: StreamPlatform; channelId: string };
  'stream:platform:disconnected': { platform: StreamPlatform; reason?: string };

  // Viewer events
  'viewer:joined': { platform: StreamPlatform; userId: string; username: string; timestamp: Date };
  'viewer:left': { platform: StreamPlatform; userId: string; username: string; timestamp: Date };
  'viewer:stats:updated': ViewerStats;
  'viewer:raid': { platform: StreamPlatform; fromChannel: string; viewerCount: number; timestamp: Date };

  // Chat events
  'chat:message:received': ChatMessage;
  'chat:message:deleted': { platform: StreamPlatform; messageId: string; reason?: string };
  'chat:user:banned': { platform: StreamPlatform; userId: string; username: string; reason?: string };
  'chat:user:timed_out': { platform: StreamPlatform; userId: string; duration: number };

  // Monetization events
  'donation:received': Donation;
  'subscriber:received': SubscriptionEvent;
  'bits:received': { userId: string; username: string; amount: number; message?: string; timestamp: Date };

  // Game events
  'game:kill_streak': { count: number; timestamp: Date; sessionId: string };
  'game:boss_defeated': { bossName: string; timestamp: Date; sessionId: string };
  'game:match_won': { mode?: string; score?: number; timestamp: Date; sessionId: string };
  'game:match_lost': { mode?: string; score?: number; timestamp: Date; sessionId: string };
  'game:detected': { gameTitle: string; confidence: number; timestamp: Date };

  // OBS events
  'obs:connected': { host: string; port: number };
  'obs:disconnected': { reason?: string };
  'obs:scene:changed': { sceneName: string; previousScene: string; timestamp: Date };
  'obs:stream:started': { timestamp: Date };
  'obs:stream:stopped': { timestamp: Date };
  'obs:recording:started': { timestamp: Date };
  'obs:recording:stopped': { outputPath: string; timestamp: Date };
  'obs:stats:updated': { cpuUsage: number; memoryUsage: number; fps: number; droppedFrames: number };

  // Clip events
  'clip:trigger:detected': { trigger: ClipTrigger; score: number; timestamp: Date; sessionId: string };
  'clip:created': ClipCandidate;
  'clip:processing:started': { clipId: string };
  'clip:processing:complete': { clipId: string; outputPath: string };
  'clip:processing:failed': { clipId: string; error: string };
  'clip:uploaded': { clipId: string; platform: StreamPlatform; url: string };
  'clip:approved': { clipId: string; approvedBy: string };
  'clip:rejected': { clipId: string; reason?: string };

  // Content queue events
  'content:retry_requested': { itemId: string };

  // Analytics/metrics events
  'stream:metrics:updated': StreamMetrics;

  // Agent events
  'agent:started': { agentId: AgentId; timestamp: Date };
  'agent:stopped': { agentId: AgentId; reason?: string; timestamp: Date };
  'agent:error': { agentId: AgentId; error: string; timestamp: Date };
  'agent:health:updated': AgentHealthCheck;
  'agent:message': AgentMessage;
  'agent:task:queued': { agentId: AgentId; taskId: string; type: string };
  'agent:task:completed': { agentId: AgentId; taskId: string; durationMs: number };
  'agent:task:failed': { agentId: AgentId; taskId: string; error: string };

  // Voice events
  'voice:command:detected': { command: string; confidence: number; rawText: string; timestamp: Date };
  'voice:transcription': { text: string; isFinal: boolean; confidence: number; timestamp: Date };

  // Notification events
  'notification:send': { title: string; body: string; level: 'info' | 'success' | 'warning' | 'error'; agentId?: AgentId };

  // Content events
  'content:title:generated': { title: string; sessionId?: string; platform?: StreamPlatform };
  'content:description:generated': { description: string; platform: StreamPlatform; videoId?: string };
  'content:thumbnail:generated': { prompt: string; imagePath?: string; sessionId?: string };
  'content:schedule:updated': { schedule: Record<string, unknown> };

  // System events
  'system:startup': { timestamp: Date; version: string };
  'system:shutdown': { timestamp: Date; reason?: string };
  'system:error': { error: string; stack?: string; component?: string };
  'plugin:loaded': { pluginId: string; name: string; version: string };
  'plugin:unloaded': { pluginId: string; reason?: string };
};

export type EventName = keyof EventMap;
export type EventPayload<T extends EventName> = EventMap[T];

export interface EventEnvelope<T extends EventName = EventName> {
  id: string;
  event: T;
  payload: EventMap[T];
  timestamp: Date;
  sourceId?: string;
  correlationId?: string;
}

export type EventHandler<T extends EventName> = (
  payload: EventMap[T],
  envelope: EventEnvelope<T>,
) => void | Promise<void>;

export type WildcardEventHandler = (
  event: EventName,
  payload: unknown,
  envelope: EventEnvelope,
) => void | Promise<void>;
