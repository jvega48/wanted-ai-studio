import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, RefreshCw, Bot, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { agentsApi } from '../api/agents.js';

const STATUS_CONFIG = {
  running: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  idle: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  stopped: { icon: Square, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' },
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  starting: { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  stopping: { icon: RefreshCw, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
} as const;

export function AgentsPage(): React.ReactElement {
  const qc = useQueryClient();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchInterval: 3000,
  });

  const { data: health = {} } = useQuery({
    queryKey: ['agents', 'health'],
    queryFn: agentsApi.health,
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: agentsApi.start,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['agents'] }),
  });

  const stopMutation = useMutation({
    mutationFn: agentsApi.stop,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['agents'] }),
  });

  const restartMutation = useMutation({
    mutationFn: agentsApi.restart,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['agents'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    );
  }

  const runningCount = agents.filter((a) => a.status === 'running').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Agents</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {runningCount} of {agents.length} agents running
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-online">{runningCount} active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const statusKey = (agent.status in STATUS_CONFIG ? agent.status : 'idle') as keyof typeof STATUS_CONFIG;
          const { icon: StatusIcon, color, bg } = STATUS_CONFIG[statusKey];
          const agentHealth = health[agent.id];
          const isLoading = startMutation.isPending || stopMutation.isPending || restartMutation.isPending;

          return (
            <div key={agent.id} className="card hover:border-white/10 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-600/30 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{agent.name}</h3>
                    <p className="text-xs text-gray-500 font-mono">{agent.id}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium ${color} ${bg}`}>
                  <StatusIcon className="w-3 h-3" />
                  {agent.status}
                </div>
              </div>

              {agentHealth && (
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                  <div className="bg-white/3 rounded-lg p-2">
                    <p className="text-gray-400">Errors</p>
                    <p className={`font-mono font-medium ${agentHealth.errorCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {agentHealth.errorCount}
                    </p>
                  </div>
                  <div className="bg-white/3 rounded-lg p-2">
                    <p className="text-gray-400">Queue</p>
                    <p className="font-mono font-medium text-white">{agentHealth.taskQueueDepth}</p>
                  </div>
                  <div className="bg-white/3 rounded-lg p-2">
                    <p className="text-gray-400">Memory</p>
                    <p className="font-mono font-medium text-white">{agentHealth.memoryUsageMb.toFixed(1)}MB</p>
                  </div>
                  <div className="bg-white/3 rounded-lg p-2">
                    <p className="text-gray-400">Uptime</p>
                    <p className="font-mono font-medium text-white">
                      {Math.floor(agentHealth.uptime / 60000)}m
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                {agent.status === 'running' ? (
                  <button
                    onClick={() => stopMutation.mutate(agent.id)}
                    disabled={isLoading}
                    className="btn-danger flex-1 text-xs py-1.5"
                  >
                    <Square className="w-3 h-3" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => startMutation.mutate(agent.id)}
                    disabled={isLoading}
                    className="btn-success flex-1 text-xs py-1.5"
                  >
                    <Play className="w-3 h-3" />
                    Start
                  </button>
                )}
                <button
                  onClick={() => restartMutation.mutate(agent.id)}
                  disabled={isLoading}
                  className="btn-secondary text-xs py-1.5 px-3"
                  title="Restart"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
