import { useEffect, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';
import { formatBytes } from '../lib/format';

interface Storage {
  totals: {
    storageBytesLogical: number;
    storageBytesFromReadyMedia: number;
    videoCount: number;
    logoCount: number;
  };
  trainers: Array<{
    tenantId: string;
    name: string;
    storageBytes: number;
    storageQuotaBytes: number;
    storagePercent: number;
    videoCount: number;
    hasLogo: boolean;
  }>;
  note: string;
}

export function StoragePage() {
  const [data, setData] = useState<Storage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Storage>('/v1/admin/storage', {}, readBearer())
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Cargando almacenamiento…</p>;

  return (
    <div className="stack">
      <header>
        <h1>Almacenamiento</h1>
        <p className="muted">{data.note}</p>
      </header>
      <section className="grid">
        <StatCard label="Uso lógico" value={formatBytes(data.totals.storageBytesLogical)} />
        <StatCard
          label="Suma de medios listos"
          value={formatBytes(data.totals.storageBytesFromReadyMedia)}
        />
        <StatCard label="Videos" value={data.totals.videoCount} />
        <StatCard label="Logotipos" value={data.totals.logoCount} />
      </section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Entrenador</th>
              <th>Uso</th>
              <th>Cuota</th>
              <th>%</th>
              <th>Videos</th>
              <th>Logo</th>
            </tr>
          </thead>
          <tbody>
            {data.trainers.map((row) => (
              <tr key={row.tenantId}>
                <td>{row.name}</td>
                <td>{formatBytes(row.storageBytes)}</td>
                <td>{formatBytes(row.storageQuotaBytes)}</td>
                <td>{row.storagePercent}</td>
                <td>{row.videoCount}</td>
                <td>{row.hasLogo ? 'sí' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
