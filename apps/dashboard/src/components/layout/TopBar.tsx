import { Bell, Activity } from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore.js';
import { formatDuration } from '@wanted/shared';

export function TopBar(): React.ReactElement {
  const { stream, unreadCount, markAllRead } = useAppStore();

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-surface-50 flex-shrink-0">
      {/* Stream status */}
      <div className="flex items-center gap-4">
        {stream.isLive ? (
          <div className="flex items-center gap-2">
            <span className="live-dot" />
            <span className="text-sm font-medium text-white">LIVE</span>
            <span className="text-sm text-gray-400 font-mono">
              {formatDuration(stream.uptime)}
            </span>
            <div className="flex items-center gap-1 text-sm text-gray-300">
              <Activity className="w-4 h-4 text-brand-400" />
              <span>{stream.viewerCount.toLocaleString()} viewers</span>
            </div>
          </div>
        ) : (
          <span className="text-sm text-gray-500">Stream offline</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={markAllRead}
          className="relative p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-sm font-bold">
          W
        </div>
      </div>
    </header>
  );
}
