/* Telvo-Webseite (docs/) – automatischer Test im unsichtbaren Chrome.
   Startet selbst einen kleinen Webserver, simuliert den Online-Dienst (Supabase) und GitHub mit erfundenen Daten
   (keine Kundendaten, keine echte Verbindung) und prüft:
   - alle Seiten laden ohne JavaScript-Fehler und ohne Verstöße gegen die Sicherheitsregel (CSP)
   - Menü, Zurück-Knopf, Direktlinks (#download …)
   - alle 14 Sprachen: vollständig, Platzhalter erhalten, keine deutschen Reste, nichts zu breit auf dem Handy, Arabisch rechts-nach-links
   - Sprachauswahl mit Maus und Tastatur
   - Kundenportal: Gerät verbinden (falscher/richtiger KEY), Playlist anlegen, Xtream-Link erkennen, bearbeiten, löschen, Support-Nachricht

   Ausführen:  npm i --no-save playwright  (einmalig)  und dann  node tests/site.e2e.js
   Ergebnis: Liste aller Prüfungen; Rückgabewert 1, wenn etwas fehlschlägt. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'docs');
const LANGS = ['de', 'en', 'tr', 'pl', 'ru', 'ar', 'uk', 'ro', 'it', 'el', 'ku', 'hr', 'es', 'fr'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

let passed = 0, failed = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + name); }
  else { failed++; fails.push(name); console.log('  ✗ ' + name + (detail ? '  →  ' + detail : '')); }
}
function group(name) { console.log('\n' + name); }

/* ---------- kleiner Webserver für docs/ (wie GitHub Pages, inkl. 404.html) ---------- */
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, path.normalize(p));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'Content-Type': TYPES['.html'] }); res.end(fs.readFileSync(path.join(ROOT, '404.html'))); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* ---------- erfundener Online-Dienst ---------- */
function fakeBackend() {
  const DEV = { mac: 'AA:BB:CC:DD:EE:01', key: 'TEST42' };
  const state = { items: [], support: [], seq: 0 };
  function handle(fn, b) {
    const authed = b.p_mac === DEV.mac && b.p_key === DEV.key;
    if (!authed) return { ok: false, error: 'MAC-Adresse oder KEY ist falsch.' };
    if (fn === 'list_playlists') return { ok: true, items: state.items };
    if (fn === 'add_playlist') {
      const it = { id: 'id-' + (++state.seq), name: b.p_name, type: b.p_type, url: b.p_url || null, server: b.p_server || null, username: b.p_username || null, password: b.p_password || null };
      state.items.push(it); return { ok: true, id: it.id };
    }
    if (fn === 'update_playlist') {
      const it = state.items.find(x => x.id === b.p_id); if (!it) return { ok: false, error: 'Nicht gefunden.' };
      Object.assign(it, { name: b.p_name, type: b.p_type, url: b.p_url || null, server: b.p_server || null, username: b.p_username || null, password: b.p_password || null });
      return { ok: true };
    }
    if (fn === 'delete_playlist') { state.items = state.items.filter(x => x.id !== b.p_id); return { ok: true }; }
    if (fn === 'send_support') { state.support.push(b); return { ok: true }; }
    return { ok: false, error: 'Unbekannte Funktion' };
  }
  return { DEV, state, handle };
}

async function newPage(browser, opts, backend) {
  const ctx = await browser.newContext(Object.assign({ locale: 'de-DE', viewport: { width: 1280, height: 860 } }, opts || {}));
  const errors = [];
  await ctx.route('https://api.github.com/**', r => r.fulfill({
    status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify([{ tag_name: 'neueste', name: 'Telvo Player 9.9.9', assets: [{ name: 'lumio-player.apk', size: 9000000, updated_at: '2030-01-01T10:00:00Z' }] }])
  }));
  await ctx.route('https://oofzhklrbrpxjoicwbsf.supabase.co/**', r => {
    const req = r.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const fn = req.url().split('/rpc/')[1];
    const out = backend ? backend.handle(fn, JSON.parse(req.postData() || '{}')) : { ok: false, error: 'offline' };
    return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(out) });
  });
  await ctx.route(/github\.com\/Splix66\/lumio-player\/releases\/download/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('Skriptfehler: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  try {
    /* ---------- 1. Sprachdateien (ohne Browser) ---------- */
    group('Sprachdateien');
    global.window = {};
    for (const l of LANGS.slice(1)) require(path.join(ROOT, 'assets', 'i18n', l + '.js'));
    const ref = Object.keys(window.LUMIO_I18N.en);
    const cnt = (s, re) => (String(s).match(re) || []).length;
    for (const l of LANGS.slice(1)) {
      const d = window.LUMIO_I18N[l] || {};
      const keys = Object.keys(d);
      const missing = ref.filter(k => !(k in d)), extra = keys.filter(k => !ref.includes(k));
      const broken = keys.filter(k => typeof d[k] !== 'string' || !d[k].trim() || [/\{\d\}/g, /<b>/g, /<\/b>/g].some(re => cnt(k, re) !== cnt(d[k], re)));
      check(l + ': ' + keys.length + ' Texte, vollständig, Platzhalter erhalten', !missing.length && !extra.length && !broken.length,
        [missing.length && missing.length + ' fehlen', extra.length && extra.length + ' zu viel', broken.length && 'fehlerhaft: ' + broken[0].slice(0, 40)].filter(Boolean).join(', '));
    }

    /* ---------- 2. Alle Seiten laden fehlerfrei ---------- */
    group('Seiten laden ohne Fehler (inkl. Sicherheitsregel)');
    for (const [p, sel] of [['', '.hero h1'], ['impressum.html', 'h1'], ['datenschutz.html', 'h1'], ['gibt-es-nicht', 'h1'], ['app/', '#dl'], ['admin.html?demo', '#loginForm']]) {
      const { ctx, page, errors } = await newPage(browser);
      const resp = await page.goto(base + p); await page.waitForTimeout(300);
      const visible = await page.isVisible(sel);
      check('/' + p + (p === 'gibt-es-nicht' ? ' (eigene 404-Seite)' : ''), visible && !errors.length && (p === 'gibt-es-nicht' ? resp.status() === 404 : resp.ok()), errors[0] || (!visible && sel + ' fehlt'));
      await ctx.close();
    }

    /* ---------- 3. Navigation ---------- */
    group('Navigation');
    {
      const { ctx, page, errors } = await newPage(browser);
      await page.goto('about:blank'); await page.goto(base);
      const cur = () => page.evaluate(() => [['viewHome', 'viewMain', 'viewDl', 'viewHelp'].filter(i => !document.getElementById(i).hidden)[0], document.querySelector('.nav [aria-current=page]').id]);
      await page.click('#tabDl'); await page.waitForFunction(() => !document.getElementById('viewDl').hidden);
      await page.click('#tabHelp'); await page.waitForFunction(() => !document.getElementById('viewHelp').hidden, null, { timeout: 3000 }).catch(() => {});
      check('Menü wechselt Bereich und markiert ihn', JSON.stringify(await cur()) === '["viewHelp","tabHelp"]', JSON.stringify(await cur()));
      await page.goBack(); await page.waitForTimeout(150);
      check('Zurück-Knopf führt zum vorherigen Bereich', JSON.stringify(await cur()) === '["viewDl","tabDl"]', page.url());
      await page.goBack(); await page.waitForTimeout(150);
      check('Zweimal zurück → Startseite (bleibt auf der Seite)', page.url().startsWith(base) && (await cur())[0] === 'viewHome', page.url());
      await page.click('button[data-go=dl]'); await page.waitForTimeout(150);
      check('Knopf „App herunterladen“ öffnet Download', (await cur())[0] === 'viewDl');
      await page.waitForTimeout(400);
      check('Download zeigt Version aus GitHub', /9\.9\.9/.test(await page.textContent('#dlList')));
      await page.goto(base + '#hilfe'); await page.waitForTimeout(150);
      check('Direktlink #hilfe öffnet Hilfe', (await cur())[0] === 'viewHelp');
      check('keine Fehler', !errors.length, errors[0]);
      await ctx.close();
    }

    /* ---------- 4. Sprachauswahl ---------- */
    group('Sprachauswahl');
    {
      const { ctx, page, errors } = await newPage(browser);
      await page.goto(base); await page.waitForTimeout(200);
      await page.click('#langBtn');
      check('Liste mit 14 Sprachen öffnet sich', await page.isVisible('#langMenu') && (await page.$$('#langMenu button')).length === 14);
      await page.click('#langMenu [data-lang=en]'); await page.waitForTimeout(300);
      check('Klick auf English übersetzt die Seite', (await page.textContent('.hero h1')).startsWith('Live TV, movies'));
      await page.focus('#langBtn'); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
      check('Tastatur: Pfeil runter + Enter wählt nächste Sprache', await page.evaluate(() => document.documentElement.lang) === 'tr');
      await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
      check('Escape schließt Liste, Fokus zurück auf Knopf', await page.isHidden('#langMenu') && await page.evaluate(() => document.activeElement.id) === 'langBtn');
      await page.reload(); await page.waitForTimeout(300);
      check('Gewählte Sprache bleibt nach Neuladen', await page.evaluate(() => document.documentElement.lang) === 'tr');
      check('keine Fehler', !errors.length, errors[0]);
      await ctx.close();
      const b = await newPage(browser, { locale: 'fr-FR' });
      await b.page.goto(base); await b.page.waitForTimeout(300);
      check('Browsersprache (Französisch) wird erkannt', await b.page.evaluate(() => document.documentElement.lang) === 'fr');
      await b.ctx.close();
    }

    /* ---------- 5. Alle Sprachen auf Handy und Desktop ---------- */
    group('Alle 14 Sprachen in allen Bereichen (Desktop 1280 px, Handy 360 px)');
    for (const vp of [{ width: 1280, height: 860 }, { width: 360, height: 740 }]) {
      const { ctx, page, errors } = await newPage(browser, { viewport: vp });
      const probs = [];
      for (const l of LANGS) {
        for (const h of ['', '#playlist', '#download', '#hilfe']) {
          await page.goto(base + '?lang=' + l + h); await page.waitForTimeout(120);
          const r = await page.evaluate(() => {
            const nav = document.querySelector('.nav');
            const rest = [...document.querySelectorAll('[data-t]')].filter(e => e.offsetParent && document.documentElement.lang !== 'de' && e.textContent === e.getAttribute('data-k') && /[äöüß]/.test(e.textContent));
            return { lang: document.documentElement.lang, dir: document.documentElement.dir, ox: document.documentElement.scrollWidth - innerWidth, nav: nav.scrollWidth - nav.clientWidth, rest: rest.length };
          });
          if (r.lang !== l) probs.push(l + h + ': Sprache nicht geladen');
          if (r.dir !== (l === 'ar' ? 'rtl' : 'ltr')) probs.push(l + ': Schreibrichtung ' + r.dir);
          if (r.ox > 0) probs.push(l + h + ': Seite ' + r.ox + ' px zu breit');
          if (r.nav > 2) probs.push(l + h + ': Menü ' + r.nav + ' px zu breit');
          if (r.rest) probs.push(l + h + ': ' + r.rest + ' deutsche Reste');
        }
      }
      check(vp.width + ' px: alle Sprachen geladen, nichts zu breit, keine deutschen Reste', !probs.length, probs.slice(0, 4).join(' | '));
      check(vp.width + ' px: keine Fehler', !errors.length, errors[0]);
      await ctx.close();
    }

    /* ---------- 6. Kundenportal mit erfundenem Online-Dienst ---------- */
    group('Kundenportal');
    {
      const be = fakeBackend();
      const { ctx, page, errors } = await newPage(browser, null, be);
      await page.goto(base + '#playlist');
      await page.fill('#mac', 'aabbccddee01'); await page.fill('#key', 'FALSCH');
      check('MAC wird beim Tippen formatiert', await page.inputValue('#mac') === 'AA:BB:CC:DD:EE:01');
      await page.click('#loginBtn'); await page.waitForTimeout(300);
      check('Falscher KEY → Fehlermeldung, bleibt bei Anmeldung', /falsch/.test(await page.textContent('#loginMsg')) && await page.isVisible('#loginForm'));
      await page.fill('#key', 'test42'); await page.click('#loginBtn'); await page.waitForTimeout(400);
      check('Richtiger KEY → verbunden, Editor für erste Playlist offen', await page.isVisible('#dash') && await page.isVisible('#editor'));
      await page.fill('#name', 'Wohnzimmer'); await page.fill('#url', 'http://beispiel.test/liste.m3u');
      await page.click('#saveBtn'); await page.waitForTimeout(400);
      check('M3U-Playlist wird gesendet und angezeigt', be.state.items.length === 1 && be.state.items[0].type === 'm3u' && /Wohnzimmer/.test(await page.textContent('#list')));
      await page.click('#newBtn'); await page.fill('#url', 'http://srv.test:8080/get.php?username=max&password=geheim&type=m3u');
      await page.click('#saveBtn'); await page.waitForTimeout(400);
      const x = be.state.items[1] || {};
      check('Xtream-Link im M3U-Feld wird als Xtream erkannt', x.type === 'xtream' && x.server === 'http://srv.test:8080' && x.username === 'max' && x.password === 'geheim', JSON.stringify(x));
      await page.click('#list li:first-child button:has-text("Bearbeiten")'); await page.fill('#name', 'Küche'); await page.click('#saveBtn'); await page.waitForTimeout(400);
      check('Bearbeiten speichert neuen Namen', be.state.items[0].name === 'Küche');
      const del = '#list li:first-child button.danger';
      await page.click(del); await page.waitForTimeout(100);
      check('Löschen fragt erst nach („Wirklich löschen?“)', be.state.items.length === 2 && await page.$eval(del, b => b.classList.contains('is-armed')));
      await page.click(del); await page.waitForTimeout(400);
      check('Zweiter Klick löscht', be.state.items.length === 1);
      check('Zähler im Menü zeigt Anzahl', (await page.textContent('#plCount')) === '1');
      await page.click('#tabHelp'); await page.fill('#supMsg', 'Testnachricht: Sender ruckeln am Abend.'); await page.click('#supBtn'); await page.waitForTimeout(400);
      check('Support-Nachricht wird gesendet', be.state.support.length === 1 && be.state.support[0].p_mac === be.DEV.mac);
      await page.click('#tabMain'); await page.click('#logoutBtn');
      check('„Anderes Gerät“ meldet ab', await page.isVisible('#loginForm') && await page.isHidden('#dash'));
      check('keine Fehler', !errors.length, errors[0]);
      await ctx.close();
      const q = await newPage(browser, null, be);
      await q.page.goto(base + '?mac=AABBCCDDEE01&key=TEST42&lang=en'); await q.page.waitForTimeout(500);
      check('QR-Code-Link aus der App verbindet automatisch (und in App-Sprache)', await q.page.isVisible('#dash') && await q.page.evaluate(() => document.documentElement.lang) === 'en');
      check('QR-Code-Link: KEY verschwindet aus der Adresszeile', !/key=/i.test(q.page.url()), q.page.url());
      await q.ctx.close();
    }

    /* ---------- 7. Kontakt per E-Mail ---------- */
    group('Kontakt per E-Mail');
    {
      const { ctx, page, errors } = await newPage(browser);
      await page.goto(base + '#hilfe'); await page.waitForTimeout(200);
      const conf = /var CONTACT_EMAIL = '([^']*)'/.exec(fs.readFileSync(path.join(ROOT, 'assets', 'site.js'), 'utf8'))[1];
      check(conf ? 'Kontakt-Kasten sichtbar (' + conf + ')' : 'ohne eingetragene Adresse bleibt der Kontakt-Kasten ausgeblendet', await page.isVisible('#contactMail') === !!conf);
      await ctx.close();
      // mit Test-Adresse: Kasten erscheint, Link ist korrekt, auch auf Englisch
      const t = await newPage(browser);
      await t.ctx.route('**/assets/site.js', async r => {
        const body = fs.readFileSync(path.join(ROOT, 'assets', 'site.js'), 'utf8').replace(/var CONTACT_EMAIL = '[^']*'/, "var CONTACT_EMAIL = 'support@beispiel.test'");
        r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
      });
      await t.page.goto(base + '?lang=en#hilfe'); await t.page.waitForTimeout(300);
      const href = await t.page.getAttribute('#contactMailLink', 'href');
      check('Mit Adresse: Kasten sichtbar, mailto-Link korrekt, übersetzt', await t.page.isVisible('#contactMail') && href.startsWith('mailto:support@beispiel.test') && /No app installed yet/.test(await t.page.textContent('#contactMail')), href);
      check('keine Fehler', !errors.length && !t.errors.length, errors[0] || t.errors[0]);
      await t.ctx.close();
    }
  } catch (e) {
    check('Test lief ohne Absturz', false, e.message.split('\n')[0]);
  } finally {
    await browser.close(); srv.close();
  }
  console.log('\n' + passed + ' bestanden, ' + failed + ' fehlgeschlagen');
  if (failed) console.log('Fehlgeschlagen:\n- ' + fails.join('\n- '));
  process.exit(failed ? 1 : 0);
})();
