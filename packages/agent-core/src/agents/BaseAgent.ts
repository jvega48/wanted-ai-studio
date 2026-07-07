import { randomUUID } from 'crypto';
import type {
  AgentConfig,
  AgentGoal,
  AgentHealthCheck,
  AgentId,
  AgentMessage,
  AgentPermission,
  AgentPriority,
  AgentStatus,
  AgentTask,
  EventName,
} from '@wanted/shared';
import { createLogger, type Logger } from '@wanted/shared';
import type { EventBus } from '../bus/EventBus.js';
import type { AgentScheduler } from '../scheduler/AgentScheduler.js';

export interface AgentContext {
  bus: EventBus;
  scheduler: AgentScheduler;
  config: AgentConfig;
}

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
};

export abstract class BaseAgent {
  readonly id: AgentId;
  readonly config: AgentConfig;

  protected status: AgentStatus = 'idle';
  protected goals: AgentGoal[] = [];
  protected tools: Map<string, ToolDefinition> = new Map();
  protected subscriptions: Array<() => void> = [];
  protected taskQueue: AgentTask[] = [];
  protected errorCount = 0;
  protected lastError: string | null = null;
  protected startedAt: Date | null = null;
  protected readonly log: Logger;

  protected bus: EventBus;
  protected scheduler: AgentScheduler;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private memoryUsageStart = 0;

  constructor(ctx: AgentContext) {
    this.id = ctx.config.id as AgentId;
    this.config = ctx.config;
    this.bus = ctx.bus;
    this.scheduler = ctx.scheduler;
    this.log = createLogger(`Agent:${ctx.config.name}`);
  }

  async start(): Promise<void> {
    if (this.status === 'running') {
      this.log.warn('Agent already running, skipping start');
      return;
    }

    this.status = 'starting';
    this.startedAt = new Date();
    this.errorCount = 0;
    this.memoryUsageStart = process.memoryUsage().heapUsed;

    try {
      this.log.info('Starting agent', { id: this.id, name: this.config.name });
      await this.onStart();
      this.registerTools();
      this.bindEvents();
      this.startHeartbeat();
      this.status = 'running';
      this.bus.emitSync('agent:started', { agentId: this.id, timestamp: new Date() }, this.id);
      this.log.info('Agent started successfully');
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      this.log.error('Agent failed to start', error);
      throw error;
    }
  }

  async stop(reason?: string): Promise<void> {
    if (this.status === 'stopped') return;

    this.status = 'stopping';
    this.log.info('Stopping agent', { reason });

    try {
      this.stopHeartbeat();
      this.unsubscribeAll();
      await this.onStop(reason);
      this.taskQueue = [];
      this.status = 'stopped';
      this.bus.emitSync(
        'agent:stopped',
        { agentId: this.id, reason, timestamp: new Date() },
        this.id,
      );
      this.log.info('Agent stopped');
    } catch (error) {
      this.log.error('Error during agent stop', error);
      this.status = 'error';
      throw error;
    }
  }

  async pause(): Promise<void> {
    if (this.status !== 'running') return;
    this.status = 'paused';
    await this.onPause();
    this.log.info('Agent paused');
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return;
    await this.onResume();
    this.status = 'running';
    this.log.info('Agent resumed');
  }

  getHealthCheck(): AgentHealthCheck {
    const mem = process.memoryUsage();
    return {
      agentId: this.id,
      status: this.status,
      lastHeartbeat: new Date(),
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      errorCount: this.errorCount,
      lastError: this.lastError,
      memoryUsageMb: mem.heapUsed / 1024 / 1024,
      cpuPercent: 0,
      taskQueueDepth: this.taskQueue.length,
      metadata: this.getHealthMetadata(),
    };
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  hasPermission(permission: AgentPermission): boolean {
    return this.config.permissions.includes(permission);
  }

  assertPermission(permission: AgentPermission): void {
    if (!this.hasPermission(permission)) {
      throw new Error(`Agent "${this.id}" lacks permission: ${permission}`);
    }
  }

  async queueTask(
    type: string,
    payload: unknown,
    priority: AgentPriority = 'normal',
    scheduledAt?: Date,
  ): Promise<AgentTask> {
    const task: AgentTask = {
      id: randomUUID(),
      agentId: this.id,
      type,
      priority,
      payload,
      scheduledAt,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      metadata: {},
    };

    this.taskQueue.push(task);
    this.sortTaskQueue();
    this.bus.emitSync('agent:task:queued', { agentId: this.id, taskId: task.id, type }, this.id);

    if (!scheduledAt || scheduledAt <= new Date()) {
      void this.processNextTask();
    }

    return task;
  }

  async receiveMessage(message: AgentMessage): Promise<void> {
    this.log.debug('Message received', { from: message.fromAgent, type: message.type });
    await this.onMessage(message);
  }

  protected subscribe<T extends EventName>(
    event: T,
    handler: Parameters<EventBus['on']>[1],
  ): void {
    const unsubscribe = this.bus.on(event, handler as Parameters<EventBus['on']>[1]);
    this.subscriptions.push(unsubscribe);
  }

  protected unsubscribeAll(): void {
    for (const unsub of this.subscriptions) {
      unsub();
    }
    this.subscriptions = [];
  }

  protected registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    taskId?: string,
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.errorCount++;
        this.lastError = lastError.message;
        this.log.warn(`Attempt ${attempt + 1} failed`, { taskId, error: lastError.message });

        if (attempt < this.config.maxRetries - 1) {
          await new Promise((r) =>
            setTimeout(r, this.config.retryDelayMs * Math.pow(2, attempt)),
          );
        }
      }
    }
    throw lastError ?? new Error('Unknown error during retry');
  }

  private async processNextTask(): Promise<void> {
    const task = this.taskQueue.shift();
    if (!task || this.status !== 'running') return;

    task.startedAt = new Date();
    const start = Date.now();

    try {
      task.result = await this.executeTask(task);
      task.completedAt = new Date();
      this.bus.emitSync(
        'agent:task:completed',
        { agentId: this.id, taskId: task.id, durationMs: Date.now() - start },
        this.id,
      );
    } catch (error) {
      task.failedAt = new Date();
      task.error = error instanceof Error ? error.message : String(error);
      task.retryCount++;

      if (task.retryCount < task.maxRetries) {
        task.scheduledAt = new Date(Date.now() + this.config.retryDelayMs * task.retryCount);
        this.taskQueue.unshift(task);
        this.sortTaskQueue();
      } else {
        this.bus.emitSync(
          'agent:task:failed',
          { agentId: this.id, taskId: task.id, error: task.error },
          this.id,
        );
      }
    }

    if (this.taskQueue.length > 0) {
      void this.processNextTask();
    }
  }

  private sortTaskQueue(): void {
    const priorityOrder: Record<AgentPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };
    this.taskQueue.sort((a, b) => {
      const priorityDiff =
        priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      const aTime = a.scheduledAt?.getTime() ?? 0;
      const bTime = b.scheduledAt?.getTime() ?? 0;
      return aTime - bTime;
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const health = this.getHealthCheck();
      this.bus.emitSync('agent:health:updated', health, this.id);
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Lifecycle hooks — override in subclasses
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(reason?: string): Promise<void>;
  protected abstract onMessage(message: AgentMessage): Promise<void>;
  protected abstract executeTask(task: AgentTask): Promise<unknown>;

  protected async onPause(): Promise<void> {}
  protected async onResume(): Promise<void> {}
  protected abstract registerTools(): void;
  protected abstract bindEvents(): void;
  protected getHealthMetadata(): Record<string, unknown> {
    return {};
  }
}
