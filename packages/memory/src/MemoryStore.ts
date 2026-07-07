import { prisma } from '@wanted/database';
import type { MemoryEntry, MemorySearchQuery, MemorySearchResult } from '@wanted/shared';
import { createLogger, generateId, MEMORY_DEFAULTS } from '@wanted/shared';
import type { EmbeddingService } from './EmbeddingService.js';
import type { VectorStore } from './VectorStore.js';

export class MemoryStore {
  private readonly log = createLogger('MemoryStore');
  private readonly inMemoryCache = new Map<string, MemoryEntry>();

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStore,
  ) {}

  async initialize(): Promise<void> {
    const entries = await prisma.memoryEntry.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { importance: 'desc' },
      take: 2000,
    });

    for (const entry of entries) {
      const typed = this.mapDbEntry(entry);
      this.inMemoryCache.set(typed.key, typed);
      if (typed.type !== 'short_term') {
        await this.vectorStore.add(typed);
      }
    }

    this.log.info(`Memory store initialized with ${entries.length} entries`);
  }

  async store(
    type: MemoryEntry['type'],
    scope: MemoryEntry['scope'],
    key: string,
    content: string,
    options: {
      tags?: string[];
      importance?: number;
      ttlMs?: number;
      sessionId?: string;
      sourceAgentId?: string;
    } = {},
  ): Promise<MemoryEntry> {
    const expiresAt = options.ttlMs
      ? new Date(Date.now() + options.ttlMs)
      : type === 'short_term'
      ? new Date(Date.now() + MEMORY_DEFAULTS.shortTermTtlMs)
      : undefined;

    const dbEntry = await prisma.memoryEntry.upsert({
      where: { key: key as never },
      create: {
        id: generateId(),
        type: type.toUpperCase() as never,
        scope: scope.toUpperCase() as never,
        key,
        content,
        tags: options.tags ?? [],
        importance: options.importance ?? 0.5,
        expiresAt,
        sessionId: options.sessionId,
        sourceAgentId: options.sourceAgentId,
      },
      update: {
        content,
        tags: options.tags,
        importance: options.importance,
        expiresAt,
        updatedAt: new Date(),
      },
    });

    const entry = this.mapDbEntry(dbEntry);
    this.inMemoryCache.set(key, entry);

    if (type !== 'short_term') {
      await this.vectorStore.add(entry);
    }

    return entry;
  }

  async retrieve(key: string): Promise<MemoryEntry | undefined> {
    const cached = this.inMemoryCache.get(key);
    if (cached) {
      cached.accessCount++;
      cached.lastAccessedAt = new Date();
      await prisma.memoryEntry.update({
        where: { id: cached.id },
        data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
      }).catch(() => null);
      return cached;
    }

    const db = await prisma.memoryEntry.findFirst({ where: { key } });
    if (!db) return undefined;

    const entry = this.mapDbEntry(db);
    this.inMemoryCache.set(key, entry);
    return entry;
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    const allEntries = Array.from(this.inMemoryCache.values()).filter((e) => {
      if (query.type && e.type !== query.type) return false;
      if (query.scope && e.scope !== query.scope) return false;
      if (query.minImportance && e.importance < query.minImportance) return false;
      if (e.expiresAt && e.expiresAt < new Date()) return false;
      return true;
    });

    if (allEntries.length === 0) return [];

    return this.vectorStore.search(
      query.query,
      allEntries,
      query.limit ?? 10,
      query.similarityThreshold ?? 0.6,
    );
  }

  async delete(key: string): Promise<boolean> {
    this.inMemoryCache.delete(key);
    this.vectorStore.remove(key);
    const result = await prisma.memoryEntry.deleteMany({ where: { key } });
    return result.count > 0;
  }

  async pruneExpired(): Promise<number> {
    const now = new Date();

    for (const [key, entry] of this.inMemoryCache) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.inMemoryCache.delete(key);
        this.vectorStore.remove(key);
      }
    }

    const result = await prisma.memoryEntry.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    return result.count;
  }

  async getStats(): Promise<{ total: number; byType: Record<string, number>; vectorized: number }> {
    const all = Array.from(this.inMemoryCache.values());
    const byType: Record<string, number> = {};
    for (const e of all) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }

    return { total: all.length, byType, vectorized: this.vectorStore.size };
  }

  private mapDbEntry(db: {
    id: string;
    type: string;
    scope: string;
    key: string;
    content: string;
    tags: string[];
    importance: number;
    accessCount: number;
    lastAccessedAt: Date;
    expiresAt: Date | null;
    sourceAgentId: string | null;
    sessionId: string | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): MemoryEntry {
    return {
      id: db.id,
      type: db.type.toLowerCase() as MemoryEntry['type'],
      scope: db.scope.toLowerCase() as MemoryEntry['scope'],
      key: db.key,
      content: db.content,
      tags: db.tags,
      importance: db.importance,
      accessCount: db.accessCount,
      lastAccessedAt: db.lastAccessedAt,
      expiresAt: db.expiresAt ?? undefined,
      sourceAgentId: db.sourceAgentId ?? undefined,
      sessionId: db.sessionId ?? undefined,
      metadata: db.metadata as Record<string, unknown>,
      createdAt: db.createdAt,
      updatedAt: db.updatedAt,
    };
  }
}
