// The single normalization boundary. Every source adapter (local JSON, uploaded
// JSON, and in future S3 / SiteWise / AgentCore Memory) must funnel its raw
// telemetry objects through normalizePayload() so the rest of the app only ever
// deals with the canonical sensor model:
//
// { id, source, sourceInstance, assetId, assetName, plant, name, tagName,
//   description, unit, variableType, configuredMin, configuredMax, sampleCount,
//   samples: [{ timestamp, value }], firstValue, lastValue, isPartialSeries }

import { normalizeTimestamp, isValidNumeric, deduplicateSamples } from './timeSeries.js';
import { resolvePlant } from './plantResolver.js';

function resolveSensorId(propertyRaw, assetId) {
  if (propertyRaw.property_id) return `pid:${propertyRaw.property_id}`;
  if (propertyRaw.tag_name) return `tag:${propertyRaw.tag_name}`;
  if (propertyRaw.name) return `name:${propertyRaw.name}`;
  return `composite:${assetId}:${propertyRaw.description || ''}:${propertyRaw.unit || ''}`;
}

function normalizeSampleValue(raw) {
  if (typeof raw === 'number') return raw;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const num = Number(raw);
    return Number.isNaN(num) ? NaN : num;
  }
  return NaN;
}

// Normalizes ONE raw telemetry payload (matching the assets/properties/sample_data
// shape) into an array of canonical sensor objects. Does not merge across payloads.
export function normalizePayload(raw, meta) {
  const { source, sourceInstance } = meta;
  const sensors = [];
  if (!raw || typeof raw !== 'object' || !raw.assets || typeof raw.assets !== 'object') {
    return sensors;
  }

  for (const [assetId, assetRaw] of Object.entries(raw.assets)) {
    if (!assetRaw || !Array.isArray(assetRaw.properties)) continue;
    const assetName = assetRaw.name || assetId;

    for (const propertyRaw of assetRaw.properties) {
      if (!propertyRaw) continue;
      const plant = resolvePlant({ assetRaw, propertyRaw, assetId, assetName });
      const id = resolveSensorId(propertyRaw, assetId);

      const rawSamples = Array.isArray(propertyRaw.sample_data) ? propertyRaw.sample_data : [];
      const samples = deduplicateSamples(
        rawSamples
          .filter((pair) => Array.isArray(pair) && pair.length >= 2)
          .map(([ts, val]) => ({
            timestamp: normalizeTimestamp(ts),
            value: normalizeSampleValue(val),
          }))
          .filter((s) => Number.isFinite(s.timestamp))
      );

      const declaredSampleCount = isValidNumeric(propertyRaw.sample_count)
        ? propertyRaw.sample_count
        : samples.length;

      sensors.push({
        id,
        source,
        sourceInstance,
        assetId,
        assetName,
        plant,
        name: propertyRaw.name || propertyRaw.tag_name || id,
        tagName: propertyRaw.tag_name || '',
        description: propertyRaw.description || '',
        unit: propertyRaw.unit || '',
        variableType: propertyRaw.variable_type || '',
        configuredMin: isValidNumeric(propertyRaw.min) ? propertyRaw.min : null,
        configuredMax: isValidNumeric(propertyRaw.max) ? propertyRaw.max : null,
        sampleCount: declaredSampleCount,
        samples,
        firstValue: isValidNumeric(propertyRaw.first_value) ? propertyRaw.first_value : samples[0]?.value ?? null,
        lastValue: isValidNumeric(propertyRaw.last_value)
          ? propertyRaw.last_value
          : samples[samples.length - 1]?.value ?? null,
        isPartialSeries: declaredSampleCount > samples.length,
        sources: [sourceInstance],
      });
    }
  }

  return sensors;
}

// Merges multiple canonical-sensor arrays (e.g. one per loaded file) into one
// deduplicated set, combining samples for sensors that share stable identity.
export function mergeSensorSets(sensorLists) {
  const map = new Map();

  for (const list of sensorLists) {
    for (const sensor of list) {
      const existing = map.get(sensor.id);
      if (!existing) {
        map.set(sensor.id, { ...sensor, samples: [...sensor.samples], sources: [...sensor.sources] });
        continue;
      }
      existing.samples = deduplicateSamples([...existing.samples, ...sensor.samples]);
      existing.sampleCount = Math.max(existing.sampleCount, sensor.sampleCount);
      existing.firstValue = existing.samples[0]?.value ?? existing.firstValue;
      existing.lastValue = existing.samples[existing.samples.length - 1]?.value ?? existing.lastValue;
      existing.isPartialSeries = existing.sampleCount > existing.samples.length;
      existing.description = existing.description || sensor.description;
      existing.unit = existing.unit || sensor.unit;
      existing.variableType = existing.variableType || sensor.variableType;
      existing.configuredMin = existing.configuredMin ?? sensor.configuredMin;
      existing.configuredMax = existing.configuredMax ?? sensor.configuredMax;
      existing.tagName = existing.tagName || sensor.tagName;
      for (const src of sensor.sources) {
        if (!existing.sources.includes(src)) existing.sources.push(src);
      }
    }
  }

  return [...map.values()];
}
