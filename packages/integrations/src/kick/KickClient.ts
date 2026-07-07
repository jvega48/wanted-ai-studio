import { createLogger } from '@wanted/shared';
import type { ChatMessage, StreamPlatform } from '@wanted/shared';

export interface KickConfig {
  channelSlug: string;
  accessToken: string;
  channelId: number;
}

export interface KickStreamInfo {
  isLive: boolean;
  viewerCount: number;
  title: string;
  category: string;
  startedAt: Date | null;
}

export class KickClient {
  private readonly log = createLogger('KickClient');
  private readonly baseUrl = 'https://kick.com/api/v2';
  private messageHandlers: Array<(msg: ChatMessage) => void> = [];
  private connected = false;
  private wsClient: WebSocket | null = null;

  constructor(private readonly config: KickConfig) {}

  async connect(): Promise<void> {
    if (this.connected) return;

    this.log.info(`Connecting to Kick chat for channel: ${this.config.channelSlug}`);

    // Kick uses Pusher-based WebSocket — connect via their pusher endpoint
    try {
      this.wsClient = new WebSocket(`wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=7.6.0&flash=false`);

      this.wsClient.onopen = () => {
        this.connected = true;
        this.log.info('Connected to Kick chat');

        // Subscribe to channel chat
        this.wsClient?.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { auth: '', channel: `chatrooms.${this.config.channelId}.v2` },
        }));
      };

      this.wsClient.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.wsClient.onclose = () => {
        this.connected = false;
        this.log.warn('Kick WebSocket disconnected');
      };

      this.wsClient.onerror = (err) => {
        this.log.error('Kick WebSocket error', err);
      };
    } catch (err) {
      this.log.error('Failed to connect to Kick', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.wsClient?.close();
    this.connected = false;
  }

  onMessage(handler: (msg: ChatMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  async getStreamInfo(): Promise<KickStreamInfo> {
    const response = await fetch(`${this.baseUrl}/channels/${this.config.channelSlug}`, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Kick API error: ${response.status}`);

    const data = await response.json() as {
      livestream?: {
        viewer_count: number;
        session_title: string;
        created_at: string;
        categories?: Array<{ name: string }>;
      };
    };

    return {
      isLive: !!data.livestream,
      viewerCount: data.livestream?.viewer_count ?? 0,
      title: data.livestream?.session_title ?? '',
      category: data.livestream?.categories?.[0]?.name ?? '',
      startedAt: data.livestream?.created_at ? new Date(data.livestream.created_at) : null,
    };
  }

  async sendMessage(message: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/messages/send/${this.config.channelId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: message, type: 'message' }),
    });

    if (!response.ok) throw new Error(`Failed to send Kick message: ${response.status}`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(raw: string): void {
    try {
      const event = JSON.parse(raw) as { event: string; data: string };
      if (event.event !== 'App\\Events\\ChatMessageEvent') return;

      const chatData = JSON.parse(event.data) as {
        id: string;
        chatroom_id: number;
        content: string;
        sender: {
          id: number;
          username: string;
          slug: string;
          badges?: Array<{ type: string }>;
        };
        created_at: string;
      };

      const msg: ChatMessage = {
        id: chatData.id,
        platform: 'kick' as StreamPlatform,
        channelId: String(this.config.channelId),
        userId: String(chatData.sender.id),
        username: chatData.sender.slug,
        displayName: chatData.sender.username,
        message: chatData.content,
        timestamp: new Date(chatData.created_at),
        badges: chatData.sender.badges?.map((b) => b.type) ?? [],
        isSubscriber: chatData.sender.badges?.some((b) => b.type === 'subscriber') ?? false,
        isModerator: chatData.sender.badges?.some((b) => b.type === 'moderator') ?? false,
        isBroadcaster: chatData.sender.badges?.some((b) => b.type === 'broadcaster') ?? false,
        isHighlighted: false,
        emotes: [],
        deleted: false,
      };

      this.messageHandlers.forEach((h) => h(msg));
    } catch {
      // Ignore malformed messages
    }
  }
}
