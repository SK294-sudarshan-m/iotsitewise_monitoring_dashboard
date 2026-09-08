// Resolves a plant identifier from runtime telemetry only. Never hard-codes a
// specific plant name - BJCW1 is only ever an emergent result of parsing real
// tag-naming conventions such as "S-BJCW1-KL1-F-PV-...".

function fromNamingConvention(str) {
  if (!str || typeof str !== 'string') return null;
  const segments = str.split('-');
  if (segments.length >= 2 && segments[0].toUpperCase() === 'S' && /^[A-Za-z0-9]+$/.test(segments[1])) {
    return segments[1].toUpperCase();
  }
  return null;
}

// assetRaw: the raw per-asset object from the source payload (may carry an
// explicit plant field). propertyRaw: the raw per-property object (may override).
export function resolvePlant({ assetRaw, propertyRaw, assetId, assetName }) {
  const explicit =
    propertyRaw?.plant ||
    propertyRaw?.plant_name ||
    propertyRaw?.plantName ||
    assetRaw?.plant ||
    assetRaw?.plant_name ||
    assetRaw?.plantName;
  if (explicit) return String(explicit);

  const fromTag =
    fromNamingConvention(propertyRaw?.name) ||
    fromNamingConvention(propertyRaw?.tag_name) ||
    fromNamingConvention(assetRaw?.name);
  if (fromTag) return fromTag;

  if (assetName) return assetName;
  if (assetId) return String(assetId);
  return 'UNKNOWN';
}
