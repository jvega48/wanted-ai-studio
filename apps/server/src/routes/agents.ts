import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AgentId } from '@wanted/shared';

const startBodySchema = z.object({ agentId: z.string() });
const messageBodySchema = z.object({
  fromAgent: z.string(),
  toAgent: z.string(),
  type: z.string(),
  payload: z.unknown(),
});

export const agentsRoutes: FastifyPluginAsync = async (app) => {
  const manager = app.agentManager;

  app.get('/', {
    schema: {
      description: 'List all registered agents and their status',
      tags: ['agents'],
      response: { 200: { type: 'array' } },
    },
  }, async () => manager.listAgents());

  app.get('/health', {
    schema: { description: 'Get health status for all agents', tags: ['agents'] },
  }, async () => {
    const health = manager.getHealth();
    return Object.fromEntries(health);
  });

  app.get('/:agentId/health', {
    schema: {
      description: 'Get health status for a specific agent',
      tags: ['agents'],
      params: { type: 'object', properties: { agentId: { type: 'string' } } },
    },
  }, async (req) => {
    const { agentId } = req.params as { agentId: string };
    const health = manager.getHealth();
    const agentHealth = health.get(agentId as AgentId);
    if (!agentHealth) {
      const err = Object.assign(new Error(`Agent not found: ${agentId}`), { statusCode: 404 });
      throw err;
    }
    return agentHealth;
  });

  app.post('/:agentId/start', {
    schema: {
      description: 'Start a specific agent',
      tags: ['agents'],
      params: { type: 'object', properties: { agentId: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    await manager.startAgent(agentId as AgentId);
    return reply.status(200).send({ message: `Agent ${agentId} started` });
  });

  app.post('/:agentId/stop', {
    schema: {
      description: 'Stop a specific agent',
      tags: ['agents'],
      params: { type: 'object', properties: { agentId: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    await manager.stopAgent(agentId as AgentId, 'user_requested');
    return reply.status(200).send({ message: `Agent ${agentId} stopped` });
  });

  app.post('/:agentId/restart', {
    schema: {
      description: 'Restart a specific agent',
      tags: ['agents'],
      params: { type: 'object', properties: { agentId: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    await manager.restartAgent(agentId as AgentId);
    return reply.status(200).send({ message: `Agent ${agentId} restarted` });
  });

  app.post('/message', {
    schema: {
      description: 'Send a message to a specific agent',
      tags: ['agents'],
    },
  }, async (req, reply) => {
    const body = messageBodySchema.parse(req.body);
    await manager.sendMessage({
      id: crypto.randomUUID(),
      fromAgent: body.fromAgent,
      toAgent: body.toAgent,
      type: body.type,
      payload: body.payload,
      timestamp: new Date(),
    });
    return reply.status(202).send({ message: 'Message queued' });
  });
};
