import type { AgentMessage, AgentTask, ChatMessage } from '@wanted/shared';
import { AGENT_IDS } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

interface ModerationRule {
  id: string;
  name: string;
  pattern?: RegExp;
  type: 'regex' | 'keyword' | 'toxicity' | 'spam';
  action: 'delete' | 'timeout' | 'ban' | 'flag' | 'warn';
  duration?: number;
  enabled: boolean;
}

interface ModerationStats {
  totalMessages: number;
  deletedMessages: number;
  timedOutUsers: number;
  bannedUsers: number;
  flaggedMessages: number;
  welcomedUsers: number;
}

const DEFAULT_RULES: ModerationRule[] = [
  {
    id: 'no-caps-spam',
    name: 'Excessive Capitals',
    pattern: /^[A-Z\s!]{20,}$/,
    type: 'regex',
    action: 'delete',
    enabled: true,
  },
  {
    id: 'no-url-spam',
    name: 'URL Spam',
    pattern: /(?:https?:\/\/|www\.)\S{10,}/gi,
    type: 'regex',
    action: 'delete',
    enabled: true,
  },
  {
    id: 'no-self-promo',
    name: 'Self Promotion',
    pattern: /follow\s+me|sub(?:scribe)?\s+to\s+my|check\s+out\s+my\s+channel/gi,
    type: 'regex',
    action: 'delete',
    enabled: true,
  },
];

export class ModeratorAgent extends BaseAgent {
  private rules: ModerationRule[] = [...DEFAULT_RULES];
  private stats: ModerationStats = {
    totalMessages: 0,
    deletedMessages: 0,
    timedOutUsers: 0,
    bannedUsers: 0,
    flaggedMessages: 0,
    welcomedUsers: 0,
  };
  private recentMessagesByUser = new Map<string, number[]>();
  private welcomedUsers = new Set<string>();
  private spamWindowMs = 10_000;
  private spamMessageLimit = 5;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.MODERATOR,
        name: 'Moderator Agent',
        description: 'Monitors chat, removes spam, detects toxicity, and welcomes viewers',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'high',
        permissions: ['chat:read', 'chat:write', 'stream:read', 'notifications:send'],
        maxRetries: 2,
        retryDelayMs: 1000,
        heartbeatIntervalMs: 15_000,
        timeoutMs: 10_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.scheduler.scheduleInterval(
      'moderator:cleanup-spam-window',
      60_000,
      async () => this.cleanupSpamWindow(),
    );

    this.scheduler.scheduleInterval(
      'moderator:post-stats',
      5 * 60_000,
      async () => {
        this.log.info('Moderation stats', this.stats as unknown as Record<string, unknown>);
      },
    );
  }

  protected async onStop(_reason?: string): Promise<void> {
    this.recentMessagesByUser.clear();
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'add_rule',
      description: 'Add a new moderation rule',
      parameters: {
        name: { type: 'string' },
        pattern: { type: 'string' },
        action: { type: 'string' },
      },
      handler: async (params) => {
        const rule: ModerationRule = {
          id: `rule-${Date.now()}`,
          name: params['name'] as string,
          pattern: params['pattern'] ? new RegExp(params['pattern'] as string, 'gi') : undefined,
          type: 'regex',
          action: params['action'] as ModerationRule['action'],
          enabled: true,
        };
        this.rules.push(rule);
        return { ruleId: rule.id };
      },
    });

    this.registerTool({
      name: 'get_stats',
      description: 'Get moderation statistics',
      parameters: {},
      handler: async () => this.stats,
    });

    this.registerTool({
      name: 'highlight_message',
      description: 'Highlight an important chat message',
      parameters: { messageId: { type: 'string' } },
      handler: async (params) => {
        this.log.info('Message highlighted', { messageId: params['messageId'] });
        return { success: true };
      },
    });
  }

  protected bindEvents(): void {
    this.subscribe('chat:message:received', async (message) => {
      await this.processMessage(message);
    });

    this.subscribe('viewer:joined', async (payload) => {
      await this.welcomeViewer(payload.username, payload.platform);
    });

    this.subscribe('stream:started', () => {
      this.welcomedUsers.clear();
      this.stats = {
        totalMessages: 0,
        deletedMessages: 0,
        timedOutUsers: 0,
        bannedUsers: 0,
        flaggedMessages: 0,
        welcomedUsers: 0,
      };
    });
  }

  protected async onMessage(message: AgentMessage): Promise<void> {
    if (message.type === 'add_rule') {
      const payload = message.payload as { name: string; pattern: string; action: string };
      const rule: ModerationRule = {
        id: `rule-${Date.now()}`,
        name: payload.name,
        pattern: new RegExp(payload.pattern, 'gi'),
        type: 'regex',
        action: payload.action as ModerationRule['action'],
        enabled: true,
      };
      this.rules.push(rule);
    }
  }

  protected async executeTask(task: AgentTask): Promise<unknown> {
    const tool = this.tools.get(task.type);
    if (!tool) throw new Error(`Unknown task: ${task.type}`);
    return tool.handler(task.payload as Record<string, unknown>);
  }

  private async processMessage(message: ChatMessage): Promise<void> {
    this.stats.totalMessages++;

    if (message.isBroadcaster || message.isModerator) return;

    const spamResult = this.detectSpam(message);
    if (spamResult) {
      await this.handleViolation(message, 'spam', 'delete');
      return;
    }

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.pattern && rule.pattern.test(message.message)) {
        await this.handleViolation(message, rule.name, rule.action, rule.duration);
        return;
      }
    }

    if (this.isHighPriority(message)) {
      this.bus.emitSync(
        'chat:message:received',
        { ...message, isHighlighted: true },
        this.id,
      );
      this.stats.flaggedMessages++;
    }
  }

  private detectSpam(message: ChatMessage): boolean {
    const key = `${message.platform}:${message.userId}`;
    const now = Date.now();
    const timestamps = this.recentMessagesByUser.get(key) ?? [];

    const recentTimestamps = timestamps.filter((t) => now - t < this.spamWindowMs);
    recentTimestamps.push(now);
    this.recentMessagesByUser.set(key, recentTimestamps);

    return recentTimestamps.length > this.spamMessageLimit;
  }

  private isHighPriority(message: ChatMessage): boolean {
    if (message.isSubscriber && message.message.length > 50) return true;
    if (message.bits && message.bits > 100) return true;
    const importantKeywords = ['!question', '!clip', '!highlight', '?'];
    return importantKeywords.some((kw) => message.message.toLowerCase().includes(kw));
  }

  private async handleViolation(
    message: ChatMessage,
    reason: string,
    action: ModerationRule['action'],
    duration?: number,
  ): Promise<void> {
    this.log.info(`Moderation action: ${action} for user ${message.username}`, { reason });

    switch (action) {
      case 'delete':
        this.bus.emitSync(
          'chat:message:deleted',
          { platform: message.platform, messageId: message.id, reason },
          this.id,
        );
        this.stats.deletedMessages++;
        break;
      case 'timeout':
        this.bus.emitSync(
          'chat:user:timed_out',
          { platform: message.platform, userId: message.userId, duration: duration ?? 60 },
          this.id,
        );
        this.stats.timedOutUsers++;
        break;
      case 'ban':
        this.bus.emitSync(
          'chat:user:banned',
          { platform: message.platform, userId: message.userId, username: message.username, reason },
          this.id,
        );
        this.stats.bannedUsers++;
        break;
      case 'flag':
        this.stats.flaggedMessages++;
        this.bus.emitSync(
          'notification:send',
          {
            title: 'Message Flagged',
            body: `Flagged message from ${message.username}: ${message.message.slice(0, 100)}`,
            level: 'warning',
            agentId: this.id,
          },
          this.id,
        );
        break;
    }
  }

  private async welcomeViewer(username: string, platform: string): Promise<void> {
    if (this.welcomedUsers.has(`${platform}:${username}`)) return;
    this.welcomedUsers.add(`${platform}:${username}`);
    this.stats.welcomedUsers++;
    this.log.info(`Welcoming viewer: ${username} on ${platform}`);
  }

  private cleanupSpamWindow(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.recentMessagesByUser) {
      const fresh = timestamps.filter((t) => now - t < this.spamWindowMs);
      if (fresh.length === 0) {
        this.recentMessagesByUser.delete(key);
      } else {
        this.recentMessagesByUser.set(key, fresh);
      }
    }
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return { stats: this.stats, activeRules: this.rules.filter((r) => r.enabled).length };
  }
}
