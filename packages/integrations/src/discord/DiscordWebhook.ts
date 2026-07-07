import { createLogger } from '@wanted/shared';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  author?: { name: string; url?: string; icon_url?: string };
}

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
  tts?: boolean;
}

export class DiscordWebhook {
  private readonly log = createLogger('DiscordWebhook');

  constructor(private readonly webhookUrl: string) {}

  async send(payload: DiscordWebhookPayload): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord webhook failed: ${response.status} ${text}`);
    }

    this.log.info('Discord message sent');
  }

  async sendMessage(content: string, username?: string): Promise<void> {
    await this.send({ content, username });
  }

  async sendEmbed(embed: DiscordEmbed, content?: string, username?: string): Promise<void> {
    await this.send({ content, embeds: [embed], username });
  }

  async sendStreamAlert(options: {
    streamerName: string;
    gameTitle: string;
    streamTitle: string;
    viewerCount: number;
    streamUrl: string;
    thumbnailUrl?: string;
    avatarUrl?: string;
  }): Promise<void> {
    const embed: DiscordEmbed = {
      title: `🔴 ${options.streamerName} is LIVE!`,
      description: options.streamTitle,
      color: 0x6441a5,
      url: options.streamUrl,
      fields: [
        { name: '🎮 Game', value: options.gameTitle, inline: true },
        { name: '👁️ Viewers', value: String(options.viewerCount), inline: true },
      ],
      timestamp: new Date().toISOString(),
      author: {
        name: options.streamerName,
        icon_url: options.avatarUrl,
      },
    };

    if (options.thumbnailUrl) {
      embed.image = { url: options.thumbnailUrl };
    }

    await this.sendEmbed(embed, `@everyone ${options.streamerName} is live!`);
  }

  async sendClipAlert(options: {
    clipTitle: string;
    clipUrl?: string;
    thumbnailUrl?: string;
    duration: number;
  }): Promise<void> {
    const embed: DiscordEmbed = {
      title: `🎬 New Clip: ${options.clipTitle}`,
      color: 0xff4444,
      url: options.clipUrl,
      fields: [
        { name: '⏱️ Duration', value: `${options.duration}s`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };

    if (options.thumbnailUrl) embed.thumbnail = { url: options.thumbnailUrl };

    await this.sendEmbed(embed);
  }
}
