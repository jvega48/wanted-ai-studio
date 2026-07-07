import { join, dirname, basename, extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { createLogger } from '@wanted/shared';
import type { ClipProcessingJob, SubtitleEntry } from '@wanted/shared';

export interface ProcessingResult {
  outputPath: string;
  durationSeconds: number;
  fileSizeBytes: number;
  width: number;
  height: number;
}

export class FFmpegProcessor {
  private readonly log = createLogger('FFmpegProcessor');

  constructor(ffmpegPath?: string, ffprobePath?: string) {
    if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
    if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);
  }

  processClip(job: ClipProcessingJob): Promise<ProcessingResult> {
    return new Promise((resolve, reject) => {
      this.ensureDir(dirname(job.outputPath));

      let command = ffmpeg(job.inputPath)
        .setStartTime(job.startTime)
        .setDuration(job.duration)
        .outputOptions(['-avoid_negative_ts make_zero']);

      if (job.format === 'portrait') {
        command = command
          .videoFilter([
            'scale=1080:1920:force_original_aspect_ratio=decrease',
            'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
          ]);
      } else if (job.format === 'square') {
        command = command
          .videoFilter([
            'scale=1080:1080:force_original_aspect_ratio=decrease',
            'pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black',
          ]);
      } else {
        command = command.videoFilter(['scale=1920:1080:force_original_aspect_ratio=decrease']);
      }

      if (job.watermark) {
        const { imagePath, position, opacity, scale } = job.watermark;
        const [overlayX, overlayY] = this.resolveWatermarkPosition(position);
        command = command.input(imagePath).complexFilter([
          `[1:v]scale=iw*${scale}:ih*${scale},format=rgba,colorchannelmixer=aa=${opacity}[wm]`,
          `[0:v][wm]overlay=${overlayX}:${overlayY}[out]`,
        ], 'out');
      }

      if (job.includeSubtitles && job.subtitlePath && existsSync(job.subtitlePath)) {
        command = command.videoFilter(`subtitles=${job.subtitlePath.replace(/\\/g, '/')}`);
      }

      command
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('192k')
        .videoBitrate('4000k')
        .fps(60)
        .format('mp4')
        .output(job.outputPath)
        .on('start', (cmd) => {
          this.log.info('FFmpeg started', { cmd: cmd.slice(0, 100) });
        })
        .on('progress', (progress) => {
          this.log.debug('FFmpeg progress', { percent: progress.percent?.toFixed(1) });
        })
        .on('end', () => {
          this.log.info('FFmpeg processing complete', { output: job.outputPath });
          resolve({
            outputPath: job.outputPath,
            durationSeconds: job.duration,
            fileSizeBytes: 0,
            width: job.format === 'portrait' ? 1080 : job.format === 'square' ? 1080 : 1920,
            height: job.format === 'portrait' ? 1920 : job.format === 'square' ? 1080 : 1080,
          });
        })
        .on('error', (err, stdout, stderr) => {
          this.log.error('FFmpeg error', err, { stderr: stderr?.slice(-500) });
          reject(err);
        })
        .run();
    });
  }

  extractThumbnail(inputPath: string, timeSeconds: number, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.ensureDir(dirname(outputPath));
      ffmpeg(inputPath)
        .screenshots({
          timestamps: [timeSeconds],
          filename: basename(outputPath),
          folder: dirname(outputPath),
          size: '1280x720',
        })
        .on('end', () => resolve(outputPath))
        .on('error', reject);
    });
  }

  generateSubtitleFile(entries: SubtitleEntry[], outputPath: string): void {
    this.ensureDir(dirname(outputPath));
    const lines: string[] = [];

    entries.forEach((entry, idx) => {
      lines.push(String(idx + 1));
      lines.push(`${this.formatSRTTime(entry.start)} --> ${this.formatSRTTime(entry.end)}`);
      lines.push(entry.text);
      lines.push('');
    });

    const { writeFileSync } = require('fs');
    writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  }

  async getMediaInfo(filePath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    videoBitrate: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) { reject(err); return; }

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        const fps = videoStream?.r_frame_rate
          ? eval(videoStream.r_frame_rate)
          : 30;

        resolve({
          duration: metadata.format.duration ?? 0,
          width: videoStream?.width ?? 0,
          height: videoStream?.height ?? 0,
          fps,
          videoBitrate: metadata.format.bit_rate ? parseInt(String(metadata.format.bit_rate), 10) / 1000 : 0,
        });
      });
    });
  }

  concatClips(inputPaths: string[], outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.ensureDir(dirname(outputPath));
      const command = ffmpeg();
      inputPaths.forEach((p) => command.input(p));

      command
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .mergeToFile(outputPath, '/tmp');
    });
  }

  private resolveWatermarkPosition(position: string): [string, string] {
    switch (position) {
      case 'top-left': return ['10', '10'];
      case 'top-right': return ['main_w-overlay_w-10', '10'];
      case 'bottom-left': return ['10', 'main_h-overlay_h-10'];
      case 'bottom-right': return ['main_w-overlay_w-10', 'main_h-overlay_h-10'];
      default: return ['10', '10'];
    }
  }

  private formatSRTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
