import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface TrendItem {
  id: string;
  title: string;
  category: 'game' | 'creator' | 'content' | 'meme' | 'event';
  score: number;
  source: string;
  description: string;
  relevance: number;
  discoveredAt: Date;
  expiresAt: Date;
  tags: string[];
}

export interface ContentIdea {
  id: string;
  title: string;
  type: 'stream' | 'short' | 'video' | 'post';
  description: string;
  trendIds: string[];
  estimatedViewPotential: 'low' | 'medium' | 'high' | 'viral';
  createdAt: Date;
}

export class TrendAgent extends BaseAgent {
  private trends: TrendItem[] = [];
  private ideas: ContentIdea[] = [];
  private refreshJobId: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.TREND,
        name: 'Trend Agent',
        description: 'Tracks gaming and creator trends, surfaces content ideas',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'low',
        permissions: ['memory:write', 'notifications:send'],
        maxRetries: 3,
        retryDelayMs: 5000,
        heartbeatIntervalMs: 300_000,
        timeoutMs: 60_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.refreshJobId = this.scheduler.scheduleInterval(
      'trend:refresh',
      6 * 60 * 60_000,
      () => this.refreshTrends(),
      true,
    );
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.refreshJobId) this.scheduler.cancel(this.refreshJobId);
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'get_trends',
      description: 'Get current trending topics',
      parameters: { category: { type: 'string' }, limit: { type: 'number' } },
      handler: async (params) => {
        const cat = params['category'] as TrendItem['category'] | undefined;
        const limit = params['limit'] as number ?? 10;
        return (cat ? this.trends.filter((t) => t.category === cat) : this.trends)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      },
    });

    this.registerTool({
      name: 'get_content_ideas',
      description: 'Get AI-generated content ideas based on trends',
      parameters: { type: { type: 'string' }, limit: { type: 'number' } },
      handler: async (params) => {
        const type = params['type'] as ContentIdea['type'] | undefined;
        return (type ? this.ideas.filter((i) => i.type === type) : this.ideas)
          .slice(0, params['limit'] as number ?? 5);
      },
    });

    this.registerTool({
      name: 'suggest_games',
      description: 'Suggest trending games to stream',
      parameters: {},
      handler: async () => {
        return this.trends
          .filter((t) => t.category === 'game')
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((t) => ({ title: t.title, score: t.score, description: t.description }));
      },
    });
  }

  protected bindEvents(): void {
    this.subscribe('system:startup', async () => {
      await this.refreshTrends();
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

  private async refreshTrends(): Promise<void> {
    this.log.info('Refreshing trends');

    // Seed with realistic-looking mock trends; replaced by real API calls in production
    const now = new Date();
    const expires = new Date(now.getTime() + 6 * 60 * 60_000);

    this.trends = [
      {
        id: generateId(), title: 'Elden Ring DLC', category: 'game',
        score: 0.95, source: 'twitch', relevance: 0.9,
        description: 'Shadow of the Erdtree DLC is trending across all platforms',
        discoveredAt: now, expiresAt: expires, tags: ['elden ring', 'rpg', 'souls'],
      },
      {
        id: generateId(), title: 'Helldivers 2', category: 'game',
        score: 0.88, source: 'steam', relevance: 0.85,
        description: 'Helldivers 2 still dominating co-op charts',
        discoveredAt: now, expiresAt: expires, tags: ['helldivers', 'shooter', 'coop'],
      },
      {
        id: generateId(), title: 'AI Streaming Tools', category: 'creator',
        score: 0.82, source: 'youtube', relevance: 0.95,
        description: 'Creator economy tools using AI for content automation',
        discoveredAt: now, expiresAt: expires, tags: ['ai', 'creator', 'automation'],
      },
    ];

    this.generateContentIdeas();

    this.bus.emitSync(
      'notification:send',
      {
        title: 'Trends Updated',
        body: `Found ${this.trends.length} trending topics. Check the dashboard for content ideas!`,
        level: 'info',
        agentId: this.id,
      },
      this.id,
    );
  }

  private generateContentIdeas(): void {
    this.ideas = this.trends.slice(0, 3).map((trend) => ({
      id: generateId(),
      title: `Stream ${trend.title} this week`,
      type: 'stream' as const,
      description: `${trend.description}. Great opportunity to capture new viewers searching for this content.`,
      trendIds: [trend.id],
      estimatedViewPotential: trend.score > 0.9 ? 'high' : 'medium' as const,
      createdAt: new Date(),
    }));
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      trendCount: this.trends.length,
      ideaCount: this.ideas.length,
    };
  }
}
