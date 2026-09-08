// The exact ten common aggregates required for Panel 3, computed only from
// observations inside the selected time window. No P05/P95/Absolute Change.

import {
  filterSamplesByRange,
  getLatestValid,
  minimum,
  maximum,
  median,
  populationStandardDeviation,
  observedRange,
  timeWeightedAverage,
  isValidNumeric,
} from './timeSeries.js';

export function computeCommonAggregates(sensor, windowStart, windowEnd) {
  const windowSamples = filterSamplesByRange(sensor.samples, windowStart, windowEnd);
  const validSamples = windowSamples.filter((s) => isValidNumeric(s.value));

  if (validSamples.length === 0) {
    return {
      current: null,
      average: null,
      minimum: null,
      maximum: null,
      median: null,
      standardDeviation: null,
      observedRange: null,
      firstValue: null,
      lastValue: null,
      sampleCount: 0,
    };
  }

  const latest = getLatestValid(validSamples);

  return {
    current: latest ? latest.value : null,
    average: timeWeightedAverage(validSamples),
    minimum: minimum(validSamples),
    maximum: maximum(validSamples),
    median: median(validSamples),
    standardDeviation: populationStandardDeviation(validSamples),
    observedRange: observedRange(validSamples),
    firstValue: validSamples[0].value,
    lastValue: validSamples[validSamples.length - 1].value,
    sampleCount: validSamples.length,
  };
}
