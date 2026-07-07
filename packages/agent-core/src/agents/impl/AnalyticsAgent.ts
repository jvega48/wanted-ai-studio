import type {
  AgentMessage,
  AgentTask,
  StreamMetrics,
  TimeSeriesData,
  TimeSeriesPoint,
  ViewerStats,
} from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

interface SessionMetrics {
  sessionId: string;
  snapshots: StreamMetrics[];
  chatCount: number;
  donationCount: number;
  donationAmount: number;
  subscriberCount: number;
  clipCount: number;
  peakViewers: number;
  startedAt: Date;
}

export class AnalyticsAgent extends BaseAgent {
  private activeSession: SessionMetrics | null = null;
  private viewerHistory: Map<string, TimeSeriesPoint[]> = new Map();
  private snapshotJobId: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.ANALYTICS,
        name: 'Analytics Agent',
        description: 'Tracks metrics, builds dashboards, and compares stream performance',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'high',
        permissions: ['analytics:read', 'analytics:write', 'stream:read'],
        maxRetries: 3,
        retryDelayMs: 1000,
        heartbeatIntervalMs: 30_000,
        timeoutMs: 60_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.snapshotJobId = this.scheduler.scheduleInterval(
      'analytics:snapshot',
      60_000,
      () => this.captureSnapshot(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.snapshotJobId) this.scheduler.cancel(this.snapshotJobId);
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'get_current_metrics',
      description: 'Returns current stream metrics snapshot',
      parameters: {},
      handler: async () => {
        if (!this.activeSession) return null;
        return this.buildCurrentMetrics();
      },
    });

    this.registerTool({
      name: 'get_viewer_timeseries',
      description: 'Returns viewer count time series for a session',
      parameters: { sessionId: { type: 'string' } },
      handler: async (params) => {
        const points = this.viewerHistory.get(params['sessionId'] as string) ?? [];
        const data: TimeSeriesData = {
          metric: 'viewers',
          unit: 'count',
          interval: 'minute',
          points,
        };
        return data;
      },
    });

    this.registerTool({
      name: 'get_session_summary',
      description: 'Returns a summary of the current or specified session',
      parameters: {},
      handler: async () => this.activeSession,
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:started', (payload) => {
      this.activeSession = {
        sessionId: payload.sessionId,
        snapshots: [],
        chatCount: 0,
        donationCount: 0,
        donationAmount: 0,
        subscriberCount: 0,
        clipCount: 0,
        peakViewers: 0,
        startedAt: payload.timestamp,
      };
      this.viewerHistory.set(payload.sessionId, []);
      this.log.info('Analytics tracking started', { sessionId: payload.sessionId });
    });

    this.subscribe('stream:ended', async (payload) => {
      this.log.info('Stream ended — finalizing analytics', { sessionId: payload.sessionId });
      await this.finalizeSession();
    });

    this.subscribe('viewer:stats:updated', (stats: ViewerStats) => {
      if (!this.activeSession) return;
      if (stats.count > this.activeSession.peakViewers) {
        this.activeSession.peakViewers = stats.count;
      }
      const points = this.viewerHistory.get(this.activeSession.sessionId);
      if (points) {
        points.push({ timestamp: stats.timestamp, value: stats.count });
      }
    });

    this.subscribe('chat:message:received', () => {
      if (this.activeSession) this.activeSession.chatCount++;
    });

    this.subscribe('donation:received', (payload) => {
      if (!this.activeSession) return;
      this.activeSession.donationCount++;
      this.activeSession.donationAmount += payload.amount;
    });

    this.subscribe('subscriber:received', () => {
      if (this.activeSession) this.activeSession.subscriberCount++;
    });

    this.subscribe('clip:created', () => {
      if (this.activeSession) this.activeSession.clipCount++;
    });
  }

  protected async onMessage(message: AgentMessage): Promise<void> {
    if (message.type === 'get_metrics') {
      const metrics = this.buildCurrentMetrics();
      const reply: AgentMessage = {
        id: generateId(),
        fromAgent: this.id,
        toAgent: message.fromAgent,
        type: 'metrics_response',
        payload: metrics,
        timestamp: new Date(),
        correlationId: message.id,
      };
      await this.bus.emit('agent:message', reply, this.id);
    }
  }

  protected async executeTask(task: AgentTask): Promise<unknown> {
    const tool = this.tools.get(task.type);
    if (!tool) throw new Error(`Unknown task: ${task.type}`);
    return tool.handler(task.payload as Record<string, unknown>);
  }

  private async captureSnapshot(): Promise<void> {
    if (!this.activeSession) return;

    const snapshot: StreamMetrics = {
      sessionId: this.activeSession.sessionId,
      timestamp: new Date(),
      viewers: [],
      totalViewers: this.activeSession.peakViewers,
      chatRate: this.calculateChatRate(),
      followRate: 0,
      clipRate: 0,
      bitrate: 0,
      droppedFrames: 0,
      cpuUsage: 0,
      gpuUsage: 0,
      ramUsageMb: process.memoryUsage().heapUsed / 1024 / 1024,
    };

    this.activeSession.snapshots.push(snapshot);
    this.bus.emitSync('stream:metrics:updated', snapshot, this.id);
  }

  private calculateChatRate(): number {
    if (!this.activeSession) return 0;
    const uptimeMinutes = (Date.now() - this.activeSession.startedAt.getTime()) / 60_000;
    return uptimeMinutes > 0 ? this.activeSession.chatCount / uptimeMinutes : 0;
  }

  private buildCurrentMetrics(): StreamMetrics | null {
    if (!this.activeSession) return null;
    return {
      sessionId: this.activeSession.sessionId,
      timestamp: new Date(),
      viewers: [],
      totalViewers: this.activeSession.peakViewers,
      chatRate: this.calculateChatRate(),
      followRate: 0,
      clipRate:
        (Date.now() - this.activeSession.startedAt.getTime()) / 3_600_000 > 0
          ? this.activeSession.clipCount / ((Date.now() - this.activeSession.startedAt.getTime()) / 3_600_000)
          : 0,
      bitrate: 0,
      droppedFrames: 0,
      cpuUsage: 0,
      gpuUsage: 0,
      ramUsageMb: process.memoryUsage().heapUsed / 1024 / 1024,
    };
  }

  private async finalizeSession(): Promise<void> {
    if (!this.activeSession) return;
    this.log.info('Session analytics finalized', {
      sessionId: this.activeSession.sessionId,
      peakViewers: this.activeSession.peakViewers,
      chatMessages: this.activeSession.chatCount,
      clips: this.activeSession.clipCount,
    });
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      activeSession: this.activeSession?.sessionId ?? null,
      snapshotCount: this.activeSession?.snapshots.length ?? 0,
    };
  }
}
