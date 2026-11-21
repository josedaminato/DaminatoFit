import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';
import { formatBytes, money, statusLabel } from '../lib/format';

interface TrainerRow {
  tenantId: string;
  name: string;
  email: string | null;
  registeredAt: string;
  status: string;
  activeStudents: number;
  membershipsTotal: number;
  routinesCreated: number;
  lastActivityAt: string;
  storageBytes: number;
  estimatedMonthlyCents: number;
}

export function TrainersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<TrainerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      q,
      status,
      page: String(page),
      pageSize: '20',
      sort: 'created_at_desc',
    });
    void apiFetch<{ items: TrainerRow[]; total: number }>(
      `/v1/admin/trainers?${params}`,
      {},
      readBearer(),
    )
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err: Error) => setError(err.message));
  }, [q, status, page]);

  return (
    <div className="stack">
      <header>
        <h1>Entrenadores</h1>
        <p className="muted">Marca DaminatoFit únicamente.</p>
      </header>
      <div className="toolbar">
        <input
          placeholder="Buscar nombre o correo"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="paused">Suspendidos</option>
          <option value="archived">Archivados</option>
        </select>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {items.length === 0 ? (
        <p className="muted">No hay entrenadores para este filtro.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Estado</th>
                <th>Alumnos activos</th>
                <th>Membresías</th>
                <th>Rutinas</th>
                <th>Última actividad</th>
                <th>Almacenamiento</th>
                <th>Estimado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.tenantId}>
                  <td>
                    <Link to={`/trainers/${row.tenantId}`}>{row.name}</Link>
                  </td>
                  <td>{row.email ?? '—'}</td>
                  <td>{statusLabel(row.status)}</td>
                  <td>{row.activeStudents}</td>
                  <td>{row.membershipsTotal}</td>
                  <td>{row.routinesCreated}</td>
                  <td>{new Date(row.lastActivityAt).toLocaleString()}</td>
                  <td>{formatBytes(row.storageBytes)}</td>
                  <td>{money(row.estimatedMonthlyCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </button>
        <span>
          Página {page} · {total} resultados
        </span>
        <button type="button" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
