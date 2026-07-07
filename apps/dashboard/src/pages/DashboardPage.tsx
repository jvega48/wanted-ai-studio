import { useQuery } from '@tanstack/react-query';
import {
  Users, MessageSquare, TrendingUp, DollarSign,
  Cpu, Zap, Film, Clock, Radio, Bot,
} from 'lucide-react';
import { agentsApi } from '../api/agents.js';
import { streamApi } from '../api/stream.js';
import { useAppStore } from '../stores/useAppStore.js';
import { formatDuration } from '@wanted/shared';

function StatCard({
  label, value, icon: Icon, change, color = 'brand',
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  change?: string;
  color?: string;
}): React.ReactElement {
  const colorMap: Record<string, string> = {
    brand: 'text-brand-400',
    green: 'text-green-400',
    blue: 'text-blue-400',
    gold: 'text-amber-400',
    red: 'text-red-400',
    cyan: 'text-cyan-400',
  };

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <Icon className={`w-4 h-4 ${colorMap[color] ?? 'text-brand-400'}`} />
      </div>
      <span className="stat-value">{value}</span>
      {change && (
        <span className={change.startsWith('+') ? 'stat-change-up' : 'stat-change-down'}>
          {change}
        </span>
      )}
    </div>
  );
}

function AgentStatusBadge({ status }: { status: string }): React.ReactElement {
  const colors: Record<string, string> = {
    running: 'bg-green-500',
    idle: 'bg-yellow-500',
    stopped: 'bg-gray-500',
    error: 'bg-red-500',
    starting: 'bg-blue-500 animate-pulse',
  };
  return (
    <span className={`agent-status-dot ${colors[status] ?? 'bg-gray-500'}`} />
  );
}

export function DashboardPage(): React.ReactElement {
  const { stream } = useAppStore();

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: agentsApi.list,
    refetchInterval: 5000,
  });

  const { data: liveSessions = [] } = useQuery({
    queryKey: ['stream', 'live'],
    queryFn: streamApi.live,
    refetchInterval: 10_000,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['stream', 'sessions'],
    queryFn: () => streamApi.sessions({ limit: 5 }),
  });

  const activeAgents = agents.filter((a) => a.status === 'running').length;
  const currentSession = liveSessions[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {stream.isLive ? `Live for ${formatDuration(stream.uptime)}` : 'Stream is offline'}
          </p>
        </div>
        {stream.isLive && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
            <span className="live-dot" />
            <span className="text-red-400 font-medium text-sm">LIVE NOW</span>
          </div>
        )}
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Live Viewers"
          value={stream.viewerCount.toLocaleString()}
          icon={Users}
          color="green"
          change={stream.isLive ? '+12%' : undefined}
        />
        <StatCard
          label="Chat Rate"
          value={`${stream.chatRate.toFixed(1)}/min`}
          icon={MessageSquare}
          color="blue"
        />
        <StatCard
          label="Active Agents"
          value={`${activeAgents}/${agents.length}`}
          icon={Bot}
          color="brand"
        />
        <StatCard
          label="Revenue Est."
          value={`$${(currentSession?.donationAmount ?? 0).toFixed(2)}`}
          icon={DollarSign}
          color="gold"
          change="+$12.50 today"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Peak Viewers" value={String(currentSession?.viewerPeak ?? 0)} icon={TrendingUp} color="cyan" />
        <StatCard label="Clip Queue" value={String(currentSession?.clipCount ?? 0)} icon={Film} color="brand" />
        <StatCard label="Stream Time" value={stream.isLive ? formatDuration(stream.uptime) : '—'} icon={Clock} color="green" />
        <StatCard label="Platforms" value={currentSession?.platforms.length.toString() ?? '0'} icon={Radio} color="blue" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent status */}
        <div className="card lg:col-span-1">
          <div className="card-header">
            <h3 className="font-semibold text-white">Agent Status</h3>
            <span className="badge badge-online">{activeAgents} running</span>
          </div>
          <div className="space-y-2">
            {agents.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Loading agents...</p>
            ) : (
              agents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <AgentStatusBadge status={agent.status} />
                    <span className="text-sm text-gray-300">{agent.name}</span>
                  </div>
                  <span className={`text-xs font-medium ${
                    agent.status === 'running' ? 'text-green-400' :
                    agent.status === 'error' ? 'text-red-400' :
                    'text-gray-500'
                  }`}>
                    {agent.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <h3 className="font-semibold text-white">Recent Streams</h3>
          </div>
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Radio className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No streams yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-white/3 hover:bg-white/5 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{s.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.startedAt ? new Date(s.startedAt).toLocaleDateString() : 'Scheduled'}
                      {s.gameTitle ? ` · ${s.gameTitle}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 ml-4 flex-shrink-0 text-right">
                    <div>
                      <p className="text-sm font-medium text-white">{s.viewerPeak.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">peak</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{s.clipCount}</p>
                      <p className="text-xs text-gray-400">clips</p>
                    </div>
                    <span className={`badge ${s.status === 'LIVE' ? 'badge-live' : 'badge-offline'}`}>
                      {s.status.toLowerCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
