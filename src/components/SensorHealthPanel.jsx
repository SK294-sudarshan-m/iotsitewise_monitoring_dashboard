import { useMemo, useState } from 'react';
import { filterSamplesByRange, getLatestValid } from '../utils/timeSeries.js';
import { summarizeHealth, HEALTH_STATUS } from '../utils/sensorHealth.js';
import { formatDuration, formatTimestamp } from '../utils/format.js';

const STATUS_ORDER = [HEALTH_STATUS.WORKING, HEALTH_STATUS.SUSPECT, HEALTH_STATUS.NOT_REPORTING, HEALTH_STATUS.UNKNOWN];

const STATUS_CLASS = {
  [HEALTH_STATUS.WORKING]: 'status-working',
  [HEALTH_STATUS.SUSPECT]: 'status-suspect',
  [HEALTH_STATUS.NOT_REPORTING]: 'status-not-reporting',
  [HEALTH_STATUS.UNKNOWN]: 'status-unknown',
};

export default function SensorHealthPanel({ sensors, windowStart, windowEnd, healthBySensorId }) {
  const [statusFilter, setStatusFilter] = useState('ALL');

  const rows = useMemo(() => {
    return sensors.map((sensor) => {
      const health = healthBySensorId.get(sensor.id) || { status: HEALTH_STATUS.UNKNOWN, reasons: ['Insufficient observations'], metrics: {} };
      const validInWindow = filterSamplesByRange(sensor.samples, windowStart, windowEnd).filter((s) => Number.isFinite(s.value));
      const latest = getLatestValid(validInWindow);
      const freshnessMs = latest ? windowEnd - latest.timestamp : null;
      return { sensor, health, latest, freshnessMs };
    });
  }, [sensors, windowStart, windowEnd, healthBySensorId]);

  const summary = useMemo(() => summarizeHealth(rows.map((r) => r.health.status)), [rows]);

  const filteredRows = statusFilter === 'ALL' ? rows : rows.filter((r) => r.health.status === statusFilter);

  return (
    <div>
      <div className="health-summary">
        <div className="health-percent-block">
          <span className="health-percent-value">{summary.healthPercent == null ? 'N/A' : `${summary.healthPercent.toFixed(1)}%`}</span>
          <span className="health-percent-label">Sensor Health</span>
        </div>
        <div className="health-bar" role="img" aria-label="Sensor health distribution">
          {STATUS_ORDER.map((status) => {
            const count = summary.counts[status] || 0;
            const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
            return pct > 0 ? <div key={status} className={`health-bar-segment ${STATUS_CLASS[status]}`} style={{ width: `${pct}%` }} title={`${status}: ${count}`} /> : null;
          })}
        </div>
        <div className="health-counts">
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              className={`health-count-chip ${STATUS_CLASS[status]} ${statusFilter === status ? 'health-count-chip-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === status ? 'ALL' : status)}
            >
              <span className="dot" /> {status}: {summary.counts[status] || 0}
            </button>
          ))}
          {statusFilter !== 'ALL' && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setStatusFilter('ALL')}>
              Clear filter
            </button>
          )}
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sensor</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Last Observation</th>
              <th>Freshness</th>
              <th>Sample Count</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ sensor, health, latest, freshnessMs }) => (
              <tr key={sensor.id}>
                <td>
                  <div className="mono">{sensor.tagName || sensor.name}</div>
                  <div className="text-muted text-small">{sensor.description}</div>
                </td>
                <td>
                  <span className={`status-badge ${STATUS_CLASS[health.status]}`}>{health.status}</span>
                </td>
                <td>{health.reasons.join('; ')}</td>
                <td>{formatTimestamp(latest?.timestamp)}</td>
                <td>{freshnessMs != null ? formatDuration(freshnessMs) : 'N/A'}</td>
                <td>{health.metrics.validCount ?? 0}</td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No sensors match the selected status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
