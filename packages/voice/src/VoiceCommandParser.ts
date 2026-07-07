import { createLogger } from '@wanted/shared';

export interface VoiceCommand {
  command: string;
  confidence: number;
  rawText: string;
  params: Record<string, string>;
}

export interface CommandPattern {
  pattern: RegExp;
  command: string;
  extractParams?: (match: RegExpMatchArray) => Record<string, string>;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  {
    pattern: /clip\s+that|create\s+clip|save\s+that/i,
    command: 'clip that',
    extractParams: () => ({}),
  },
  {
    pattern: /switch\s+(?:to\s+)?(?:scene\s+)?(.+)/i,
    command: 'switch scene',
    extractParams: (m) => ({ sceneName: m[1]?.trim() ?? '' }),
  },
  {
    pattern: /(?:go\s+to|open)\s+(?:scene\s+)?(.+)/i,
    command: 'switch scene',
    extractParams: (m) => ({ sceneName: m[1]?.trim() ?? '' }),
  },
  {
    pattern: /mute\s+(?:my\s+)?(?:discord|microphone|mic|audio)/i,
    command: 'mute discord',
    extractParams: () => ({}),
  },
  {
    pattern: /start\s+(?:the\s+)?countdown|begin\s+countdown/i,
    command: 'start countdown',
    extractParams: () => ({}),
  },
  {
    pattern: /highlight\s+(?:this\s+)?moment|mark\s+moment/i,
    command: 'highlight moment',
    extractParams: () => ({}),
  },
  {
    pattern: /(?:show|display|open)\s+chat/i,
    command: 'show chat',
    extractParams: () => ({}),
  },
  {
    pattern: /(?:hide|close)\s+chat/i,
    command: 'hide chat',
    extractParams: () => ({}),
  },
  {
    pattern: /generate\s+(?:stream\s+)?title/i,
    command: 'generate stream title',
    extractParams: () => ({}),
  },
  {
    pattern: /read\s+(?:out\s+)?donations?/i,
    command: 'read donations',
    extractParams: () => ({}),
  },
  {
    pattern: /start\s+(?:recording|stream|streaming)/i,
    command: 'start streaming',
    extractParams: () => ({}),
  },
  {
    pattern: /stop\s+(?:recording|stream|streaming)/i,
    command: 'stop streaming',
    extractParams: () => ({}),
  },
  {
    pattern: /brb|be\s+right\s+back/i,
    command: 'brb scene',
    extractParams: () => ({}),
  },
  {
    pattern: /show\s+stats?|display\s+stats?/i,
    command: 'show stats',
    extractParams: () => ({}),
  },
];

export class VoiceCommandParser {
  private readonly log = createLogger('VoiceCommandParser');

  parse(rawText: string, minConfidence = 0.7): VoiceCommand | null {
    const normalized = rawText.toLowerCase().trim();

    for (const pattern of COMMAND_PATTERNS) {
      const match = normalized.match(pattern.pattern);
      if (match) {
        const params = pattern.extractParams?.(match) ?? {};
        const confidence = this.estimateConfidence(rawText, match);

        if (confidence >= minConfidence) {
          const cmd: VoiceCommand = {
            command: pattern.command,
            confidence,
            rawText,
            params,
          };
          this.log.info(`Voice command detected: "${pattern.command}"`, { confidence });
          return cmd;
        }
      }
    }

    return null;
  }

  parseAll(rawText: string): VoiceCommand[] {
    const results: VoiceCommand[] = [];
    const normalized = rawText.toLowerCase().trim();

    for (const pattern of COMMAND_PATTERNS) {
      const match = normalized.match(pattern.pattern);
      if (match) {
        const confidence = this.estimateConfidence(rawText, match);
        results.push({
          command: pattern.command,
          confidence,
          rawText,
          params: pattern.extractParams?.(match) ?? {},
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  private estimateConfidence(rawText: string, match: RegExpMatchArray): number {
    const matchRatio = (match[0]?.length ?? 0) / rawText.length;
    return Math.min(0.95, 0.6 + matchRatio * 0.4);
  }
}
