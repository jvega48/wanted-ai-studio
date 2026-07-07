import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Notification } from '@wanted/skills';

interface StreamState {
  isLive: boolean;
  sessionId: string | null;
  viewerCount: number;
  chatRate: number;
  uptime: number;
}

interface AppState {
  stream: StreamState;
  notifications: Notification[];
  unreadCount: number;
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';

  setStreamLive: (sessionId: string) => void;
  setStreamOffline: () => void;
  updateViewerCount: (count: number) => void;
  updateChatRate: (rate: number) => void;
  incrementUptime: () => void;
  addNotification: (n: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        stream: {
          isLive: false,
          sessionId: null,
          viewerCount: 0,
          chatRate: 0,
          uptime: 0,
        },
        notifications: [],
        unreadCount: 0,
        sidebarCollapsed: false,
        theme: 'dark',

        setStreamLive: (sessionId) =>
          set((s) => ({ stream: { ...s.stream, isLive: true, sessionId, uptime: 0 } })),

        setStreamOffline: () =>
          set((s) => ({ stream: { ...s.stream, isLive: false, sessionId: null } })),

        updateViewerCount: (count) =>
          set((s) => ({ stream: { ...s.stream, viewerCount: count } })),

        updateChatRate: (rate) =>
          set((s) => ({ stream: { ...s.stream, chatRate: rate } })),

        incrementUptime: () =>
          set((s) => ({ stream: { ...s.stream, uptime: s.stream.uptime + 1 } })),

        addNotification: (n) =>
          set((s) => ({
            notifications: [n, ...s.notifications].slice(0, 100),
            unreadCount: s.unreadCount + (n.read ? 0 : 1),
          })),

        markNotificationRead: (id) =>
          set((s) => ({
            notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
            unreadCount: Math.max(0, s.unreadCount - 1),
          })),

        markAllRead: () =>
          set((s) => ({
            notifications: s.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          })),

        clearNotifications: () => set({ notifications: [], unreadCount: 0 }),

        toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

        setTheme: (theme) => set({ theme }),
      }),
      {
        name: 'wanted-ai-studio',
        partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, theme: state.theme }),
      },
    ),
  ),
);
