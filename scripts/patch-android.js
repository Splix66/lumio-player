// Macht die Android-App fit für Fernseher (Android TV, Google TV, Fire TV)
// und erlaubt http-Streams. Kann beliebig oft ausgeführt werden.
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..');
const manifestPath = path.join(base, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.error('Android-Projekt fehlt. Bitte zuerst "npm run android:einrichten" ausführen.');
  process.exit(1);
}

let m = fs.readFileSync(manifestPath, 'utf8');

// 1) Kein Touchscreen nötig + Leanback (TV) erlaubt, aber nicht Pflicht → läuft auf Handy UND TV
if (!m.includes('android.software.leanback')) {
  m = m.replace(/<application/, [
    '<uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
    '    <uses-feature android:name="android.software.leanback" android:required="false" />',
    '',
    '    <application'
  ].join('\n'));
}

// 2) TV-Banner und http-Streams erlauben
m = m.replace(/<application([^>]*)>/, (all, attrs) => {
  if (!attrs.includes('android:banner')) attrs += '\n        android:banner="@drawable/banner"';
  if (!attrs.includes('usesCleartextTraffic')) attrs += '\n        android:usesCleartextTraffic="true"';
  return '<application' + attrs + '>';
});

// 3) App im TV-Startmenü anzeigen (LEANBACK_LAUNCHER)
if (!m.includes('LEANBACK_LAUNCHER')) {
  m = m.replace(
    /(<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>)/,
    '$1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />'
  );
}

fs.writeFileSync(manifestPath, m);

// 4) Startbildschirm dunkel statt weiß (Android 12 und neuer)
const stylesPath = path.join(base, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');
if (fs.existsSync(stylesPath)) {
  let st = fs.readFileSync(stylesPath, 'utf8');
  if (!st.includes('windowSplashScreenBackground')) {
    st = st.replace(/(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)/,
      '$1\n        <item name="windowSplashScreenBackground">#0b0a1a</item>\n        <item name="android:windowBackground">#0b0a1a</item>');
    fs.writeFileSync(stylesPath, st);
  }
}

// Banner-Bild kopieren
const drawable = path.join(base, 'android', 'app', 'src', 'main', 'res', 'drawable');
fs.mkdirSync(drawable, { recursive: true });
fs.copyFileSync(path.join(base, 'assets', 'banner.png'), path.join(drawable, 'banner.png'));

console.log('Android fuer TV und Handy vorbereitet (Leanback, Banner, http-Streams, dunkler Start)');
