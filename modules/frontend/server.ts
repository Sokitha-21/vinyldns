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

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";

import {
  createBackend,
  readServerPort,
  readDistPath,
} from "./vite-plugin-hmac-proxy.js";

const app = express();

app.use(cookieParser());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const micrositeImgPath = path.resolve(
  __dirname,
  "../../docs/src/main/resources/microsite/img"
);

app.use("/img", express.static(micrositeImgPath));

// To wire in a credential decryptor explicitly, add:
//   import { decryptCredential } from './credential-decryptor.js';
//   await createBackend(app, { credentialDecryptor: decryptCredential });
// credential-decryptor.ts is NOT committed to the repo (gitignored).
// Alternatively, simply place credential-decryptor.ts next to this file
// and it will be loaded automatically at startup.
await createBackend(app);

const distPath = readDistPath();

app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = readServerPort();

app.listen(port, () => {
  console.log(`Backend listening on ${port}`);
});