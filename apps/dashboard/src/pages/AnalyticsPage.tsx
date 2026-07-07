import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Users, MessageSquare, DollarSign, Film, RefreshCw } from 'lucide-react';
import { streamApi } from '../api/stream.js';
import { analyticsApi } from '../api/analytics.js';

function MetricRow({ label, value, icon: Icon, color = 'text-brand-400' }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}

export function AnalyticsPage(): React.ReactElement {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ['stream', 'sessions'],
    queryFn: () => streamApi.sessions({ limit: 20 }),
  });

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', selectedSession ?? sessions[0]?.id],
    queryFn: () => analyticsApi.session(selectedSession ?? sessions[0]?.id ?? ''),
    enabled: (selectedSession ?? sessions[0]?.id) != null,
  });

  const activeSessionId = selectedSession ?? sessions[0]?.id;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        {sessions.length > 0 && (
          <select
            value={activeSessionId ?? ''}
            onChange={(e) => setSelectedSession(e.target.value || null)}
            className="input text-sm w-auto"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} — {s.startedAt ? new Date(s.startedAt).toLocaleDateString() : 'N/A'}
              </option>
            ))}
          </select>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <BarChart3 className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No streams to analyze yet</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      ) : analytics ? (
        <>
          {/* Overview grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Peak Viewers', value: analytics.viewerPeak.toLocaleString(), icon: Users, color: 'text-green-400' },
              { label: 'Avg Viewers', value: analytics.viewerAvg.toLocaleString(), icon: TrendingUp, color: 'text-cyan-400' },
              { label: 'Chat Messages', value: analytics.chatTotal.toLocaleString(), icon: MessageSquare, color: 'text-blue-400' },
              { label: 'Revenue', value: `$${analytics.donationsTotal.toFixed(2)}`, icon: DollarSign, color: 'text-amber-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="stat-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="stat-label">{label}</span>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <span className="stat-value">{value}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Session details */}
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-white">Session Overview</h3>
              </div>
              <MetricRow label="Duration" value={`${Math.floor(analytics.duration / 3600)}h ${Math.floor((analytics.duration % 3600) / 60)}m`} icon={TrendingUp} />
              <MetricRow label="Chat Rate" value={`${analytics.chatRate.toFixed(1)}/min`} icon={MessageSquare} color="text-blue-400" />
              <MetricRow label="Clips Created" value={String(analytics.clipsCreated)} icon={Film} color="text-brand-400" />
              <MetricRow label="Clip Approval Rate" value={`${(analytics.clipApprovalRate * 100).toFixed(0)}%`} icon={Film} />
              <MetricRow label="Subs Gained" value={String(analytics.subscribersGained)} icon={Users} color="text-green-400" />
              <MetricRow label="Total Bits" value={analytics.bitsTotal.toLocaleString()} icon={DollarSign} color="text-amber-400" />
            </div>

            {/* Viewer time series (text summary since we have no chart lib) */}
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-white">Viewer Timeline</h3>
                <span className="text-xs text-gray-400">{analytics.viewerTimeSeries.length} snapshots</span>
              </div>
              {analytics.viewerTimeSeries.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">No timeline data</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {analytics.viewerTimeSeries.map((point, i) => {
                    const maxViewers = Math.max(...analytics.viewerTimeSeries.map((p) => p.viewers));
                    const pct = maxViewers > 0 ? (point.viewers / maxViewers) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16 flex-shrink-0">
                          {new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-brand-600 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-12 text-right">{point.viewers}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
