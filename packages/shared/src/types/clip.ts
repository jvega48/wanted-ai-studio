import type { StreamPlatform } from './stream.js';

export type ClipStatus = 'pending' | 'approved' | 'processing' | 'ready' | 'published' | 'uploaded' | 'failed' | 'rejected';

export type ClipFormat = 'landscape' | 'portrait' | 'square';

export interface ClipCandidate {
  id: string;
  sessionId: string;
  timestampSeconds: number;
  durationSeconds: number;
  triggerType: ClipTrigger;
  triggerScore: number;
  title?: string;
  description?: string;
  status: ClipStatus;
  sourcePath?: string;
  outputPath?: string;
  thumbnailPath?: string;
  viewerCountAtTime?: number;
  chatRateAtTime?: number;
  platforms: Partial<Record<StreamPlatform, ClipUploadStatus>>;
  format: ClipFormat;
  tags: string[];
  aiGenerated: boolean;
  manuallyApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClipTrigger =
  | 'kill_streak'
  | 'boss_defeated'
  | 'match_won'
  | 'donation_spike'
  | 'subscriber_spike'
  | 'chat_spike'
  | 'viewer_spike'
  | 'voice_command'
  | 'manual'
  | 'ai_detected'
  | 'audio_peak'
  | 'emotion_detected';

export interface ClipUploadStatus {
  url?: string;
  videoId?: string;
  status: 'pending' | 'uploading' | 'published' | 'failed';
  uploadedAt?: Date;
  views?: number;
  likes?: number;
}

export interface ClipProcessingJob {
  clipId: string;
  inputPath: string;
  outputPath: string;
  format: ClipFormat;
  startTime: number;
  duration: number;
  includeSubtitles: boolean;
  subtitlePath?: string;
  watermark?: WatermarkConfig;
  intro?: IntroConfig;
  outro?: OutroConfig;
  filters: FFmpegFilter[];
}

export interface WatermarkConfig {
  imagePath: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity: number;
  scale: number;
}

export interface IntroConfig {
  videoPath: string;
  duration: number;
}

export interface OutroConfig {
  videoPath: string;
  duration: number;
  ctaText?: string;
}

export interface FFmpegFilter {
  name: string;
  params: Record<string, string | number>;
}

export interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}
