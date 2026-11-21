export function SimpleBars({
  title,
  points,
  emptyLabel = 'Sin datos en este período',
}: {
  title: string;
  points: Array<{ label: string; value: number }>;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <section className="panel">
      <h2>{title}</h2>
      {points.length === 0 ? (
        <p className="muted">{emptyLabel}</p>
      ) : (
        <div className="bars" role="img" aria-label={title}>
          {points.map((point) => (
            <div key={point.label} className="bar-row">
              <span>{point.label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(point.value / max) * 100}%` }} />
              </div>
              <strong>{point.value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
