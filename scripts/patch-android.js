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
if (!g.includes('media3-exoplayer')) {
  g = g.replace(/\ndependencies\s*\{/, [
    '',
    'dependencies {',
    '    implementation "androidx.media3:media3-exoplayer:1.4.1"',
    '    implementation "androidx.media3:media3-exoplayer-hls:1.4.1"',
    '    implementation "androidx.media3:media3-ui:1.4.1"'
  ].join('\n'));
  fs.writeFileSync(gradlePath, g);
}

console.log('Android fuer TV und Handy vorbereitet (Leanback, Banner, http-Streams, dunkler Start, TV-Player)');
