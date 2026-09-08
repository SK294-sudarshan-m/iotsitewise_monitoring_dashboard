import { Fragment, useMemo, useState } from 'react';
import Sparkline from './Sparkline.jsx';
import { filterSamplesByRange, getLatestValid } from '../utils/timeSeries.js';
import { formatNumber, formatTimestamp } from '../utils/format.js';

const PAGE_SIZES = [10, 25, 50, 100];

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'string') return a.localeCompare(b);
  return a - b;
}

export default function SensorDataPanel({ sensors, windowStart, windowEnd, aggregatesBySensorId }) {
  const [search, setSearch] = useState('');
  const [variableTypeFilter, setVariableTypeFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState('tagName');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedId, setExpandedId] = useState(null);

  const variableTypes = useMemo(() => {
    const set = new Set(sensors.map((s) => s.variableType).filter(Boolean));
    return ['ALL', ...[...set].sort()];
  }, [sensors]);

  const rows = useMemo(() => {
    return sensors.map((sensor) => {
      const windowedValid = filterSamplesByRange(sensor.samples, windowStart, windowEnd).filter((s) => Number.isFinite(s.value));
      const latest = getLatestValid(windowedValid);
      const agg = aggregatesBySensorId.get(sensor.id);
      return {
        sensor,
        windowedValid,
        lastTimestamp: latest ? latest.timestamp : null,
        current: agg ? agg.current : null,
      };
    });
  }, [sensors, windowStart, windowEnd, aggregatesBySensorId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(({ sensor }) => {
      if (variableTypeFilter !== 'ALL' && sensor.variableType !== variableTypeFilter) return false;
      if (!term) return true;
      const haystack = `${sensor.tagName} ${sensor.description} ${sensor.name} ${sensor.assetName}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search, variableTypeFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getKey = (row) => {
      switch (sortKey) {
        case 'tagName':
          return row.sensor.tagName || row.sensor.name;
        case 'description':
          return row.sensor.description;
        case 'assetName':
          return row.sensor.assetName;
        case 'variableType':
          return row.sensor.variableType;
        case 'unit':
          return row.sensor.unit;
        case 'current':
          return row.current;
        case 'lastTimestamp':
          return row.lastTimestamp;
        case 'configuredMin':
          return row.sensor.configuredMin;
        case 'configuredMax':
          return row.sensor.configuredMax;
        default:
          return row.sensor.tagName;
      }
    };
    return [...filtered].sort((a, b) => dir * compareValues(getKey(a), getKey(b)));
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  function sortIndicator(key) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  return (
    <div>
      <div className="table-toolbar">
        <input
          type="search"
          placeholder="Search tag, description, asset…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="table-search"
          aria-label="Search sensors"
        />
        <select
          aria-label="Filter by variable type"
          value={variableTypeFilter}
          onChange={(e) => {
            setVariableTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          {variableTypes.map((vt) => (
            <option key={vt} value={vt}>
              {vt === 'ALL' ? 'All Variable Types' : vt}
            </option>
          ))}
        </select>
        <span className="table-count">{sorted.length} sensors</span>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th onClick={() => handleSort('tagName')}>Sensor / Tag{sortIndicator('tagName')}</th>
              <th onClick={() => handleSort('description')}>Description{sortIndicator('description')}</th>
              <th onClick={() => handleSort('assetName')}>Asset / Group{sortIndicator('assetName')}</th>
              <th onClick={() => handleSort('variableType')}>Variable Type{sortIndicator('variableType')}</th>
              <th onClick={() => handleSort('unit')}>Unit{sortIndicator('unit')}</th>
              <th onClick={() => handleSort('current')}>Current{sortIndicator('current')}</th>
              <th onClick={() => handleSort('lastTimestamp')}>Last Timestamp{sortIndicator('lastTimestamp')}</th>
              <th onClick={() => handleSort('configuredMin')}>Min{sortIndicator('configuredMin')}</th>
              <th onClick={() => handleSort('configuredMax')}>Max{sortIndicator('configuredMax')}</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ sensor, windowedValid, current, lastTimestamp }) => {
              const isExpanded = expandedId === sensor.id;
              return (
                <Fragment key={sensor.id}>
                  <tr
                    className="clickable-row"
                    onClick={() => setExpandedId(isExpanded ? null : sensor.id)}
                  >
                    <td>
                      <span className={`row-caret ${isExpanded ? 'row-caret-open' : ''}`} aria-hidden="true">
                        ▸
                      </span>
                    </td>
                    <td className="mono">{sensor.tagName || sensor.name}</td>
                    <td>{sensor.description || <span className="text-muted">—</span>}</td>
                    <td>{sensor.assetName}</td>
                    <td>{sensor.variableType || <span className="text-muted">—</span>}</td>
                    <td>{sensor.unit || <span className="text-muted">—</span>}</td>
                    <td>{formatNumber(current)}</td>
                    <td>{formatTimestamp(lastTimestamp)}</td>
                    <td>{sensor.configuredMin ?? <span className="text-muted">—</span>}</td>
                    <td>{sensor.configuredMax ?? <span className="text-muted">—</span>}</td>
                    <td>
                      <Sparkline samples={windowedValid} />
                      {sensor.isPartialSeries && <span className="chip chip-neutral">Partial Data</span>}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="detail-row">
                      <td colSpan={11}>
                        <div className="detail-grid">
                          <div>
                            <span className="detail-label">Source</span>
                            <span>{sensor.source} ({sensor.sourceInstance})</span>
                          </div>
                          <div>
                            <span className="detail-label">Property / Tag Name</span>
                            <span className="mono">{sensor.name}</span>
                          </div>
                          <div>
                            <span className="detail-label">Loaded Samples</span>
                            <span>
                              {sensor.samples.length} of {sensor.sampleCount} declared
                              {sensor.isPartialSeries && <span className="chip chip-neutral">Partial Data</span>}
                            </span>
                          </div>
                          <div>
                            <span className="detail-label">Selected-Period Samples</span>
                            <span>{windowedValid.length}</span>
                          </div>
                          <div>
                            <span className="detail-label">First Loaded Timestamp</span>
                            <span>{formatTimestamp(sensor.samples[0]?.timestamp)}</span>
                          </div>
                          <div>
                            <span className="detail-label">Last Loaded Timestamp</span>
                            <span>{formatTimestamp(sensor.samples[sensor.samples.length - 1]?.timestamp)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={11} className="empty-state">
                  No sensors match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <label>
          Page size
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="pagination-controls">
          <button type="button" className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
