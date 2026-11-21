import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';
import { formatBytes, money, statusLabel } from '../lib/format';

interface Detail {
  tenantId: string;
  name: string;
  email: string | null;
  ownerName: string;
  bio: string | null;
  status: string;
  activeStudents: number;
  membershipsTotal: number;
  routinesCreated: number;
  videoCount: number;
  sessionsCompleted: number;
  storageBytes: number;
  storageQuotaBytes: number;
  storagePercent: number;
  estimatedMonthlyCents: number;
  privacyNote: string;
  adminActions: Array<{ id: string; action: string; reason: string | null; createdAt: string }>;
}

export function TrainerDetailPage() {
  const { tenantId = '' } = useParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await apiFetch<Detail>(`/v1/admin/trainers/${tenantId}`, {}, readBearer());
    setDetail(data);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [tenantId]);

  async function changeStatus(status: 'active' | 'paused' | 'archived') {
    if (!reason.trim() || reason.trim().length < 3) {
      setError('Indicá un motivo de al menos 3 caracteres');
      return;
    }
    const label =
      status === 'paused' ? 'suspender' : status === 'archived' ? 'archivar' : 'reactivar';
    if (!window.confirm(`¿Confirmás ${label} este entrenador?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `/v1/admin/trainers/${tenantId}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ status, reason: reason.trim(), confirm: true }),
        },
        readBearer(),
      );
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) return <p className="error">{error}</p>;
  if (!detail) return <p className="muted">Cargando ficha…</p>;

  return (
    <div className="stack">
      <p>
        <Link to="/trainers">← Entrenadores</Link>
      </p>
      <header>
        <h1>{detail.name}</h1>
        <p className="muted">
          {detail.email ?? 'sin correo'} · {detail.ownerName} · {statusLabel(detail.status)}
        </p>
      </header>
      <p className="muted">{detail.privacyNote}</p>
      {detail.bio ? <p>{detail.bio}</p> : null}
      <section className="grid">
        <article className="stat-card">
          <p className="stat-label">Alumnos activos</p>
          <p className="stat-value">{detail.activeStudents}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Membresías</p>
          <p className="stat-value">{detail.membershipsTotal}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Rutinas</p>
          <p className="stat-value">{detail.routinesCreated}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Videos</p>
          <p className="stat-value">{detail.videoCount}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Sesiones completadas</p>
          <p className="stat-value">{detail.sessionsCompleted}</p>
        </article>
        <article className="stat-card nature-estimate">
          <p className="stat-label">Estimado mensual</p>
          <p className="stat-value">{money(detail.estimatedMonthlyCents)}</p>
          <p className="badge">Estimado · no cobrado</p>
        </article>
      </section>
      <section className="panel">
        <h2>Almacenamiento</h2>
        <p>
          {formatBytes(detail.storageBytes)} / {formatBytes(detail.storageQuotaBytes)} (
          {detail.storagePercent}%)
        </p>
      </section>
      <section className="panel">
        <h2>Acciones administrativas</h2>
        <p className="muted">
          Suspender pone el tenant en <code>paused</code> (reversible). Archivar usa{' '}
          <code>archived</code>. No borra historial.
        </p>
        <label>
          Motivo
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void changeStatus('paused')}>
            Suspender
          </button>
          <button type="button" disabled={busy} onClick={() => void changeStatus('active')}>
            Reactivar
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => void changeStatus('archived')}
          >
            Archivar
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Historial administrativo</h2>
        {detail.adminActions.length === 0 ? (
          <p className="muted">Sin acciones registradas.</p>
        ) : (
          <ul>
            {detail.adminActions.map((action) => (
              <li key={action.id}>
                {new Date(action.createdAt).toLocaleString()} · {action.action}
                {action.reason ? ` · ${action.reason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
