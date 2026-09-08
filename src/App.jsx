import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardHeader from './components/DashboardHeader.jsx';
import DataCard from './components/DataCard.jsx';
import SensorDataPanel from './components/SensorDataPanel.jsx';
import SensorHealthPanel from './components/SensorHealthPanel.jsx';
import SensorAggregatesPanel from './components/SensorAggregatesPanel.jsx';
import KpiPanel from './components/KpiPanel.jsx';
import ChatAssistant from './components/ChatAssistant.jsx';
import { SensorDataPreview, SensorHealthPreview, SensorAggregatesPreview, KpiPreviewList } from './components/CardPreviews.jsx';
import { loadFromSource, SOURCE_TYPES } from './data/dataSource.js';
import { computeCommonAggregates } from './utils/aggregates.js';
import { classifySensorHealth, summarizeHealth } from './utils/sensorHealth.js';
import { computeAllKpis } from './utils/kpiDefinitions.js';
import { MS } from './utils/timeSeries.js';
import { formatDuration } from './utils/format.js';

const ALL_PLANTS = '__ALL_PLANTS__';
const UNIT_MS = { minutes: MS.MINUTE, hours: MS.HOUR, days: MS.DAY };
const THEME_STORAGE_KEY = 'iotwise-theme';

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage unavailable (private browsing, etc.) - fall through
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export default function App() {
  const [localResult, setLocalResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPlant, setSelectedPlant] = useState('');
  const [timeWindow, setTimeWindow] = useState({ amount: 1, unit: 'hours' });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable - theme just won't persist across reloads
    }
  }, [theme]);

  const loadLocal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadFromSource(SOURCE_TYPES.LOCAL);
      setLocalResult(result);
    } catch (err) {
      setError(err?.message || 'Failed to load local telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await loadFromSource(SOURCE_TYPES.LOCAL);
      setLocalResult(result);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Failed to refresh telemetry.');
    } finally {
      setRefreshing(false);
    }
  }

  const combinedSensors = useMemo(() => localResult?.sensors || [], [localResult]);

  const plants = useMemo(() => {
    const unique = [...new Set(combinedSensors.map((s) => s.plant))].sort();
    if (unique.length <= 1) return unique.map((p) => ({ value: p, label: p }));
    return [{ value: ALL_PLANTS, label: 'All Plants' }, ...unique.map((p) => ({ value: p, label: p }))];
  }, [combinedSensors]);

  useEffect(() => {
    if (!plants.length) {
      if (selectedPlant !== '') setSelectedPlant('');
      return;
    }
    if (!plants.some((p) => p.value === selectedPlant)) {
      setSelectedPlant(plants[0].value);
    }
  }, [plants, selectedPlant]);

  const plantFilteredSensors = useMemo(() => {
    if (!selectedPlant || selectedPlant === ALL_PLANTS) return combinedSensors;
    return combinedSensors.filter((s) => s.plant === selectedPlant);
  }, [combinedSensors, selectedPlant]);

  const dataBounds = useMemo(() => {
    let min = null;
    let max = null;
    for (const s of plantFilteredSensors) {
      for (const sample of s.samples) {
        if (min == null || sample.timestamp < min) min = sample.timestamp;
        if (max == null || sample.timestamp > max) max = sample.timestamp;
      }
    }
    return { min, max };
  }, [plantFilteredSensors]);

  const windowInfo = useMemo(() => {
    const { min, max } = dataBounds;
    if (min == null || max == null) return { windowStart: null, windowEnd: null, coverageNote: null };
    if (timeWindow.unit === 'all') {
      return { windowStart: min, windowEnd: max, coverageNote: 'Showing all available history for this plant.' };
    }
    const durationMs = timeWindow.amount * (UNIT_MS[timeWindow.unit] || MS.HOUR);
    const requestedStart = max - durationMs;
    const actualStart = Math.max(requestedStart, min);
    const coverageNote =
      requestedStart < min
        ? `Requested ${timeWindow.amount} ${timeWindow.unit} exceeds available history — showing full available coverage of ${formatDuration(max - min)}.`
        : null;
    return { windowStart: actualStart, windowEnd: max, coverageNote };
  }, [dataBounds, timeWindow]);

  const aggregatesBySensorId = useMemo(() => {
    const map = new Map();
    if (windowInfo.windowStart == null) return map;
    for (const sensor of plantFilteredSensors) {
      map.set(sensor.id, computeCommonAggregates(sensor, windowInfo.windowStart, windowInfo.windowEnd));
    }
    return map;
  }, [plantFilteredSensors, windowInfo]);

  const healthBySensorId = useMemo(() => {
    const map = new Map();
    if (windowInfo.windowStart == null) return map;
    for (const sensor of plantFilteredSensors) {
      map.set(sensor.id, classifySensorHealth(sensor, windowInfo.windowStart, windowInfo.windowEnd));
    }
    return map;
  }, [plantFilteredSensors, windowInfo]);

  const healthSummary = useMemo(() => summarizeHealth([...healthBySensorId.values()].map((h) => h.status)), [healthBySensorId]);

  const kpis = useMemo(() => {
    if (windowInfo.windowStart == null) return [];
    return computeAllKpis(plantFilteredSensors, windowInfo.windowStart, windowInfo.windowEnd);
  }, [plantFilteredSensors, windowInfo]);

  const fileWarnings = useMemo(() => {
    if (!localResult?.fileErrors) return [];
    return localResult.fileErrors.map((e) => ({ ...e, source: 'Local JSON' }));
  }, [localResult]);

  return (
    <div className="app-shell">
      <DashboardHeader
        plants={plants}
        selectedPlant={selectedPlant}
        onPlantChange={setSelectedPlant}
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        windowStart={windowInfo.windowStart}
        windowEnd={windowInfo.windowEnd}
        coverageNote={windowInfo.coverageNote}
        loading={loading}
        errorMessage={error}
        onOpenAssistant={() => setAssistantOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      <ChatAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />

      {fileWarnings.length > 0 && (
        <div className="warning-banner" role="alert">
          {fileWarnings.map((w, i) => (
            <div key={i}>
              <strong>{w.source}</strong> — {w.file}: {w.error}
            </div>
          ))}
        </div>
      )}

      {loading && <div className="status-banner">Loading telemetry…</div>}

      {!loading && combinedSensors.length === 0 && !error && (
        <div className="empty-app-state">No telemetry data available. Add a *.json file to the Data directory and click Refresh.</div>
      )}

      {!loading && plantFilteredSensors.length > 0 && windowInfo.windowStart != null && (
        <main className="cards-stack">
          <DataCard
            title="All Sensor Data"
            summary={`${plantFilteredSensors.length} Sensors`}
            previewContent={<SensorDataPreview sensors={plantFilteredSensors} aggregatesBySensorId={aggregatesBySensorId} />}
            fullContent={
              <SensorDataPanel
                sensors={plantFilteredSensors}
                windowStart={windowInfo.windowStart}
                windowEnd={windowInfo.windowEnd}
                aggregatesBySensorId={aggregatesBySensorId}
              />
            }
          />

          <DataCard
            title="Sensor Status"
            summary={healthSummary.healthPercent == null ? 'N/A' : `${healthSummary.healthPercent.toFixed(0)}% Healthy`}
            previewContent={<SensorHealthPreview sensors={plantFilteredSensors} healthBySensorId={healthBySensorId} />}
            fullContent={
              <SensorHealthPanel
                sensors={plantFilteredSensors}
                windowStart={windowInfo.windowStart}
                windowEnd={windowInfo.windowEnd}
                healthBySensorId={healthBySensorId}
              />
            }
          />

          <DataCard
            title="Common Aggregate Values"
            summary={`${plantFilteredSensors.length} Sensors`}
            previewContent={<SensorAggregatesPreview sensors={plantFilteredSensors} aggregatesBySensorId={aggregatesBySensorId} />}
            fullContent={<SensorAggregatesPanel sensors={plantFilteredSensors} aggregatesBySensorId={aggregatesBySensorId} />}
          />

          <DataCard
            title="Top 5 KPI Metrics"
            summary="Kiln Feed · TPP · WHRS Power · Grid Load · HP Steam"
            previewContent={<KpiPreviewList kpis={kpis.slice(0, 5)} />}
            fullContent={
              <KpiPanel kpis={kpis.slice(0, 5)} windowStart={windowInfo.windowStart} windowEnd={windowInfo.windowEnd} aggregatesBySensorId={aggregatesBySensorId} />
            }
          />

          <DataCard
            title="Top 6-10 KPI Metrics"
            summary="LP Steam · Pressures · Gas ΔT · Runtime %"
            previewContent={<KpiPreviewList kpis={kpis.slice(5, 10)} />}
            fullContent={
              <KpiPanel kpis={kpis.slice(5, 10)} windowStart={windowInfo.windowStart} windowEnd={windowInfo.windowEnd} aggregatesBySensorId={aggregatesBySensorId} />
            }
          />
        </main>
      )}
    </div>
  );
}
