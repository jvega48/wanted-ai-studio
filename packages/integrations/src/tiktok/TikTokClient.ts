import { createLogger } from '@wanted/shared';
import { createReadStream } from 'fs';

export interface TikTokConfig {
  accessToken: string;
  openId: string;
}

export interface TikTokVideoInfo {
  videoId: string;
  shareUrl: string;
  title: string;
  createTime: number;
  coverImageUrl: string;
  viewCount: number;
  likeCount: number;
  shareCount: number;
}

export interface TikTokUploadResult {
  publishId: string;
  uploadUrl?: string;
}

export class TikTokClient {
  private readonly log = createLogger('TikTokClient');
  private readonly baseUrl = 'https://open.tiktokapis.com/v2';

  constructor(private readonly config: TikTokConfig) {}

  async initVideoUpload(options: {
    title: string;
    privacyLevel: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
    disableDuet?: boolean;
    disableStitch?: boolean;
    disableComment?: boolean;
  }): Promise<TikTokUploadResult> {
    this.log.info('Initializing TikTok video upload', { title: options.title });

    const response = await fetch(`${this.baseUrl}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: options.title.slice(0, 150),
          privacy_level: options.privacyLevel,
          disable_duet: options.disableDuet ?? false,
          disable_comment: options.disableComment ?? false,
          disable_stitch: options.disableStitch ?? false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: 0,
          chunk_size: 10_000_000,
          total_chunk_count: 1,
        },
      }),
    });

    const data = await response.json() as {
      data?: { publish_id: string; upload_url: string };
      error?: { code: string; message: string };
    };

    if (data.error?.code !== 'ok') {
      throw new Error(`TikTok upload init failed: ${data.error?.message}`);
    }

    return {
      publishId: data.data?.publish_id ?? '',
      uploadUrl: data.data?.upload_url,
    };
  }

  async getPublishStatus(publishId: string): Promise<{
    status: 'PROCESSING_UPLOAD' | 'FAILED_PUBLISH' | 'SEND_TO_USER_INBOX' | 'PUBLISH_COMPLETE';
    failReason?: string;
    publicvideoId?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const data = await response.json() as {
      data?: {
        status: 'PROCESSING_UPLOAD' | 'FAILED_PUBLISH' | 'SEND_TO_USER_INBOX' | 'PUBLISH_COMPLETE';
        fail_reason?: string;
        publicvideo?: { id: string };
      };
    };

    return {
      status: data.data?.status ?? 'PROCESSING_UPLOAD',
      failReason: data.data?.fail_reason,
      publicvideoId: data.data?.publicvideo?.id,
    };
  }

  async getVideoList(count = 20): Promise<TikTokVideoInfo[]> {
    const response = await fetch(`${this.baseUrl}/video/list/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        max_count: count,
        fields: ['id', 'title', 'create_time', 'cover_image_url', 'share_url', 'view_count', 'like_count', 'share_count'],
      }),
    });

    const data = await response.json() as {
      data?: {
        videos: Array<{
          id: string;
          title: string;
          create_time: number;
          cover_image_url: string;
          share_url: string;
          view_count: number;
          like_count: number;
          share_count: number;
        }>;
      };
    };

    return (data.data?.videos ?? []).map((v) => ({
      videoId: v.id,
      shareUrl: v.share_url,
      title: v.title,
      createTime: v.create_time,
      coverImageUrl: v.cover_image_url,
      viewCount: v.view_count,
      likeCount: v.like_count,
      shareCount: v.share_count,
    }));
  }

  async getUserInfo(): Promise<{ displayName: string; followerCount: number; followingCount: number }> {
    const response = await fetch(`${this.baseUrl}/user/info/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ fields: ['display_name', 'follower_count', 'following_count'] }),
    });

    const data = await response.json() as {
      data?: { user?: { display_name: string; follower_count: number; following_count: number } };
    };

    return {
      displayName: data.data?.user?.display_name ?? '',
      followerCount: data.data?.user?.follower_count ?? 0,
      followingCount: data.data?.user?.following_count ?? 0,
    };
  }
}
