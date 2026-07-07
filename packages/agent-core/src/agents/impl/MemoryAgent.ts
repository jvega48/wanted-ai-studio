import type { AgentMessage, AgentTask, MemoryEntry, MemorySearchQuery } from '@wanted/shared';
import { AGENT_IDS, MEMORY_DEFAULTS, generateId } from '@wanted/shared';
import type { AgentContext } from '../BaseAgent.js';
import { BaseAgent } from '../BaseAgent.js';

export class MemoryAgent extends BaseAgent {
  private shortTermMemory = new Map<string, MemoryEntry>();
  private longTermMemory = new Map<string, MemoryEntry>();
  private cleanupJobId: string | null = null;

  constructor(ctx: AgentContext) {
    super({
      ...ctx,
      config: {
        id: AGENT_IDS.MEMORY,
        name: 'Memory Agent',
        description: 'Manages long-term creator memory, viewer FAQs, stream history, and brand knowledge',
        version: '1.0.0',
        enabled: true,
        autoStart: true,
        priority: 'critical',
        permissions: ['memory:read', 'memory:write', 'stream:read'],
        maxRetries: 3,
        retryDelayMs: 1000,
        heartbeatIntervalMs: 60_000,
        timeoutMs: 30_000,
        metadata: {},
        ...ctx.config,
      },
    });
  }

  protected async onStart(): Promise<void> {
    this.cleanupJobId = this.scheduler.scheduleInterval(
      'memory:cleanup',
      60 * 60_000,
      () => this.cleanExpiredEntries(),
      true,
    );

    await this.loadSeedMemories();
  }

  protected async onStop(_reason?: string): Promise<void> {
    if (this.cleanupJobId) this.scheduler.cancel(this.cleanupJobId);
  }

  protected registerTools(): void {
    this.registerTool({
      name: 'store',
      description: 'Store a memory entry',
      parameters: {
        type: { type: 'string' },
        scope: { type: 'string' },
        key: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        importance: { type: 'number' },
        ttlMs: { type: 'number' },
      },
      handler: async (params) => {
        return this.store(
          params['type'] as MemoryEntry['type'],
          params['scope'] as MemoryEntry['scope'],
          params['key'] as string,
          params['content'] as string,
          {
            tags: params['tags'] as string[] | undefined,
            importance: params['importance'] as number | undefined,
            ttlMs: params['ttlMs'] as number | undefined,
          },
        );
      },
    });

    this.registerTool({
      name: 'retrieve',
      description: 'Retrieve a memory by key',
      parameters: { key: { type: 'string' }, scope: { type: 'string' } },
      handler: async (params) => {
        return this.retrieve(params['key'] as string, params['scope'] as MemoryEntry['scope'] | undefined);
      },
    });

    this.registerTool({
      name: 'search',
      description: 'Search memories by query and filters',
      parameters: {
        query: { type: 'string' },
        type: { type: 'string' },
        scope: { type: 'string' },
        limit: { type: 'number' },
      },
      handler: async (params) => {
        return this.search({
          query: params['query'] as string,
          type: params['type'] as MemoryEntry['type'] | undefined,
          scope: params['scope'] as MemoryEntry['scope'] | undefined,
          limit: params['limit'] as number | undefined,
        });
      },
    });

    this.registerTool({
      name: 'delete',
      description: 'Delete a memory entry',
      parameters: { key: { type: 'string' } },
      handler: async (params) => {
        const key = params['key'] as string;
        const deleted = this.shortTermMemory.delete(key) || this.longTermMemory.delete(key);
        return { deleted };
      },
    });

    this.registerTool({
      name: 'get_stats',
      description: 'Get memory system statistics',
      parameters: {},
      handler: async () => ({
        shortTermCount: this.shortTermMemory.size,
        longTermCount: this.longTermMemory.size,
        totalCount: this.shortTermMemory.size + this.longTermMemory.size,
      }),
    });
  }

  protected bindEvents(): void {
    this.subscribe('stream:started', async (payload) => {
      await this.store('episodic', 'session', `stream:${payload.sessionId}:start`, JSON.stringify({
        sessionId: payload.sessionId,
        platforms: payload.platforms,
        startedAt: payload.timestamp,
      }), { importance: 0.8, tags: ['stream', 'session'] });
    });

    this.subscribe('stream:ended', async (payload) => {
      await this.store('episodic', 'stream', `stream:${payload.sessionId}:end`, JSON.stringify({
        sessionId: payload.sessionId,
        duration: payload.duration,
        endedAt: new Date(),
      }), { importance: 0.8, tags: ['stream', 'session', 'ended'] });
    });

    this.subscribe('donation:received', async (payload) => {
      await this.store('semantic', 'viewer', `viewer:${payload.userId}:supporter`, JSON.stringify({
        userId: payload.userId,
        username: payload.username,
        totalDonations: payload.amount,
        lastDonationAt: payload.timestamp,
      }), { importance: 0.9, tags: ['viewer', 'supporter', 'donation'] });
    });
  }

  protected async onMessage(message: AgentMessage): Promise<void> {
    const tool = this.tools.get(message.type);
    if (!tool) return;

    const result = await tool.handler(message.payload as Record<string, unknown>);
    const reply: AgentMessage = {
      id: generateId(),
      fromAgent: this.id,
      toAgent: message.fromAgent,
      type: `${message.type}_response`,
      payload: result,
      timestamp: new Date(),
      correlationId: message.id,
    };
    await this.bus.emit('agent:message', reply, this.id);
  }

  protected async executeTask(task: AgentTask): Promise<unknown> {
    const tool = this.tools.get(task.type);
    if (!tool) throw new Error(`Unknown task: ${task.type}`);
    return tool.handler(task.payload as Record<string, unknown>);
  }

  store(
    type: MemoryEntry['type'],
    scope: MemoryEntry['scope'],
    key: string,
    content: string,
    options?: { tags?: string[]; importance?: number; ttlMs?: number; sessionId?: string },
  ): MemoryEntry {
    const entry: MemoryEntry = {
      id: generateId(),
      type,
      scope,
      key,
      content,
      tags: options?.tags ?? [],
      importance: options?.importance ?? 0.5,
      accessCount: 0,
      lastAccessedAt: new Date(),
      expiresAt: options?.ttlMs ? new Date(Date.now() + options.ttlMs) : undefined,
      sessionId: options?.sessionId,
      sourceAgentId: undefined,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const store = type === 'short_term'
      ? this.shortTermMemory
      : this.longTermMemory;

    store.set(key, entry);
    return entry;
  }

  retrieve(key: string, scope?: MemoryEntry['scope']): MemoryEntry | undefined {
    const entry = this.shortTermMemory.get(key) ?? this.longTermMemory.get(key);
    if (!entry) return undefined;
    if (scope && entry.scope !== scope) return undefined;
    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    return entry;
  }

  search(query: MemorySearchQuery): MemoryEntry[] {
    const all = [...this.shortTermMemory.values(), ...this.longTermMemory.values()];
    const queryLower = query.query.toLowerCase();

    return all
      .filter((e) => {
        if (query.type && e.type !== query.type) return false;
        if (query.scope && e.scope !== query.scope) return false;
        if (query.minImportance && e.importance < query.minImportance) return false;
        if (query.tags && !query.tags.some((t) => e.tags.includes(t))) return false;
        return e.content.toLowerCase().includes(queryLower) || e.key.toLowerCase().includes(queryLower);
      })
      .sort((a, b) => b.importance - a.importance)
      .slice(0, query.limit ?? 20);
  }

  private cleanExpiredEntries(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.shortTermMemory) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.shortTermMemory.delete(key);
        cleaned++;
      }
    }

    for (const [key, entry] of this.longTermMemory) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.longTermMemory.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) this.log.info(`Cleaned ${cleaned} expired memory entries`);
  }

  private async loadSeedMemories(): Promise<void> {
    this.store('semantic', 'global', 'brand:name', 'Wanted AI Studio', {
      importance: 1.0,
      tags: ['brand'],
    });
    this.store('procedural', 'global', 'stream:best-practices', JSON.stringify([
      'Always test audio before going live',
      'Engage with chat every 5-10 minutes minimum',
      'Clip high-energy moments immediately',
      'Post clips within 24 hours for maximum reach',
    ]), { importance: 0.9, tags: ['procedure', 'stream'] });
  }

  protected getHealthMetadata(): Record<string, unknown> {
    return {
      shortTermEntries: this.shortTermMemory.size,
      longTermEntries: this.longTermMemory.size,
    };
  }
}
