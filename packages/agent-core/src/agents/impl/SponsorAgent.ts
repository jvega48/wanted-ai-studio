import type { AgentMessage, AgentTask } from '@wanted/shared';
import { AGENT_IDS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export interface Sponsor {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  website?: string;
  dealValue?: number;
  currency?: string;
  dealType: 'per_stream' | 'monthly' | 'per_video' | 'one_time';
  notes?: string;
  tags?: string[];
  activeSince?: Date;
  activeTo?: Date;
  isActive: boolean;
  totalPaid: number;
  mentionCount: number;
  lastMentionedAt?: Date;
  outreachHistory: OutreachEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OutreachEvent {
  id: string;
  date: Date;
  type: 'email' | 'call' | 'meeting' | 'message';
  summary: string;
  outcome?: 'positive' | 'negative' | 'neutral' | 'pending';
  followUpAt?: Date;
}

export interface SponsorCampaign {
  id: string;
  sponsorId: string;
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  budget: number;
  deliverables: string[];
  completedDeliverables: string[];
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  createdAt: Date;
}

export class SponsorAgent extends BaseAgent {
  private sponsors: Map<string, Sponsor> = new Map();
  private campaigns: Map<string, SponsorCampaign> = new Map();
  private mentionReminderJobId: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.SPONSOR,
        name: 'Sponsor Agent',
        description: 'Tracks sponsors, manages campaigns, and generates outreach drafts',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'low',
        permissions: ['memory:read', 'memory:write', 'notifications:send', 'stream:read'],
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
    this.mentionReminderJobId = this.scheduler.scheduleInterval(
      'sponsor:mention-reminder',
      30 * 60_000,
      () => this.checkMentionReminders(),
    );
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.mentionReminderJobId) this.scheduler.cancel(this.mentionReminderJobId);
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'add_sponsor',
      description: 'Add a new sponsor to the database',
      parameters: {
        name: { type: 'string' },
        contactEmail: { type: 'string' },
        dealValue: { type: 'number' },
        dealType: { type: 'string' },
        notes: { type: 'string' },
      },
      handler: async (params) => {
        const sponsor: Sponsor = {
          id: generateId(),
          name: params['name'] as string,
          contactEmail: params['contactEmail'] as string | undefined,
          dealValue: params['dealValue'] as number | undefined,
          dealType: (params['dealType'] as Sponsor['dealType']) ?? 'monthly',
          notes: params['notes'] as string | undefined,
          isActive: true,
          totalPaid: 0,
          mentionCount: 0,
          outreachHistory: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.sponsors.set(sponsor.id, sponsor);
        this.log.info(`Sponsor added: ${sponsor.name}`);
        return sponsor;
      },
    });

    this.registerTool({
      name: 'generate_outreach',
      description: 'Generate a sponsor outreach email draft',
      parameters: {
        companyName: { type: 'string' },
        contactName: { type: 'string' },
        viewerCount: { type: 'number' },
        niche: { type: 'string' },
      },
      handler: async (params) => {
        return this.generateOutreachEmail(
          params['companyName'] as string,
          params['contactName'] as string | undefined,
          params['viewerCount'] as number | undefined,
          params['niche'] as string | undefined,
        );
      },
    });

    this.registerTool({
      name: 'get_sponsors',
      description: 'Get all sponsors',
      parameters: { activeOnly: { type: 'boolean' } },
      handler: async (params) => {
        const all = Array.from(this.sponsors.values());
        return params['activeOnly'] ? all.filter((s) => s.isActive) : all;
      },
    });

    this.registerTool({
      name: 'log_outreach',
      description: 'Log a sponsor outreach event',
      parameters: {
        sponsorId: { type: 'string' },
        type: { type: 'string' },
        summary: { type: 'string' },
        outcome: { type: 'string' },
      },
      handler: async (params) => {
        const sponsor = this.sponsors.get(params['sponsorId'] as string);
        if (!sponsor) throw new Error('Sponsor not found');
        const event: OutreachEvent = {
          id: generateId(),
          date: new Date(),
          type: params['type'] as OutreachEvent['type'],
          summary: params['summary'] as string,
          outcome: params['outcome'] as OutreachEvent['outcome'],
        };
        sponsor.outreachHistory.push(event);
        sponsor.updatedAt = new Date();
        return event;
      },
    });

    this.registerTool({
      name: 'create_campaign',
      description: 'Create a sponsor campaign',
      parameters: {
        sponsorId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        budget: { type: 'number' },
        deliverables: { type: 'array', items: { type: 'string' } },
      },
      handler: async (params) => {
        const campaign: SponsorCampaign = {
          id: generateId(),
          sponsorId: params['sponsorId'] as string,
          name: params['name'] as string,
          description: params['description'] as string ?? '',
          startDate: new Date(params['startDate'] as string),
          endDate: new Date(params['endDate'] as string),
          budget: params['budget'] as number ?? 0,
          deliverables: params['deliverables'] as string[] ?? [],
          completedDeliverables: [],
          status: 'planned',
          createdAt: new Date(),
        };
        this.campaigns.set(campaign.id, campaign);
        return campaign;
      },
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:started', async () => {
      const activeSponsors = Array.from(this.sponsors.values()).filter((s) => s.isActive);
      if (activeSponsors.length > 0) {
        this.bus.emitSync(
          'notification:send',
          {
            title: 'Sponsor Reminder',
            body: `You have ${activeSponsors.length} active sponsors. Remember to mention them during your stream!`,
            level: 'info',
            agentId: this.id,
          },
          this.id,
        );
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

  private generateOutreachEmail(
    companyName: string,
    contactName?: string,
    viewerCount?: number,
    niche?: string,
  ): string {
    const greeting = contactName ? `Hi ${contactName},` : `Hi ${companyName} Team,`;
    const viewers = viewerCount ? `${viewerCount.toLocaleString()} viewers` : 'a growing community';

    return `${greeting}

I'm reaching out because I believe ${companyName} would be a fantastic fit for my streaming community.

I currently stream ${niche ?? 'gaming and lifestyle content'} to ${viewers} across Twitch and YouTube, with an engaged audience that aligns perfectly with ${companyName}'s target demographic.

What I can offer:
• Live stream sponsor segments with dedicated airtime
• Social media mentions across TikTok, Twitter, and Discord (${viewers}+ community)
• Dedicated short-form content featuring your product
• Authentic integration that resonates with my audience

I'd love to explore a partnership that benefits both of us. Would you be open to a quick call this week to discuss options?

Looking forward to hearing from you!

Best regards,
[Your Name]
[Your Channel / Contact Info]`;
  }

  private async checkMentionReminders(): Promise<void> {
    const activeSponsors = Array.from(this.sponsors.values()).filter((s) => s.isActive);
    const threshold = 7 * 24 * 60 * 60_000;

    for (const sponsor of activeSponsors) {
      if (!sponsor.lastMentionedAt || Date.now() - sponsor.lastMentionedAt.getTime() > threshold) {
        this.bus.emitSync(
          'notification:send',
          {
            title: 'Sponsor Mention Overdue',
            body: `It's been a while since you mentioned ${sponsor.name}. Consider including them in your next stream!`,
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
      sponsorCount: this.sponsors.size,
      activeSponsorCount: Array.from(this.sponsors.values()).filter((s) => s.isActive).length,
      campaignCount: this.campaigns.size,
    };
  }
}
