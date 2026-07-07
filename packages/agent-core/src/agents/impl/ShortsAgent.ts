import type { AgentMessage, AgentTask, ClipCandidate } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface ShortsMeta {
  id: string;
  clipId: string;
  title: string;
  description: string;
  hashtags: string[];
  subtitlePath?: string;
  outputPath?: string;
  status: 'pending' | 'processing' | 'ready' | 'uploaded';
  platform: 'youtube' | 'tiktok' | 'instagram';
  createdAt: Date;
}

export class ShortsAgent extends BaseAgent {
  private shortQueue: ShortsMeta[] = [];

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.SHORTS,
        name: 'Shorts Agent',
        description: 'Generates vertical clips with captions and subtitles for Shorts',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'normal',
        permissions: ['clips:read', 'clips:write', 'upload:write', 'notifications:send'],
        maxRetries: 3,
        retryDelayMs: 3000,
        heartbeatIntervalMs: 60_000,
        timeoutMs: 120_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.scheduler.scheduleInterval(
      'shorts:process-queue',
      3 * 60_000,
      () => this.processQueue(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {}

  protected registerTools(): void {
    this.registerTool({
      name: 'create_short',
      description: 'Create a YouTube Short from a clip',
      parameters: {
        clipId: { type: 'string' },
        title: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
      handler: async (params) => {
        const short: ShortsMeta = {
          id: generateId(),
          clipId: params['clipId'] as string,
          title: params['title'] as string,
          description: this.buildShortsDescription(params['hashtags'] as string[]),
          hashtags: params['hashtags'] as string[] ?? [],
          status: 'pending',
          platform: 'youtube',
          createdAt: new Date(),
        };
        this.shortQueue.push(short);
        return short;
      },
    });

    this.registerTool({
      name: 'get_queue',
      description: 'Get the Shorts queue',
      parameters: {},
      handler: async () => this.shortQueue,
    });
  }

  protected bindEvents(): void {
    this.subscribe('clip:processing:complete', async (payload) => {
      this.log.info('Clip ready, queuing for Shorts conversion', { clipId: payload.clipId });
      await this.queueTask('create_short', {
        clipId: payload.clipId,
        title: 'Watch this insane moment!',
        hashtags: ['#gaming', '#shorts', '#stream', '#clips'],
      });
    });
  }

  protected async onMessage(message: AgentMessage): Promise<void> {
    const tool = this.tools.get(message.type);
    if (tool) await tool.handler(message.payload as Record<string, unknown>);
  }

  protected async executeTask(task: AgentTask): Promise<unknown> {
    const tool = this.tools.get(task.type);
    if (!tool) throw new Error(`Unknown task: ${task.type}`);
    return tool.handler(task.payload as Record<string, unknown>);
  }

  private buildShortsDescription(hashtags: string[]): string {
    return `Watch the highlights! ${hashtags.join(' ')}`;
  }

  private async processQueue(): Promise<void> {
    const pending = this.shortQueue.filter((s) => s.status === 'pending').slice(0, 2);
    for (const short of pending) {
      short.status = 'processing';
      this.log.info(`Processing short: ${short.id}`);

      this.scheduler.scheduleDelay(
        `short:complete:${short.id}`,
        5000,
        async () => {
          short.status = 'ready';
          short.outputPath = `/shorts/${short.id}_vertical.mp4`;
          this.bus.emitSync(
            'notification:send',
            {
              title: 'Short Ready',
              body: `Your Short "${short.title}" is ready to upload!`,
              level: 'success',
              agentId: this.id,
            },
            this.id,
          );
        },
      );
    }
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      queueLength: this.shortQueue.length,
      pending: this.shortQueue.filter((s) => s.status === 'pending').length,
      ready: this.shortQueue.filter((s) => s.status === 'ready').length,
    };
  }
}
