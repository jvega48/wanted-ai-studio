import { randomUUID } from 'crypto';
import type {
  EventEnvelope,
  EventHandler,
  EventMap,
  EventName,
  WildcardEventHandler,
} from '@wanted/shared';

type Subscription = {
  id: string;
  event: EventName | '*';
  handler: EventHandler<EventName> | WildcardEventHandler;
  once: boolean;
};

export class EventBus {
  private readonly subscriptions = new Map<string, Subscription[]>();
  private readonly wildcardSubscriptions: Subscription[] = [];
  private readonly eventHistory: EventEnvelope[] = [];
  private readonly maxHistorySize: number;
  private isShuttingDown = false;

  constructor(maxHistorySize = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  on<T extends EventName>(event: T, handler: EventHandler<T>): () => void {
    return this.addSubscription(event, handler as EventHandler<EventName>, false);
  }

  once<T extends EventName>(event: T, handler: EventHandler<T>): () => void {
    return this.addSubscription(event, handler as EventHandler<EventName>, true);
  }

  onAny(handler: WildcardEventHandler): () => void {
    const sub: Subscription = { id: randomUUID(), event: '*', handler, once: false };
    this.wildcardSubscriptions.push(sub);
    return () => {
      const idx = this.wildcardSubscriptions.findIndex((s) => s.id === sub.id);
      if (idx !== -1) this.wildcardSubscriptions.splice(idx, 1);
    };
  }

  off<T extends EventName>(event: T, handler: EventHandler<T>): void {
    const subs = this.subscriptions.get(event);
    if (!subs) return;
    const filtered = subs.filter((s) => s.handler !== handler);
    if (filtered.length === 0) {
      this.subscriptions.delete(event);
    } else {
      this.subscriptions.set(event, filtered);
    }
  }

  async emit<T extends EventName>(
    event: T,
    payload: EventMap[T],
    sourceId?: string,
    correlationId?: string,
  ): Promise<void> {
    if (this.isShuttingDown) return;

    const envelope: EventEnvelope<T> = {
      id: randomUUID(),
      event,
      payload,
      timestamp: new Date(),
      sourceId,
      correlationId,
    };

    this.addToHistory(envelope as EventEnvelope);

    const subs = this.subscriptions.get(event) ?? [];
    const onceSubs: string[] = [];

    const handlers: Array<Promise<void>> = [];

    for (const sub of subs) {
      if (sub.once) onceSubs.push(sub.id);
      handlers.push(
        Promise.resolve(
          (sub.handler as EventHandler<T>)(payload, envelope),
        ).catch((err: unknown) => {
          console.error(`[EventBus] Handler error for event "${event}":`, err);
        }),
      );
    }

    for (const sub of this.wildcardSubscriptions) {
      if (sub.once) onceSubs.push(sub.id);
      handlers.push(
        Promise.resolve(
          (sub.handler as WildcardEventHandler)(event, payload, envelope as EventEnvelope),
        ).catch((err: unknown) => {
          console.error(`[EventBus] Wildcard handler error for event "${event}":`, err);
        }),
      );
    }

    await Promise.all(handlers);

    if (onceSubs.length > 0) {
      const remaining = (this.subscriptions.get(event) ?? []).filter(
        (s) => !onceSubs.includes(s.id),
      );
      if (remaining.length === 0) {
        this.subscriptions.delete(event);
      } else {
        this.subscriptions.set(event, remaining);
      }
    }
  }

  emitSync<T extends EventName>(
    event: T,
    payload: EventMap[T],
    sourceId?: string,
  ): void {
    void this.emit(event, payload, sourceId);
  }

  waitFor<T extends EventName>(event: T, timeoutMs?: number): Promise<EventMap[T]> {
    return new Promise<EventMap[T]>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const unsubscribe = this.addSubscription(
        event,
        ((payload: EventMap[T]) => {
          if (timer) clearTimeout(timer);
          resolve(payload);
        }) as EventHandler<EventName>,
        true,
      );

      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for event "${event}" after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }

  getHistory(event?: EventName, limit = 100): EventEnvelope[] {
    const history = event
      ? this.eventHistory.filter((e) => e.event === event)
      : this.eventHistory;
    return history.slice(-limit);
  }

  subscriberCount(event: EventName): number {
    return (this.subscriptions.get(event) ?? []).length;
  }

  removeAllListeners(event?: EventName): void {
    if (event) {
      this.subscriptions.delete(event);
    } else {
      this.subscriptions.clear();
      this.wildcardSubscriptions.splice(0);
    }
  }

  shutdown(): void {
    this.isShuttingDown = true;
    this.removeAllListeners();
  }

  private addSubscription(
    event: EventName,
    handler: EventHandler<EventName>,
    once: boolean,
  ): () => void {
    const sub: Subscription = { id: randomUUID(), event, handler, once };
    const existing = this.subscriptions.get(event) ?? [];
    this.subscriptions.set(event, [...existing, sub]);

    return () => {
      const current = this.subscriptions.get(event) ?? [];
      const filtered = current.filter((s) => s.id !== sub.id);
      if (filtered.length === 0) {
        this.subscriptions.delete(event);
      } else {
        this.subscriptions.set(event, filtered);
      }
    };
  }

  private addToHistory(envelope: EventEnvelope): void {
    this.eventHistory.push(envelope);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }
}

export const globalEventBus = new EventBus(5000);
