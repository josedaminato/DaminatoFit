import { useEffect, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { apiFetch } from '../lib/api';
import { readBearer } from '../lib/auth';
import { money } from '../lib/format';

interface Billing {
  commercialRule: {
    version: number;
    priceCentsPerBillableStudent: number;
    monthlyCapCents: number;
    billableBasis: string;
  };
  referralPolicy: { automaticDiscountsEnabled: boolean; note: string };
  totals: { estimatedMonthlyCents: number; chargedMonthlyCents: number };
  trainers: Array<{
    tenantId: string;
    name: string;
    simulatedBillableStudents: number;
    estimatedMonthlyCents: number;
  }>;
}

export function BillingPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Billing>('/v1/admin/billing/estimates', {}, readBearer())
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Cargando estimaciones…</p>;

  return (
    <div className="stack">
      <header>
        <h1>Finanzas estimadas</h1>
        <p className="muted">
          Simulación con membresías activas. No hay cobros, facturas ni deudas en esta fase.
        </p>
      </header>
      <section className="grid">
        <StatCard
          label="Estimado total del mes"
          value={money(data.totals.estimatedMonthlyCents)}
          nature="estimate"
        />
        <StatCard
          label="Cobrado"
          value={money(data.totals.chargedMonthlyCents)}
          hint="Siempre 0 hasta integrar cobros"
        />
        <StatCard
          label="Regla"
          value={`v${data.commercialRule.version}`}
          hint={`${money(data.commercialRule.priceCentsPerBillableStudent)} / alumno · tope ${money(data.commercialRule.monthlyCapCents)}`}
        />
      </section>
      <section className="panel">
        <h2>Referidos</h2>
        <p>{data.referralPolicy.note}</p>
        <p className="muted">
          Descuentos automáticos:{' '}
          {data.referralPolicy.automaticDiscountsEnabled ? 'sí' : 'deshabilitados'}
        </p>
      </section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Entrenador</th>
              <th>Alumnos simulados</th>
              <th>Estimado</th>
            </tr>
          </thead>
          <tbody>
            {data.trainers.map((row) => (
              <tr key={row.tenantId}>
                <td>{row.name}</td>
                <td>{row.simulatedBillableStudents}</td>
                <td>{money(row.estimatedMonthlyCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
