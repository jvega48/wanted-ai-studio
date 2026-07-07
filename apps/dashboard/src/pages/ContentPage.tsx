import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Youtube, Music2, Film, Clock, CheckCircle, XCircle, RefreshCw, Upload } from 'lucide-react';
import { contentApi } from '../api/content.js';

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  YOUTUBE: Youtube,
  TIKTOK: Music2,
  SHORTS: Film,
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-yellow-400',
  PROCESSING: 'text-blue-400',
  SCHEDULED: 'text-brand-400',
  PUBLISHED: 'text-green-400',
  FAILED: 'text-red-400',
  CANCELLED: 'text-gray-400',
};

export function ContentPage(): React.ReactElement {
  const qc = useQueryClient();
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['content', platformFilter],
    queryFn: () => contentApi.list({ platform: platformFilter === 'ALL' ? undefined : platformFilter }),
    refetchInterval: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: contentApi.cancel,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['content'] }),
  });

  const retryMutation = useMutation({
    mutationFn: contentApi.retry,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['content'] }),
  });

  const FILTERS = ['ALL', 'YOUTUBE', 'TIKTOK', 'SHORTS'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Queue</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage scheduled uploads across platforms</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {FILTERS.map((f) => {
          const Icon = PLATFORM_ICONS[f];
          return (
            <button
              key={f}
              onClick={() => setPlatformFilter(f)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                platformFilter === f
                  ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                  : 'bg-white/3 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {f}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Upload className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No content queued</p>
          <p className="text-xs mt-1 text-gray-600">Approve clips to add them to the upload queue</p>
        </div>
      ) : (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-white/5">
                <th className="pb-3 text-left font-medium">Title</th>
                <th className="pb-3 text-left font-medium">Platform</th>
                <th className="pb-3 text-left font-medium">Status</th>
                <th className="pb-3 text-left font-medium">Scheduled</th>
                <th className="pb-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((item) => {
                const PlatformIcon = PLATFORM_ICONS[item.platform] ?? Film;
                return (
                  <tr key={item.id} className="hover:bg-white/2 transition-colors">
                    <td className="py-3 pr-4">
                      <p className="text-white font-medium line-clamp-1">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.description}</p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <PlatformIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-300">{item.platform}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`font-medium ${STATUS_COLORS[item.status] ?? 'text-gray-400'}`}>
                        {item.status === 'PROCESSING' && <RefreshCw className="w-3 h-3 inline mr-1 animate-spin" />}
                        {item.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-400">
                      {item.scheduledAt
                        ? new Date(item.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.status === 'FAILED' && (
                          <button
                            onClick={() => retryMutation.mutate(item.id)}
                            className="btn-secondary text-xs py-1 px-2 gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry
                          </button>
                        )}
                        {(item.status === 'PENDING' || item.status === 'SCHEDULED') && (
                          <button
                            onClick={() => cancelMutation.mutate(item.id)}
                            className="btn-danger text-xs py-1 px-2 gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            Cancel
                          </button>
                        )}
                        {item.status === 'PUBLISHED' && item.platformUrl && (
                          <a
                            href={item.platformUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary text-xs py-1 px-2 gap-1"
                          >
                            <CheckCircle className="w-3 h-3 text-green-400" />
                            View
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
