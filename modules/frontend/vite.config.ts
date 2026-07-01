/*
 * Copyright 2018 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import {
  hmacProxyPlugin,
  readOldPortalUrl,
  readServerPort,
} from './vite-plugin-hmac-proxy';
import { readFileSync, createReadStream, existsSync } from 'fs';

// Read the canonical version from version.sbt at the repo root.
// version.sbt contains a single line: version in ThisBuild := "x.y.z"
const versionSbt = readFileSync(
  path.resolve(__dirname, '../../version.sbt'),
  'utf-8'
);
const versionMatch = versionSbt.match(/:=\s*"([^"]+)"/);
const appVersion = versionMatch ? versionMatch[1] : 'unknown';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __OLD_PORTAL_URL__: JSON.stringify(readOldPortalUrl()),
  },
  plugins: [
    react(),
    // To wire in a credential decryptor explicitly, add:
    //   import { decryptCredential } from './credential-decryptor';
    //   hmacProxyPlugin({ credentialDecryptor: decryptCredential })
    // credential-decryptor.ts is NOT committed to the repo (gitignored).
    // Alternatively, simply place credential-decryptor.ts next to this file
    // and it will be loaded automatically at startup.
    hmacProxyPlugin(),
    // Serve images directly from the microsite img directory under /img/*
    {
      name: 'serve-microsite-img',
      configureServer(server) {
        const micrositeImgDir = path.resolve(
          __dirname,
          '../docs/src/main/resources/microsite/img'
        );
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        };
        server.middlewares.use('/img', (req, res, next) => {
          const filePath = path.join(micrositeImgDir, req.url ?? '/');
          if (existsSync(filePath)) {
            const mime = mimeTypes[path.extname(filePath)] ?? 'application/octet-stream';
            res.setHeader('Content-Type', mime);
            createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: readServerPort(),
    strictPort: true,   // fail hard rather than silently falling back to 9002+
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