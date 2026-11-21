export function StatCard({
  label,
  value,
  hint,
  nature = 'real',
}: {
  label: string;
  value: string | number;
  hint?: string;
  nature?: 'real' | 'estimate' | 'unavailable';
}) {
  return (
    <article className={`stat-card nature-${nature}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint ? <p className="muted">{hint}</p> : null}
      {nature === 'estimate' ? <p className="badge">Estimado · no cobrado</p> : null}
      {nature === 'unavailable' ? <p className="badge">No disponible</p> : null}
    </article>
  );
}
