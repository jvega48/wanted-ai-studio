import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface StreamScheduleEntry {
  id: string;
  title: string;
  game?: string;
  description: string;
  scheduledAt: Date;
  durationHours: number;
  checklist: ChecklistItem[];
  suggestedTags: string[];
  platforms: string[];
}

export interface ChecklistItem {
  id: string;
  task: string;
  completed: boolean;
  required: boolean;
}

const STREAM_CHECKLIST_TEMPLATE: Omit<ChecklistItem, 'id'>[] = [
  { task: 'Verify OBS scenes are configured', completed: false, required: true },
  { task: 'Test audio levels', completed: false, required: true },
  { task: 'Check stream key is set', completed: false, required: true },
  { task: 'Prepare stream title and tags', completed: false, required: true },
  { task: 'Notify Discord community', completed: false, required: false },
  { task: 'Check sponsor mentions/overlays', completed: false, required: false },
  { task: 'Set up chat commands', completed: false, required: false },
  { task: 'Verify game capture is working', completed: false, required: true },
  { task: 'Test alerts (follows, subs, donations)', completed: false, required: false },
  { task: 'Prepare starting soon screen', completed: false, required: false },
];

export class ProducerAgent extends BaseAgent {
  private schedule: StreamScheduleEntry[] = [];
  private activeStream: StreamScheduleEntry | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.PRODUCER,
        name: 'Producer Agent',
        description: 'Builds stream schedules, suggests titles and topics, creates checklists',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'normal',
        permissions: ['stream:read', 'stream:write', 'memory:read', 'notifications:send'],
        maxRetries: 3,
        retryDelayMs: 2000,
        heartbeatIntervalMs: 60_000,
        timeoutMs: 30_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.scheduler.scheduleInterval(
      'producer:daily-schedule-check',
      60 * 60_000,
      () => this.checkUpcomingStreams(),
      true,
    );
  }

  protected async onStop(_reason?: string): Promise<void> {}

  protected registerTools(): void {
    this.registerTool({
      name: 'create_stream_schedule',
      description: 'Create a stream schedule entry',
      parameters: {
        title: { type: 'string' },
        game: { type: 'string' },
        scheduledAt: { type: 'string' },
        durationHours: { type: 'number' },
        platforms: { type: 'array', items: { type: 'string' } },
      },
      handler: async (params) => {
        const entry: StreamScheduleEntry = {
          id: generateId(),
          title: params['title'] as string,
          game: params['game'] as string | undefined,
          description: '',
          scheduledAt: new Date(params['scheduledAt'] as string),
          durationHours: params['durationHours'] as number ?? 3,
          checklist: STREAM_CHECKLIST_TEMPLATE.map((item) => ({
            ...item,
            id: generateId(),
          })),
          suggestedTags: this.generateTags(params['game'] as string | undefined),
          platforms: params['platforms'] as string[] ?? ['twitch'],
        };
        this.schedule.push(entry);
        return entry;
      },
    });

    this.registerTool({
      name: 'suggest_stream_title',
      description: 'Generate stream title suggestions',
      parameters: { game: { type: 'string' }, mood: { type: 'string' } },
      handler: async (params) => {
        return this.generateTitleSuggestions(
          params['game'] as string,
          params['mood'] as string | undefined,
        );
      },
    });

    this.registerTool({
      name: 'get_schedule',
      description: 'Get upcoming stream schedule',
      parameters: {},
      handler: async () => this.schedule.filter((s) => s.scheduledAt > new Date()),
    });

    this.registerTool({
      name: 'get_checklist',
      description: 'Get stream preparation checklist',
      parameters: { streamId: { type: 'string' } },
      handler: async (params) => {
        const stream = this.schedule.find((s) => s.id === params['streamId']);
        return stream?.checklist ?? [];
      },
    });

    this.registerTool({
      name: 'complete_checklist_item',
      description: 'Mark a checklist item as completed',
      parameters: { streamId: { type: 'string' }, itemId: { type: 'string' } },
      handler: async (params) => {
        const stream = this.schedule.find((s) => s.id === params['streamId']);
        if (!stream) throw new Error('Stream not found');
        const item = stream.checklist.find((c) => c.id === params['itemId']);
        if (!item) throw new Error('Checklist item not found');
        item.completed = true;
        return item;
      },
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:started', (payload) => {
      const now = new Date();
      this.activeStream = this.schedule.find(
        (s) => Math.abs(s.scheduledAt.getTime() - now.getTime()) < 30 * 60_000,
      ) ?? null;

      this.log.info('Stream started, tracking active stream', {
        activeStreamId: this.activeStream?.id,
      });
    });

    this.subscribe('stream:ended', () => {
      this.activeStream = null;
    });

    this.subscribe('agent:message', async (message) => {
      if (message.toAgent === this.id) {
        await this.onMessage(message);
      }
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

  private generateTitleSuggestions(game: string, mood?: string): string[] {
    const templates = [
      `${game} - Road to ${this.randomMilestone()} !`,
      `Playing ${game} ${mood ? `in ${mood} mode` : 'live'}!`,
      `${game} | ${this.randomHook()}`,
      `Let's play ${game}! Come hang out`,
      `${game} — No pause, all skill`,
    ];
    return templates;
  }

  private generateTags(game?: string): string[] {
    const baseTags = ['gaming', 'live', 'streamer'];
    if (game) {
      const gameTag = game.toLowerCase().replace(/\s+/g, '');
      baseTags.push(gameTag, 'gameplay', `${gameTag}gameplay`);
    }
    return baseTags;
  }

  private randomMilestone(): string {
    const milestones = ['Rank 1', '100 Wins', 'Max Level', 'Platinum', 'Champion'];
    return milestones[Math.floor(Math.random() * milestones.length)] ?? 'Rank 1';
  }

  private randomHook(): string {
    const hooks = [
      'All kills, no mercy',
      'The grind never stops',
      'Watch this',
      'Something huge happening',
      'Best plays of the week',
    ];
    return hooks[Math.floor(Math.random() * hooks.length)] ?? 'All kills, no mercy';
  }

  private async checkUpcomingStreams(): Promise<void> {
    const inOneHour = new Date(Date.now() + 60 * 60_000);
    const upcoming = this.schedule.filter(
      (s) => s.scheduledAt > new Date() && s.scheduledAt < inOneHour,
    );

    for (const stream of upcoming) {
      const incompleteRequired = stream.checklist.filter((c) => c.required && !c.completed);
      if (incompleteRequired.length > 0) {
        this.bus.emitSync(
          'notification:send',
          {
            title: 'Stream Starting Soon',
            body: `Stream "${stream.title}" starts in ~1 hour. ${incompleteRequired.length} required checklist items incomplete.`,
            level: 'warning',
            agentId: this.id,
          },
          this.id,
        );
      }
    }
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      scheduledStreams: this.schedule.length,
      activeStream: this.activeStream?.id ?? null,
    };
  }
}
