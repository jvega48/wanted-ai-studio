import { api } from './client.js';

export interface StreamSession {
  id: string;
  title: string;
  description: string;
  status: string;
  platforms: string[];
  viewerPeak: number;
  viewerAverage: number;
  chatMessages: number;
  donationAmount: number;
  clipCount: number;
  startedAt: string | null;
  endedAt: string | null;
  gameTitle: string | null;
  tags: string[];
  createdAt: string;
}

export const streamApi = {
  sessions: (params?: { limit?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    return api.get<StreamSession[]>(`/stream/sessions?${qs}`);
  },
  session: (id: string) => api.get<StreamSession>(`/stream/sessions/${id}`),
  live: () => api.get<StreamSession[]>('/stream/live'),
  start: (body: { title: string; platforms: string[]; gameTitle?: string; tags?: string[] }) =>
    api.post<StreamSession>('/stream/start', body),
  stop: (sessionId: string) => api.post<StreamSession>('/stream/end', { sessionId }),
  end: (sessionId: string) => api.post<StreamSession>('/stream/end', { sessionId }),
};
