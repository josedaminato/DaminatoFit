import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';

interface AuditItem {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  reason: string | null;
  createdAt: string;
}

export function AuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [retentionNote, setRetentionNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ items: AuditItem[]; total: number; retentionNote: string }>(
      `/v1/admin/audit?page=${page}&pageSize=30`,
      {},
      readBearer(),
    )
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setRetentionNote(data.retentionNote);
      })
      .catch((err: Error) => setError(err.message));
  }, [page]);

  return (
    <div className="stack">
      <header>
        <h1>Auditoría</h1>
        <p className="muted">{retentionNote || 'Registros append-only.'}</p>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {items.length === 0 ? (
        <p className="muted">Sin eventos todavía.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Recurso</th>
                <th>Resultado</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>{item.action}</td>
                  <td>
                    {item.resourceType}
                    {item.resourceId ? ` · ${item.resourceId.slice(0, 8)}` : ''}
                  </td>
                  <td>{item.result}</td>
                  <td>{item.reason ?? '—'}</td>
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
          Página {page} · {total} eventos
        </span>
        <button type="button" disabled={page * 30 >= total} onClick={() => setPage((p) => p + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
