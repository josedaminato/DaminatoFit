import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';
import { money } from '../lib/format';

interface Config {
  commercial: {
    version: number;
    priceCentsPerBillableStudent: number;
    monthlyCapCents: number;
    billableBasis: string;
    note: string;
  };
  referral: { automaticDiscountsEnabled: boolean; publicCodesEnabled: boolean };
  functional: Record<string, number>;
  security: { mfaEnforced: boolean; mfaRequiredBeforeInternetExposure: boolean };
  infrastructureSecrets: { note: string; exposed: boolean };
}

export function ConfigPage() {
  const [data, setData] = useState<Config | null>(null);
  const [price, setPrice] = useState(200);
  const [cap, setCap] = useState(2000);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const cfg = await apiFetch<Config>('/v1/admin/config', {}, readBearer());
    setData(cfg);
    setPrice(cfg.commercial.priceCentsPerBillableStudent);
    setCap(cfg.commercial.monthlyCapCents);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, []);

  async function save() {
    if (
      !window.confirm('¿Crear una nueva versión de la regla comercial? No aplica retroactivamente.')
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await apiFetch(
        '/v1/admin/config/commercial',
        {
          method: 'POST',
          body: JSON.stringify({
            priceCentsPerBillableStudent: price,
            monthlyCapCents: cap,
            note,
            confirm: true,
          }),
        },
        readBearer(),
      );
      setNote('');
      setMessage('Nueva versión comercial guardada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }

  if (!data && error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Cargando configuración…</p>;

  return (
    <div className="stack">
      <header>
        <h1>Configuración</h1>
        <p className="muted">Los secretos de infraestructura no se muestran ni se editan aquí.</p>
      </header>
      <section className="panel">
        <h2>Comercial (versionado)</h2>
        <p>
          Versión actual v{data.commercial.version}:{' '}
          {money(data.commercial.priceCentsPerBillableStudent)} por alumno simulado, tope{' '}
          {money(data.commercial.monthlyCapCents)}.
        </p>
        <p className="muted">Base: {data.commercial.billableBasis}</p>
        <label>
          Centavos por alumno
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            min={0}
          />
        </label>
        <label>
          Tope mensual (centavos)
          <input
            type="number"
            value={cap}
            onChange={(e) => setCap(Number(e.target.value))}
            min={0}
          />
        </label>
        <label>
          Nota / motivo
          <input value={note} onChange={(e) => setNote(e.target.value)} minLength={3} />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="ok">{message}</p> : null}
        <button type="button" onClick={() => void save()}>
          Guardar nueva versión
        </button>
      </section>
      <section className="panel">
        <h2>Referidos</h2>
        <p>
          Códigos públicos: {data.referral.publicCodesEnabled ? 'sí' : 'no'} · Descuentos
          automáticos: {data.referral.automaticDiscountsEnabled ? 'sí' : 'no'}
        </p>
      </section>
      <section className="panel">
        <h2>Funcional</h2>
        <ul>
          {Object.entries(data.functional).map(([key, value]) => (
            <li key={key}>
              {key}: {value}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>Seguridad</h2>
        <p>MFA forzado: {data.security.mfaEnforced ? 'sí' : 'no'}</p>
        <p className="muted">
          MFA requerido antes de exposición a internet:{' '}
          {data.security.mfaRequiredBeforeInternetExposure ? 'sí' : 'no'}
        </p>
        <p className="muted">{data.infrastructureSecrets.note}</p>
      </section>
    </div>
  );
}
