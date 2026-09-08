// Future production adapter for AWS S3-hosted JSON telemetry objects.
//
// Intentionally NOT implemented for the local POC. When wired up, this module
// should be the ONLY place that knows how to reach S3 - it must:
//   1. Accept non-secret config: { region, bucket, prefix, objectKeys } or a
//      list of deployment-provided pre-signed object URLs. Never accept or
//      embed permanent AWS access keys/secret keys/session tokens here.
//   2. Fetch one or many JSON objects (via pre-signed URLs or an authenticated
//      backend proxy - never raw long-lived credentials in the browser).
//   3. Parse them safely (try/catch per object, matching the { raw,
//      sourceInstance, error } shape every other adapter returns).
//   4. Return that array unchanged - normalization stays in dataNormalizer.js.
//   5. Optionally support refreshTelemetry(config) for periodic polling.
//
// Dashboard components and KPI/health/aggregate utilities must never import
// this module directly or branch on "S3-ness" - only dataSource.js should.

export async function loadTelemetry(_config) {
  throw new Error('AWS S3 telemetry source is not configured for this deployment.');
}

export const refreshTelemetry = loadTelemetry;
