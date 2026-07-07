import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Film, Check, X, Download, Upload, RefreshCw, Scissors } from 'lucide-react';
import { clipsApi } from '../api/clips.js';

const FORMAT_LABELS: Record<string, string> = {
  PORTRAIT: '9:16 Portrait',
  LANDSCAPE: '16:9 Landscape',
  SQUARE: '1:1 Square',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  PROCESSING: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  READY: 'text-green-400 bg-green-500/10 border-green-500/20',
  APPROVED: 'text-brand-400 bg-brand-600/10 border-brand-500/20',
  REJECTED: 'text-red-400 bg-red-500/10 border-red-500/20',
  PUBLISHED: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  FAILED: 'text-red-400 bg-red-900/20 border-red-500/20',
};

export function ClipsPage(): React.ReactElement {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const { data: clips = [], isLoading } = useQuery({
    queryKey: ['clips', statusFilter],
    queryFn: () => clipsApi.list({ status: statusFilter === 'ALL' ? undefined : statusFilter }),
    refetchInterval: 15_000,
  });

  const approveMutation = useMutation({
    mutationFn: clipsApi.approve,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clips'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: clipsApi.reject,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clips'] }),
  });

  const FILTERS = ['ALL', 'PENDING', 'PROCESSING', 'READY', 'APPROVED', 'PUBLISHED', 'REJECTED'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clips</h1>
          <p className="text-sm text-gray-400 mt-0.5">{clips.length} clips {statusFilter !== 'ALL' ? `(${statusFilter.toLowerCase()})` : 'total'}</p>
        </div>
        <button
          onClick={() => void qc.invalidateQueries({ queryKey: ['clips'] })}
          className="btn-secondary gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
              statusFilter === f
                ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                : 'bg-white/3 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      ) : clips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Scissors className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No clips found</p>
          <p className="text-xs mt-1 text-gray-600">Clips are created automatically during streams</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clips.map((clip) => (
            <div key={clip.id} className="card hover:border-white/10 transition-colors group">
              {/* Thumbnail */}
              <div className="aspect-video bg-black/40 rounded-xl flex items-center justify-center mb-4 overflow-hidden border border-white/5">
                {clip.thumbnailUrl ? (
                  <img src={clip.thumbnailUrl} alt={clip.title} className="w-full h-full object-cover" />
                ) : (
                  <Film className="w-8 h-8 text-gray-600" />
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-white line-clamp-1">{clip.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {clip.duration.toFixed(1)}s · {FORMAT_LABELS[clip.format] ?? clip.format}
                    {clip.triggerType ? ` · ${clip.triggerType.replace(/_/g, ' ')}` : ''}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[clip.status] ?? 'text-gray-400'}`}>
                    {clip.status === 'PROCESSING' && (
                      <RefreshCw className="w-2.5 h-2.5 inline mr-1 animate-spin" />
                    )}
                    {clip.status.toLowerCase()}
                  </span>
                  {clip.triggerScore != null && (
                    <span className="text-xs text-gray-500">
                      score: {(clip.triggerScore * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                {(clip.status === 'PENDING' || clip.status === 'READY') && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate(clip.id)}
                      disabled={approveMutation.isPending}
                      className="btn-success flex-1 text-xs py-1.5"
                    >
                      <Check className="w-3 h-3" />
                      Approve
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(clip.id)}
                      disabled={rejectMutation.isPending}
                      className="btn-danger flex-1 text-xs py-1.5"
                    >
                      <X className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                )}

                {clip.status === 'APPROVED' && (
                  <div className="flex gap-2">
                    <a
                      href={clip.outputPath ?? '#'}
                      download
                      className="btn-secondary flex-1 text-xs py-1.5 flex items-center justify-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                    <button className="btn-primary flex-1 text-xs py-1.5">
                      <Upload className="w-3 h-3" />
                      Publish
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
