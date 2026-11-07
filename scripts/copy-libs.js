// Kopiert die Video-Bibliothek hls.js nach www/lib, damit die App sie offline dabei hat.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'hls.js', 'dist', 'hls.min.js');
const dest = path.join(__dirname, '..', 'www', 'lib', 'hls.min.js');

if (!fs.existsSync(src)) {
  console.log('hls.js nicht gefunden – die App lädt sie dann aus dem Internet.');
  process.exit(0);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('✓ hls.js nach www/lib kopiert');
