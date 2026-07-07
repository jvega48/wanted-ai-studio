import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { AgentsPage } from './pages/AgentsPage.js';
import { StreamPage } from './pages/StreamPage.js';
import { ClipsPage } from './pages/ClipsPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { ContentPage } from './pages/ContentPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { useWebSocket } from './hooks/useWebSocket.js';

export function App(): React.ReactElement {
  useWebSocket();

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/stream" element={<StreamPage />} />
        <Route path="/clips" element={<ClipsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/content" element={<ContentPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
