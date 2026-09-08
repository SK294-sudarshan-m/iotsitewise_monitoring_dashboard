// Future production adapter for AWS IoT SiteWise.
//
// Intentionally NOT implemented for the local POC. AWS IoT SiteWise responses
// (assets, asset properties, latest property values, historical
// timestamp/value observations, across multiple assets/plants/time ranges) are
// NOT assumed to match the local mock JSON shape. All SiteWise-specific
// response translation belongs HERE (or immediately at this normalization
// boundary) - never scattered into React components or KPI/health utilities.
//
// When implemented, this module should:
//   1. Accept non-secret config (region, asset/property identifiers, requested
//      time range) supplied by the deployment - never embed AWS credentials.
//      Authentication should flow through temporary/federated credentials or
//      an authenticated backend, not long-lived keys in browser code.
//   2. Call the SiteWise API (e.g. BatchGetAssetPropertyValue /
//      GetAssetPropertyValueHistory) via that authenticated path.
//   3. Translate each asset/property/observation into the SAME raw shape the
//      rest of the pipeline expects (assets -> properties -> sample_data),
//      or equivalently emit already-canonical sensor objects here - either
//      way normalization happens once, not per component.
//   4. Return results using the shared { raw, sourceInstance, error } contract
//      (or canonical sensors directly) so dataSource.js can merge them exactly
//      like every other source.
//   5. Optionally support refreshTelemetry(config) for polling a requested
//      time window.

export async function loadTelemetry(_config) {
  throw new Error('AWS IoT SiteWise telemetry source is not configured for this deployment.');
}

export const refreshTelemetry = loadTelemetry;
