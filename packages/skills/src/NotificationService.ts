import { createLogger } from '@wanted/shared';
import type { AgentId } from '@wanted/shared';

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  title: string;
  body: string;
  level: NotificationLevel;
  agentId?: AgentId;
  timestamp: Date;
  read: boolean;
  action?: { label: string; url?: string };
}

export type NotificationHandler = (notification: Notification) => void;

export class NotificationService {
  private readonly log = createLogger('NotificationService');
  private readonly notifications: Notification[] = [];
  private readonly handlers: NotificationHandler[] = [];
  private readonly maxStored = 200;

  push(
    title: string,
    body: string,
    level: NotificationLevel = 'info',
    agentId?: AgentId,
    action?: Notification['action'],
  ): Notification {
    const notification: Notification = {
      id: crypto.randomUUID(),
      title,
      body,
      level,
      agentId,
      timestamp: new Date(),
      read: false,
      action,
    };

    this.notifications.unshift(notification);
    if (this.notifications.length > this.maxStored) {
      this.notifications.splice(this.maxStored);
    }

    this.handlers.forEach((h) => h(notification));
    this.log.info(`Notification [${level}]: ${title}`);
    return notification;
  }

  onNotification(handler: NotificationHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx !== -1) this.handlers.splice(idx, 1);
    };
  }

  markRead(id: string): void {
    const n = this.notifications.find((n) => n.id === id);
    if (n) n.read = true;
  }

  markAllRead(): void {
    this.notifications.forEach((n) => { n.read = true; });
  }

  getUnread(): Notification[] {
    return this.notifications.filter((n) => !n.read);
  }

  getAll(limit = 50): Notification[] {
    return this.notifications.slice(0, limit);
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  clear(): void {
    this.notifications.splice(0);
  }
}
