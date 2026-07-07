import { randomUUID } from 'crypto';

export function generateId(): string {
  return randomUUID();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number = 1000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let attempt = 0;

    const execute = async (): Promise<void> => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          reject(error);
          return;
        }
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await sleep(delay);
        return execute();
      }
    };

    void execute();
  });
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [h > 0 ? String(h).padStart(2, '0') : null, String(m).padStart(2, '0'), String(s).padStart(2, '0')].filter(Boolean);
  return parts.join(':');
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 255);
}

export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  intervalMs: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>): void => {
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      fn(...args);
    }
  };
}

export function createLogger(component: string): Logger {
  return new Logger(component);
}

export class Logger {
  constructor(private readonly component: string) {}

  private format(level: string, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const base = `[${timestamp}] [${level.toUpperCase()}] [${this.component}] ${message}`;
    return meta ? `${base} ${JSON.stringify(meta)}` : base;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env['LOG_LEVEL'] === 'debug') {
      console.warn(this.format('debug', message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.format('info', message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.format('warn', message, meta));
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorInfo = error instanceof Error ? { message: error.message, stack: error.stack } : { value: String(error) };
    console.error(this.format('error', message, { ...meta, error: errorInfo }));
  }
}
