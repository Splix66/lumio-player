// Kopiert die Video-Bibliothek hls.js nach www/lib, damit die App sie offline dabei hat.
const fs = require('fs');
const path = require('path');

const libs = [
  ['hls.js', 'dist/hls.min.js', 'hls.min.js'],
  ['qrcode-generator', 'qrcode.js', 'qrcode.js']
];
const libDir = path.join(__dirname, '..', 'www', 'lib');
fs.mkdirSync(libDir, { recursive: true });

for (const [pkg, file, target] of libs) {
  const src = path.join(__dirname, '..', 'node_modules', pkg, file);
  if (!fs.existsSync(src)) {
    console.log(pkg + ' nicht gefunden – die App lädt es dann aus dem Internet.');
    continue;
  }
  fs.copyFileSync(src, path.join(libDir, target));
  console.log('OK: ' + pkg + ' nach www/lib kopiert');
}
