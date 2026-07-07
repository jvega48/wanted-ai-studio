import { createReadStream } from 'fs';
import OpenAI from 'openai';
import { createLogger } from '@wanted/shared';
import type { SubtitleEntry } from '@wanted/shared';

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export type WhisperModel = 'whisper-1';

export class WhisperTranscriber {
  private readonly client: OpenAI;
  private readonly log = createLogger('WhisperTranscriber');
  private readonly model: WhisperModel = 'whisper-1';

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env['OPENAI_API_KEY'] });
  }

  async transcribeFile(
    filePath: string,
    options: {
      language?: string;
      prompt?: string;
      temperature?: number;
    } = {},
  ): Promise<TranscriptionResult> {
    this.log.info('Transcribing file', { filePath });

    const stream = createReadStream(filePath) as unknown as File;
    const response = await this.client.audio.transcriptions.create({
      file: stream,
      model: this.model,
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature ?? 0,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const result: TranscriptionResult = {
      text: response.text,
      language: response.language ?? 'en',
      duration: response.duration ?? 0,
      segments: (response.segments ?? []).map((s, idx) => ({
        id: idx,
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        confidence: s.avg_logprob ? Math.exp(s.avg_logprob) : 0.5,
      })),
    };

    this.log.info('Transcription complete', {
      words: result.text.split(' ').length,
      segments: result.segments.length,
    });

    return result;
  }

  async translateFile(filePath: string, targetLanguage?: string): Promise<TranscriptionResult> {
    this.log.info('Translating audio file', { filePath, targetLanguage });
    const stream = createReadStream(filePath) as unknown as File;
    const response = await this.client.audio.translations.create({
      file: stream,
      model: this.model,
      response_format: 'verbose_json',
    });

    return {
      text: response.text,
      language: 'en',
      duration: response.duration ?? 0,
      segments: (response.segments ?? []).map((s, idx) => ({
        id: idx,
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        confidence: 0.8,
      })),
    };
  }

  segmentsToSubtitles(segments: TranscriptionSegment[]): SubtitleEntry[] {
    return segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));
  }

  splitIntoChunks(text: string, maxCharsPerChunk = 80): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let current = '';

    for (const word of words) {
      if ((current + ' ' + word).trim().length <= maxCharsPerChunk) {
        current = (current + ' ' + word).trim();
      } else {
        if (current) chunks.push(current);
        current = word;
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }
}
