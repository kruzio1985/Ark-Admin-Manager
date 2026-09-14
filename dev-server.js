// Copyright (c) 2026 Kruzio
// Licensed under the PolyForm Noncommercial License 1.0.0.
// Non-commercial use only. Commercial use and selling of this code are prohibited.
// https://polyformproject.org/licenses/noncommercial/1.0.0/

/**
 * Ark Admin Manager — Dev Server (Express)
 * Używany TYLKO w trybie deweloperskim (npm run dev)
 * W produkcji main.js ładuje index.html bezpośrednio
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// MAM_DATA_DIR for dev mode
const APP_DATA_DIR = process.env.MAM_DATA_DIR || path.join(process.env.APPDATA || '', 'ArkAdminManager');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(APP_DATA_DIR, 'ark_admin.db');

// Ensure AppData exists
if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

// Copy DB if needed
const dbSrc = path.join(DATA_DIR, 'ark_admin.db');
const dbDest = DB_PATH;
if (!fs.existsSync(dbDest) && fs.existsSync(dbSrc)) {
  fs.copyFileSync(dbSrc, dbDest);
  console.log('[dev-server] Database copied to AppData');
}

// Static files from src/ui
app.use(express.static(path.join(__dirname, 'src', 'ui')));
app.use(express.json());

// API proxy — wszystkie /api/* przekierowują do electronicznych IPC
// W trybie dev po prostu ładujemy index.html który używa fetch→IPC bridge
// (w przeglądarce fetch będzie failował, ale Electron przechwyci)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'dev', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[dev-server] Ark Admin Manager UI: http://localhost:${PORT}`);
  console.log(`[dev-server] Data dir: ${APP_DATA_DIR}`);
});
