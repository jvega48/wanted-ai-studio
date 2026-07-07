export type AgentStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error' | 'starting' | 'stopping';

export type AgentPriority = 'critical' | 'high' | 'normal' | 'low';

export type AgentPermission =
  | 'obs:read'
  | 'obs:write'
  | 'chat:read'
  | 'chat:write'
  | 'stream:read'
  | 'stream:write'
  | 'clips:read'
  | 'clips:write'
  | 'analytics:read'
  | 'analytics:write'
  | 'memory:read'
  | 'memory:write'
  | 'upload:read'
  | 'upload:write'
  | 'notifications:send'
  | 'discord:read'
  | 'discord:write'
  | 'settings:read'
  | 'settings:write'
  | 'agents:manage';

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  autoStart: boolean;
  priority: AgentPriority;
  permissions: AgentPermission[];
  maxRetries: number;
  retryDelayMs: number;
  heartbeatIntervalMs: number;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

export interface AgentHealthCheck {
  agentId: string;
  status: AgentStatus;
  lastHeartbeat: Date;
  uptime: number;
  errorCount: number;
  lastError: string | null;
  memoryUsageMb: number;
  cpuPercent: number;
  taskQueueDepth: number;
  metadata: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: string;
  payload: unknown;
  timestamp: Date;
  correlationId?: string;
  replyTo?: string;
  ttlMs?: number;
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: string;
  priority: AgentPriority;
  payload: unknown;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  result?: unknown;
  error?: string;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, unknown>;
}

export interface AgentGoal {
  id: string;
  description: string;
  success_criteria: string[];
  priority: AgentPriority;
  deadline?: Date;
  completed: boolean;
  result?: string;
}

export type AgentId =
  | 'ceo'
  | 'producer'
  | 'obs'
  | 'moderator'
  | 'analytics'
  | 'clip'
  | 'youtube'
  | 'shorts'
  | 'tiktok'
  | 'thumbnail'
  | 'sponsor'
  | 'community'
  | 'trend'
  | 'memory'
  | 'revenue';
