import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { apiFetch } from './lib/api';
import { authClient, readBearer, writeBearer } from './lib/auth';
import { AuditPage } from './pages/AuditPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { BillingPage } from './pages/BillingPage';
import { ConfigPage } from './pages/ConfigPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { StatsPage } from './pages/StatsPage';
import { StoragePage } from './pages/StoragePage';
import { StudentsPage } from './pages/StudentsPage';
import { TrainerDetailPage } from './pages/TrainerDetailPage';
import { TrainersPage } from './pages/TrainersPage';

interface AdminMe {
  user: { email: string; displayName: string };
  mfa: { enabled: boolean };
}

export default function App() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<AdminMe>('/v1/admin/me', {}, readBearer());
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function signOut() {
    await authClient.signOut();
    writeBearer(null);
    setMe(null);
  }

  if (loading) {
    return <p className="centered muted">Cargando…</p>;
  }

  if (!me) {
    return <LoginPage onSignedIn={() => void refresh()} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout email={me.user.email} onSignOut={() => void signOut()} />}>
          <Route index element={<DashboardPage />} />
          <Route path="trainers" element={<TrainersPage />} />
          <Route path="trainers/:tenantId" element={<TrainerDetailPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="storage" element={<StoragePage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
