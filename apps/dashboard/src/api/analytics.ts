const API_BASE = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001/api/v1';

export interface AnalyticsSummary {
  sessionId: string;
  title: string;
  duration: number;
  viewerPeak: number;
  viewerAvg: number;
  chatTotal: number;
  chatRate: number;
  clipsCreated: number;
  clipApprovalRate: number;
  subscribersGained: number;
  donationsTotal: number;
  donationCount: number;
  bitsTotal: number;
  platforms: string[];
  gameTitle: string | null;
  viewerTimeSeries: Array<{ timestamp: string; viewers: number }>;
}

export interface ComparisonReport {
  sessionIds: string[];
  metrics: Array<{
    metric: string;
    values: number[];
    winner: number;
    improvement: number;
  }>;
  insights: string[];
  recommendations: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const analyticsApi = {
  session: (sessionId: string) => request<AnalyticsSummary>(`/analytics/session/${sessionId}`),

  compare: (sessionIds: string[]) =>
    request<ComparisonReport>('/analytics/compare', {
      method: 'POST',
      body: JSON.stringify({ sessionIds }),
    }),

  trends: () => request<{ metric: string; trend: number; label: string }[]>('/analytics/trends'),
};
