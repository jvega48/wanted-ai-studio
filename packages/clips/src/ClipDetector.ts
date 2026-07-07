import { createLogger } from '@wanted/shared';
import type { ClipTrigger } from '@wanted/shared';
import { CLIP_DEFAULTS } from '@wanted/shared';

export interface AudioEvent {
  timestamp: number;
  peakDb: number;
  isSilence: boolean;
}

export interface DetectionWindow {
  startTime: number;
  endTime: number;
  events: Array<{ type: ClipTrigger; score: number; timestamp: number }>;
  averageScore: number;
}

export class ClipDetector {
  private readonly log = createLogger('ClipDetector');
  private readonly windowSizeSeconds = CLIP_DEFAULTS.detectWindowSeconds;
  private readonly eventBuffer: Array<{ type: ClipTrigger; score: number; timestamp: number }> = [];
  private streamStartTime: number | null = null;

  startSession(): void {
    this.streamStartTime = Date.now();
    this.eventBuffer.splice(0);
    this.log.info('Clip detection session started');
  }

  endSession(): void {
    this.streamStartTime = null;
    this.log.info('Clip detection session ended');
  }

  recordEvent(type: ClipTrigger, score: number): void {
    if (!this.streamStartTime) return;
    const timestamp = (Date.now() - this.streamStartTime) / 1000;
    this.eventBuffer.push({ type, score, timestamp });
    this.pruneOldEvents();
  }

  getCurrentWindowScore(): number {
    if (this.eventBuffer.length === 0) return 0;
    const recent = this.getRecentEvents(this.windowSizeSeconds);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, e) => sum + e.score, 0) / recent.length;
  }

  shouldClip(threshold = CLIP_DEFAULTS.minTriggerScore): boolean {
    return this.getCurrentWindowScore() >= threshold;
  }

  detectAudioPeaks(audioEvents: AudioEvent[], thresholdDb = -6): Array<{ timestamp: number; score: number }> {
    const peaks: Array<{ timestamp: number; score: number }> = [];

    for (let i = 1; i < audioEvents.length - 1; i++) {
      const prev = audioEvents[i - 1];
      const curr = audioEvents[i];
      const next = audioEvents[i + 1];

      if (!curr || !prev || !next) continue;

      if (
        curr.peakDb >= thresholdDb &&
        curr.peakDb > prev.peakDb &&
        curr.peakDb >= next.peakDb
      ) {
        const score = Math.min(1.0, (curr.peakDb + 60) / 60);
        peaks.push({ timestamp: curr.timestamp, score });
      }
    }

    return peaks;
  }

  buildHighlightReel(durationTarget: number): DetectionWindow[] {
    if (this.eventBuffer.length === 0) return [];

    const windows: DetectionWindow[] = [];
    let i = 0;

    while (i < this.eventBuffer.length) {
      const windowStart = this.eventBuffer[i]?.timestamp ?? 0;
      const windowEvents = this.eventBuffer.filter(
        (e) => e.timestamp >= windowStart && e.timestamp < windowStart + this.windowSizeSeconds,
      );

      if (windowEvents.length > 0) {
        const avgScore = windowEvents.reduce((s, e) => s + e.score, 0) / windowEvents.length;
        windows.push({
          startTime: windowStart,
          endTime: windowStart + this.windowSizeSeconds,
          events: windowEvents,
          averageScore: avgScore,
        });
      }

      i += windowEvents.length || 1;
    }

    return windows
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, Math.ceil(durationTarget / this.windowSizeSeconds));
  }

  private getRecentEvents(windowSeconds: number): typeof this.eventBuffer {
    if (!this.streamStartTime) return [];
    const currentTime = (Date.now() - this.streamStartTime) / 1000;
    return this.eventBuffer.filter((e) => e.timestamp >= currentTime - windowSeconds);
  }

  private pruneOldEvents(): void {
    if (!this.streamStartTime) return;
    const currentTime = (Date.now() - this.streamStartTime) / 1000;
    const cutoff = currentTime - this.windowSizeSeconds * 2;
    const firstKeep = this.eventBuffer.findIndex((e) => e.timestamp >= cutoff);
    if (firstKeep > 0) this.eventBuffer.splice(0, firstKeep);
  }
}
