import { useEffect, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';
import { formatBytes, money } from '../lib/format';

interface Dashboard {
  trainers: {
    total: number;
    active: number;
    paused: number;
    archived: number;
    new_7d: number;
    new_30d: number;
  };
  students: {
    unique_students: number;
    memberships_active: number;
    memberships_inactive: number;
  };
  activity: {
    routines_created: number;
    routines_assigned: number;
    sessions_completed: number;
    sessions_abandoned: number;
    trainers_recent_activity: number;
  };
  resources: {
    videoCount: number;
    logoCount: number;
    storageBytesLogical: number;
  };
  business: {
    potentiallyBillableTrainers: number;
    estimatedMonthlyCents: number;
  };
}

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Dashboard>('/v1/admin/dashboard', {}, readBearer())
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Cargando resumen…</p>;

  return (
    <div className="stack">
      <header>
        <h1>Resumen</h1>
        <p className="muted">Solo DaminatoFit. PupiApp queda fuera de estos totales comerciales.</p>
      </header>
      <section className="grid">
        <StatCard label="Entrenadores" value={data.trainers.total} />
        <StatCard label="Activos" value={data.trainers.active} />
        <StatCard label="Suspendidos" value={data.trainers.paused} />
        <StatCard label="Archivados" value={data.trainers.archived} />
        <StatCard label="Nuevos 7 días" value={data.trainers.new_7d} />
        <StatCard label="Nuevos 30 días" value={data.trainers.new_30d} />
      </section>
      <section className="grid">
        <StatCard label="Alumnos únicos" value={data.students.unique_students} />
        <StatCard label="Membresías activas" value={data.students.memberships_active} />
        <StatCard label="Membresías inactivas" value={data.students.memberships_inactive} />
        <StatCard label="Sesiones completadas" value={data.activity.sessions_completed} />
        <StatCard label="Sesiones abandonadas" value={data.activity.sessions_abandoned} />
        <StatCard label="Rutinas creadas" value={data.activity.routines_created} />
      </section>
      <section className="grid">
        <StatCard label="Videos listos" value={data.resources.videoCount} />
        <StatCard label="Logotipos" value={data.resources.logoCount} />
        <StatCard label="Almacenamiento" value={formatBytes(data.resources.storageBytesLogical)} />
        <StatCard
          label="Ingreso mensual estimado"
          value={money(data.business.estimatedMonthlyCents)}
          nature="estimate"
          hint={`${data.business.potentiallyBillableTrainers} entrenadores con estimación > 0`}
        />
      </section>
    </div>
  );
}
