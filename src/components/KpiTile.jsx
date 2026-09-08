import { useState } from 'react';
import Sparkline from './Sparkline.jsx';
import { filterSamplesByRange } from '../utils/timeSeries.js';
import { formatNumber, formatValueWithUnit, formatPercent, formatDuration } from '../utils/format.js';

function ExpandIcon({ expanded }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d={expanded ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandButton({ expanded, onClick }) {
  return (
    <button
      type="button"
      className="kpi-tile-expand-btn"
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse details' : 'Expand details'}
      onClick={onClick}
    >
      <ExpandIcon expanded={expanded} />
    </button>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="kpi-stat">
      <span className="kpi-stat-label">{label}</span>
      <span className="kpi-stat-value">{value}</span>
    </div>
  );
}

function MinimalMetric({ value, caption, size }) {
  return (
    <div className="kpi-minimal-metric">
      <span className={size === 'lg' ? 'kpi-metric-value' : 'kpi-metric-value-sm'}>{value}</span>
      <span className="kpi-metric-caption">{caption}</span>
    </div>
  );
}

const AGGREGATE_FIELDS = [
  ['current', 'Current'],
  ['average', 'Average'],
  ['minimum', 'Minimum'],
  ['maximum', 'Maximum'],
  ['median', 'Median'],
  ['standardDeviation', 'Std Dev'],
  ['observedRange', 'Range'],
  ['firstValue', 'First'],
  ['lastValue', 'Last'],
  ['sampleCount', 'Samples'],
];

function AllMetricsToggle({ aggregate }) {
  const [show, setShow] = useState(false);
  if (!aggregate) return null;
  return (
    <div className="kpi-all-metrics">
      <button type="button" className="kpi-all-metrics-toggle" onClick={() => setShow((v) => !v)}>
        {show ? 'Hide full metric breakdown ▲' : 'Show all 10 metrics ▾'}
      </button>
      {show && (
        <div className="kpi-all-metrics-grid">
          {AGGREGATE_FIELDS.map(([key, label]) => (
            <div key={key} className="kpi-all-metrics-cell">
              <span className="detail-label">{label}</span>
              <span>{key === 'sampleCount' ? aggregate.sampleCount ?? 0 : formatNumber(aggregate[key])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnavailableTile({ def, message }) {
  return (
    <div className="kpi-tile kpi-tile-unavailable">
      <div className="kpi-tile-head">
        <div className="kpi-tile-titles">
          <span className="kpi-tile-label">{def.label}</span>
          <span className="kpi-tile-subtitle">#{def.order}</span>
        </div>
      </div>
      <div className="kpi-unavailable-message">{message || 'N/A'}</div>
    </div>
  );
}

function StandardKpiTile({ def, result, windowStart, windowEnd, aggregate }) {
  const [expanded, setExpanded] = useState(false);
  const isFlow = 'total' in result;
  const sparklineSamples = result.primarySensor ? filterSamplesByRange(result.primarySensor.samples, windowStart, windowEnd) : [];

  return (
    <div className="kpi-tile">
      <div className="kpi-tile-head">
        <div className="kpi-tile-titles">
          <span className="kpi-tile-label">{def.label}</span>
          <span className="kpi-tile-subtitle">{result.unit || `#${def.order}`}</span>
        </div>
        <ExpandButton expanded={expanded} onClick={() => setExpanded((v) => !v)} />
      </div>

      <div className="kpi-tile-minimal">
        <MinimalMetric size="lg" value={formatValueWithUnit(result.current, result.unit)} caption="Current" />
        <MinimalMetric size="sm" value={formatNumber(result.average, 1)} caption="Average" />
      </div>

      {expanded && (
        <div className="kpi-tile-detail">
          <Sparkline samples={sparklineSamples} width={220} height={36} />
          <div className="kpi-tile-stats-row">
            <span>Min {formatNumber(result.minimum, 1)}</span>
            <span>Max {formatNumber(result.maximum, 1)}</span>
            {!isFlow && <span>Std Dev {formatNumber(result.standardDeviation, 2)}</span>}
          </div>
          {isFlow && (
            <div className="kpi-tile-secondary">
              {def.totalLabel}: {formatValueWithUnit(result.total, def.totalUnit, 1)}
            </div>
          )}
          {!isFlow && result.outOfRangePercent != null && (
            <div className="kpi-tile-secondary">Out of range: {formatPercent(result.outOfRangePercent)}</div>
          )}
          <StatRow label="Matched Sensor" value={<span className="mono">{result.primarySensor?.tagName || result.primarySensor?.name}</span>} />
          <StatRow label="Description" value={result.primarySensor?.description || '—'} />
          <StatRow label="Selected-Period Samples" value={result.sampleCount ?? 0} />
          {result.candidates && result.candidates.length > 1 && (
            <div className="kpi-candidates">
              <span className="detail-label">Other matching sensors</span>
              <ul>
                {result.candidates.slice(1).map((c) => (
                  <li key={c.id} className="mono">
                    {c.tagName || c.name} — {c.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <AllMetricsToggle aggregate={aggregate} />
        </div>
      )}
    </div>
  );
}

function TempDropTile({ def, result }) {
  const [expanded, setExpanded] = useState(false);
  const { headline, pathResults } = result;
  return (
    <div className="kpi-tile">
      <div className="kpi-tile-head">
        <div className="kpi-tile-titles">
          <span className="kpi-tile-label">{def.label}</span>
          <span className="kpi-tile-subtitle">{result.unit || `#${def.order}`}</span>
        </div>
        <ExpandButton expanded={expanded} onClick={() => setExpanded((v) => !v)} />
      </div>

      <div className="kpi-tile-minimal">
        <MinimalMetric size="lg" value={formatValueWithUnit(headline.current, result.unit)} caption="Current" />
        <MinimalMetric size="sm" value={formatNumber(headline.average, 1)} caption="Average" />
      </div>

      {expanded && (
        <div className="kpi-tile-detail">
          <div className="kpi-tile-stats-row">
            <span>Min {formatNumber(headline.minimum, 1)}</span>
            <span>Max {formatNumber(headline.maximum, 1)}</span>
          </div>
          <div className="kpi-tile-secondary">
            {pathResults.length} process path{pathResults.length === 1 ? '' : 's'}
          </div>
          {pathResults.map((p) => (
            <div key={p.label} className="kpi-path-row">
              <div className="kpi-path-label">{p.label}</div>
              <div className="kpi-path-stats">
                <span>Current {formatNumber(p.current, 1)}</span>
                <span>Avg {formatNumber(p.average, 1)}</span>
                <span>Min {formatNumber(p.minimum, 1)}</span>
                <span>Max {formatNumber(p.maximum, 1)}</span>
                <span>{p.sampleCount} pts</span>
              </div>
              <div className="text-muted text-small">
                Inlet: <span className="mono">{p.inletSensor.tagName}</span> ({p.inletSensor.description}) — Outlet:{' '}
                <span className="mono">{p.outletSensor.tagName}</span> ({p.outletSensor.description})
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuntimeTile({ def, result }) {
  const [expanded, setExpanded] = useState(false);
  const { headline, equipmentResults } = result;
  return (
    <div className="kpi-tile">
      <div className="kpi-tile-head">
        <div className="kpi-tile-titles">
          <span className="kpi-tile-label">{def.label}</span>
          <span className="kpi-tile-subtitle">#{def.order}</span>
        </div>
        <ExpandButton expanded={expanded} onClick={() => setExpanded((v) => !v)} />
      </div>

      <div className="kpi-tile-minimal">
        <MinimalMetric size="lg" value={formatPercent(headline.runtimePercent)} caption="Runtime %" />
        <MinimalMetric size="sm" value={formatDuration(headline.onDuration)} caption="ON Duration" />
      </div>

      {expanded && (
        <div className="kpi-tile-detail">
          <div className="kpi-tile-stats-row">
            <span>OFF {formatDuration(headline.offDuration)}</span>
            <span>Starts {headline.startCount}</span>
            <span>Stops {headline.stopCount}</span>
          </div>
          <StatRow label="Longest OFF Duration" value={formatDuration(headline.longestOffDuration)} />
          <StatRow label="Observed Duration" value={formatDuration(headline.observedDuration)} />
          <StatRow label="Equipment Count" value={headline.equipmentCount} />
          {equipmentResults.map((eq) => (
            <div key={eq.sensor.id} className="kpi-path-row">
              <div className="kpi-path-label mono">
                {eq.sensor.tagName || eq.sensor.name} — {eq.sensor.description}
              </div>
              <div className="kpi-path-stats">
                <span>Runtime {formatPercent(eq.runtimePercent)}</span>
                <span>ON {formatDuration(eq.onDuration)}</span>
                <span>OFF {formatDuration(eq.offDuration)}</span>
                <span>Starts {eq.startCount}</span>
                <span>Stops {eq.stopCount}</span>
                <span>Longest OFF {formatDuration(eq.longestOffDuration)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KpiTile({ def, result, windowStart, windowEnd, aggregatesBySensorId }) {
  if (!result || result.status !== 'ok') {
    return <UnavailableTile def={def} message={result?.message} />;
  }
  if (def.id === 'whrs-gas-temperature-drop') return <TempDropTile def={def} result={result} />;
  if (def.id === 'equipment-runtime-percent') return <RuntimeTile def={def} result={result} />;
  const aggregate = result.primarySensor ? aggregatesBySensorId?.get(result.primarySensor.id) : null;
  return <StandardKpiTile def={def} result={result} windowStart={windowStart} windowEnd={windowEnd} aggregate={aggregate} />;
}
