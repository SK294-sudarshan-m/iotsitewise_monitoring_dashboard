// Parses browser-selected JSON files (input type="file" multiple). Same raw
// output shape as every other adapter: [{ raw, sourceInstance, error }].

export async function loadTelemetry(fileList) {
  const files = Array.from(fileList || []);
  const results = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      results.push({ raw: json, sourceInstance: file.name, error: null });
    } catch (err) {
      results.push({ raw: null, sourceInstance: file.name, error: err?.message || 'Invalid JSON' });
    }
  }
  return results;
}
