// Sensor DATA / COMMUNICATION health classification. This does NOT and cannot
// assess physical calibration or mechanical condition - only whether the sensor
// is reporting trustworthy, timely, valid data for the selected period.

import {
  filterSamplesByRange,
  isValidNumeric,
  inferSamplingInterval,
  largestGap,
  observedRange,
  sortSamples,
} from './timeSeries.js';

export const HEALTH_STATUS = {
  WORKING: 'WORKING',
  SUSPECT: 'SUSPECT',
  NOT_REPORTING: 'NOT REPORTING',
  UNKNOWN: 'UNKNOWN',
};

// Configurable constants driving the classification. Kept in one place so
// tuning does not require touching the decision logic below.
export const HEALTH_CONFIG = {
  STALE_INTERVAL_MULTIPLIER: 6, // trailing gap beyond this * expectedInterval => NOT REPORTING
  SUSPECT_GAP_MULTIPLIER: 3, // any gap beyond this * expectedInterval => SUSPECT
  MIN_SAMPLES_FOR_HEALTH: 2, // fewer valid in-window samples => UNKNOWN (insufficient evidence)
  FLATLINE_MIN_SAMPLES: 4,
  FLATLINE_TOLERANCE_RATIO: 0.005, // fraction of configured span treated as "no real movement"
  FLATLINE_FALLBACK_TOLERANCE: 1e-6,
  RANGE_VIOLATION_MIN_COUNT: 2,
  RANGE_VIOLATION_RATIO_THRESHOLD: 0.1,
};

const STATE_LIKE_UNITS = ['state', 'status', 'bool', 'boolean', 'on/off', 'discrete'];
const STATE_LIKE_VARTYPES = ['state', 'status', 'binary', 'discrete', 'digital'];

export function detectBinarySensor(sensor) {
  if (sensor.configuredMin === 0 && sensor.configuredMax === 1) return true;
  const unit = (sensor.unit || '').toLowerCase();
  if (STATE_LIKE_UNITS.some((tok) => unit.includes(tok))) return true;
  const varType = (sensor.variableType || '').toLowerCase();
  if (STATE_LIKE_VARTYPES.some((tok) => varType.includes(tok))) return true;
  const validValues = sensor.samples.filter((s) => isValidNumeric(s.value)).map((s) => s.value);
  if (validValues.length >= 2 && validValues.every((v) => v === 0 || v === 1)) return true;
  return false;
}

function classifyFreshnessAndGaps(validInWindow, windowEnd, allValidSamples) {
  const expectedInterval = inferSamplingInterval(allValidSamples.length >= 2 ? allValidSamples : validInWindow);
  if (!expectedInterval || !Number.isFinite(expectedInterval) || expectedInterval <= 0) {
    return { tier: 'unknown', expectedInterval: null, maxGap: null };
  }
  const maxGap = largestGap(validInWindow, windowEnd);
  if (maxGap == null) return { tier: 'unknown', expectedInterval, maxGap: null };
  if (maxGap > HEALTH_CONFIG.STALE_INTERVAL_MULTIPLIER * expectedInterval) {
    return { tier: 'not-reporting', expectedInterval, maxGap };
  }
  if (maxGap > HEALTH_CONFIG.SUSPECT_GAP_MULTIPLIER * expectedInterval) {
    return { tier: 'suspect', expectedInterval, maxGap };
  }
  return { tier: 'normal', expectedInterval, maxGap };
}

function detectFlatline(sensor, validInWindow) {
  if (validInWindow.length < HEALTH_CONFIG.FLATLINE_MIN_SAMPLES) return false;
  const range = observedRange(validInWindow);
  if (range == null) return false;
  const span =
    sensor.configuredMin != null && sensor.configuredMax != null && sensor.configuredMax > sensor.configuredMin
      ? sensor.configuredMax - sensor.configuredMin
      : null;
  const tolerance = span != null ? span * HEALTH_CONFIG.FLATLINE_TOLERANCE_RATIO : HEALTH_CONFIG.FLATLINE_FALLBACK_TOLERANCE;
  return range <= tolerance;
}

function detectRangeViolations(sensor, validInWindow) {
  const { configuredMin: min, configuredMax: max } = sensor;
  if (min == null || max == null || min >= max) return { violated: false, count: 0, ratio: 0 };
  const violations = validInWindow.filter((s) => s.value < min || s.value > max).length;
  const ratio = validInWindow.length > 0 ? violations / validInWindow.length : 0;
  const violated = violations >= HEALTH_CONFIG.RANGE_VIOLATION_MIN_COUNT && ratio >= HEALTH_CONFIG.RANGE_VIOLATION_RATIO_THRESHOLD;
  return { violated, count: violations, ratio };
}

// Returns { status, reasons: string[], metrics: {...} } for one sensor over the
// selected [windowStart, windowEnd].
export function classifySensorHealth(sensor, windowStart, windowEnd) {
  const windowSamples = sortSamples(filterSamplesByRange(sensor.samples, windowStart, windowEnd));

  if (windowSamples.length === 0) {
    return {
      status: HEALTH_STATUS.NOT_REPORTING,
      reasons: ['No observations in selected period'],
      metrics: { validCount: 0, invalidCount: 0 },
    };
  }

  const validInWindow = windowSamples.filter((s) => isValidNumeric(s.value));
  const invalidCount = windowSamples.length - validInWindow.length;

  if (validInWindow.length === 0) {
    return {
      status: HEALTH_STATUS.NOT_REPORTING,
      reasons: ['Invalid values'],
      metrics: { validCount: 0, invalidCount },
    };
  }

  const gapInfo = classifyFreshnessAndGaps(validInWindow, windowEnd, sensor.samples.filter((s) => isValidNumeric(s.value)));

  if (gapInfo.tier === 'not-reporting') {
    return {
      status: HEALTH_STATUS.NOT_REPORTING,
      reasons: ['Large reporting gaps'],
      metrics: { validCount: validInWindow.length, invalidCount, ...gapInfo },
    };
  }

  if (validInWindow.length < HEALTH_CONFIG.MIN_SAMPLES_FOR_HEALTH) {
    return {
      status: HEALTH_STATUS.UNKNOWN,
      reasons: ['Insufficient observations'],
      metrics: { validCount: validInWindow.length, invalidCount, ...gapInfo },
    };
  }

  const isBinary = detectBinarySensor(sensor);
  const reasons = [];

  if (gapInfo.tier === 'suspect') reasons.push('Large reporting gaps');
  if (!isBinary && detectFlatline(sensor, validInWindow)) reasons.push('Prolonged analog flat-line');
  const rangeCheck = detectRangeViolations(sensor, validInWindow);
  if (rangeCheck.violated) reasons.push('Repeated range violations');
  if (invalidCount > 0) reasons.push('Invalid values');

  if (reasons.length > 0) {
    return {
      status: HEALTH_STATUS.SUSPECT,
      reasons,
      metrics: { validCount: validInWindow.length, invalidCount, ...gapInfo, ...rangeCheck },
    };
  }

  return {
    status: HEALTH_STATUS.WORKING,
    reasons: ['Reporting normally'],
    metrics: { validCount: validInWindow.length, invalidCount, ...gapInfo },
  };
}

export function summarizeHealth(statuses) {
  const counts = { WORKING: 0, SUSPECT: 0, 'NOT REPORTING': 0, UNKNOWN: 0 };
  for (const s of statuses) counts[s] = (counts[s] || 0) + 1;
  const total = statuses.length;
  const healthPercent = total > 0 ? (counts.WORKING / total) * 100 : null;
  return { counts, total, healthPercent };
}
