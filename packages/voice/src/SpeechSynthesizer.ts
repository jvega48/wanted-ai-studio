import OpenAI from 'openai';
import { createLogger } from '@wanted/shared';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSModel = 'tts-1' | 'tts-1-hd';
export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface SpeechOptions {
  voice?: TTSVoice;
  model?: TTSModel;
  speed?: number;
  format?: TTSFormat;
}

export class SpeechSynthesizer {
  private readonly client: OpenAI;
  private readonly log = createLogger('SpeechSynthesizer');
  private readonly defaultVoice: TTSVoice = 'nova';
  private readonly defaultModel: TTSModel = 'tts-1';

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env['OPENAI_API_KEY'] });
  }

  async synthesize(text: string, outputPath: string, options: SpeechOptions = {}): Promise<string> {
    this.log.info('Synthesizing speech', { chars: text.length, voice: options.voice });

    const response = await this.client.audio.speech.create({
      model: options.model ?? this.defaultModel,
      voice: options.voice ?? this.defaultVoice,
      input: text.slice(0, 4096),
      speed: options.speed ?? 1.0,
      response_format: options.format ?? 'mp3',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, buffer);

    this.log.info('Speech synthesized', { outputPath, bytes: buffer.length });
    return outputPath;
  }

  async synthesizeToBuffer(text: string, options: SpeechOptions = {}): Promise<Buffer> {
    const response = await this.client.audio.speech.create({
      model: options.model ?? this.defaultModel,
      voice: options.voice ?? this.defaultVoice,
      input: text.slice(0, 4096),
      speed: options.speed ?? 1.0,
      response_format: options.format ?? 'mp3',
    });

    return Buffer.from(await response.arrayBuffer());
  }

  getAvailableVoices(): TTSVoice[] {
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  }
}
