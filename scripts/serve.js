// Kleiner Webserver zum Testen im Browser: npm start → http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..', 'www');
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  let file;
  // Kaputte Adressen (z. B. "%E0%A4%A") dürfen den Server nicht abstürzen lassen
  try { file = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (file.endsWith('/')) file += 'index.html';
  const full = path.join(root, path.normalize(file));
  // Nur Dateien INNERHALB von www/ ausliefern (auch nicht aus Nachbarordnern wie "www-alt")
  if (!full.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, {
      'Content-Type': types[path.extname(full)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(port, () => {
  console.log('\n  Telvo Player läuft:');
  console.log('  → Auf diesem Computer:  http://localhost:' + port);
  console.log('  → Ohne Online-Abgleich testen:  http://localhost:' + port + '/?nocloud');
  Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal)
    .forEach(i => console.log('  → Im WLAN (Handy/Tablet): http://' + i.address + ':' + port));
  console.log('\n  Beenden mit Strg+C\n');
});
