import { useEffect, useState } from 'react';
import { SimpleBars } from '../components/SimpleBars';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';

interface Stats {
  snapshots: { available: boolean; note: string };
  live: {
    newTrainersByMonth: Array<{ bucket: string; count: number }>;
    newMembershipsByMonth: Array<{ bucket: string; count: number }>;
    completedSessionsByMonth: Array<{ bucket: string; count: number }>;
  };
}

export function StatsPage() {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Stats>(`/v1/admin/stats?period=${period}`, {}, readBearer())
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [period]);

  return (
    <div className="stack">
      <header>
        <h1>Estadísticas</h1>
        <p className="muted">Zona horaria UTC. Sin cifras inventadas.</p>
      </header>
      <select value={period} onChange={(e) => setPeriod(e.target.value)}>
        <option value="7d">Últimos 7 días</option>
        <option value="30d">Últimos 30 días</option>
        <option value="90d">Últimos 90 días</option>
        <option value="12m">Últimos 12 meses</option>
      </select>
      {error ? <p className="error">{error}</p> : null}
      {data ? (
        <>
          <p className="muted">{data.snapshots.note}</p>
          <SimpleBars
            title="Nuevos entrenadores por mes"
            points={data.live.newTrainersByMonth.map((p) => ({
              label: p.bucket,
              value: p.count,
            }))}
          />
          <SimpleBars
            title="Nuevas membresías por mes"
            points={data.live.newMembershipsByMonth.map((p) => ({
              label: p.bucket,
              value: p.count,
            }))}
          />
          <SimpleBars
            title="Sesiones completadas por mes"
            points={data.live.completedSessionsByMonth.map((p) => ({
              label: p.bucket,
              value: p.count,
            }))}
          />
        </>
      ) : (
        <p className="muted">Cargando…</p>
      )}
    </div>
  );
}
