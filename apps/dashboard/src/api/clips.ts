const API_BASE = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001/api/v1';

export interface Clip {
  id: string;
  sessionId: string;
  title: string;
  status: string;
  format: string;
  duration: number;
  outputPath: string | null;
  thumbnailUrl: string | null;
  triggerType: string | null;
  triggerScore: number | null;
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

export const clipsApi = {
  list: (params?: { status?: string; sessionId?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.sessionId) qs.set('sessionId', params.sessionId);
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<Clip[]>(`/clips${qs.size ? `?${qs}` : ''}`);
  },

  get: (id: string) => request<Clip>(`/clips/${id}`),

  approve: (id: string) => request<Clip>(`/clips/${id}/approve`, { method: 'POST' }),

  reject: (id: string) => request<Clip>(`/clips/${id}/reject`, { method: 'POST' }),

  delete: (id: string) => request<void>(`/clips/${id}`, { method: 'DELETE' }),
};
