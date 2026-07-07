import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import type { EventEnvelope, EventName } from '@wanted/shared';
import { createLogger } from '@wanted/shared';

const log = createLogger('WebSocketServer');

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  subscribedEvents: Set<EventName | '*'>;
  connectedAt: Date;
}

const clients = new Map<string, ConnectedClient>();

export const websocketPlugin: FastifyPluginAsync = async (app) => {
  app.get('/events', { websocket: true }, (socket, req) => {
    const clientId = crypto.randomUUID();
    const client: ConnectedClient = {
      id: clientId,
      ws: socket as unknown as WebSocket,
      subscribedEvents: new Set(['*']),
      connectedAt: new Date(),
    };
    clients.set(clientId, client);
    log.info(`Client connected: ${clientId}`, { total: clients.size });

    socket.send(JSON.stringify({ type: 'connected', clientId, timestamp: new Date() }));

    const busUnsubscribe = app.bus.onAny((event, payload, envelope) => {
      if (!client.subscribedEvents.has('*') && !client.subscribedEvents.has(event)) return;
      if (socket.readyState !== 1) return;

      try {
        socket.send(JSON.stringify({
          type: 'event',
          event,
          payload,
          id: envelope.id,
          timestamp: envelope.timestamp,
        }));
      } catch (err) {
        log.error('Failed to send to client', err);
      }
    });

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          events?: string[];
          event?: string;
          payload?: unknown;
        };

        switch (msg.type) {
          case 'subscribe':
            if (msg.events) {
              client.subscribedEvents = new Set(msg.events as EventName[]);
              socket.send(JSON.stringify({ type: 'subscribed', events: msg.events }));
            }
            break;

          case 'subscribe_all':
            client.subscribedEvents = new Set(['*']);
            socket.send(JSON.stringify({ type: 'subscribed', events: ['*'] }));
            break;

          case 'emit':
            if (msg.event && msg.payload) {
              void app.bus.emit(msg.event as EventName, msg.payload as never, clientId);
            }
            break;

          case 'ping':
            socket.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
            break;
        }
      } catch (err) {
        log.error('WebSocket message parse error', err);
      }
    });

    socket.on('close', () => {
      busUnsubscribe();
      clients.delete(clientId);
      log.info(`Client disconnected: ${clientId}`, { total: clients.size });
    });

    socket.on('error', (err) => {
      log.error(`WebSocket error for client ${clientId}`, err);
    });
  });

  app.get('/clients', {}, async () => ({
    count: clients.size,
    clients: Array.from(clients.values()).map((c) => ({
      id: c.id,
      connectedAt: c.connectedAt,
      subscribedEvents: Array.from(c.subscribedEvents),
    })),
  }));
};

export function broadcastToClients(event: EventName, payload: unknown): void {
  const message = JSON.stringify({ type: 'event', event, payload, timestamp: new Date() });
  for (const client of clients.values()) {
    if (!client.subscribedEvents.has('*') && !client.subscribedEvents.has(event)) continue;
    try {
      (client.ws as unknown as { readyState: number; send: (data: string) => void }).send(message);
    } catch (err) {
      log.error('Broadcast send error', err);
    }
  }
}
