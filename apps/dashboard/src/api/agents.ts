import { api } from './client.js';
import type { AgentHealthCheck, AgentStatus } from '@wanted/shared';

export interface AgentListItem {
  id: string;
  name: string;
  status: AgentStatus;
}

export const agentsApi = {
  list: () => api.get<AgentListItem[]>('/agents'),
  health: () => api.get<Record<string, AgentHealthCheck>>('/agents/health'),
  agentHealth: (id: string) => api.get<AgentHealthCheck>(`/agents/${id}/health`),
  start: (id: string) => api.post(`/agents/${id}/start`),
  stop: (id: string) => api.post(`/agents/${id}/stop`),
  restart: (id: string) => api.post(`/agents/${id}/restart`),
};
