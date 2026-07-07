import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@wanted/shared';

const log = createLogger('SettingsService');
const SETTINGS_PATH = join(process.cwd(), 'data', 'settings.json');

export interface AppCredentials {
  twitch: {
    clientId: string;
    clientSecret: string;
    channelName: string;
    accessToken: string;
    refreshToken: string;
  };
  youtube: {
    clientId: string;
    clientSecret: string;
    channelId: string;
    refreshToken: string;
  };
  tiktok: {
    clientKey: string;
    clientSecret: string;
  };
  obs: {
    host: string;
    port: number;
    password: string;
  };
  anthropic: {
    apiKey: string;
    model: string;
  };
  discord: {
    webhookUrl: string;
    clipWebhookUrl: string;
  };
}

const DEFAULTS: AppCredentials = {
  twitch: { clientId: '', clientSecret: '', channelName: '', accessToken: '', refreshToken: '' },
  youtube: { clientId: '', clientSecret: '', channelId: '', refreshToken: '' },
  tiktok: { clientKey: '', clientSecret: '' },
  obs: { host: 'localhost', port: 4455, password: '' },
  anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
  discord: { webhookUrl: '', clipWebhookUrl: '' },
};

const SECRET_FIELDS = new Set([
  'clientSecret', 'accessToken', 'refreshToken', 'password', 'apiKey',
  'webhookUrl', 'clipWebhookUrl',
]);

function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 8, 20))}${value.slice(-4)}`;
}

function maskCredentials(creds: AppCredentials): AppCredentials {
  const masked = JSON.parse(JSON.stringify(creds)) as AppCredentials;
  for (const section of Object.values(masked) as Record<string, unknown>[]) {
    for (const [key, val] of Object.entries(section)) {
      if (SECRET_FIELDS.has(key) && typeof val === 'string') {
        section[key] = mask(val);
      }
    }
  }
  return masked;
}

export function loadSettings(): AppCredentials {
  try {
    if (!existsSync(SETTINGS_PATH)) return { ...DEFAULTS };
    const raw = readFileSync(SETTINGS_PATH, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) } as AppCredentials;
  } catch {
    log.warn('Could not read settings.json — using defaults');
    return { ...DEFAULTS };
  }
}

export function saveSettings(creds: AppCredentials): void {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(creds, null, 2), 'utf-8');
}

export function applyToEnv(creds: AppCredentials): void {
  const map: Record<string, string> = {
    TWITCH_CLIENT_ID: creds.twitch.clientId,
    TWITCH_CLIENT_SECRET: creds.twitch.clientSecret,
    TWITCH_CHANNEL_NAME: creds.twitch.channelName,
    TWITCH_ACCESS_TOKEN: creds.twitch.accessToken,
    TWITCH_REFRESH_TOKEN: creds.twitch.refreshToken,
    YOUTUBE_CLIENT_ID: creds.youtube.clientId,
    YOUTUBE_CLIENT_SECRET: creds.youtube.clientSecret,
    YOUTUBE_CHANNEL_ID: creds.youtube.channelId,
    YOUTUBE_REFRESH_TOKEN: creds.youtube.refreshToken,
    TIKTOK_CLIENT_KEY: creds.tiktok.clientKey,
    TIKTOK_CLIENT_SECRET: creds.tiktok.clientSecret,
    OBS_HOST: creds.obs.host,
    OBS_PORT: String(creds.obs.port),
    OBS_PASSWORD: creds.obs.password,
    ANTHROPIC_API_KEY: creds.anthropic.apiKey,
    ANTHROPIC_MODEL: creds.anthropic.model,
    DISCORD_WEBHOOK_URL: creds.discord.webhookUrl,
    DISCORD_CLIP_WEBHOOK_URL: creds.discord.clipWebhookUrl,
  };

  for (const [key, value] of Object.entries(map)) {
    if (value) process.env[key] = value;
  }

  log.info('Credentials applied to process environment');
}

export { maskCredentials };
