import type { AgentManager, EventBus } from '@wanted/agent-core';

declare module 'fastify' {
  interface FastifyInstance {
    bus: EventBus;
    agentManager: AgentManager;
  }
}
