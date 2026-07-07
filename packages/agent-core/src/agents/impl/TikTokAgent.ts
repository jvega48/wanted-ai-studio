import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface TikTokPost {
  id: string;
  clipId?: string;
  caption: string;
  hashtags: string[];
  videoPath?: string;
  coverPath?: string;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  scheduledAt?: Date;
  publishedAt?: Date;
  tiktokVideoId?: string;
  views?: number;
  likes?: number;
  shares?: number;
  createdAt: Date;
}

const TRENDING_GAMING_HASHTAGS = [
  '#gaming', '#gamer', '#gaminglife', '#streamer', '#twitchstreamer',
  '#gamingcommunity', '#live', '#clips', '#fyp', '#foryoupage',
  '#gamingmoments', '#epicmoments', '#streamerclips',
];

export class TikTokAgent extends BaseAgent {
  private postQueue: TikTokPost[] = [];
  private scheduledPosts: TikTokPost[] = [];

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.TIKTOK,
        name: 'TikTok Agent',
        description: 'Creates captions, hashtags, and schedules TikTok uploads',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'normal',
        permissions: ['clips:read', 'upload:write', 'notifications:send'],
        maxRetries: 3,
        retryDelayMs: 5000,
        heartbeatIntervalMs: 60_000,
        timeoutMs: 120_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.scheduler.scheduleInterval(
      'tiktok:post-scheduler',
      15 * 60_000,
      () => this.checkScheduledPosts(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {}

  protected registerTools(): void {
    this.registerTool({
      name: 'create_post',
      description: 'Create a TikTok post from a clip',
      parameters: {
        clipId: { type: 'string' },
        caption: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
        scheduledAt: { type: 'string' },
      },
      handler: async (params) => {
        const post: TikTokPost = {
          id: generateId(),
          clipId: params['clipId'] as string | undefined,
          caption: params['caption'] as string,
          hashtags: params['hashtags'] as string[] ?? this.selectHashtags(),
          status: params['scheduledAt'] ? 'scheduled' : 'draft',
          scheduledAt: params['scheduledAt'] ? new Date(params['scheduledAt'] as string) : undefined,
          createdAt: new Date(),
        };
        this.postQueue.push(post);
        if (post.scheduledAt) this.scheduledPosts.push(post);
        return post;
      },
    });

    this.registerTool({
      name: 'generate_caption',
      description: 'Generate a viral TikTok caption for a clip',
      parameters: {
        triggerType: { type: 'string' },
        gameTitle: { type: 'string' },
      },
      handler: async (params) => {
        return this.generateCaption(
          params['triggerType'] as string,
          params['gameTitle'] as string | undefined,
        );
      },
    });

    this.registerTool({
      name: 'suggest_hashtags',
      description: 'Suggest trending hashtags for a TikTok post',
      parameters: { niche: { type: 'string' }, game: { type: 'string' } },
      handler: async (params) => this.suggestHashtags(params['game'] as string | undefined),
    });

    this.registerTool({
      name: 'get_optimal_schedule',
      description: 'Get the best times to post TikToks this week',
      parameters: { timezone: { type: 'string' } },
      handler: async () => this.getOptimalPostTimes(),
    });

    this.registerTool({
      name: 'get_queue',
      description: 'Get the TikTok post queue',
      parameters: {},
      handler: async () => this.postQueue,
    });
  }

  protected bindEvents(): void {
    this.subscribe('clip:processing:complete', async (payload) => {
      const caption = this.generateCaption('ai_detected');
      await this.queueTask('create_post', {
        clipId: payload.clipId,
        caption,
        hashtags: this.selectHashtags(),
        scheduledAt: this.getNextOptimalTime().toISOString(),
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

  private generateCaption(triggerType: string, gameTitle?: string): string {
    const hooks: Record<string, string[]> = {
      kill_streak: ['Nobody saw that coming 💀', 'POV: You went off 🔥', 'Clean sweep, no mercy'],
      boss_defeated: ['Boss didn\'t stand a chance 👑', 'That\'s how it\'s done ⚔️'],
      match_won: ['W only 🏆', 'The comeback was REAL', 'Clutch or kick 🎮'],
      donation_spike: ['The community said WOW 🙌', 'You guys are insane 💙'],
      ai_detected: ['You need to see this moment 👀', 'Clip of the stream 🔥'],
      manual: ['Watch this 🎮', 'Clip of the day'],
    };

    const options = hooks[triggerType] ?? hooks['ai_detected'] ?? ['Watch this 🎮'];
    const hook = options[Math.floor(Math.random() * options.length)] ?? options[0] ?? 'Watch this 🎮';
    const game = gameTitle ? ` | ${gameTitle}` : '';
    return `${hook}${game}`;
  }

  private selectHashtags(count = 8): string[] {
    const shuffled = [...TRENDING_GAMING_HASHTAGS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private suggestHashtags(game?: string): string[] {
    const base = this.selectHashtags(6);
    if (game) {
      base.push(`#${game.toLowerCase().replace(/\s+/g, '')}`, `#${game.toLowerCase().replace(/\s+/g, '')}tiktok`);
    }
    return base;
  }

  private getOptimalPostTimes(): Array<{ day: string; time: string; score: number }> {
    return [
      { day: 'Tuesday', time: '09:00', score: 0.92 },
      { day: 'Thursday', time: '12:00', score: 0.88 },
      { day: 'Friday', time: '19:00', score: 0.95 },
      { day: 'Saturday', time: '11:00', score: 0.90 },
      { day: 'Sunday', time: '14:00', score: 0.87 },
    ];
  }

  private getNextOptimalTime(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    return d;
  }

  private async checkScheduledPosts(): Promise<void> {
    const now = new Date();
    const due = this.scheduledPosts.filter(
      (p) => p.scheduledAt && p.scheduledAt <= now && p.status === 'scheduled',
    );

    for (const post of due) {
      post.status = 'publishing';
      this.log.info(`Publishing TikTok: ${post.id}`);

      this.scheduler.scheduleDelay(
        `tiktok:publish:${post.id}`,
        2000,
        async () => {
          post.status = 'published';
          post.publishedAt = new Date();
          post.tiktokVideoId = `tt_${generateId().slice(0, 10)}`;
          this.bus.emitSync(
            'notification:send',
            {
              title: 'TikTok Published',
              body: `Your TikTok is live!`,
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
      queueLength: this.postQueue.length,
      scheduled: this.scheduledPosts.length,
      published: this.postQueue.filter((p) => p.status === 'published').length,
    };
  }
}
