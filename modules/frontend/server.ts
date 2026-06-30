import express from "express";
import path from "path";
import cookieParser from "cookie-parser";

import { createBackend } from "./vite-plugin-hmac-proxy.js";

const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register API/backend middleware first
createBackend(app);

// Serve React build
app.use(express.static("/Users/jvelku299@apac.comcast.com/Documents/projects/vinyldns/vinyldns/modules/frontend/dist"));

app.use((req, res) => {
    res.sendFile("/Users/jvelku299@apac.comcast.com/Documents/projects/vinyldns/vinyldns/modules/frontend/dist/index.html");
});

const port = 9100;

app.listen(port, () => {
    console.log(`Backend listening on ${port}`);
});