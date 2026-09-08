// Single factory/selector for telemetry sources. Every adapter returns the same
// raw shape ([{ raw, sourceInstance, error }]); this module is the only place
// that funnels that raw output through normalizePayload()/mergeSensorSets(), so
// dashboard components and KPI/health/aggregate utilities never know or care
// which adapter produced the data.
//
// Non-secret source selection mirrors what a VITE_DATA_SOURCE=local|s3|sitewise
// build-time env var would drive in a real deployment - see SOURCE_TYPES below.
// No AWS secret credentials are read, stored, or referenced here.

import { normalizePayload, mergeSensorSets } from '../utils/dataNormalizer.js';
import * as localJsonAdapter from './localJsonAdapter.js';
import * as uploadedJsonAdapter from './uploadedJsonAdapter.js';
import * as s3JsonAdapter from './s3JsonAdapter.js';
import * as siteWiseAdapter from './siteWiseAdapter.js';

export const SOURCE_TYPES = {
  LOCAL: 'local-json',
  UPLOADED: 'uploaded-json',
  S3: 's3',
  SITEWISE: 'sitewise',
};

export const SOURCE_LABELS = {
  [SOURCE_TYPES.LOCAL]: 'Local JSON',
  [SOURCE_TYPES.UPLOADED]: 'Uploaded JSON',
  [SOURCE_TYPES.S3]: 'AWS S3',
  [SOURCE_TYPES.SITEWISE]: 'AWS IoT SiteWise',
};

function buildResult(rawEntries, source) {
  const sensorLists = [];
  const fileErrors = [];

  for (const entry of rawEntries) {
    if (entry.error) {
      fileErrors.push({ file: entry.sourceInstance, error: entry.error });
      continue;
    }
    const sensors = normalizePayload(entry.raw, { source, sourceInstance: entry.sourceInstance });
    if (!sensors.length) {
      fileErrors.push({ file: entry.sourceInstance, error: 'No recognizable telemetry (assets/properties) found' });
      continue;
    }
    sensorLists.push(sensors);
  }

  return {
    sensors: mergeSensorSets(sensorLists),
    fileErrors,
    filesLoaded: rawEntries.length - fileErrors.length,
    totalFiles: rawEntries.length,
    source,
    loadedAt: Date.now(),
  };
}

// options: { files } for UPLOADED, adapter-specific config object for S3/SITEWISE.
export async function loadFromSource(sourceType, options = {}) {
  switch (sourceType) {
    case SOURCE_TYPES.LOCAL: {
      const raws = await localJsonAdapter.loadTelemetry();
      return buildResult(raws, SOURCE_TYPES.LOCAL);
    }
    case SOURCE_TYPES.UPLOADED: {
      const raws = await uploadedJsonAdapter.loadTelemetry(options.files);
      return buildResult(raws, SOURCE_TYPES.UPLOADED);
    }
    case SOURCE_TYPES.S3: {
      const raws = await s3JsonAdapter.loadTelemetry(options);
      return buildResult(raws, SOURCE_TYPES.S3);
    }
    case SOURCE_TYPES.SITEWISE: {
      const raws = await siteWiseAdapter.loadTelemetry(options);
      return buildResult(raws, SOURCE_TYPES.SITEWISE);
    }
    default:
      throw new Error(`Unknown telemetry source: ${sourceType}`);
  }
}

// Merges a freshly-loaded batch into an existing sensor set (used when uploaded
// files are added on top of local JSON, or a future source refreshes).
export function mergeIntoExisting(existingSensors, incomingSensors) {
  return mergeSensorSets([existingSensors, incomingSensors]);
}
