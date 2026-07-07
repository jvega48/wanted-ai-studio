import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import type { AgentManager, EventBus } from '@wanted/agent-core';
import { agentsRoutes } from './routes/agents.js';
import { streamRoutes } from './routes/stream.js';
import { analyticsRoutes } from './routes/analytics.js';
import { clipsRoutes } from './routes/clips.js';
import { contentRoutes } from './routes/content.js';
import { settingsRoutes } from './routes/settings.js';
import { websocketPlugin } from './ws/websocket.js';

export interface AppOptions {
  bus: EventBus;
  manager: AgentManager;
}

export async function buildServer(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        coerceTypes: true,
      },
    },
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Wanted AI Studio API',
        description: 'Backend API for the Wanted AI Studio streaming platform',
        version: '1.0.0',
      },
      tags: [
        { name: 'agents', description: 'Agent management' },
        { name: 'stream', description: 'Stream session management' },
        { name: 'analytics', description: 'Analytics and metrics' },
        { name: 'clips', description: 'Clip management' },
        { name: 'content', description: 'Content queue management' },
        { name: 'settings', description: 'System settings' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { deepLinking: true },
  });

  await app.register(websocket);

  app.decorate('bus', opts.bus);
  app.decorate('agentManager', opts.manager);

  app.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['system'],
      response: { 200: { type: 'object', properties: { status: { type: 'string' } } } },
    },
  }, async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(agentsRoutes, { prefix: '/api/v1/agents' });
  await app.register(streamRoutes, { prefix: '/api/v1/stream' });
  await app.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
  await app.register(clipsRoutes, { prefix: '/api/v1/clips' });
  await app.register(contentRoutes, { prefix: '/api/v1/content' });
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' });
  await app.register(websocketPlugin, { prefix: '/ws' });

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    void reply.status(statusCode).send({
      error: error.name,
      message: error.message,
      statusCode,
    });
  });

  return app;
}
