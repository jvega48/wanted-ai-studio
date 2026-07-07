import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface ThumbnailRequest {
  id: string;
  sessionId?: string;
  gameTitle?: string;
  streamTitle?: string;
  emotionKeywords: string[];
  colorScheme: string;
  prompt: string;
  imagePath?: string;
  status: 'pending' | 'generating' | 'ready' | 'rejected';
  createdAt: Date;
}

const THUMBNAIL_EMOTION_KEYWORDS: Record<string, string[]> = {
  win: ['triumphant', 'ecstatic', 'shocked', 'celebration'],
  loss: ['devastated', 'shocked', 'determined', 'comeback'],
  funny: ['laughing', 'surprised', 'confused', 'amazed'],
  epic: ['intense', 'focused', 'determined', 'shocked'],
  default: ['excited', 'engaged', 'surprised'],
};

export class ThumbnailAgent extends BaseAgent {
  private requests: ThumbnailRequest[] = [];
  private brandColorScheme = 'dark purple and gold';

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.THUMBNAIL,
        name: 'Thumbnail Agent',
        description: 'Generates thumbnail prompts and maintains brand consistency',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'low',
        permissions: ['clips:read', 'notifications:send', 'memory:read'],
        maxRetries: 3,
        retryDelayMs: 5000,
        heartbeatIntervalMs: 120_000,
        timeoutMs: 60_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {}

  protected async onStop(_reason?: string): Promise<void> {}

  protected registerTools(): void {
    this.registerTool({
      name: 'generate_thumbnail_prompt',
      description: 'Generate an AI image prompt for a stream thumbnail',
      parameters: {
        gameTitle: { type: 'string' },
        streamTitle: { type: 'string' },
        mood: { type: 'string' },
        sessionId: { type: 'string' },
      },
      handler: async (params) => {
        const request = this.createRequest(
          params['gameTitle'] as string | undefined,
          params['streamTitle'] as string | undefined,
          params['mood'] as string | undefined,
          params['sessionId'] as string | undefined,
        );
        return request;
      },
    });

    this.registerTool({
      name: 'set_brand_colors',
      description: 'Update the brand color scheme for thumbnails',
      parameters: { colorScheme: { type: 'string' } },
      handler: async (params) => {
        this.brandColorScheme = params['colorScheme'] as string;
        this.log.info(`Brand colors updated: ${this.brandColorScheme}`);
        return { colorScheme: this.brandColorScheme };
      },
    });

    this.registerTool({
      name: 'get_requests',
      description: 'Get thumbnail generation history',
      parameters: {},
      handler: async () => this.requests,
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:ended', async (payload) => {
      await this.queueTask('generate_thumbnail_prompt', {
        sessionId: payload.sessionId,
        streamTitle: 'Stream Thumbnail',
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

  private createRequest(
    gameTitle?: string,
    streamTitle?: string,
    mood?: string,
    sessionId?: string,
  ): ThumbnailRequest {
    const emotions = THUMBNAIL_EMOTION_KEYWORDS[mood ?? 'default'] ?? THUMBNAIL_EMOTION_KEYWORDS['default'] ?? ['excited'];
    const prompt = this.buildPrompt(gameTitle, streamTitle, emotions);

    const request: ThumbnailRequest = {
      id: generateId(),
      sessionId,
      gameTitle,
      streamTitle,
      emotionKeywords: emotions,
      colorScheme: this.brandColorScheme,
      prompt,
      status: 'pending',
      createdAt: new Date(),
    };

    this.requests.push(request);
    this.log.info(`Thumbnail prompt generated`, { id: request.id });
    return request;
  }

  private buildPrompt(gameTitle?: string, streamTitle?: string, emotions?: string[]): string {
    const emotion = emotions?.[0] ?? 'excited';
    const game = gameTitle ? `playing ${gameTitle}` : 'streaming';
    const title = streamTitle ? `, title: "${streamTitle}"` : '';
    return [
      `YouTube gaming thumbnail, streamer face close-up with ${emotion} expression,`,
      `${game}${title},`,
      `${this.brandColorScheme} color scheme,`,
      `dramatic lighting, high contrast, text overlay space on left side,`,
      `professional gaming thumbnail style, 1280x720`,
    ].join(' ');
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      requestCount: this.requests.length,
      pending: this.requests.filter((r) => r.status === 'pending').length,
    };
  }
}
