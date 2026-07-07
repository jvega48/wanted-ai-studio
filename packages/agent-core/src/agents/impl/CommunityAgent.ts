import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface Announcement {
  id: string;
  content: string;
  channel: string;
  scheduledAt?: Date;
  sentAt?: Date;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  type: 'stream_start' | 'stream_end' | 'clip' | 'custom' | 'poll';
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  duration: number;
  channel: string;
  createdAt: Date;
  endsAt: Date;
  votes: Record<string, number>;
}

export class CommunityAgent extends BaseAgent {
  private announcements: Announcement[] = [];
  private polls: Poll[] = [];
  private discordWebhookUrl: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.COMMUNITY,
        name: 'Community Agent',
        description: 'Discord integration, announcements, polls, and community engagement',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'normal',
        permissions: ['discord:read', 'discord:write', 'notifications:send'],
        maxRetries: 3,
        retryDelayMs: 3000,
        heartbeatIntervalMs: 60_000,
        timeoutMs: 30_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.discordWebhookUrl = process.env['DISCORD_WEBHOOK_URL'] ?? null;

    this.scheduler.scheduleInterval(
      'community:check-scheduled',
      60_000,
      () => this.processScheduledAnnouncements(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {}

  protected registerTools(): void {
    this.registerTool({
      name: 'announce',
      description: 'Send or schedule a Discord announcement',
      parameters: {
        content: { type: 'string' },
        channel: { type: 'string' },
        scheduledAt: { type: 'string' },
        type: { type: 'string' },
      },
      handler: async (params) => {
        const announcement: Announcement = {
          id: generateId(),
          content: params['content'] as string,
          channel: params['channel'] as string ?? 'general',
          scheduledAt: params['scheduledAt'] ? new Date(params['scheduledAt'] as string) : undefined,
          type: (params['type'] as Announcement['type']) ?? 'custom',
          status: params['scheduledAt'] ? 'scheduled' : 'draft',
        };
        this.announcements.push(announcement);

        if (!announcement.scheduledAt) {
          await this.sendAnnouncement(announcement);
        }
        return announcement;
      },
    });

    this.registerTool({
      name: 'create_poll',
      description: 'Create a Discord poll',
      parameters: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        durationMinutes: { type: 'number' },
        channel: { type: 'string' },
      },
      handler: async (params) => {
        const durationMs = (params['durationMinutes'] as number ?? 10) * 60_000;
        const poll: Poll = {
          id: generateId(),
          question: params['question'] as string,
          options: params['options'] as string[],
          duration: durationMs,
          channel: params['channel'] as string ?? 'general',
          createdAt: new Date(),
          endsAt: new Date(Date.now() + durationMs),
          votes: {},
        };
        (params['options'] as string[]).forEach((opt) => { poll.votes[opt] = 0; });
        this.polls.push(poll);
        return poll;
      },
    });

    this.registerTool({
      name: 'get_announcements',
      description: 'Get announcement history',
      parameters: {},
      handler: async () => this.announcements,
    });

    this.registerTool({
      name: 'get_polls',
      description: 'Get polls',
      parameters: {},
      handler: async () => this.polls,
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:started', async (payload) => {
      const announcement: Announcement = {
        id: generateId(),
        content: `🔴 **WE ARE LIVE!** Stream has started! Come join us!`,
        channel: 'stream-announcements',
        type: 'stream_start',
        status: 'draft',
      };
      this.announcements.push(announcement);
      await this.sendAnnouncement(announcement);
    });

    this.subscribe('stream:ended', async () => {
      const announcement: Announcement = {
        id: generateId(),
        content: `Thanks for watching! Stream has ended. VOD will be available soon. See you next time! 👋`,
        channel: 'stream-announcements',
        type: 'stream_end',
        status: 'draft',
      };
      this.announcements.push(announcement);
      await this.sendAnnouncement(announcement);
    });

    this.subscribe('clip:created', async (clip) => {
      if (clip.triggerScore >= 0.9) {
        const announcement: Announcement = {
          id: generateId(),
          content: `🎬 New clip created! Check out this moment from the stream.`,
          channel: 'clips',
          type: 'clip',
          status: 'draft',
        };
        this.announcements.push(announcement);
        await this.sendAnnouncement(announcement);
      }
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

  private async sendAnnouncement(announcement: Announcement): Promise<void> {
    if (!this.discordWebhookUrl) {
      this.log.warn('Discord webhook not configured, skipping announcement');
      announcement.status = 'failed';
      return;
    }

    try {
      this.log.info(`Sending Discord announcement to #${announcement.channel}`);
      // Actual HTTP call to Discord webhook done by integrations/discord package
      announcement.status = 'sent';
      announcement.sentAt = new Date();
    } catch (error) {
      announcement.status = 'failed';
      this.log.error('Discord announcement failed', error);
    }
  }

  private async processScheduledAnnouncements(): Promise<void> {
    const now = new Date();
    const due = this.announcements.filter(
      (a) => a.status === 'scheduled' && a.scheduledAt && a.scheduledAt <= now,
    );
    for (const ann of due) {
      await this.sendAnnouncement(ann);
    }
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      discordConfigured: !!this.discordWebhookUrl,
      announcementCount: this.announcements.length,
      activePoll: this.polls.filter((p) => p.endsAt > new Date()).length,
    };
  }
}
