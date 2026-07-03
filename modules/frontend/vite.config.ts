import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync, createReadStream, existsSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';

// Read the canonical version from version.sbt at the repo root.
const versionSbt = readFileSync(
  path.resolve(__dirname, '../../version.sbt'),
  'utf-8'
);
const versionMatch = versionSbt.match(/:=\s*"([^"]+)"/);
const appVersion = versionMatch ? versionMatch[1] : 'unknown';

const appConf = readFileSync(path.resolve(__dirname, 'conf/application.conf'), 'utf-8');
const oldPortalMatch =
  appConf.match(/old-portal\s*\{[\s\S]*?url\s*=\s*"([^"]+)"/) ??
  appConf.match(/old-portal\.url\s*=\s*"([^"]+)"/);
const oldPortalUrl = process.env.OLD_PORTAL_URL ?? oldPortalMatch?.[1];

function readPlayPortFromConf(): number {
  const parsePort = (content: string): number | undefined => {
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^http\.port\s*=\s*(\d+)\s*$/);
      if (match) return Number(match[1]);
    }
    return undefined;
  };

  const localConf = path.resolve(__dirname, 'conf/local.conf');
  if (existsSync(localConf)) {
    const localPort = parsePort(readFileSync(localConf, 'utf-8'));
    if (localPort) return localPort;
  }

  const appConf = path.resolve(__dirname, 'conf/application.conf');
  if (existsSync(appConf)) {
    const appPort = parsePort(readFileSync(appConf, 'utf-8'));
    if (appPort) return appPort;
  }

  return 9001;
}

const playPort = Number(process.env.PORTAL_PORT ?? readPlayPortFromConf());
const PLAY_BACKEND = `http://localhost:${playPort}`;

export default defineConfig({
  publicDir: false,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __OLD_PORTAL_URL__: JSON.stringify(oldPortalUrl),
  },
  plugins: [
    react(),
    // Serve /img/* from public/img/ first, then fall back to the microsite docs
    // directory so both sources work during development.
    {
      name: 'serve-img',
      configureServer(server) {
        const sources = [
          path.resolve(__dirname, 'public/img'),
          path.resolve(__dirname, '../docs/src/main/resources/microsite/img'),
        ];
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.ico': 'image/x-icon',
        };
        server.middlewares.use('/img', (req, res, next) => {
          for (const dir of sources) {
            const filePath = path.join(dir, req.url ?? '/');
            if (existsSync(filePath)) {
              const mime = mimeTypes[path.extname(filePath)] ?? 'application/octet-stream';
              res.setHeader('Content-Type', mime);
              createReadStream(filePath).pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
    // Dev-mode Play login bridge: intercepts POST /login, fetches the CSRF
    // token from Play, re-posts with correct form encoding, and returns a
    // simple JSON result so the React LoginPage doesn't need redirect logic.
    {
      name: 'play-login-handler',
      configureServer(server) {
        server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.method !== 'POST' || req.url !== '/login') return next();
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
            const { username, password } = JSON.parse(Buffer.concat(chunks).toString()) as {
              username: string;
              password: string;
            };

            // Step 1: GET Play login page → obtain session cookie + CSRF token.
            const getRes = await fetch(`${PLAY_BACKEND}/login`, { headers: { Accept: 'text/html' } });
            const setCookies: string[] = getRes.headers.getSetCookie?.() ?? [];
            const sessionCookie = setCookies.find((c) => c.startsWith('PLAY_SESSION='))?.split(';')[0] ?? '';
            const html = await getRes.text();
            const metaMatch = html.match(/id="csrf"[^>]*content="([^"]+)"/);
            const formMatch = html.match(/action="\/login\?csrfToken=([^"&]+)"/);
            const csrfToken = metaMatch?.[1] ?? formMatch?.[1] ?? '';

            // Step 2: POST credentials to Play with the extracted CSRF token.
            const loginRes = await fetch(`${PLAY_BACKEND}/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Csrf-Token': csrfToken,
                ...(sessionCookie ? { Cookie: sessionCookie } : {}),
              },
              body: new URLSearchParams({ username, password }).toString(),
              redirect: 'manual',
            });

            const location = loginRes.headers.get('location') ?? '';
            const isSuccess = Boolean(location) && !location.includes('/login');

            if (isSuccess) {
              for (const cookie of loginRes.headers.getSetCookie?.() ?? []) {
                res.appendHeader('Set-Cookie', cookie);
              }
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
            } else {
              const flashRaw = (loginRes.headers.getSetCookie?.() ?? [])
                .find((c) => c.startsWith('PLAY_FLASH='))
                ?.split(';')[0]?.substring('PLAY_FLASH='.length) ?? '';
              const flash: Record<string, string> = {};
              for (const kv of decodeURIComponent(flashRaw).split('&')) {
                const eq = kv.indexOf('=');
                if (eq !== -1) flash[decodeURIComponent(kv.slice(0, eq))] = decodeURIComponent(kv.slice(eq + 1));
              }
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: flash.alertMessage ?? 'Invalid credentials. Please try again.' }));
            }
          } catch {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: `Login service unavailable. Is Play running at ${PLAY_BACKEND}?` }));
          }
        });
      },
    },
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 9002,
    strictPort: true,
    proxy: {
      '/api':               { target: PLAY_BACKEND, changeOrigin: true },
      // GET /login is served by Vite (React Router); POST /login is handled by
      // the play-login-handler plugin above before reaching the proxy.
      '/login':             { target: PLAY_BACKEND, changeOrigin: true,
                              bypass: (req) => (req.method !== 'POST' ? req.url : undefined) },
      '/logout':            { target: PLAY_BACKEND, changeOrigin: true },
      '/callback':          { target: PLAY_BACKEND, changeOrigin: true },
      '/health':            { target: PLAY_BACKEND, changeOrigin: true },
      '/download-creds-file': { target: PLAY_BACKEND, changeOrigin: true },
      '/regenerate-creds':  { target: PLAY_BACKEND, changeOrigin: true },
      '/public':            { target: PLAY_BACKEND, changeOrigin: true },
      '/assets':            { target: PLAY_BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: 'public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'assets/index.css';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});

