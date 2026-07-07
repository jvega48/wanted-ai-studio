import OpenAI from 'openai';
import { createLogger, MEMORY_DEFAULTS } from '@wanted/shared';

export class EmbeddingService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly log = createLogger('EmbeddingService');
  private readonly cache = new Map<string, number[]>();

  constructor(apiKey?: string, model = MEMORY_DEFAULTS.embeddingDimension > 1024 ? 'text-embedding-3-large' : 'text-embedding-3-small') {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env['OPENAI_API_KEY'] });
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const cacheKey = text.slice(0, 200);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text.slice(0, 8191),
      });

      const embedding = response.data[0]?.embedding ?? [];
      if (this.cache.size > 1000) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, embedding);
      return embedding;
    } catch (err) {
      this.log.error('Embedding generation failed', err);
      return [];
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts.map((t) => t.slice(0, 8191)),
      });
      return response.data.map((d) => d.embedding);
    } catch (err) {
      this.log.error('Batch embedding failed', err);
      return texts.map(() => []);
    }
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += (a[i] ?? 0) * (b[i] ?? 0);
      normA += (a[i] ?? 0) ** 2;
      normB += (b[i] ?? 0) ** 2;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
  }
}
