/**
 * pipPing backend entrypoint.
 * Single Node process: REST API + price-poll engine + (in prod) static frontend.
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import './firebase.js'; // side-effect: initializes Firebase Admin + Firestore
import { registerRoutes } from './routes.js';
import { startEngine } from './engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 8080;
const app = express();
app.use(express.json({ limit: '256kb' }));

registerRoutes(app);

// In production, serve the built frontend from dist/
const distPath = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback for non-/api routes
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[server] serving static frontend from ${distPath}`);
} else {
  console.log('[server] dist/ not found; running API-only (use Vite dev server for UI)');
}

app.listen(PORT, () => {
  console.log(`[server] pipPing listening on :${PORT}`);
  startEngine();
});
