const API_BASE = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001/api/v1';

export interface ContentQueueItem {
  id: string;
  clipId: string | null;
  platform: string;
  status: string;
  title: string;
  description: string | null;
  tags: string[];
  scheduledAt: string | null;
  publishedAt: string | null;
  platformUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const contentApi = {
  list: (params?: { platform?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.platform) qs.set('platform', params.platform);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<ContentQueueItem[]>(`/content${qs.size ? `?${qs}` : ''}`);
  },

  cancel: (id: string) => request<ContentQueueItem>(`/content/${id}/cancel`, { method: 'POST' }),

  retry: (id: string) => request<ContentQueueItem>(`/content/${id}/retry`, { method: 'POST' }),

  create: (data: {
    clipId?: string;
    platform: string;
    title: string;
    description?: string;
    tags?: string[];
    scheduledAt?: string;
  }) => request<ContentQueueItem>('/content', { method: 'POST', body: JSON.stringify(data) }),
};
