import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  Radio,
  Scissors,
  BarChart3,
  FileVideo,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore.js';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/stream', icon: Radio, label: 'Stream' },
  { to: '/clips', icon: Scissors, label: 'Clips' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/content', icon: FileVideo, label: 'Content' },
  { to: '/settings', icon: Settings, label: 'Settings' },
] as const;

export function Sidebar(): React.ReactElement {
  const { sidebarCollapsed, toggleSidebar, stream } = useAppStore();

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-full flex flex-col bg-surface-50 border-r border-white/5 z-40 transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!sidebarCollapsed && (
          <span className="font-bold text-sm text-gradient-brand whitespace-nowrap">
            Wanted AI Studio
          </span>
        )}
      </div>

      {/* Live badge */}
      {stream.isLive && (
        <div className={clsx(
          'mx-3 mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20',
          sidebarCollapsed && 'justify-center',
        )}>
          <span className="live-dot flex-shrink-0" />
          {!sidebarCollapsed && (
            <span className="text-xs font-medium text-red-400">LIVE</span>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
                sidebarCollapsed && 'justify-center',
              )
            }
            title={sidebarCollapsed ? label : undefined}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 mx-2 mb-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
        title={sidebarCollapsed ? 'Expand' : 'Collapse'}
      >
        {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        {!sidebarCollapsed && <span className="ml-2 text-xs">Collapse</span>}
      </button>
    </aside>
  );
}
