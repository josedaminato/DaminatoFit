import { useEffect, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';

interface Summary {
  uniqueStudents: number;
  membershipsTotal: number;
  membershipsActive: number;
  membershipsInactive: number;
  multiTrainerStudents: number;
  billableNote: string;
  definitions: Record<string, string>;
}

export function StudentsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Summary>('/v1/admin/students/summary', {}, readBearer())
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Cargando alumnos…</p>;

  return (
    <div className="stack">
      <header>
        <h1>Alumnos y membresías</h1>
        <p className="muted">{data.billableNote}</p>
      </header>
      <section className="grid">
        <StatCard label="Usuarios únicos" value={data.uniqueStudents} />
        <StatCard label="Membresías totales" value={data.membershipsTotal} />
        <StatCard label="Membresías activas" value={data.membershipsActive} />
        <StatCard label="Membresías inactivas" value={data.membershipsInactive} />
        <StatCard label="Con varios entrenadores" value={data.multiTrainerStudents} />
      </section>
      <section className="panel">
        <h2>Definiciones</h2>
        <ul>
          {Object.entries(data.definitions).map(([key, value]) => (
            <li key={key}>
              <strong>{key}</strong>: {value}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
