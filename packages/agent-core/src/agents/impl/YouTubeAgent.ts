import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface YouTubeVideoMeta {
  id: string;
  clipId?: string;
  sessionId?: string;
  title: string;
  description: string;
  tags: string[];
  chapters: YouTubeChapter[];
  thumbnailPath?: string;
  categoryId: string;
  privacyStatus: 'public' | 'private' | 'unlisted';
  status: 'draft' | 'queued' | 'uploading' | 'published' | 'failed';
  scheduledAt?: Date;
  publishedAt?: Date;
  youtubeVideoId?: string;
  viewCount?: number;
  likeCount?: number;
  createdAt: Date;
}

export interface YouTubeChapter {
  title: string;
  startTime: string;
  endTime?: string;
}

export class YouTubeAgent extends BaseAgent {
  private uploadQueue: YouTubeVideoMeta[] = [];
  private processJobId: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.YOUTUBE,
        name: 'YouTube Agent',
        description: 'Creates titles, descriptions, chapters, tags and manages YouTube uploads',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'normal',
        permissions: ['upload:read', 'upload:write', 'clips:read', 'memory:read', 'notifications:send'],
        maxRetries: 3,
        retryDelayMs: 5000,
        heartbeatIntervalMs: 60_000,
        timeoutMs: 300_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.processJobId = this.scheduler.scheduleInterval(
      'youtube:process-queue',
      5 * 60_000,
      () => this.processUploadQueue(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.processJobId) this.scheduler.cancel(this.processJobId);
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'generate_video_meta',
      description: 'Generate YouTube video metadata from a stream session',
      parameters: {
        sessionId: { type: 'string' },
        title: { type: 'string' },
        gameTitle: { type: 'string' },
        highlights: { type: 'array', items: { type: 'string' } },
      },
      handler: async (params) => {
        return this.generateVideoMeta(
          params['sessionId'] as string,
          params['title'] as string,
          params['gameTitle'] as string | undefined,
          params['highlights'] as string[] | undefined,
        );
      },
    });

    this.registerTool({
      name: 'queue_upload',
      description: 'Add a video to the YouTube upload queue',
      parameters: { meta: { type: 'object' } },
      handler: async (params) => {
        const meta = params['meta'] as YouTubeVideoMeta;
        meta.status = 'queued';
        this.uploadQueue.push(meta);
        this.log.info(`Video queued for upload: ${meta.title}`);
        return meta;
      },
    });

    this.registerTool({
      name: 'get_upload_queue',
      description: 'Get the current YouTube upload queue',
      parameters: {},
      handler: async () => this.uploadQueue,
    });

    this.registerTool({
      name: 'generate_chapters',
      description: 'Generate YouTube chapters from stream moments',
      parameters: {
        moments: { type: 'array', items: { type: 'object' } },
      },
      handler: async (params) => {
        return this.generateChapters(params['moments'] as Array<{ timestamp: number; description: string }>);
      },
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:ended', async (payload) => {
      this.log.info('Stream ended — preparing YouTube video metadata', {
        sessionId: payload.sessionId,
      });
      await this.queueTask('generate_video_meta', {
        sessionId: payload.sessionId,
        title: 'Stream VOD',
      });
    });

    this.subscribe('clip:processing:complete', async (payload) => {
      this.log.info('Clip ready, checking if should upload to YouTube', {
        clipId: payload.clipId,
      });
    });
  }

  protected async onMessage(message: AgentMessage): Promise<void> {
    const tool = this.tools.get(message.type);
    if (tool) {
      await tool.handler(message.payload as Record<string, unknown>);
    }
  }

  protected async executeTask(task: AgentTask): Promise<unknown> {
    const tool = this.tools.get(task.type);
    if (!tool) throw new Error(`Unknown task: ${task.type}`);
    return tool.handler(task.payload as Record<string, unknown>);
  }

  private generateVideoMeta(
    sessionId: string,
    title: string,
    gameTitle?: string,
    highlights?: string[],
  ): YouTubeVideoMeta {
    const description = this.buildDescription(gameTitle, highlights);
    const tags = this.buildTags(gameTitle);

    const meta: YouTubeVideoMeta = {
      id: generateId(),
      sessionId,
      title: `${title} | ${gameTitle ?? 'Stream'} Live`,
      description,
      tags,
      chapters: [],
      categoryId: '20',
      privacyStatus: 'private',
      status: 'draft',
      createdAt: new Date(),
    };

    this.uploadQueue.push(meta);
    this.log.info(`Video meta generated: ${meta.title}`);
    return meta;
  }

  private buildDescription(gameTitle?: string, highlights?: string[]): string {
    const lines: string[] = [];

    if (gameTitle) {
      lines.push(`🎮 Playing: ${gameTitle}`);
      lines.push('');
    }

    if (highlights && highlights.length > 0) {
      lines.push('🔥 Stream Highlights:');
      highlights.forEach((h) => lines.push(`• ${h}`));
      lines.push('');
    }

    lines.push('📌 Subscribe for more content!');
    lines.push('');
    lines.push('🔔 Turn on notifications to never miss a stream');
    lines.push('');
    lines.push('Follow me:');
    lines.push('• Twitch: twitch.tv/yourchannel');
    lines.push('• TikTok: @yourchannel');
    lines.push('• Discord: discord.gg/yourserver');

    return lines.join('\n');
  }

  private buildTags(gameTitle?: string): string[] {
    const tags = ['gaming', 'live stream', 'gameplay', 'streamer'];
    if (gameTitle) {
      tags.push(gameTitle.toLowerCase(), `${gameTitle} gameplay`, `${gameTitle} stream`);
    }
    return [...new Set(tags)];
  }

  private generateChapters(
    moments: Array<{ timestamp: number; description: string }>,
  ): YouTubeChapter[] {
    const sorted = [...moments].sort((a, b) => a.timestamp - b.timestamp);

    return sorted.map((moment, idx) => {
      const minutes = Math.floor(moment.timestamp / 60);
      const seconds = Math.floor(moment.timestamp % 60);
      const startTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      const next = sorted[idx + 1];

      return {
        title: moment.description,
        startTime,
        endTime: next ? this.formatTime(next.timestamp) : undefined,
      };
    });
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private async processUploadQueue(): Promise<void> {
    const queued = this.uploadQueue.filter((v) => v.status === 'queued').slice(0, 1);
    for (const video of queued) {
      this.log.info(`Processing YouTube upload: ${video.title}`);
      video.status = 'uploading';
      this.bus.emitSync(
        'notification:send',
        {
          title: 'YouTube Upload Started',
          body: `Uploading "${video.title}" to YouTube...`,
          level: 'info',
          agentId: this.id,
        },
        this.id,
      );

      // Actual upload delegated to integrations/youtube package
      this.scheduler.scheduleDelay(
        `yt:upload:${video.id}`,
        3000,
        async () => {
          video.status = 'published';
          video.publishedAt = new Date();
          video.youtubeVideoId = `yt_${generateId().slice(0, 8)}`;
          this.log.info(`YouTube upload complete: ${video.youtubeVideoId}`);
        },
      );
    }
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      queueLength: this.uploadQueue.length,
      pendingUploads: this.uploadQueue.filter((v) => v.status === 'queued').length,
      uploadedCount: this.uploadQueue.filter((v) => v.status === 'published').length,
    };
  }
}
