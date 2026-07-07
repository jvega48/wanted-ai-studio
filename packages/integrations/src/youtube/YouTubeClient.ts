import { google, youtube_v3 } from 'googleapis';
import { createLogger } from '@wanted/shared';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

export interface YouTubeUploadOptions {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: 'public' | 'private' | 'unlisted';
  publishAt?: Date;
  madeForKids?: boolean;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
  title: string;
  status: string;
}

export interface YouTubeChannelStats {
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

export class YouTubeClient {
  private readonly youtube: youtube_v3.Youtube;
  private readonly log = createLogger('YouTubeClient');

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.youtube = google.youtube({ version: 'v3', auth });
  }

  async uploadVideo(filePath: string, options: YouTubeUploadOptions): Promise<YouTubeUploadResult> {
    this.log.info('Starting YouTube video upload', { title: options.title });

    const fileStats = await stat(filePath);
    this.log.info(`File size: ${(fileStats.size / 1024 / 1024).toFixed(1)}MB`);

    const response = await this.youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: options.title.slice(0, 100),
          description: options.description.slice(0, 5000),
          tags: options.tags.slice(0, 500),
          categoryId: options.categoryId,
        },
        status: {
          privacyStatus: options.privacyStatus,
          publishAt: options.publishAt?.toISOString(),
          madeForKids: options.madeForKids ?? false,
          selfDeclaredMadeForKids: options.madeForKids ?? false,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body: createReadStream(filePath),
      },
    });

    const videoId = response.data.id ?? '';
    this.log.info(`Upload complete: ${videoId}`);

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: response.data.snippet?.title ?? options.title,
      status: response.data.status?.privacyStatus ?? 'private',
    };
  }

  async setThumbnail(videoId: string, thumbnailPath: string): Promise<void> {
    await this.youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: 'image/jpeg',
        body: createReadStream(thumbnailPath),
      },
    });
    this.log.info(`Thumbnail set for video: ${videoId}`);
  }

  async updateVideo(
    videoId: string,
    updates: Partial<{ title: string; description: string; tags: string[] }>,
  ): Promise<void> {
    await this.youtube.videos.update({
      part: ['snippet'],
      requestBody: {
        id: videoId,
        snippet: {
          title: updates.title,
          description: updates.description,
          tags: updates.tags,
          categoryId: '20',
        },
      },
    });
  }

  async getChannelStats(): Promise<YouTubeChannelStats> {
    const response = await this.youtube.channels.list({
      part: ['statistics'],
      mine: true,
    });

    const stats = response.data.items?.[0]?.statistics;
    return {
      subscriberCount: parseInt(stats?.subscriberCount ?? '0', 10),
      viewCount: parseInt(stats?.viewCount ?? '0', 10),
      videoCount: parseInt(stats?.videoCount ?? '0', 10),
    };
  }

  async getLiveBroadcastId(): Promise<string | null> {
    const response = await this.youtube.liveBroadcasts.list({
      part: ['id', 'status'],
      broadcastStatus: 'active',
      maxResults: 1,
    });
    return response.data.items?.[0]?.id ?? null;
  }

  async insertChatMessage(liveChatId: string, message: string): Promise<void> {
    await this.youtube.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: { messageText: message.slice(0, 200) },
        },
      },
    });
  }

  async deleteChatMessage(messageId: string): Promise<void> {
    await this.youtube.liveChatMessages.delete({ id: messageId });
  }
}
