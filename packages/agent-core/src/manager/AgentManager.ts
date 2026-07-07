import { createLogger } from '@wanted/shared';
import type { AgentHealthCheck, AgentId, AgentMessage, AgentStatus } from '@wanted/shared';
import type { BaseAgent } from '../agents/BaseAgent.js';
import type { EventBus } from '../bus/EventBus.js';
import { AgentScheduler } from '../scheduler/AgentScheduler.js';

export interface AgentRegistration {
  agent: BaseAgent;
  autoStart: boolean;
}

export class AgentManager {
  private readonly agents = new Map<AgentId, BaseAgent>();
  private readonly scheduler: AgentScheduler;
  private readonly log = createLogger('AgentManager');
  private isStarted = false;

  constructor(
    private readonly bus: EventBus,
    schedulerTickMs = 1000,
  ) {
    this.scheduler = new AgentScheduler(schedulerTickMs);
  }

  register(agent: BaseAgent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already registered`);
    }
    this.agents.set(agent.id, agent);
    this.log.info(`Registered agent: ${agent.id}`);
  }

  unregister(agentId: AgentId): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    if (agent.getStatus() === 'running') {
      void agent.stop('unregistered');
    }
    this.agents.delete(agentId);
    this.log.info(`Unregistered agent: ${agentId}`);
  }

  async startAll(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;
    this.scheduler.start();

    const startOrder: AgentId[] = [
      'memory',
      'analytics',
      'obs',
      'moderator',
      'clip',
      'producer',
      'youtube',
      'shorts',
      'tiktok',
      'thumbnail',
      'community',
      'sponsor',
      'trend',
      'revenue',
      'ceo',
    ];

    for (const agentId of startOrder) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      if (!agent.config.autoStart) {
        this.log.info(`Skipping auto-start for agent: ${agentId}`);
        continue;
      }

      try {
        await agent.start();
        this.log.info(`Started agent: ${agentId}`);
      } catch (error) {
        this.log.error(`Failed to start agent: ${agentId}`, error);
        if (agent.config.priority === 'critical') {
          throw new Error(`Critical agent "${agentId}" failed to start: ${String(error)}`);
        }
      }
    }

    this.bus.emitSync('system:startup', {
      timestamp: new Date(),
      version: process.env['npm_package_version'] ?? '1.0.0',
    });
  }

  async stopAll(reason = 'shutdown'): Promise<void> {
    this.scheduler.stop();

    const stopOrder = Array.from(this.agents.keys()).reverse();
    await Promise.all(
      stopOrder.map(async (agentId) => {
        const agent = this.agents.get(agentId);
        if (!agent || agent.getStatus() === 'stopped') return;
        try {
          await agent.stop(reason);
        } catch (error) {
          this.log.error(`Failed to stop agent: ${agentId}`, error);
        }
      }),
    );

    this.isStarted = false;
    this.bus.emitSync('system:shutdown', { timestamp: new Date(), reason });
  }

  async startAgent(agentId: AgentId): Promise<void> {
    const agent = this.getAgentOrThrow(agentId);
    await agent.start();
  }

  async stopAgent(agentId: AgentId, reason?: string): Promise<void> {
    const agent = this.getAgentOrThrow(agentId);
    await agent.stop(reason);
  }

  async restartAgent(agentId: AgentId): Promise<void> {
    const agent = this.getAgentOrThrow(agentId);
    this.log.info(`Restarting agent: ${agentId}`);
    await agent.stop('restart');
    await new Promise((r) => setTimeout(r, 500));
    await agent.start();
    this.log.info(`Agent restarted: ${agentId}`);
  }

  async sendMessage(message: AgentMessage): Promise<void> {
    const target = this.agents.get(message.toAgent as AgentId);
    if (!target) {
      this.log.warn(`Target agent not found: ${message.toAgent}`);
      return;
    }
    if (target.getStatus() !== 'running') {
      this.log.warn(`Target agent not running: ${message.toAgent}`);
      return;
    }
    await target.receiveMessage(message);
  }

  broadcast(message: Omit<AgentMessage, 'toAgent'>): void {
    for (const [id, agent] of this.agents) {
      if (id === message.fromAgent) continue;
      if (agent.getStatus() !== 'running') continue;
      void agent.receiveMessage({ ...message, toAgent: id });
    }
  }

  getHealth(): Map<AgentId, AgentHealthCheck> {
    const health = new Map<AgentId, AgentHealthCheck>();
    for (const [id, agent] of this.agents) {
      health.set(id, agent.getHealthCheck());
    }
    return health;
  }

  getStatus(agentId: AgentId): AgentStatus | undefined {
    return this.agents.get(agentId)?.getStatus();
  }

  listAgents(): Array<{ id: AgentId; status: AgentStatus; name: string }> {
    return Array.from(this.agents.entries()).map(([id, agent]) => ({
      id,
      status: agent.getStatus(),
      name: agent.config.name,
    }));
  }

  getScheduler(): AgentScheduler {
    return this.scheduler;
  }

  private getAgentOrThrow(agentId: AgentId): BaseAgent {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return agent;
  }
}
