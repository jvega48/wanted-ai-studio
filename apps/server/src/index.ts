import { connectDatabase, disconnectDatabase } from '@wanted/database';
import { registerEventBridges } from './bridges/index.js';
import { loadSettings, applyToEnv } from './services/SettingsService.js';
import {
  AgentManager,
  AnalyticsAgent,
  CeoAgent,
  ClipAgent,
  CommunityAgent,
  EventBus,
  MemoryAgent,
  ModeratorAgent,
  OBSAgent,
  ProducerAgent,
  RevenueAgent,
  ShortsAgent,
  SponsorAgent,
  ThumbnailAgent,
  TikTokAgent,
  TrendAgent,
  YouTubeAgent,
} from '@wanted/agent-core';
import { createLogger } from '@wanted/shared';
import { buildServer } from './app.js';

const log = createLogger('Bootstrap');

async function bootstrap(): Promise<void> {
  log.info('Starting Wanted AI Studio server...');

  // Load persisted credentials and apply to process.env before agents start
  applyToEnv(loadSettings());
  log.info('Settings loaded');

  await connectDatabase();
  log.info('Database connected');

  const bus = new EventBus(10_000);
  const manager = new AgentManager(bus);

  const ctx = (config = {}) => ({ bus, scheduler: manager.getScheduler(), config });

  manager.register(new MemoryAgent(ctx({ id: 'memory' })));
  manager.register(new AnalyticsAgent(ctx({ id: 'analytics' })));
  manager.register(new OBSAgent(ctx({ id: 'obs' })));
  manager.register(new ModeratorAgent(ctx({ id: 'moderator' })));
  manager.register(new ClipAgent(ctx({ id: 'clip' })));
  manager.register(new ProducerAgent(ctx({ id: 'producer' })));
  manager.register(new YouTubeAgent(ctx({ id: 'youtube' })));
  manager.register(new ShortsAgent(ctx({ id: 'shorts' })));
  manager.register(new TikTokAgent(ctx({ id: 'tiktok' })));
  manager.register(new ThumbnailAgent(ctx({ id: 'thumbnail' })));
  manager.register(new CommunityAgent(ctx({ id: 'community' })));
  manager.register(new SponsorAgent(ctx({ id: 'sponsor' })));
  manager.register(new TrendAgent(ctx({ id: 'trend' })));
  manager.register(new RevenueAgent(ctx({ id: 'revenue' })));
  manager.register(new CeoAgent(ctx({ id: 'ceo' })));

  registerEventBridges(bus);
  log.info('Event bridges registered');

  await manager.startAll();
  log.info('All agents started');

  const server = await buildServer({ bus, manager });

  const host = process.env['HOST'] ?? '0.0.0.0';
  const port = parseInt(process.env['PORT'] ?? '3001', 10);

  await server.listen({ host, port });
  log.info(`Server listening on http://${host}:${port}`);

  const shutdown = async (signal: string): Promise<void> => {
    log.info(`Received ${signal}, shutting down...`);
    await server.close();
    await manager.stopAll('server_shutdown');
    await disconnectDatabase();
    log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
