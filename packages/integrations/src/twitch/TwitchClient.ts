import { ApiClient } from '@twurple/api';
import { RefreshingAuthProvider } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';
import { createLogger } from '@wanted/shared';
import type { ChatMessage, StreamPlatform } from '@wanted/shared';

export interface TwitchConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  channelName: string;
  userId: string;
}

export interface TwitchStreamInfo {
  isLive: boolean;
  title: string;
  game: string;
  viewerCount: number;
  startedAt: Date | null;
  thumbnailUrl: string;
}

export class TwitchClient {
  private authProvider!: RefreshingAuthProvider;
  private apiClient!: ApiClient;
  private chatClient!: ChatClient;
  private readonly log = createLogger('TwitchClient');
  private config: TwitchConfig;
  private messageHandlers: Array<(message: ChatMessage) => void> = [];
  private connected = false;

  constructor(config: TwitchConfig) {
    this.config = config;
    this.initialize();
  }

  private initialize(): void {
    this.authProvider = new RefreshingAuthProvider({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    });

    this.authProvider.onRefresh((_userId, newTokenData) => {
      this.log.info('Twitch token refreshed');
      this.config.accessToken = newTokenData.accessToken;
      if (newTokenData.refreshToken) {
        this.config.refreshToken = newTokenData.refreshToken;
      }
    });

    this.apiClient = new ApiClient({ authProvider: this.authProvider });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await this.authProvider.addUserForToken(
      {
        accessToken: this.config.accessToken,
        refreshToken: this.config.refreshToken,
        expiresIn: null,
        obtainmentTimestamp: 0,
        scope: ['chat:read', 'chat:edit', 'channel:read:stream_key'],
      },
      ['chat'],
    );

    this.chatClient = new ChatClient({
      authProvider: this.authProvider,
      channels: [this.config.channelName],
    });

    this.chatClient.onMessage((_channel, user, text, msg) => {
      const chatMsg: ChatMessage = {
        id: msg.id,
        platform: 'twitch' as StreamPlatform,
        channelId: this.config.userId,
        userId: msg.userInfo.userId,
        username: user,
        displayName: msg.userInfo.displayName,
        message: text,
        timestamp: msg.date ?? new Date(),
        badges: Array.from(msg.userInfo.badges.keys()),
        color: msg.userInfo.color ?? undefined,
        isSubscriber: msg.userInfo.isSubscriber,
        isModerator: msg.userInfo.isMod,
        isBroadcaster: msg.userInfo.isBroadcaster,
        isHighlighted: msg.isHighlight,
        bits: msg.bits ?? undefined,
        emotes: [],
        deleted: false,
      };
      this.messageHandlers.forEach((h) => h(chatMsg));
    });

    await this.chatClient.connect();
    this.connected = true;
    this.log.info(`Connected to Twitch chat: #${this.config.channelName}`);
  }

  async disconnect(): Promise<void> {
    await this.chatClient?.quit();
    this.connected = false;
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.connected) throw new Error('Not connected to Twitch chat');
    await this.chatClient.say(this.config.channelName, message);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.apiClient.moderation.deleteChatMessages(
      this.config.userId,
      this.config.userId,
      messageId,
    );
  }

  async timeoutUser(userId: string, duration: number, reason?: string): Promise<void> {
    await this.apiClient.moderation.banUser(
      this.config.userId,
      this.config.userId,
      { user: userId, duration, reason },
    );
  }

  async banUser(userId: string, reason?: string): Promise<void> {
    await this.apiClient.moderation.banUser(
      this.config.userId,
      this.config.userId,
      { user: userId, reason },
    );
  }

  async getStreamInfo(): Promise<TwitchStreamInfo> {
    const stream = await this.apiClient.streams.getStreamByUserId(this.config.userId);
    if (!stream) {
      return { isLive: false, title: '', game: '', viewerCount: 0, startedAt: null, thumbnailUrl: '' };
    }
    const game = await stream.getGame();
    return {
      isLive: true,
      title: stream.title,
      game: game?.name ?? '',
      viewerCount: stream.viewers,
      startedAt: stream.startDate,
      thumbnailUrl: stream.getThumbnailUrl(1280, 720),
    };
  }

  async updateStreamInfo(title: string, gameId?: string): Promise<void> {
    await this.apiClient.channels.updateChannelInfo(this.config.userId, {
      title,
      gameId,
    });
  }

  async getFollowerCount(): Promise<number> {
    const result = await this.apiClient.channels.getChannelFollowerCount(this.config.userId);
    return result;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
