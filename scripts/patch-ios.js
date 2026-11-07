// Erlaubt auf iPhone/iPad das Abspielen von http-Streams (viele IPTV-Server nutzen kein https).
const fs = require('fs');
const path = require('path');

const plistPath = path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist');
if (!fs.existsSync(plistPath)) {
  console.error('iOS-Projekt fehlt. Bitte zuerst "npm run ios:einrichten" ausführen (nur auf einem Mac möglich).');
  process.exit(1);
}

let p = fs.readFileSync(plistPath, 'utf8');
if (!p.includes('NSAppTransportSecurity')) {
  const block = [
    '\t<key>NSAppTransportSecurity</key>',
    '\t<dict>',
    '\t\t<key>NSAllowsArbitraryLoads</key>',
    '\t\t<true/>',
    '\t\t<key>NSAllowsArbitraryLoadsForMedia</key>',
    '\t\t<true/>',
    '\t</dict>',
    ''
  ].join('\n');
  const idx = p.lastIndexOf('</dict>');
  p = p.slice(0, idx) + block + p.slice(idx);
  fs.writeFileSync(plistPath, p);
}
console.log('✓ iOS: http-Streams erlaubt');
