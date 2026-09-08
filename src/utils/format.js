// Shared display formatting. Keeps number/duration/timestamp presentation
// consistent and out of individual components.

export function formatNumber(value, decimals = 2) {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return 'N/A';
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatValueWithUnit(value, unit, decimals = 2) {
  const formatted = formatNumber(value, decimals);
  if (formatted === 'N/A') return 'N/A';
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatPercent(value, decimals = 1) {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(decimals)}%`;
}

export function formatTimestamp(ms) {
  if (ms == null || Number.isNaN(ms)) return 'N/A';
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return 'N/A';
  const totalSeconds = Math.round(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!days && !hours) parts.push(`${seconds}s`);
  return parts.join(' ') || '0s';
}
