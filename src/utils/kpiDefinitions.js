// Centralized Top-10 KPI registry: semantic sensor matching + calculation.
// Names and order come from "Important KPI and Metrics -- Top 10 Metrics.xlsx"
// (inspected at Data/Important_KPI_and_Metrics.xlsx; the workbook is never
// parsed at runtime). No PropertyID/UUID is ever hard-coded here - matching is
// purely semantic (description / tag name / unit / variable type text).

import {
  filterSamplesByRange,
  isValidNumeric,
  getLatestValid,
  minimum,
  maximum,
  timeWeightedAverage,
  populationStandardDeviation,
  trapezoidalIntegral,
  computeOutOfRangeDuration,
  inferSamplingInterval,
  pairNearestTimestamps,
  calculateRuntime,
} from './timeSeries.js';
import { detectBinarySensor } from './sensorHealth.js';

function normalizeText(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const COMBINED_TOKENS = ['total', 'combined', 'comp', 'cmp', 'inclusive', 'incl', 'aggregate'];

// Scores how well one sensor matches a KPI's semantic spec. Returns null when
// the sensor is disqualified (a required concept is entirely absent).
function scoreSensor(sensor, matchSpec) {
  const desc = normalizeText(sensor.description);
  const tag = normalizeText(sensor.tagName);
  const name = normalizeText(sensor.name);
  const unit = normalizeText(sensor.unit);
  const varType = normalizeText(sensor.variableType);

  for (const group of matchSpec.requiredGroups) {
    const hit = group.some((tok) => desc.includes(tok) || tag.includes(tok) || name.includes(tok));
    if (!hit) return null;
  }
  for (const tok of matchSpec.excludeTokens || []) {
    if (desc.includes(tok) || tag.includes(tok)) return null;
  }

  let score = 0;
  for (const group of matchSpec.requiredGroups) {
    for (const tok of group) {
      if (desc.includes(tok)) score += 3;
      if (tag.includes(tok)) score += 2;
      if (name.includes(tok)) score += 1;
    }
  }
  for (const tok of matchSpec.boostTokens || []) {
    if (desc.includes(tok)) score += 3;
    if (tag.includes(tok)) score += 2;
  }
  if (matchSpec.preferredUnitTokens?.some((u) => unit.includes(u))) score += 4;
  if (matchSpec.preferredVarTypeTokens?.some((v) => varType.includes(v))) score += 2;
  for (const tok of COMBINED_TOKENS) {
    if (desc.includes(tok)) score += 5;
    if (tag.includes(tok)) score += 4;
  }
  return score;
}

function rankCandidates(sensors, matchSpec) {
  return sensors
    .map((sensor) => ({ sensor, score: scoreSensor(sensor, matchSpec) }))
    .filter((c) => c.score != null)
    .sort((a, b) => b.score - a.score);
}

function windowedValid(sensor, windowStart, windowEnd) {
  return filterSamplesByRange(sensor.samples, windowStart, windowEnd).filter((s) => isValidNumeric(s.value));
}

// Standard shape for flow/power KPIs: current/average/min/max plus a totalized
// (time-integrated) headline number, backed by the single best-matching sensor.
function buildFlowResult(sensors, matchSpec, windowStart, windowEnd) {
  const ranked = rankCandidates(sensors, matchSpec);
  if (!ranked.length) {
    return { status: 'unavailable', message: 'Sensor not available', candidates: [] };
  }
  const primary = ranked[0].sensor;
  const windowSamples = windowedValid(primary, windowStart, windowEnd);
  if (!windowSamples.length) {
    return { status: 'unavailable', message: 'Insufficient data', primarySensor: primary, candidates: ranked.map((c) => c.sensor) };
  }
  return {
    status: 'ok',
    primarySensor: primary,
    candidates: ranked.map((c) => c.sensor),
    current: getLatestValid(windowSamples)?.value ?? null,
    average: timeWeightedAverage(windowSamples),
    minimum: minimum(windowSamples),
    maximum: maximum(windowSamples),
    total: trapezoidalIntegral(windowSamples),
    unit: primary.unit,
    sampleCount: windowSamples.length,
  };
}

// Pressure KPI shape: current/average/min/max/stddev plus % of window time spent
// outside the sensor's own configured range (only when that range is trustworthy).
function buildPressureResult(sensors, matchSpec, windowStart, windowEnd) {
  const ranked = rankCandidates(sensors, matchSpec);
  if (!ranked.length) {
    return { status: 'unavailable', message: 'Sensor not available', candidates: [] };
  }
  const primary = ranked[0].sensor;
  const windowSamples = windowedValid(primary, windowStart, windowEnd);
  if (!windowSamples.length) {
    return { status: 'unavailable', message: 'Insufficient data', primarySensor: primary, candidates: ranked.map((c) => c.sensor) };
  }
  const outOfRangeMs = computeOutOfRangeDuration(windowSamples, primary.configuredMin, primary.configuredMax);
  const windowDuration = windowSamples[windowSamples.length - 1].timestamp - windowSamples[0].timestamp;
  return {
    status: 'ok',
    primarySensor: primary,
    candidates: ranked.map((c) => c.sensor),
    current: getLatestValid(windowSamples)?.value ?? null,
    average: timeWeightedAverage(windowSamples),
    minimum: minimum(windowSamples),
    maximum: maximum(windowSamples),
    standardDeviation: populationStandardDeviation(windowSamples),
    outOfRangePercent: outOfRangeMs != null && windowDuration > 0 ? (outOfRangeMs / windowDuration) * 100 : null,
    unit: primary.unit,
    sampleCount: windowSamples.length,
  };
}

// --- KPI 9: WHRS Gas Temperature Drop ------------------------------------
// Pairs inlet/outlet gas-temperature sensors that share the same underlying
// process description (e.g. "PH Boiler inlet/Outlet Gas temperature"),
// disambiguating identical descriptions across equipment lines (PH1A vs PH1B)
// using well-known WHRS path tokens found in the tag name. Never subtracts an
// arbitrary pair - a path is only used when exactly one inlet and one outlet
// sensor is found for it.

const KNOWN_PATH_TOKENS = ['PH1A', 'PH1B', 'PH2A', 'PH2B', 'AQC', 'ESP', 'TG', 'STG', 'WH1', 'WH2'];

function findPathToken(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const segments = candidate.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    for (const tok of KNOWN_PATH_TOKENS) {
      if (segments.includes(tok)) return tok;
    }
  }
  return null;
}

function descriptionDirectionKey(description) {
  const norm = normalizeText(description).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  let direction = null;
  if (/\binlet\b/.test(norm)) direction = 'inlet';
  else if (/\boutlet\b/.test(norm) || /\bexit\b/.test(norm)) direction = 'outlet';
  if (!direction) return null;
  const stripped = norm.replace(/\b(inlet|outlet|exit)\b/g, '').replace(/\s+/g, ' ').trim();
  const tokens = stripped.split(' ').filter(Boolean).sort();
  return { direction, key: tokens.join(' ') };
}

function findGasTemperaturePaths(sensors) {
  const candidates = sensors
    .filter((s) => normalizeText(s.variableType).includes('temp') && normalizeText(s.description).includes('gas'))
    .map((s) => {
      const dk = descriptionDirectionKey(s.description);
      return dk ? { sensor: s, ...dk } : null;
    })
    .filter(Boolean);

  const byDescKey = new Map();
  for (const c of candidates) {
    if (!byDescKey.has(c.key)) byDescKey.set(c.key, []);
    byDescKey.get(c.key).push(c);
  }

  const paths = [];
  for (const [key, group] of byDescKey) {
    const inlets = group.filter((g) => g.direction === 'inlet');
    const outlets = group.filter((g) => g.direction === 'outlet');
    if (inlets.length === 1 && outlets.length === 1) {
      const tok = findPathToken(inlets[0].sensor.tagName, inlets[0].sensor.name);
      paths.push({ label: tok ? `${tok} — ${key}` : key, inlet: inlets[0].sensor, outlet: outlets[0].sensor });
      continue;
    }
    if (inlets.length >= 1 && outlets.length >= 1) {
      const bySubToken = new Map();
      for (const g of group) {
        const tok = findPathToken(g.sensor.tagName, g.sensor.name) || 'UNKNOWN';
        if (!bySubToken.has(tok)) bySubToken.set(tok, []);
        bySubToken.get(tok).push(g);
      }
      for (const [tok, subGroup] of bySubToken) {
        if (tok === 'UNKNOWN') continue;
        const subInlets = subGroup.filter((g) => g.direction === 'inlet');
        const subOutlets = subGroup.filter((g) => g.direction === 'outlet');
        if (subInlets.length === 1 && subOutlets.length === 1) {
          paths.push({ label: `${tok} — ${key}`, inlet: subInlets[0].sensor, outlet: subOutlets[0].sensor });
        }
      }
    }
  }
  return paths;
}

function meanOf(values) {
  const valid = values.filter((v) => isValidNumeric(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function calculateWhrsGasTempDrop(sensors, windowStart, windowEnd) {
  const paths = findGasTemperaturePaths(sensors);
  if (!paths.length) {
    return { status: 'unavailable', message: 'No trustworthy inlet/outlet gas-temperature pair found', pathResults: [] };
  }

  const pathResults = [];
  for (const path of paths) {
    const inletWindowed = windowedValid(path.inlet, windowStart, windowEnd);
    const outletWindowed = windowedValid(path.outlet, windowStart, windowEnd);
    const combinedInterval = inferSamplingInterval([...path.inlet.samples, ...path.outlet.samples]);
    const tolerance = combinedInterval ? combinedInterval / 2 : 5 * 60 * 1000;
    const pairs = pairNearestTimestamps(inletWindowed, outletWindowed, tolerance);
    if (!pairs.length) continue;
    const deltaSamples = pairs.map((p) => ({ timestamp: p.timestamp, value: p.a - p.b }));
    pathResults.push({
      label: path.label,
      inletSensor: path.inlet,
      outletSensor: path.outlet,
      current: deltaSamples[deltaSamples.length - 1].value,
      average: timeWeightedAverage(deltaSamples),
      minimum: minimum(deltaSamples),
      maximum: maximum(deltaSamples),
      sampleCount: deltaSamples.length,
    });
  }

  if (!pathResults.length) {
    return { status: 'unavailable', message: 'Insufficient aligned observations for gas-temperature pairing', pathResults: [] };
  }

  const headline = {
    current: meanOf(pathResults.map((p) => p.current)),
    average: meanOf(pathResults.map((p) => p.average)),
    minimum: Math.min(...pathResults.map((p) => p.minimum)),
    maximum: Math.max(...pathResults.map((p) => p.maximum)),
  };

  return { status: 'ok', headline, pathResults, unit: 'DegC' };
}

// --- KPI 10: Equipment Runtime % ------------------------------------------
// Uses binary/state equipment sensors only (detected via the same reusable
// detectBinarySensor() logic sensor health relies on). Pools ON/observed time
// across all detected equipment for a single, well-defined aggregate headline.

function calculateEquipmentRuntime(sensors, windowStart, windowEnd) {
  const binarySensors = sensors.filter((s) => detectBinarySensor(s));
  if (!binarySensors.length) {
    return { status: 'unavailable', message: 'Sensor not available', equipmentResults: [] };
  }

  const equipmentResults = [];
  let pooledOn = 0;
  let pooledObserved = 0;
  let pooledStarts = 0;
  let pooledStops = 0;
  let pooledLongestOff = 0;

  for (const sensor of binarySensors) {
    const runtime = calculateRuntime(sensor.samples, windowStart, windowEnd, 1);
    if (!runtime) continue;
    equipmentResults.push({ sensor, ...runtime });
    pooledOn += runtime.onDuration;
    pooledObserved += runtime.observedDuration;
    pooledStarts += runtime.startCount;
    pooledStops += runtime.stopCount;
    if (runtime.longestOffDuration > pooledLongestOff) pooledLongestOff = runtime.longestOffDuration;
  }

  if (!equipmentResults.length) {
    return { status: 'unavailable', message: 'Insufficient data', equipmentResults: [] };
  }

  const headline = {
    runtimePercent: pooledObserved > 0 ? (pooledOn / pooledObserved) * 100 : null,
    onDuration: pooledOn,
    offDuration: pooledObserved - pooledOn,
    observedDuration: pooledObserved,
    startCount: pooledStarts,
    stopCount: pooledStops,
    longestOffDuration: pooledLongestOff,
    equipmentCount: equipmentResults.length,
  };

  return { status: 'ok', headline, equipmentResults };
}

// --- Registry ---------------------------------------------------------------
// Order below is authoritative and matches the workbook's KPI Metric column.

export const KPI_DEFINITIONS = [
  {
    id: 'kiln-feed-rate',
    label: 'Kiln Feed Rate',
    order: 1,
    expectedUnit: 'TPH',
    totalLabel: 'Total Feed',
    totalUnit: 'Tonnes',
    matchSpec: {
      requiredGroups: [['kiln'], ['feed']],
      preferredUnitTokens: ['tph'],
      preferredVarTypeTokens: ['flow'],
    },
    calculate: (sensors, windowStart, windowEnd) => buildFlowResult(sensors, KPI_DEFINITIONS[0].matchSpec, windowStart, windowEnd),
  },
  {
    id: 'tpp-generation-load',
    label: 'TPP Generation Load',
    order: 2,
    expectedUnit: 'MW',
    totalLabel: 'Energy Generated',
    totalUnit: 'MWh',
    matchSpec: {
      requiredGroups: [['tpp', 'cpp', 'thermal power', 'captive power'], ['generation', 'load']],
      preferredUnitTokens: ['mw'],
      preferredVarTypeTokens: ['energy', 'power'],
    },
    calculate: (sensors, windowStart, windowEnd) => buildFlowResult(sensors, KPI_DEFINITIONS[1].matchSpec, windowStart, windowEnd),
  },
  {
    id: 'whrs-power-generation',
    label: 'WHRS Power Generation',
    order: 3,
    expectedUnit: 'MW',
    totalLabel: 'WHRS Energy Generated',
    totalUnit: 'MWh',
    matchSpec: {
      requiredGroups: [['whrs', 'whsr', 'waste heat'], ['power', 'generation']],
      boostTokens: ['power generation'],
      preferredUnitTokens: ['mw'],
      preferredVarTypeTokens: ['power', 'energy'],
    },
    calculate: (sensors, windowStart, windowEnd) => buildFlowResult(sensors, KPI_DEFINITIONS[2].matchSpec, windowStart, windowEnd),
  },
  {
    id: 'grid-load',
    label: 'Grid Load',
    order: 4,
    expectedUnit: 'MW',
    totalLabel: 'Grid Energy',
    totalUnit: 'MWh',
    matchSpec: {
      requiredGroups: [['grid'], ['load', 'import', 'draw']],
      preferredUnitTokens: ['mw'],
      preferredVarTypeTokens: ['power'],
    },
    calculate: (sensors, windowStart, windowEnd) => buildFlowResult(sensors, KPI_DEFINITIONS[3].matchSpec, windowStart, windowEnd),
  },
  {
    id: 'hp-steam-generation-rate',
    label: 'HP Steam Generation Rate',
    order: 5,
    expectedUnit: 'TPH',
    totalLabel: 'Total HP Steam Generated',
    totalUnit: 'Tonnes',
    matchSpec: {
      requiredGroups: [['hp'], ['steam'], ['generation', 'flow']],
      preferredUnitTokens: ['tph'],
      preferredVarTypeTokens: ['flow'],
    },
    calculate: (sensors, windowStart, windowEnd) => buildFlowResult(sensors, KPI_DEFINITIONS[4].matchSpec, windowStart, windowEnd),
  },
  {
    id: 'lp-steam-generation-rate',
    label: 'LP Steam Generation Rate',
    order: 6,
    expectedUnit: 'TPH',
    totalLabel: 'Total LP Steam Generated',
    totalUnit: 'Tonnes',
    matchSpec: {
      requiredGroups: [['lp'], ['steam'], ['generation', 'flow']],
      preferredUnitTokens: ['tph'],
      preferredVarTypeTokens: ['flow'],
    },
    calculate: (sensors, windowStart, windowEnd) => buildFlowResult(sensors, KPI_DEFINITIONS[5].matchSpec, windowStart, windowEnd),
  },
  {
    id: 'hp-steam-pressure',
    label: 'HP Steam Pressure',
    order: 7,
    expectedUnit: 'Kg/cm2',
    matchSpec: {
      requiredGroups: [['hp'], ['steam'], ['pressure']],
      boostTokens: ['tg'],
      preferredUnitTokens: ['kg/cm2', 'bar', 'mpa'],
      preferredVarTypeTokens: ['pressure'],
    },
    calculate: (sensors, windowStart, windowEnd) => buildPressureResult(sensors, KPI_DEFINITIONS[6].matchSpec, windowStart, windowEnd),
  },
  {
    id: 'lp-steam-pressure',
    label: 'LP Steam Pressure',
    order: 8,
    expectedUnit: 'Kg/cm2',
    matchSpec: {
      requiredGroups: [['lp'], ['steam'], ['pressure']],
      boostTokens: ['tg'],
      preferredUnitTokens: ['kg/cm2', 'bar', 'mpa'],
      preferredVarTypeTokens: ['pressure'],
    },
    calculate: (sensors, windowStart, windowEnd) => buildPressureResult(sensors, KPI_DEFINITIONS[7].matchSpec, windowStart, windowEnd),
  },
  {
    id: 'whrs-gas-temperature-drop',
    label: 'WHRS Gas Temperature Drop',
    order: 9,
    expectedUnit: 'DegC',
    calculate: (sensors, windowStart, windowEnd) => calculateWhrsGasTempDrop(sensors, windowStart, windowEnd),
  },
  {
    id: 'equipment-runtime-percent',
    label: 'Equipment Runtime %',
    order: 10,
    expectedUnit: '%',
    calculate: (sensors, windowStart, windowEnd) => calculateEquipmentRuntime(sensors, windowStart, windowEnd),
  },
];

export function computeAllKpis(sensors, windowStart, windowEnd) {
  return KPI_DEFINITIONS.map((def) => ({
    def,
    result: sensors.length ? def.calculate(sensors, windowStart, windowEnd) : { status: 'unavailable', message: 'No sensors available' },
  }));
}
