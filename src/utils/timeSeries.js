// Centralized time-series / statistical math shared by aggregates, KPI calculations
// and sensor health logic. No component or adapter should reimplement this math.

const MS_PER_HOUR = 3_600_000;

// Normalizes a raw timestamp (Unix seconds, Unix milliseconds, or ISO string) into
// a consistent milliseconds-since-epoch number. Returns NaN when it can't be parsed.
export function normalizeTimestamp(raw) {
  if (raw == null) return NaN;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return NaN;
    // 10-digit epoch seconds are ~1.7e9; 13-digit epoch ms are ~1.7e12.
    return raw >= 1e11 ? raw : raw * 1000;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return normalizeTimestamp(Number(trimmed));
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? NaN : parsed;
  }
  return NaN;
}

export function isValidNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function sortSamples(samples) {
  return [...samples].sort((a, b) => a.timestamp - b.timestamp);
}

export function deduplicateSamples(samples) {
  const seen = new Set();
  const out = [];
  for (const s of sortSamples(samples)) {
    const key = `${s.timestamp}|${s.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function filterSamplesByRange(samples, windowStart, windowEnd) {
  return samples.filter((s) => s.timestamp >= windowStart && s.timestamp <= windowEnd);
}

export function getLatest(samples) {
  if (!samples.length) return null;
  return samples[samples.length - 1];
}

export function getLatestValid(samples) {
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    if (isValidNumeric(samples[i].value)) return samples[i];
  }
  return null;
}

export function minimum(samples) {
  const valid = samples.filter((s) => isValidNumeric(s.value));
  if (!valid.length) return null;
  return valid.reduce((min, s) => (s.value < min ? s.value : min), valid[0].value);
}

export function maximum(samples) {
  const valid = samples.filter((s) => isValidNumeric(s.value));
  if (!valid.length) return null;
  return valid.reduce((max, s) => (s.value > max ? s.value : max), valid[0].value);
}

export function median(samples) {
  const values = samples.filter((s) => isValidNumeric(s.value)).map((s) => s.value).sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

export function arithmeticMean(samples) {
  const values = samples.filter((s) => isValidNumeric(s.value)).map((s) => s.value);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function populationStandardDeviation(samples) {
  const values = samples.filter((s) => isValidNumeric(s.value)).map((s) => s.value);
  if (!values.length) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function observedRange(samples) {
  const min = minimum(samples);
  const max = maximum(samples);
  if (min == null || max == null) return null;
  return max - min;
}

// Timestamp-aware average: trapezoidal time weighting for 2+ points, the raw value
// for a single point, null for zero points.
export function timeWeightedAverage(samples) {
  const valid = samples.filter((s) => isValidNumeric(s.value));
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0].value;
  let areaSum = 0;
  let totalTime = 0;
  for (let i = 0; i < valid.length - 1; i += 1) {
    const a = valid[i];
    const b = valid[i + 1];
    const dt = b.timestamp - a.timestamp;
    if (dt <= 0) continue;
    areaSum += ((a.value + b.value) / 2) * dt;
    totalTime += dt;
  }
  if (totalTime === 0) return valid[valid.length - 1].value;
  return areaSum / totalTime;
}

// Trapezoidal integral of value-over-time, expressed in value-units * hours.
// Used for TPH -> tonnes and MW -> MWh totals.
export function trapezoidalIntegral(samples) {
  const valid = samples.filter((s) => isValidNumeric(s.value));
  if (valid.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < valid.length - 1; i += 1) {
    const a = valid[i];
    const b = valid[i + 1];
    const deltaHours = (b.timestamp - a.timestamp) / MS_PER_HOUR;
    if (deltaHours <= 0) continue;
    total += ((a.value + b.value) / 2) * deltaHours;
  }
  return total;
}

// Duration (ms) where the segment-average value falls outside [min, max].
export function computeOutOfRangeDuration(samples, min, max) {
  const valid = samples.filter((s) => isValidNumeric(s.value));
  if (valid.length < 2 || min == null || max == null || min >= max) return null;
  let duration = 0;
  for (let i = 0; i < valid.length - 1; i += 1) {
    const a = valid[i];
    const b = valid[i + 1];
    const dt = b.timestamp - a.timestamp;
    if (dt <= 0) continue;
    const segAvg = (a.value + b.value) / 2;
    if (segAvg < min || segAvg > max) duration += dt;
  }
  return duration;
}

// Median of positive consecutive timestamp differences - the sensor's expected
// reporting cadence, used for freshness / gap analysis.
export function inferSamplingInterval(samples) {
  const sorted = sortSamples(samples);
  const diffs = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const d = sorted[i + 1].timestamp - sorted[i].timestamp;
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 === 0 ? (diffs[mid - 1] + diffs[mid]) / 2 : diffs[mid];
}

// Largest gap between consecutive valid samples, optionally including a virtual
// trailing checkpoint (e.g. the selected window's end) to detect trailing staleness.
export function largestGap(samples, trailingCheckpoint) {
  const valid = sortSamples(samples.filter((s) => isValidNumeric(s.value)));
  if (!valid.length) return null;
  let max = 0;
  for (let i = 0; i < valid.length - 1; i += 1) {
    const gap = valid[i + 1].timestamp - valid[i].timestamp;
    if (gap > max) max = gap;
  }
  if (trailingCheckpoint != null) {
    const trailing = trailingCheckpoint - valid[valid.length - 1].timestamp;
    if (trailing > max) max = trailing;
  }
  return max;
}

// Interprets a 0/1 (or other 2-state) series as ON/OFF segments clipped to
// [windowStart, windowEnd]. The last known state before/at windowStart is assumed
// to persist from windowStart; the last known state in-window is assumed to
// persist through windowEnd (no fabricated data, just state-hold semantics).
export function calculateStateTransitions(samples, windowStart, windowEnd, onValue = 1) {
  const valid = sortSamples(samples.filter((s) => isValidNumeric(s.value)));
  const inOrBefore = valid.filter((s) => s.timestamp <= windowEnd);
  if (!inOrBefore.length) return { segments: [], starts: 0, stops: 0 };

  const segments = [];
  let starts = 0;
  let stops = 0;

  // Find the anchor sample: last sample at/before windowStart, else the first
  // in-window sample (we cannot know the state before data begins).
  let anchorIdx = -1;
  for (let i = 0; i < inOrBefore.length; i += 1) {
    if (inOrBefore[i].timestamp <= windowStart) anchorIdx = i;
    else break;
  }
  const relevant = anchorIdx >= 0 ? inOrBefore.slice(anchorIdx) : inOrBefore;

  for (let i = 0; i < relevant.length; i += 1) {
    const cur = relevant[i];
    const segStart = Math.max(cur.timestamp, windowStart);
    const next = relevant[i + 1];
    const segEnd = next ? Math.max(Math.min(next.timestamp, windowEnd), segStart) : windowEnd;
    if (segEnd > segStart) {
      segments.push({ value: cur.value, start: segStart, end: segEnd, duration: segEnd - segStart });
    }
    if (next && next.timestamp > windowStart && next.timestamp <= windowEnd) {
      if (cur.value !== onValue && next.value === onValue) starts += 1;
      if (cur.value === onValue && next.value !== onValue) stops += 1;
    }
  }

  return { segments, starts, stops };
}

export function calculateRuntime(samples, windowStart, windowEnd, onValue = 1) {
  const { segments, starts, stops } = calculateStateTransitions(samples, windowStart, windowEnd, onValue);
  if (!segments.length) return null;
  let onDuration = 0;
  let offDuration = 0;
  let longestOff = 0;
  for (const seg of segments) {
    if (seg.value === onValue) {
      onDuration += seg.duration;
    } else {
      offDuration += seg.duration;
      if (seg.duration > longestOff) longestOff = seg.duration;
    }
  }
  const observedDuration = onDuration + offDuration;
  return {
    onDuration,
    offDuration,
    observedDuration,
    longestOffDuration: longestOff,
    startCount: starts,
    stopCount: stops,
    runtimePercent: observedDuration > 0 ? (onDuration / observedDuration) * 100 : null,
    observedStart: segments[0].start,
    observedEnd: segments[segments.length - 1].end,
  };
}

// Nearest-neighbour pairing of two timestamp-sorted sample arrays within a
// tolerance window (ms). Used to align inlet/outlet temperature pairs that may
// not share exact timestamps.
export function pairNearestTimestamps(seriesA, seriesB, toleranceMs) {
  const a = sortSamples(seriesA.filter((s) => isValidNumeric(s.value)));
  const b = sortSamples(seriesB.filter((s) => isValidNumeric(s.value)));
  const pairs = [];
  let bIdx = 0;
  for (const pointA of a) {
    while (bIdx < b.length - 1 && Math.abs(b[bIdx + 1].timestamp - pointA.timestamp) <= Math.abs(b[bIdx].timestamp - pointA.timestamp)) {
      bIdx += 1;
    }
    const candidate = b[bIdx];
    if (candidate && Math.abs(candidate.timestamp - pointA.timestamp) <= toleranceMs) {
      pairs.push({ timestamp: pointA.timestamp, a: pointA.value, b: candidate.value });
    }
  }
  return pairs;
}

export const MS = { HOUR: MS_PER_HOUR, MINUTE: 60_000, DAY: 86_400_000 };
