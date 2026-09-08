import { useMemo, useState } from 'react';
import { formatNumber } from '../utils/format.js';

const COLUMNS = [
  { key: 'tagName', label: 'Sensor' },
  { key: 'current', label: 'Current' },
  { key: 'average', label: 'Average' },
  { key: 'minimum', label: 'Min' },
  { key: 'maximum', label: 'Max' },
  { key: 'median', label: 'Median' },
  { key: 'standardDeviation', label: 'Std Dev' },
  { key: 'observedRange', label: 'Range' },
  { key: 'firstValue', label: 'First' },
  { key: 'lastValue', label: 'Last' },
  { key: 'sampleCount', label: 'Samples' },
];

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'string') return a.localeCompare(b);
  return a - b;
}

export default function SensorAggregatesPanel({ sensors, aggregatesBySensorId }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('tagName');
  const [sortDir, setSortDir] = useState('asc');

  const rows = useMemo(
    () =>
      sensors.map((sensor) => ({
        sensor,
        agg: aggregatesBySensorId.get(sensor.id) || {},
      })),
    [sensors, aggregatesBySensorId]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(({ sensor }) => `${sensor.tagName} ${sensor.description} ${sensor.name}`.toLowerCase().includes(term));
  }, [rows, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getKey = (row) => (sortKey === 'tagName' ? row.sensor.tagName || row.sensor.name : row.agg[sortKey]);
    return [...filtered].sort((a, b) => dir * compareValues(getKey(a), getKey(b)));
  }, [filtered, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <div>
      <div className="table-toolbar">
        <input
          type="search"
          placeholder="Search sensors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="table-search"
          aria-label="Search aggregate values"
        />
        <span className="table-count">{sorted.length} sensors</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)}>
                  {col.label}
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ sensor, agg }) => (
              <tr key={sensor.id}>
                <td>
                  <div className="mono">{sensor.tagName || sensor.name}</div>
                  <div className="text-muted text-small">{sensor.unit}</div>
                </td>
                <td>{formatNumber(agg.current)}</td>
                <td>{formatNumber(agg.average)}</td>
                <td>{formatNumber(agg.minimum)}</td>
                <td>{formatNumber(agg.maximum)}</td>
                <td>{formatNumber(agg.median)}</td>
                <td>{formatNumber(agg.standardDeviation)}</td>
                <td>{formatNumber(agg.observedRange)}</td>
                <td>{formatNumber(agg.firstValue)}</td>
                <td>{formatNumber(agg.lastValue)}</td>
                <td>{agg.sampleCount ?? 0}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="empty-state">
                  No sensors match the current search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
