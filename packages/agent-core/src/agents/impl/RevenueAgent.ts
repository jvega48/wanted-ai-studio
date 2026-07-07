import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface RevenueEstimate {
  id: string;
  period: 'current_stream' | 'weekly' | 'monthly';
  subscriptions: number;
  donations: number;
  ads: number;
  sponsorships: number;
  bits: number;
  total: number;
  currency: string;
  estimatedAt: Date;
  recommendations: string[];
}

export interface MonetizationMetric {
  name: string;
  value: number;
  benchmark: number;
  status: 'above' | 'at' | 'below';
  suggestion?: string;
}

export class RevenueAgent extends BaseAgent {
  private currentStreamRevenue: Omit<RevenueEstimate, 'recommendations' | 'estimatedAt' | 'id'> = {
    period: 'current_stream',
    subscriptions: 0,
    donations: 0,
    ads: 0,
    sponsorships: 0,
    bits: 0,
    total: 0,
    currency: 'USD',
  };
  private estimates: RevenueEstimate[] = [];
  private reportJobId: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.REVENUE,
        name: 'Revenue Agent',
        description: 'Estimates revenue, tracks monetization metrics, and surfaces opportunities',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'low',
        permissions: ['analytics:read', 'stream:read', 'notifications:send'],
        maxRetries: 3,
        retryDelayMs: 5000,
        heartbeatIntervalMs: 300_000,
        timeoutMs: 30_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.reportJobId = this.scheduler.scheduleInterval(
      'revenue:hourly-report',
      60 * 60_000,
      () => this.generateHourlyReport(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.reportJobId) this.scheduler.cancel(this.reportJobId);
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'get_current_estimate',
      description: 'Get revenue estimate for the current stream',
      parameters: {},
      handler: async () => this.buildEstimate(),
    });

    this.registerTool({
      name: 'get_metrics',
      description: 'Get monetization performance metrics',
      parameters: {},
      handler: async () => this.buildMetrics(),
    });

    this.registerTool({
      name: 'get_recommendations',
      description: 'Get actionable revenue improvement recommendations',
      parameters: {},
      handler: async () => this.buildRecommendations(),
    });

    this.registerTool({
      name: 'get_history',
      description: 'Get revenue estimate history',
      parameters: { limit: { type: 'number' } },
      handler: async (params) => this.estimates.slice(-(params['limit'] as number ?? 10)),
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:started', () => {
      this.currentStreamRevenue = {
        period: 'current_stream',
        subscriptions: 0,
        donations: 0,
        ads: 0,
        sponsorships: 0,
        bits: 0,
        total: 0,
        currency: 'USD',
      };
    });

    this.subscribe('stream:ended', async () => {
      await this.generateHourlyReport();
    });

    this.subscribe('donation:received', (payload) => {
      this.currentStreamRevenue.donations += payload.amount;
      this.currentStreamRevenue.total += payload.amount;
    });

    this.subscribe('subscriber:received', () => {
      const subValue = 2.50;
      this.currentStreamRevenue.subscriptions += subValue;
      this.currentStreamRevenue.total += subValue;
    });

    this.subscribe('bits:received', (payload) => {
      const dollarValue = payload.amount * 0.01;
      this.currentStreamRevenue.bits += dollarValue;
      this.currentStreamRevenue.total += dollarValue;
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

  private buildEstimate(): RevenueEstimate {
    const estimate: RevenueEstimate = {
      id: generateId(),
      ...this.currentStreamRevenue,
      recommendations: this.buildRecommendations(),
      estimatedAt: new Date(),
    };
    return estimate;
  }

  private buildMetrics(): MonetizationMetric[] {
    return [
      {
        name: 'Revenue per viewer',
        value: this.currentStreamRevenue.total / Math.max(1, 100),
        benchmark: 0.50,
        status: this.currentStreamRevenue.total / 100 >= 0.5 ? 'above' : 'below',
        suggestion: 'Encourage donations with milestone alerts',
      },
      {
        name: 'Subscription rate',
        value: this.currentStreamRevenue.subscriptions / Math.max(1, 100) * 100,
        benchmark: 5,
        status: 'at',
        suggestion: 'Offer subscriber-only content to boost conversions',
      },
      {
        name: 'Average donation value',
        value: this.currentStreamRevenue.donations,
        benchmark: 10,
        status: this.currentStreamRevenue.donations >= 10 ? 'above' : 'below',
      },
    ];
  }

  private buildRecommendations(): string[] {
    const recs: string[] = [];

    if (this.currentStreamRevenue.subscriptions < 5) {
      recs.push('Set a subscriber goal on screen — sub goals increase conversion by ~20%');
    }
    if (this.currentStreamRevenue.donations < 10) {
      recs.push('Enable donation alerts with a milestone tracker to encourage giving');
    }
    recs.push('Schedule streams during peak hours (7-10pm) to maximize ad revenue');
    recs.push('Create a Shorts pipeline to drive YouTube ad revenue passively');

    return recs;
  }

  private async generateHourlyReport(): Promise<void> {
    const estimate = this.buildEstimate();
    this.estimates.push(estimate);

    this.log.info('Hourly revenue report generated', {
      total: estimate.total,
      subscriptions: estimate.subscriptions,
      donations: estimate.donations,
    });
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      currentStreamRevenue: this.currentStreamRevenue.total,
      estimateCount: this.estimates.length,
    };
  }
}
