// Lightweight, non-interactive "top 5" previews shown inside a DataCard while
// it is collapsed. No search/sort/pagination here by design - that richer
// interaction only exists in the full view once a card is expanded.
import { formatNumber, formatValueWithUnit, formatPercent, formatDuration } from '../utils/format.js';
import { HEALTH_STATUS } from '../utils/sensorHealth.js';

const PREVIEW_COUNT = 5;

const STATUS_CLASS = {
  [HEALTH_STATUS.WORKING]: 'status-working',
  [HEALTH_STATUS.SUSPECT]: 'status-suspect',
  [HEALTH_STATUS.NOT_REPORTING]: 'status-not-reporting',
  [HEALTH_STATUS.UNKNOWN]: 'status-unknown',
};

function topSensors(sensors) {
  return [...sensors].sort((a, b) => (a.tagName || a.name).localeCompare(b.tagName || b.name)).slice(0, PREVIEW_COUNT);
}

export function SensorDataPreview({ sensors, aggregatesBySensorId }) {
  const rows = topSensors(sensors);
  return (
    <table className="preview-table">
      <thead>
        <tr>
          <th>Sensor / Tag</th>
          <th>Description</th>
          <th>Current</th>
          <th>Unit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((sensor) => (
          <tr key={sensor.id}>
            <td className="mono">{sensor.tagName || sensor.name}</td>
            <td>{sensor.description || <span className="text-muted">—</span>}</td>
            <td>{formatNumber(aggregatesBySensorId.get(sensor.id)?.current)}</td>
            <td>{sensor.unit || <span className="text-muted">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SensorHealthPreview({ sensors, healthBySensorId }) {
  const rows = topSensors(sensors);
  return (
    <table className="preview-table">
      <thead>
        <tr>
          <th>Sensor</th>
          <th>Status</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((sensor) => {
          const health = healthBySensorId.get(sensor.id);
          return (
            <tr key={sensor.id}>
              <td className="mono">{sensor.tagName || sensor.name}</td>
              <td>
                <span className={`status-badge ${STATUS_CLASS[health?.status] || ''}`}>{health?.status || 'UNKNOWN'}</span>
              </td>
              <td>{health?.reasons?.join('; ') || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SensorAggregatesPreview({ sensors, aggregatesBySensorId }) {
  const rows = topSensors(sensors);
  return (
    <table className="preview-table">
      <thead>
        <tr>
          <th>Sensor</th>
          <th>Current</th>
          <th>Average</th>
          <th>Min</th>
          <th>Max</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((sensor) => {
          const agg = aggregatesBySensorId.get(sensor.id);
          return (
            <tr key={sensor.id}>
              <td className="mono">{sensor.tagName || sensor.name}</td>
              <td>{formatNumber(agg?.current)}</td>
              <td>{formatNumber(agg?.average)}</td>
              <td>{formatNumber(agg?.minimum)}</td>
              <td>{formatNumber(agg?.maximum)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function kpiPreviewValue(result) {
  if (!result || result.status !== 'ok') return 'N/A';
  if (result.headline?.runtimePercent != null) return formatPercent(result.headline.runtimePercent);
  if (result.headline) return formatValueWithUnit(result.headline.current, result.unit);
  return formatValueWithUnit(result.current, result.unit);
}

function kpiPreviewSecondary(result) {
  if (!result || result.status !== 'ok') return null;
  if (result.headline?.onDuration != null) return `ON ${formatDuration(result.headline.onDuration)}`;
  if (result.headline) return `Avg ${formatNumber(result.headline.average, 1)}`;
  return `Avg ${formatNumber(result.average, 1)}`;
}

export function KpiPreviewList({ kpis }) {
  return (
    <ul className="kpi-preview-list">
      {kpis.map(({ def, result }) => (
        <li key={def.id} className="kpi-preview-item">
          <span className="kpi-preview-label">{def.label}</span>
          <span className="kpi-preview-values">
            <span className="kpi-preview-current">{kpiPreviewValue(result)}</span>
            {kpiPreviewSecondary(result) && <span className="kpi-preview-secondary">{kpiPreviewSecondary(result)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
