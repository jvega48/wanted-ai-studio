import { createLogger } from '@wanted/shared';
import type { MemoryEntry, MemorySearchResult } from '@wanted/shared';
import type { EmbeddingService } from './EmbeddingService.js';

interface VectorEntry {
  id: string;
  embedding: number[];
  memoryKey: string;
}

export class VectorStore {
  private readonly entries: VectorEntry[] = [];
  private readonly log = createLogger('VectorStore');

  constructor(private readonly embeddingService: EmbeddingService) {}

  async add(memory: MemoryEntry): Promise<void> {
    const embedding = await this.embeddingService.embed(memory.content);
    if (embedding.length === 0) return;

    const existing = this.entries.findIndex((e) => e.memoryKey === memory.key);
    if (existing !== -1) {
      this.entries[existing] = { id: memory.id, embedding, memoryKey: memory.key };
    } else {
      this.entries.push({ id: memory.id, embedding, memoryKey: memory.key });
    }
  }

  async search(
    query: string,
    memories: MemoryEntry[],
    limit = 10,
    threshold = 0.6,
  ): Promise<MemorySearchResult[]> {
    if (this.entries.length === 0) return [];

    const queryEmbedding = await this.embeddingService.embed(query);
    if (queryEmbedding.length === 0) return [];

    const memoryMap = new Map(memories.map((m) => [m.key, m]));

    const scored = this.entries
      .map((entry) => {
        const similarity = this.embeddingService.cosineSimilarity(queryEmbedding, entry.embedding);
        const memory = memoryMap.get(entry.memoryKey);
        if (!memory) return null;

        const relevanceScore = similarity * 0.7 + memory.importance * 0.2 + Math.min(memory.accessCount / 100, 0.1);
        return { entry: memory, similarity, relevanceScore };
      })
      .filter((r): r is MemorySearchResult => r !== null && r.similarity >= threshold)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    return scored;
  }

  remove(memoryKey: string): void {
    const idx = this.entries.findIndex((e) => e.memoryKey === memoryKey);
    if (idx !== -1) this.entries.splice(idx, 1);
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries.splice(0);
  }
}
