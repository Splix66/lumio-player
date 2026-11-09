// Kopiert die Bibliotheken (hls.js, mpegts.js, QR-Code) nach www/lib, damit die App sie fest dabei hat
// und nichts aus dem Internet nachladen muss. Auf GitHub (CI) bricht der Bau ab, wenn eine fehlt.
const fs = require('fs');
const path = require('path');

const libs = [
  ['hls.js', 'dist/hls.min.js', 'hls.min.js'],
  ['mpegts.js', 'dist/mpegts.js', 'mpegts.js'],
  ['qrcode-generator', 'qrcode.js', 'qrcode.js']
];
const libDir = path.join(__dirname, '..', 'www', 'lib');
fs.mkdirSync(libDir, { recursive: true });

for (const [pkg, file, target] of libs) {
  const src = path.join(__dirname, '..', 'node_modules', pkg, file);
  if (!fs.existsSync(src)) {
    console.log(pkg + ' nicht gefunden – die App lädt es dann aus dem Internet.');
    if (process.env.CI) { console.error('FEHLER: ' + pkg + ' fehlt – die App wäre unvollständig.'); process.exitCode = 1; }
    continue;
  }
  fs.copyFileSync(src, path.join(libDir, target));
  console.log('OK: ' + pkg + ' nach www/lib kopiert');
}

// Schrift "Inter" (ähnlich wie San Francisco) nach www/fonts kopieren
const fontDir = path.join(__dirname, '..', 'www', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });
for (const w of [400, 500, 600, 700, 800]) {
  const name = 'inter-latin-' + w + '-normal.woff2';
  const src = path.join(__dirname, '..', 'node_modules', '@fontsource', 'inter', 'files', name);
  if (!fs.existsSync(src)) { console.log('Schrift ' + name + ' nicht gefunden – es wird die Systemschrift benutzt.'); continue; }
  fs.copyFileSync(src, path.join(fontDir, name));
}
console.log('OK: Schrift Inter nach www/fonts kopiert');
