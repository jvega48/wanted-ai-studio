export interface PromptTemplate {
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  variables: string[];
}

const TEMPLATES: Record<string, PromptTemplate> = {
  stream_title: {
    name: 'stream_title',
    systemPrompt: 'You are a creative streaming content expert who generates viral, engaging stream titles.',
    userPromptTemplate: 'Generate 5 stream title variations for a {{game}} stream with a {{mood}} mood. The streamer has {{followers}} followers. Make titles under 100 characters, punchy and SEO-friendly. Format as a JSON array of strings.',
    variables: ['game', 'mood', 'followers'],
  },
  youtube_description: {
    name: 'youtube_description',
    systemPrompt: 'You are an SEO expert for YouTube gaming channels. Write descriptions that are keyword-rich but natural.',
    userPromptTemplate: 'Write a YouTube video description for a {{duration}}-minute stream of {{game}}. Include: hook paragraph, what happened highlights ({{highlights}}), CTA to subscribe/follow. Add relevant timestamps if provided: {{timestamps}}. End with hashtags. Max 5000 chars.',
    variables: ['duration', 'game', 'highlights', 'timestamps'],
  },
  tiktok_caption: {
    name: 'tiktok_caption',
    systemPrompt: 'You are a TikTok content creator expert. Write viral captions that hook viewers in 3 seconds.',
    userPromptTemplate: 'Write a TikTok caption for a gaming clip showing: {{clipDescription}}. Game: {{game}}. Make it punchy, use 1-2 emojis max, and include a hook. Under 150 characters. Also suggest 8 relevant hashtags.',
    variables: ['clipDescription', 'game'],
  },
  moderation_response: {
    name: 'moderation_response',
    systemPrompt: 'You are a friendly but firm chat moderator for a gaming stream.',
    userPromptTemplate: 'A viewer said: "{{message}}". This violated rule: {{rule}}. Write a kind but clear 1-sentence public warning for the chat. Keep it under 100 characters.',
    variables: ['message', 'rule'],
  },
  sponsor_pitch: {
    name: 'sponsor_pitch',
    systemPrompt: 'You are an expert at writing concise, compelling sponsorship pitches for content creators.',
    userPromptTemplate: 'Write a 3-paragraph sponsorship pitch email to {{company}} from a streamer with {{viewers}} average viewers on {{platform}}. Niche: {{niche}}. Tone: professional but personable. Include: value prop, audience fit, specific deliverables offer.',
    variables: ['company', 'viewers', 'platform', 'niche'],
  },
  content_idea: {
    name: 'content_idea',
    systemPrompt: 'You are a YouTube/Twitch content strategist with expertise in gaming content.',
    userPromptTemplate: 'Suggest 5 content ideas for a {{niche}} streamer. Current trending games: {{trends}}. The creator\'s best performing content was: {{topContent}}. Format as JSON: [{title, type, description, estimatedViews, difficulty}]',
    variables: ['niche', 'trends', 'topContent'],
  },
};

export class PromptBuilder {
  private readonly templates: Map<string, PromptTemplate>;

  constructor(customTemplates?: Record<string, PromptTemplate>) {
    this.templates = new Map(Object.entries({ ...TEMPLATES, ...customTemplates }));
  }

  build(templateName: string, variables: Record<string, string>): { system: string; user: string } {
    const template = this.templates.get(templateName);
    if (!template) throw new Error(`Template not found: ${templateName}`);

    let userPrompt = template.userPromptTemplate;
    for (const [key, value] of Object.entries(variables)) {
      userPrompt = userPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return { system: template.systemPrompt, user: userPrompt };
  }

  addTemplate(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }

  listTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }
}
