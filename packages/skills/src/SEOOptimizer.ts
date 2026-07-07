export interface SEOAnalysis {
  score: number;
  titleScore: number;
  descriptionScore: number;
  tagScore: number;
  suggestions: string[];
  warnings: string[];
}

export interface OptimizedMetadata {
  title: string;
  description: string;
  tags: string[];
  seoScore: number;
}

export class SEOOptimizer {
  private readonly stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'it', 'its', 'was', 'are', 'be', 'been',
  ]);

  analyzeYouTube(title: string, description: string, tags: string[]): SEOAnalysis {
    const suggestions: string[] = [];
    const warnings: string[] = [];

    const titleScore = this.scoreTitleYouTube(title, suggestions, warnings);
    const descriptionScore = this.scoreDescriptionYouTube(description, suggestions, warnings);
    const tagScore = this.scoreTagsYouTube(tags, suggestions, warnings);

    const score = Math.round(titleScore * 0.4 + descriptionScore * 0.35 + tagScore * 0.25);

    return { score, titleScore, descriptionScore, tagScore, suggestions, warnings };
  }

  optimizeTitle(title: string, keywords: string[]): string {
    let optimized = title.trim();

    const primaryKeyword = keywords[0];
    if (primaryKeyword && !optimized.toLowerCase().includes(primaryKeyword.toLowerCase())) {
      optimized = `${primaryKeyword} | ${optimized}`;
    }

    if (optimized.length > 100) optimized = optimized.slice(0, 97) + '...';
    return optimized;
  }

  optimizeTags(game: string, existingTags: string[]): string[] {
    const gameTags = this.generateGameTags(game);
    const combined = [...new Set([...existingTags, ...gameTags])];
    return combined.slice(0, 15);
  }

  optimizeDescription(description: string, keywords: string[]): string {
    const lines = description.split('\n');

    if (!lines[0]?.includes(keywords[0] ?? '')) {
      lines.unshift(`${keywords.slice(0, 3).join(', ')} stream highlights and gameplay.`);
    }

    return lines.join('\n').slice(0, 5000);
  }

  extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !this.stopWords.has(w));

    const frequency = new Map<string, number>();
    for (const word of words) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private scoreTitleYouTube(title: string, suggestions: string[], warnings: string[]): number {
    let score = 100;

    if (title.length < 30) { score -= 20; suggestions.push('Title is too short — aim for 50-70 characters'); }
    if (title.length > 100) { score -= 15; warnings.push('Title exceeds 100 characters — may be truncated'); }
    if (!title.match(/[!?|:]/)) { score -= 5; suggestions.push('Add emotional punctuation (!, ?, |) to increase CTR'); }
    if (title === title.toLowerCase()) { score -= 10; suggestions.push('Use Title Case to improve readability'); }

    return Math.max(0, score);
  }

  private scoreDescriptionYouTube(desc: string, suggestions: string[], warnings: string[]): number {
    let score = 100;

    if (desc.length < 200) { score -= 25; suggestions.push('Add more description content — aim for 300+ characters'); }
    if (!desc.includes('http') && !desc.includes('www.')) { score -= 10; suggestions.push('Add links to your social profiles and streams'); }
    if (!desc.match(/#\w+/)) { score -= 10; suggestions.push('Include hashtags in your description for discoverability'); }
    if (!desc.includes('Subscribe')) { score -= 5; suggestions.push('Add a subscribe CTA in your description'); }

    return Math.max(0, score);
  }

  private scoreTagsYouTube(tags: string[], suggestions: string[], _warnings: string[]): number {
    let score = 100;

    if (tags.length < 5) { score -= 30; suggestions.push('Add more tags — aim for 10-15 relevant tags'); }
    if (tags.length > 500) { score -= 10; suggestions.push('You may have too many tags — focus on the most relevant'); }
    if (!tags.some((t) => t.length > 15)) { score -= 10; suggestions.push('Include some long-tail keyword tags for better targeting'); }

    return Math.max(0, score);
  }

  private generateGameTags(game: string): string[] {
    const gameSlug = game.toLowerCase().replace(/\s+/g, '');
    return [
      game.toLowerCase(),
      gameSlug,
      `${gameSlug} gameplay`,
      `${gameSlug} stream`,
      `${gameSlug} highlights`,
      `${game.toLowerCase()} moments`,
      'gaming',
      'livestream',
      'gamer',
      'gameplay highlights',
    ];
  }
}
