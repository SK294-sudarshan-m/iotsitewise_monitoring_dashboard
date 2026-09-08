import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(rootDir, 'Data');

function listLocalJsonFiles() {
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter((f) => f.toLowerCase().endsWith('.json') && !f.startsWith('~$'));
}

function buildManifest() {
  return listLocalJsonFiles().map((name) => {
    const stat = fs.statSync(path.join(dataDir, name));
    return { name, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  });
}

// Serves the sibling Data/ directory's *.json files to the browser without ever
// copying them into src/ or public/. Dev mode reads Data/ live via middleware;
// production build snapshots the same files into dist/local-data/ so the built
// app is self-contained under the same /local-data/* URL scheme.
function localDataPlugin() {
  return {
    name: 'local-data-plugin',
    configureServer(server) {
      server.middlewares.use('/local-data', (req, res) => {
        const reqPath = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        if (reqPath === 'manifest.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files: buildManifest() }));
          return;
        }
        if (!reqPath || reqPath.includes('..') || reqPath.includes('/') || reqPath.includes('\\')) {
          res.statusCode = 400;
          res.end('Invalid local data request');
          return;
        }
        const files = listLocalJsonFiles();
        if (!files.includes(reqPath)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        fs.createReadStream(path.join(dataDir, reqPath)).pipe(res);
      });
    },
    closeBundle() {
      const outDir = path.resolve(rootDir, 'dist', 'local-data');
      fs.mkdirSync(outDir, { recursive: true });
      const manifest = buildManifest();
      for (const entry of manifest) {
        fs.copyFileSync(path.join(dataDir, entry.name), path.join(outDir, entry.name));
      }
      fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ files: manifest }, null, 2));
    },
  };
}

export default defineConfig({
  // Relative base so the built app works from any path (e.g. a GitHub Pages
  // project site at /<repo>/) without hard-coding a repo name.
  base: './',
  plugins: [react(), localDataPlugin()],
  server: {
    fs: {
      allow: [rootDir],
    },
  },
});
