// Petit serveur statique pour les tests Playwright.
// Sert la racine du projet (index.html + css/ + js/ + ...) en http(s),
// jamais en file:// — l'app elle-même refuse de fonctionner en file://
// (localStorage bloqué par le navigateur, voir README.md). Reprend le
// même besoin que le serveur de tests/mcps-test-suite.js, mais autonome
// pour pouvoir être lancé par `webServer` dans playwright.config.js.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.MCPS_E2E_PORT || 4173;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`[static-server] http://localhost:${PORT}`));
