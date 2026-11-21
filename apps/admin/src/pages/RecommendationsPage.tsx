import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';

interface BrandCount {
  brand: string;
  published: number;
  hiddenByTrainer: number;
  hiddenByModeration: number;
  openReports: number;
}

interface ReportItem {
  id: string;
  recommendationId: string;
  brand: string;
  trainerName: string;
  recommendationName: string;
  destinationUrl: string;
  reason: string;
  details: string;
  status: string;
  moderationHidden: boolean;
}

export function RecommendationsPage() {
  const [brands, setBrands] = useState<BrandCount[]>([]);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [brand, setBrand] = useState<'daminatofit' | 'pupiapp'>('daminatofit');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    void apiFetch<{ brands: BrandCount[] }>('/v1/admin/recommendations/summary', {}, readBearer())
      .then((data) => setBrands(data.brands))
      .catch((error: Error) => setMessage(error.message));
    void apiFetch<{ items: ReportItem[] }>(
      `/v1/admin/recommendations/reports?brand=${brand}`,
      {},
      readBearer(),
    )
      .then((data) => setItems(data.items))
      .catch((error: Error) => setMessage(error.message));
  }

  useEffect(() => {
    load();
  }, [brand]);

  async function moderate(reportId: string, action: 'hide' | 'dismiss') {
    if (!confirm || reason.trim().length < 3) {
      setMessage('Confirmá la acción y escribí un motivo.');
      return;
    }
    try {
      await apiFetch(
        '/v1/admin/recommendations/moderate',
        {
          method: 'POST',
          body: JSON.stringify({ action, reason: reason.trim(), reportId, confirm: true }),
        },
        readBearer(),
      );
      setMessage(action === 'hide' ? 'Contenido oculto.' : 'Denuncia cerrada sin ocultar.');
      setConfirm(false);
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo moderar.');
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>Recomendaciones</h1>
        <p className="muted">
          Supervisión de denuncias. No se editan acuerdos, códigos ni descuentos. DaminatoFit y
          PupiApp se cuentan por separado.
        </p>
      </header>
      <div className="cards">
        {brands.map((row) => (
          <article key={row.brand} className="card">
            <h2>{row.brand === 'daminatofit' ? 'DaminatoFit' : 'PupiApp'}</h2>
            <p>Publicadas: {row.published}</p>
            <p>Ocultas por el entrenador: {row.hiddenByTrainer}</p>
            <p>Ocultas por moderación: {row.hiddenByModeration}</p>
            <p>Denuncias abiertas: {row.openReports}</p>
          </article>
        ))}
      </div>
      <div className="row">
        <button type="button" onClick={() => setBrand('daminatofit')}>
          DaminatoFit
        </button>
        <button type="button" onClick={() => setBrand('pupiapp')}>
          PupiApp
        </button>
      </div>
      <label>
        Motivo de la medida
        <input value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <label>
        <input
          type="checkbox"
          checked={confirm}
          onChange={(event) => setConfirm(event.target.checked)}
        />{' '}
        Confirmo la medida
      </label>
      {message ? <p>{message}</p> : null}
      {items.length === 0 ? (
        <p className="muted">No hay denuncias en esta marca.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Marca</th>
                <th>Entrenador</th>
                <th>Recomendación</th>
                <th>Motivo</th>
                <th>Enlace</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.brand}</td>
                  <td>{item.trainerName}</td>
                  <td>{item.recommendationName}</td>
                  <td>
                    {item.reason}
                    {item.details ? ` · ${item.details}` : ''}
                  </td>
                  <td>{item.destinationUrl}</td>
                  <td>{item.moderationHidden ? 'oculta' : item.status}</td>
                  <td>
                    <button type="button" onClick={() => void moderate(item.id, 'hide')}>
                      Ocultar
                    </button>
                    <button type="button" onClick={() => void moderate(item.id, 'dismiss')}>
                      Cerrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
