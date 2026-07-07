import { randomUUID } from 'crypto';
import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

interface DailyPlan {
  date: string;
  kpis: Record<string, number>;
  priorities: Array<{ agentId: string; task: string; priority: string }>;
  insights: string[];
  generatedAt: Date;
}

export class CeoAgent extends BaseAgent {
  private dailyPlan: DailyPlan | null = null;
  private dailyPlanJobId: string | null = null;
  private healthCheckJobId: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.CEO,
        name: 'CEO Agent',
        description: 'Coordinates all agents, prioritizes tasks, and tracks KPIs',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'critical',
        permissions: ['agents:manage', 'analytics:read', 'memory:read', 'memory:write', 'notifications:send', 'settings:read'],
        maxRetries: 3,
        retryDelayMs: 2000,
        heartbeatIntervalMs: 30_000,
        timeoutMs: 60_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.dailyPlanJobId = this.scheduler.scheduleInterval(
      'ceo:daily-plan',
      24 * 60 * 60 * 1000,
      () => this.generateDailyPlan(),
      true,
    );

    this.healthCheckJobId = this.scheduler.scheduleInterval(
      'ceo:health-check',
      5 * 60 * 1000,
      () => this.monitorAgentHealth(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.dailyPlanJobId) this.scheduler.cancel(this.dailyPlanJobId);
    if (this.healthCheckJobId) this.scheduler.cancel(this.healthCheckJobId);
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'get_daily_plan',
      description: 'Returns the current daily operational plan',
      parameters: {},
      handler: async () => this.dailyPlan,
    });

    this.registerTool({
      name: 'prioritize_task',
      description: 'Assigns priority to a task for a specific agent',
      parameters: {
        agentId: { type: 'string' },
        task: { type: 'string' },
        priority: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
      },
      handler: async (params) => {
        this.log.info('Prioritizing task', params);
        const message: AgentMessage = {
          id: randomUUID(),
          fromAgent: this.id,
          toAgent: params['agentId'] as string,
          type: 'prioritize_task',
          payload: { task: params['task'], priority: params['priority'] },
          timestamp: new Date(),
        };
        await this.bus.emit('agent:message', message, this.id);
        return { success: true };
      },
    });

    this.registerTool({
      name: 'generate_daily_plan',
      description: 'Generates a new daily operational plan',
      parameters: {},
      handler: () => this.generateDailyPlan(),
    });
  }

  protected bindEvents(): void {
    this.subscribe('agent:error', async (payload) => {
      this.log.warn(`Agent error detected: ${payload.agentId}`, { error: payload.error });
      await this.handleAgentError(payload.agentId, payload.error);
    });

    this.subscribe('stream:started', async (payload) => {
      this.log.info('Stream started, activating stream-mode priorities', { sessionId: payload.sessionId });
      await this.activateStreamMode(payload.sessionId);
    });

    this.subscribe('stream:ended', async (payload) => {
      this.log.info('Stream ended, switching to post-stream workflow', { sessionId: payload.sessionId });
      await this.activatePostStreamMode(payload.sessionId);
    });

    this.subscribe('donation:received', (payload) => {
      this.log.info('Donation received', { amount: payload.amount, user: payload.username });
    });
  }

  protected async onMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'status_report':
        await this.processStatusReport(message.fromAgent, message.payload);
        break;
      case 'request_guidance':
        await this.provideGuidance(message.fromAgent, message.payload as Record<string, unknown>);
        break;
      default:
        this.log.debug('Unhandled message type', { type: message.type });
    }
  }

  protected async executeTask(task: AgentTask): Promise<unknown> {
    const tool = this.tools.get(task.type);
    if (!tool) throw new Error(`Unknown task type: ${task.type}`);
    return tool.handler(task.payload as Record<string, unknown>);
  }

  private async generateDailyPlan(): Promise<void> {
    this.log.info('Generating daily plan');
    const today = new Date().toISOString().split('T')[0] ?? '';

    this.dailyPlan = {
      date: today,
      kpis: {
        targetViewers: 500,
        targetClips: 3,
        targetFollows: 50,
        targetRevenue: 100,
      },
      priorities: [
        { agentId: AGENT_IDS.PRODUCER, task: 'prepare_stream_schedule', priority: 'high' },
        { agentId: AGENT_IDS.TREND, task: 'fetch_trending_topics', priority: 'normal' },
        { agentId: AGENT_IDS.COMMUNITY, task: 'schedule_announcements', priority: 'normal' },
      ],
      insights: [
        'Focus on engagement during peak hours (7-10pm)',
        'Schedule clip uploads for 24h post-stream',
        'Check sponsorship opportunities weekly',
      ],
      generatedAt: new Date(),
    };

    this.bus.emitSync(
      'notification:send',
      {
        title: 'Daily Plan Ready',
        body: `Your AI plan for ${today} is ready. Check the dashboard for priorities.`,
        level: 'info',
        agentId: this.id,
      },
      this.id,
    );
  }

  private async monitorAgentHealth(): Promise<void> {
    const health = this.bus.getHistory('agent:health:updated', 100);
    const agentStatuses = new Map<string, string>();

    for (const envelope of health) {
      const h = envelope.payload as { agentId: string; status: string };
      agentStatuses.set(h.agentId, h.status);
    }

    for (const [agentId, status] of agentStatuses) {
      if (status === 'error') {
        this.log.warn(`Agent in error state, scheduling restart: ${agentId}`);
        this.scheduler.scheduleDelay(
          `restart:${agentId}`,
          5000,
          async () => {
            this.bus.emitSync('agent:error', {
              agentId: agentId as import('@wanted/shared').AgentId,
              error: 'Health monitor detected error state',
              timestamp: new Date(),
            });
          },
        );
      }
    }
  }

  private async handleAgentError(agentId: string, error: string): Promise<void> {
    this.log.warn(`Handling error from agent: ${agentId}`, { error });
    this.bus.emitSync(
      'notification:send',
      {
        title: 'Agent Error Detected',
        body: `Agent ${agentId} encountered an error: ${error}`,
        level: 'warning',
        agentId: this.id,
      },
      this.id,
    );
  }

  private async activateStreamMode(sessionId: string): Promise<void> {
    const streamModeMessage: AgentMessage = {
      id: randomUUID(),
      fromAgent: this.id,
      toAgent: '',
      type: 'activate_stream_mode',
      payload: { sessionId },
      timestamp: new Date(),
    };

    for (const agentId of [AGENT_IDS.MODERATOR, AGENT_IDS.ANALYTICS, AGENT_IDS.CLIP]) {
      await this.bus.emit(
        'agent:message',
        { ...streamModeMessage, toAgent: agentId },
        this.id,
      );
    }
  }

  private async activatePostStreamMode(sessionId: string): Promise<void> {
    for (const agentId of [AGENT_IDS.YOUTUBE, AGENT_IDS.SHORTS, AGENT_IDS.TIKTOK, AGENT_IDS.ANALYTICS]) {
      const msg: AgentMessage = {
        id: randomUUID(),
        fromAgent: this.id,
        toAgent: agentId,
        type: 'activate_post_stream',
        payload: { sessionId },
        timestamp: new Date(),
      };
      await this.bus.emit('agent:message', msg, this.id);
    }
  }

  private async processStatusReport(fromAgent: string, payload: unknown): Promise<void> {
    this.log.info(`Status report from ${fromAgent}`, { payload });
  }

  private async provideGuidance(toAgent: string, context: Record<string, unknown>): Promise<void> {
    this.log.info(`Providing guidance to ${toAgent}`, { context });
    const response: AgentMessage = {
      id: randomUUID(),
      fromAgent: this.id,
      toAgent,
      type: 'guidance',
      payload: { instruction: 'Continue with current priorities', context },
      timestamp: new Date(),
    };
    await this.bus.emit('agent:message', response, this.id);
  }
}
