// Reads *.json telemetry files that live in the sibling Data/ directory. In dev
// this hits the Vite middleware defined in vite.config.js; in a production build
// the same /local-data/* URLs are served as static files copied at build time.
// Data/ itself is never imported into src/ - only fetched over HTTP at runtime.

const BASE = `${import.meta.env.BASE_URL}local-data`;

export async function listLocalFiles() {
  const res = await fetch(`${BASE}/manifest.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Unable to read local data manifest (HTTP ${res.status})`);
  const manifest = await res.json();
  return Array.isArray(manifest.files) ? manifest.files : [];
}

export async function loadTelemetry() {
  const files = await listLocalFiles();
  const results = [];
  for (const file of files) {
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(file.name)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      results.push({ raw: json, sourceInstance: file.name, error: null });
    } catch (err) {
      results.push({ raw: null, sourceInstance: file.name, error: err?.message || String(err) });
    }
  }
  return results;
}

export const refreshTelemetry = loadTelemetry;
