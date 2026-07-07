import type { AgentMessage, AgentTask, ClipCandidate, ClipTrigger } from '@wanted/shared';
import { AGENT_IDS, CLIP_DEFAULTS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

interface ClipWindow {
  startTime: number;
  eventScores: number[];
  lastEventAt: number;
}

export class ClipAgent extends BaseAgent {
  private activeSessionId: string | null = null;
  private streamStartTime: number | null = null;
  private clipQueue: ClipCandidate[] = [];
  private clipWindow: ClipWindow | null = null;
  private detectionJobId: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.CLIP,
        name: 'Clip Agent',
        description: 'Detects exciting moments and manages clip creation queue',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'high',
        permissions: ['clips:read', 'clips:write', 'stream:read', 'notifications:send'],
        maxRetries: 3,
        retryDelayMs: 2000,
        heartbeatIntervalMs: 15_000,
        timeoutMs: 30_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.detectionJobId = this.scheduler.scheduleInterval(
      'clip:process-queue',
      10_000,
      () => this.processClipQueue(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.detectionJobId) this.scheduler.cancel(this.detectionJobId);
    this.clipWindow = null;
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'create_clip',
      description: 'Manually create a clip at the current stream position',
      parameters: {
        sessionId: { type: 'string' },
        title: { type: 'string' },
        durationSeconds: { type: 'number' },
      },
      handler: async (params) => {
        const candidate = this.buildClipCandidate(
          params['sessionId'] as string,
          this.getCurrentTimestamp(),
          params['durationSeconds'] as number ?? CLIP_DEFAULTS.minDurationSeconds,
          'manual',
          1.0,
        );
        candidate.title = params['title'] as string | undefined;
        candidate.manuallyApproved = true;
        this.queueClip(candidate);
        return candidate;
      },
    });

    this.registerTool({
      name: 'get_clip_queue',
      description: 'Returns the current clip queue',
      parameters: {},
      handler: async () => this.clipQueue,
    });

    this.registerTool({
      name: 'approve_clip',
      description: 'Approve a clip for processing',
      parameters: { clipId: { type: 'string' } },
      handler: async (params) => {
        const clip = this.clipQueue.find((c) => c.id === params['clipId']);
        if (!clip) throw new Error(`Clip not found: ${params['clipId']}`);
        clip.manuallyApproved = true;
        this.bus.emitSync('clip:approved', { clipId: clip.id, approvedBy: 'user' }, this.id);
        return clip;
      },
    });

    this.registerTool({
      name: 'reject_clip',
      description: 'Reject and remove a clip from the queue',
      parameters: { clipId: { type: 'string' }, reason: { type: 'string' } },
      handler: async (params) => {
        const idx = this.clipQueue.findIndex((c) => c.id === params['clipId']);
        if (idx === -1) throw new Error(`Clip not found: ${params['clipId']}`);
        const [clip] = this.clipQueue.splice(idx, 1) as [ClipCandidate];
        clip.status = 'rejected';
        this.bus.emitSync(
          'clip:rejected',
          { clipId: clip.id, reason: params['reason'] as string | undefined },
          this.id,
        );
        return { success: true };
      },
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:started', (payload) => {
      this.activeSessionId = payload.sessionId;
      this.streamStartTime = Date.now();
      this.clipWindow = null;
      this.clipQueue = [];
      this.log.info('Clip detection active', { sessionId: payload.sessionId });
    });

    this.subscribe('stream:ended', () => {
      this.activeSessionId = null;
      this.streamStartTime = null;
      this.log.info(`Clip session ended. Queue: ${this.clipQueue.length} clips`);
    });

    this.subscribe('game:kill_streak', (payload) => {
      this.onTriggerEvent('kill_streak', 0.8 + payload.count * 0.05, payload.sessionId);
    });

    this.subscribe('game:boss_defeated', (payload) => {
      this.onTriggerEvent('boss_defeated', 0.9, payload.sessionId);
    });

    this.subscribe('game:match_won', (payload) => {
      this.onTriggerEvent('match_won', 0.85, payload.sessionId);
    });

    this.subscribe('donation:received', (payload) => {
      const score = Math.min(0.6 + payload.amount / 1000, 1.0);
      if (score >= CLIP_DEFAULTS.minTriggerScore && this.activeSessionId) {
        this.onTriggerEvent('donation_spike', score, this.activeSessionId);
      }
    });

    this.subscribe('subscriber:received', () => {
      if (this.activeSessionId) {
        this.onTriggerEvent('subscriber_spike', 0.7, this.activeSessionId);
      }
    });

    this.subscribe('voice:command:detected', (payload) => {
      if (payload.command === 'clip that' && this.activeSessionId) {
        this.onTriggerEvent('voice_command', 1.0, this.activeSessionId);
      }
    });

    // When a user approves a clip via the API, mark it in the in-memory queue
    // so processClipQueue() picks it up for FFmpeg processing.
    this.subscribe('clip:approved', ({ clipId }) => {
      const candidate = this.clipQueue.find((c) => c.id === clipId);
      if (candidate) {
        candidate.manuallyApproved = true;
        candidate.status = 'approved';
      }
    });
  }

  protected async onMessage(message: AgentMessage): Promise<void> {
    if (message.type === 'create_clip') {
      const payload = message.payload as { sessionId: string; title?: string };
      await this.queueTask('create_clip', payload);
    }
  }

  protected async executeTask(task: AgentTask): Promise<unknown> {
    const tool = this.tools.get(task.type);
    if (!tool) throw new Error(`Unknown task: ${task.type}`);
    return tool.handler(task.payload as Record<string, unknown>);
  }

  private onTriggerEvent(trigger: ClipTrigger, score: number, sessionId: string): void {
    const timestamp = this.getCurrentTimestamp();
    this.bus.emitSync(
      'clip:trigger:detected',
      { trigger, score, timestamp: new Date(), sessionId },
      this.id,
    );

    if (score >= CLIP_DEFAULTS.minTriggerScore) {
      const candidate = this.buildClipCandidate(sessionId, timestamp, CLIP_DEFAULTS.minDurationSeconds, trigger, score);
      this.queueClip(candidate);
    }
  }

  private buildClipCandidate(
    sessionId: string,
    timestampSeconds: number,
    durationSeconds: number,
    triggerType: ClipTrigger,
    triggerScore: number,
  ): ClipCandidate {
    return {
      id: generateId(),
      sessionId,
      timestampSeconds: Math.max(0, timestampSeconds - durationSeconds * 0.7),
      durationSeconds,
      triggerType,
      triggerScore,
      status: 'pending',
      platforms: {},
      format: 'landscape',
      tags: [],
      aiGenerated: triggerType !== 'manual',
      manuallyApproved: triggerType === 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private queueClip(candidate: ClipCandidate): void {
    this.clipQueue.push(candidate);
    this.bus.emitSync('clip:created', candidate, this.id);
    this.log.info(`Clip queued: ${candidate.id}`, {
      trigger: candidate.triggerType,
      score: candidate.triggerScore,
    });
  }

  private async processClipQueue(): Promise<void> {
    const pendingClips = this.clipQueue.filter(
      (c) => (c.status === 'pending' || c.status === 'approved') && c.manuallyApproved,
    );

    for (const clip of pendingClips.slice(0, 2)) {
      clip.status = 'processing';
      this.bus.emitSync('clip:processing:started', { clipId: clip.id }, this.id);

      this.scheduler.scheduleDelay(
        `clip:complete:${clip.id}`,
        5000,
        async () => {
          clip.status = 'ready';
          clip.outputPath = `/clips/${clip.id}.mp4`;
          clip.updatedAt = new Date();
          this.bus.emitSync(
            'clip:processing:complete',
            { clipId: clip.id, outputPath: clip.outputPath },
            this.id,
          );
        },
      );
    }
  }

  private getCurrentTimestamp(): number {
    if (!this.streamStartTime) return 0;
    return (Date.now() - this.streamStartTime) / 1000;
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      queueLength: this.clipQueue.length,
      activeSession: this.activeSessionId,
      pendingClips: this.clipQueue.filter((c) => c.status === 'pending').length,
    };
  }
}
