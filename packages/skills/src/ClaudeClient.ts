import Anthropic from '@anthropic-ai/sdk';
import { createLogger, AI_DEFAULTS } from '@wanted/shared';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: string;
}

export interface ClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export class ClaudeClient {
  private readonly client: Anthropic;
  private readonly defaultModel: string;
  private readonly log = createLogger('ClaudeClient');

  constructor(apiKey?: string, model?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'] });
    this.defaultModel = model ?? AI_DEFAULTS.defaultModel;
  }

  async complete(
    userMessage: string,
    options: ClaudeOptions = {},
  ): Promise<ClaudeResponse> {
    const model = options.model ?? this.defaultModel;

    this.log.debug('Claude request', { model, chars: userMessage.length });

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens ?? AI_DEFAULTS.maxTokens,
      temperature: options.temperature ?? AI_DEFAULTS.temperature,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
      stopReason: response.stop_reason ?? 'end_turn',
    };
  }

  async chat(
    messages: ClaudeMessage[],
    options: ClaudeOptions = {},
  ): Promise<ClaudeResponse> {
    const model = options.model ?? this.defaultModel;

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens ?? AI_DEFAULTS.maxTokens,
      temperature: options.temperature ?? AI_DEFAULTS.temperature,
      system: options.systemPrompt,
      messages,
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
      stopReason: response.stop_reason ?? 'end_turn',
    };
  }

  async completeJSON<T = unknown>(
    userMessage: string,
    options: ClaudeOptions = {},
  ): Promise<T> {
    const response = await this.complete(userMessage, {
      ...options,
      systemPrompt: (options.systemPrompt ?? '') +
        '\n\nRespond with valid JSON only. No markdown, no explanation, just the JSON object.',
    });

    const raw = response.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(raw) as T;
  }

  useFastModel(): ClaudeClient {
    return new ClaudeClient(
      process.env['ANTHROPIC_API_KEY'],
      AI_DEFAULTS.fastModel,
    );
  }
}
