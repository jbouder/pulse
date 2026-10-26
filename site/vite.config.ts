/// <reference types="vitest/config" />
import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const DATA_DIR = path.resolve(import.meta.dirname, '../data');
/** The files the dashboard fetches: the index and one file per project. */
const DATA_PATTERN = /^\/data\/(summary\.json|projects\/[a-z0-9-]+\.json)$/;

/**
 * Serve the collector's JSON at /data/* in dev and copy it into dist/data on
 * build, so the dashboard fetches it at runtime instead of bundling it (the
 * files change daily and cache on their own). Raw CSVs are never served.
 */
function collectorData(): Plugin {
  return {
    name: 'pulse-collector-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = DATA_PATTERN.exec((req.url ?? '').split('?')[0]);
        if (!m) return next();
        const file = path.join(DATA_DIR, m[1]);
        if (!fs.existsSync(file)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Content-Type', 'application/json');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = path.resolve(import.meta.dirname, 'dist/data');
      fs.mkdirSync(path.join(out, 'projects'), { recursive: true });
      fs.copyFileSync(
        path.join(DATA_DIR, 'summary.json'),
        path.join(out, 'summary.json'),
      );
      for (const f of fs.readdirSync(path.join(DATA_DIR, 'projects'))) {
        if (!f.endsWith('.json')) continue;
        fs.copyFileSync(
          path.join(DATA_DIR, 'projects', f),
          path.join(out, 'projects', f),
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), collectorData()],
  build: {
    // React, React DOM and Base UI are ~165 KB gzipped together, the same
    // floor holocron and datapad ship; Recharts is split off with the pages
    // that use it (src/components/AppShell.tsx).
    chunkSizeWarningLimit: 600,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // test/themes.test.ts reads src/index.css?raw; without this Vitest
    // replaces CSS imports with an empty string.
    css: { include: /index\.css/ },
  },
});
