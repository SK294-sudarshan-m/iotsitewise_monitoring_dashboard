import KpiTile from './KpiTile.jsx';

export default function KpiPanel({ kpis, windowStart, windowEnd, aggregatesBySensorId }) {
  return (
    <div className="kpi-grid">
      {kpis.map(({ def, result }) => (
        <KpiTile
          key={def.id}
          def={def}
          result={result}
          windowStart={windowStart}
          windowEnd={windowEnd}
          aggregatesBySensorId={aggregatesBySensorId}
        />
      ))}
    </div>
  );
}
