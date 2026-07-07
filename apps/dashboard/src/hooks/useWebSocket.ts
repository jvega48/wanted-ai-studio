import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore.js';

const WS_URL = import.meta.env['VITE_WS_URL'] ?? `ws://${window.location.hostname}:3001/ws/events`;

export function useWebSocket(): void {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addNotification, setStreamLive, setStreamOffline, updateViewerCount } = useAppStore();

  useEffect(() => {
    let isUnmounted = false;

    function connect(): void {
      if (isUnmounted) return;

      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'subscribe_all' }));
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            event?: string;
            payload?: unknown;
          };

          if (msg.type !== 'event' || !msg.event) return;

          handleEvent(msg.event, msg.payload);
        } catch { /* ignore */ }
      };

      socket.onclose = () => {
        ws.current = null;
        if (!isUnmounted) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };
    }

    function handleEvent(event: string, payload: unknown): void {
      const p = payload as Record<string, unknown>;

      switch (event) {
        case 'stream:started':
          setStreamLive(p['sessionId'] as string);
          break;
        case 'stream:ended':
          setStreamOffline();
          break;
        case 'viewer:stats:updated':
          updateViewerCount(p['count'] as number);
          break;
        case 'notification:send':
          addNotification({
            id: crypto.randomUUID(),
            title: p['title'] as string,
            body: p['body'] as string,
            level: (p['level'] as 'info' | 'success' | 'warning' | 'error') ?? 'info',
            agentId: p['agentId'] as never,
            timestamp: new Date(),
            read: false,
          });
          break;
      }
    }

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [addNotification, setStreamLive, setStreamOffline, updateViewerCount]);
}
