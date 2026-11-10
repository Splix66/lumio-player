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

// 3b) Handy und Tablet nur im Querformat (seitlich, beide Richtungen). Fernseher sind ohnehin quer.
m = m.replace(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/, (tag) => {
  if (tag.includes('android:screenOrientation')) return tag;
  return tag.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
});

// 3c) TV-Banner auch direkt an der Start-Activity: Der Fire-TV-Startbildschirm nimmt sonst teils nur das kleine
//     App-Symbol (Logo auf grauer Kachel) statt der gefüllten Banner-Kachel mit Namen wie bei Netflix oder YouTube.
m = m.replace(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/, (tag) => {
  if (tag.includes('android:banner')) return tag;
  return tag.replace(/<activity\b/, '<activity\n            android:banner="@drawable/banner"');
});

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

// 5) TV-Player (ExoPlayer): Java-Dateien, Bildschirm im Manifest und Bibliotheken
const javaDir = path.join(base, 'android', 'app', 'src', 'main', 'java', 'de', 'lumio', 'player');
fs.mkdirSync(javaDir, { recursive: true });
const nativeSrc = path.join(base, 'platforms', 'android', 'java');
fs.readdirSync(nativeSrc).filter(f => f.endsWith('.java')).forEach(f => {
  fs.copyFileSync(path.join(nativeSrc, f), path.join(javaDir, f));
});

let m2 = fs.readFileSync(manifestPath, 'utf8');
if (!m2.includes('.PlayerActivity')) {
  m2 = m2.replace(/<\/application>/, [
    '    <activity',
    '            android:name=".PlayerActivity"',
    '            android:exported="false"',
    '            android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|keyboard|keyboardHidden|navigation|uiMode"',
    '            android:screenOrientation="sensorLandscape"',
    '            android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen" />',
    '    </application>'
  ].join('\n'));
  fs.writeFileSync(manifestPath, m2);
}

const gradlePath = path.join(base, 'android', 'app', 'build.gradle');
let g = fs.readFileSync(gradlePath, 'utf8');
// Media3 (ExoPlayer): Version hier zentral – bei einem Wechsel die Änderungshinweise prüfen
// (https://github.com/androidx/media/blob/release/RELEASENOTES.md) und auf echten Boxen testen.
// 1.9.x ist die neueste Reihe für compileSdk 35 (Capacitor 7, Android Gradle Plugin 8.7).
// Ab Media3 1.10 ist compileSdk 36 Pflicht – erst nach einem Wechsel auf Capacitor 8 / neueres Gradle-Plugin möglich.
const MEDIA3 = '1.9.4';
if (!g.includes('media3-exoplayer')) {
  g = g.replace(/\ndependencies\s*\{/, [
    '',
    'dependencies {',
    '    implementation "androidx.media3:media3-exoplayer:' + MEDIA3 + '"',
    '    implementation "androidx.media3:media3-exoplayer-hls:' + MEDIA3 + '"',
    '    implementation "androidx.media3:media3-ui:' + MEDIA3 + '"'
  ].join('\n'));
  fs.writeFileSync(gradlePath, g);
} else {
  // schon eingerichtet (z. B. „npm run android:aktualisieren“): Versionsnummer trotzdem angleichen
  const g2 = g.replace(/(androidx\.media3:media3-[a-z-]+:)[0-9][0-9A-Za-z.\-]*/g, '$1' + MEDIA3);
  if (g2 !== g) fs.writeFileSync(gradlePath, g2);
}

// Versionsnummer des Pakets aus der App-Version (www/js/app.js), z. B. 1.13.1 → versionName "1.13.1", versionCode 11301.
// Vorher blieb sie immer „1.0 (1)“: Android zeigte bei jedem Kunden 1.0, und App-Stores (Amazon, Google) verlangen
// einen steigenden versionCode. 11301 > 1 – Updates über ältere Installationen bleiben ohne Deinstallieren möglich.
{
  const appJs = fs.readFileSync(path.join(base, 'www', 'js', 'app.js'), 'utf8');
  const m = /version: '(\d+)\.(\d+)\.(\d+)'/.exec(appJs);
  if (m) {
    const name = m[1] + '.' + m[2] + '.' + m[3];
    const code = Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
    let g3 = fs.readFileSync(gradlePath, 'utf8');
    const g4 = g3.replace(/versionCode\s+\d+/, 'versionCode ' + code).replace(/versionName\s+"[^"]*"/, 'versionName "' + name + '"');
    if (g4 !== g3) fs.writeFileSync(gradlePath, g4);
    console.log('Android-Version: ' + name + ' (' + code + ')');
  }
}

console.log('Android fuer TV und Handy vorbereitet (Leanback, Banner, http-Streams, dunkler Start, TV-Player)');
