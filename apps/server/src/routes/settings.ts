import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@wanted/database';
import {
  loadSettings,
  saveSettings,
  applyToEnv,
  maskCredentials,
  type AppCredentials,
} from '../services/SettingsService.js';

const credentialsSchema = z.object({
  twitch: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    channelName: z.string(),
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
  youtube: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    channelId: z.string(),
    refreshToken: z.string(),
  }),
  tiktok: z.object({
    clientKey: z.string(),
    clientSecret: z.string(),
  }),
  obs: z.object({
    host: z.string(),
    port: z.coerce.number().int().min(1).max(65535),
    password: z.string(),
  }),
  openai: z.object({
    apiKey: z.string(),
    model: z.string(),
    ttsVoice: z.string(),
  }),
  discord: z.object({
    webhookUrl: z.string(),
    clipWebhookUrl: z.string(),
  }),
});

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  // ── Credentials ──────────────────────────────────────────────────────────

  app.get('/credentials', {
    schema: { description: 'Get current credentials (secrets masked)', tags: ['settings'] },
  }, async () => {
    const creds = loadSettings();
    return maskCredentials(creds);
  });

  app.put('/credentials', {
    schema: { description: 'Save credentials and apply to running server', tags: ['settings'] },
  }, async (req, reply) => {
    const incoming = credentialsSchema.parse(req.body) as AppCredentials;

    // Load existing so we don't overwrite real secrets with masked placeholders
    const existing = loadSettings();

    function mergeField(inVal: string, exVal: string): string {
      // If the incoming value looks like a masked placeholder, keep existing
      return inVal.includes('•') ? exVal : inVal;
    }

    const merged: AppCredentials = {
      twitch: {
        clientId: mergeField(incoming.twitch.clientId, existing.twitch.clientId),
        clientSecret: mergeField(incoming.twitch.clientSecret, existing.twitch.clientSecret),
        channelName: incoming.twitch.channelName || existing.twitch.channelName,
        accessToken: mergeField(incoming.twitch.accessToken, existing.twitch.accessToken),
        refreshToken: mergeField(incoming.twitch.refreshToken, existing.twitch.refreshToken),
      },
      youtube: {
        clientId: mergeField(incoming.youtube.clientId, existing.youtube.clientId),
        clientSecret: mergeField(incoming.youtube.clientSecret, existing.youtube.clientSecret),
        channelId: incoming.youtube.channelId || existing.youtube.channelId,
        refreshToken: mergeField(incoming.youtube.refreshToken, existing.youtube.refreshToken),
      },
      tiktok: {
        clientKey: mergeField(incoming.tiktok.clientKey, existing.tiktok.clientKey),
        clientSecret: mergeField(incoming.tiktok.clientSecret, existing.tiktok.clientSecret),
      },
      obs: {
        host: incoming.obs.host || existing.obs.host,
        port: incoming.obs.port || existing.obs.port,
        password: mergeField(incoming.obs.password, existing.obs.password),
      },
      openai: {
        apiKey: mergeField(incoming.openai.apiKey, existing.openai.apiKey),
        model: incoming.openai.model || existing.openai.model,
        ttsVoice: incoming.openai.ttsVoice || existing.openai.ttsVoice,
      },
      discord: {
        webhookUrl: mergeField(incoming.discord.webhookUrl, existing.discord.webhookUrl),
        clipWebhookUrl: mergeField(incoming.discord.clipWebhookUrl, existing.discord.clipWebhookUrl),
      },
    };

    saveSettings(merged);
    applyToEnv(merged);

    return reply.status(200).send({ success: true, message: 'Credentials saved and applied' });
  });

  // ── Plugins ───────────────────────────────────────────────────────────────

  app.get('/plugins', {
    schema: { description: 'List all plugins', tags: ['settings'] },
  }, async () => {
    return prisma.plugin.findMany({ orderBy: { name: 'asc' } });
  });

  app.post('/plugins/:id/enable', {
    schema: { description: 'Enable a plugin', tags: ['settings'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return prisma.plugin.update({ where: { id }, data: { enabled: true } });
  });

  app.post('/plugins/:id/disable', {
    schema: { description: 'Disable a plugin', tags: ['settings'] },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return prisma.plugin.update({ where: { id }, data: { enabled: false } });
  });

  app.get('/audit-log', {
    schema: { description: 'Get audit log entries', tags: ['settings'] },
  }, async (req) => {
    const query = req.query as { limit?: string; action?: string };
    return prisma.auditLog.findMany({
      take: Math.min(parseInt(query.limit ?? '50', 10), 500),
      where: query.action ? { action: query.action } : undefined,
      orderBy: { timestamp: 'desc' },
    });
  });
};
