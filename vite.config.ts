import { defineConfig, type Plugin } from 'vite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

function brotliAndImmutableHeadersPlugin(): Plugin {
  return {
    name: 'brotli-immutable-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url.endsWith('.wasm') || req.url.includes('.wasm?'))) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url) {
          const cleanUrl = req.url.split('?')[0]!;
          if (cleanUrl.endsWith('.wasm')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('Content-Type', 'application/wasm');

            const acceptEncoding = (req.headers['accept-encoding'] as string) || '';
            const distDir = path.resolve(import.meta.dirname ?? process.cwd(), 'dist');
            const wasmPath = path.join(distDir, cleanUrl.replace(/^\//, ''));
            const brPath = `${wasmPath}.br`;

            if (acceptEncoding.includes('br') && fs.existsSync(brPath)) {
              res.setHeader('Content-Encoding', 'br');
              res.setHeader('Vary', 'Accept-Encoding');
              const stream = fs.createReadStream(brPath);
              stream.pipe(res);
              return;
            }
          }
        }
        next();
      });
    },
    closeBundle() {
      // Find all wasm files in dist/ and pre-compress with Brotli quality 11
      const distDir = path.resolve(import.meta.dirname ?? process.cwd(), 'dist');
      if (!fs.existsSync(distDir)) return;
      function walk(dir: string) {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (entry.endsWith('.wasm')) {
            const content = fs.readFileSync(fullPath);
            const br = zlib.brotliCompressSync(content, {
              params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
            });
            fs.writeFileSync(`${fullPath}.br`, br);
          }
        }
      }
      walk(distDir);
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [brotliAndImmutableHeadersPlugin()],
  server: {
    port: 3000,
    headers: {
      'Accept-Ranges': 'bytes',
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        draft: 'draft.html',
        student: 'student.html',
        instructor: 'instructor.html',
      },
    },
  },
});
