import { formatTimestamp } from '../utils/format.js';

const TIME_UNITS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'all', label: 'All Available' },
];

// Hollow (outline) crescent - shown while light mode is active, meaning a
// click will switch TO dark. Filled crescent - shown while dark mode is
// active, meaning a click will switch TO light. Same crescent glyph both
// times, split only by fill/outline so the two states read as a pair.
function CrescentIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? '0' : '1.6'}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DashboardHeader({
  plants,
  selectedPlant,
  onPlantChange,
  timeWindow,
  onTimeWindowChange,
  onRefresh,
  refreshing,
  windowStart,
  windowEnd,
  coverageNote,
  loading,
  errorMessage,
  onOpenAssistant,
  theme,
  onToggleTheme,
}) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-title-row">
        <div>
          <h1 className="dashboard-title">IoT SiteWise monitoring dashboard</h1>
          <p className="dashboard-subtitle">Plant telemetry monitoring &amp; KPI console</p>
        </div>
        <div className="dashboard-title-actions">
          <button
            type="button"
            className="btn btn-secondary btn-theme-toggle"
            onClick={onToggleTheme}
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <CrescentIcon filled={theme === 'dark'} />
          </button>
          <button type="button" className="btn btn-secondary btn-assistant" onClick={onOpenAssistant}>
            <span className="chat-avatar chat-avatar-tiny" aria-hidden="true">P</span>
            Assistant
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="plant-select">Plant</label>
          <select
            id="plant-select"
            value={selectedPlant}
            onChange={(e) => onPlantChange(e.target.value)}
            disabled={!plants.length}
          >
            {plants.length === 0 && <option value="">No plants available</option>}
            {plants.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="time-amount">Time Window</label>
          <div className="time-window-controls">
            <input
              id="time-amount"
              type="number"
              min="1"
              step="1"
              value={timeWindow.amount}
              disabled={timeWindow.unit === 'all'}
              onChange={(e) => onTimeWindowChange({ ...timeWindow, amount: Math.max(1, Number(e.target.value) || 1) })}
            />
            <select
              aria-label="Time unit"
              value={timeWindow.unit}
              onChange={(e) => onTimeWindowChange({ ...timeWindow, unit: e.target.value })}
            >
              {TIME_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-group filter-group-actions">
          <label htmlFor="refresh-btn">&nbsp;</label>
          <div className="action-buttons">
            <button id="refresh-btn" type="button" className="btn btn-primary" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="window-info">
        {loading && <span className="window-info-item">Loading telemetry…</span>}
        {!loading && errorMessage && <span className="window-info-item status-error">{errorMessage}</span>}
        {!loading && !errorMessage && windowStart != null && windowEnd != null && (
          <>
            <span className="window-info-item">
              Effective window: <strong>{formatTimestamp(windowStart)}</strong> → <strong>{formatTimestamp(windowEnd)}</strong>
            </span>
            {coverageNote && <span className="window-info-item window-coverage-note">{coverageNote}</span>}
          </>
        )}
      </div>
    </header>
  );
}
