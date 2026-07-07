import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';
import { useAppStore } from '../../stores/useAppStore.js';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps): React.ReactElement {
  const { sidebarCollapsed } = useAppStore();

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <TopBar />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
