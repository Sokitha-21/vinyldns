import express from "express";
import path from "path";
import cookieParser from "cookie-parser";

import {
  createBackend,
  readServerPort,
  readDistPath,
} from "./vite-plugin-hmac-proxy.js";

const app = express();

app.use(cookieParser());

createBackend(app);

const distPath = readDistPath();

app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = readServerPort();

app.listen(port, () => {
  console.log(`Backend listening on ${port}`);
});