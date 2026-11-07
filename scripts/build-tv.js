// Baut die Ordner für Samsung (dist/tizen) und LG (dist/webos) aus www/ zusammen.
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..');
const www = path.join(base, 'www');
const dist = path.join(base, 'dist');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

for (const target of ['tizen', 'webos']) {
  const out = path.join(dist, target);
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(www, out);
  copyDir(path.join(base, 'platforms', target), out);
  console.log('✓ ' + target + ' → dist/' + target);
}

if (!fs.existsSync(path.join(www, 'lib', 'hls.min.js'))) {
  console.log('\nHinweis: www/lib/hls.min.js fehlt. Führe einmal "npm install" aus, damit die TV-Apps offline vollständig sind.');
}
