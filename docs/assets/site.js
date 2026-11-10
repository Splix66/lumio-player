/* Telvo-Webseite – Bereiche, Kundenportal (Playlists per MAC + KEY), Download, Hilfe & Support */
(function () {
  'use strict';
  var API = 'https://oofzhklrbrpxjoicwbsf.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_cx6n8buREFat_yE7kKW6FA_SnMsOQX7';
  // Support-Adresse für Besucher ohne App (z. B. 'support@lumio-player.de'). Leer = Kontakt-Kasten bleibt ausgeblendet.
  var CONTACT_EMAIL = 'telvo.support@gmail.com';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Häufige Fragen (Deutsch ist die Grundsprache, Übersetzungen unten) ---------- */
  var FAQ = [
    ['Wie installiere ich die App auf Fire TV oder einer Android-Box?', [
      'Installiere aus dem App-Store die kostenlose App „Downloader“ und öffne sie.',
      'Gib dort den Code 5619512 ein (oder die Adresse splix66.github.io/lumio-player/app). Der Download startet von selbst, danach auf „Installieren“ drücken.',
      'Fire TV fragt beim ersten Mal nach einer Erlaubnis: unter Einstellungen → Mein Fire TV → Entwickleroptionen → „Apps unbekannter Herkunft installieren“ für Downloader einschalten. Fehlen die Entwickleroptionen, unter Mein Fire TV → Info 7-mal auf den Gerätenamen drücken.']],
    ['Wo finde ich MAC-Adresse und KEY?', [
      'Öffne Telvo Player auf deinem Fernseher oder Handy. MAC und KEY stehen ganz unten am Bildschirmrand – und oben rechts unter „Profil“.',
      'Ist noch keine Playlist eingerichtet, zeigt die App beides groß auf dem Startbildschirm, zusammen mit einem QR-Code. Scannst du ihn mit dem Handy, öffnet sich diese Seite mit allem schon ausgefüllt.']],
    ['Meine Playlist erscheint nicht in der App', [
      'Die App fragt alle 30 Sekunden nach neuen Playlists, solange sie geöffnet und mit dem Internet verbunden ist. Warte kurz oder starte die App neu.',
      'Prüfe, ob MAC und KEY hier genau mit denen in der App übereinstimmen. Jedes Gerät hat eigene Werte.']],
    ['Sender oder Filme starten nicht', [
      'Prüfe zuerst, ob dein Zugang noch läuft: Die Restlaufzeit steht in der App unten rechts. Ist er abgelaufen, muss er verlängert werden.',
      'Bei Live-Sendern hilft oft ein anderes Format: In der App unter Einstellungen → Live-Stream-Format zwischen HLS und MPEG-TS wechseln.',
      'Hat sich das Passwort geändert, kannst du die Playlist hier unter „Playlists“ bearbeiten.']],
    ['Das Bild ruckelt oder bleibt hängen', [
      'Meist liegt es an der Internetverbindung oder am Server der Playlist. Ein Netzwerkkabel statt WLAN hilft beim Fernseher oft spürbar.',
      'Viele Zugänge erlauben nur eine Verbindung gleichzeitig. Läuft derselbe Zugang auf einem zweiten Gerät, bricht das Bild ab.']],
    ['Was ist der Unterschied zwischen M3U und Xtream?', [
      'Ein M3U-Link ist eine einzelne Adresse mit allen Sendern. Xtream Codes besteht aus Server-Adresse, Benutzername und Passwort.',
      'Wenn du beides hast, nimm Xtream: Kategorien laden schneller und Filme und Serien bekommen Beschreibungen, Cover und Staffeln.']],
    ['Gehen Favoriten verloren, wenn ich eine Playlist bearbeite?', [
      'Nein. Beim Bearbeiten bleibt die Playlist dieselbe – Favoriten und „Weiterschauen“ bleiben in der App erhalten. Nur beim Löschen werden sie mit entfernt.']],
    ['Sind meine Zugangsdaten sicher?', [
      'Alle Daten werden verschlüsselt übertragen. Abrufen kann sie nur, wer MAC-Adresse und KEY deines Geräts kennt. Nach 20 falschen Versuchen wird das Gerät für eine Stunde gesperrt.',
      'Gib MAC und KEY deshalb nicht an Fremde weiter.']],
    ['Woher bekomme ich Sender?', [
      'Telvo Player ist nur der Player und enthält keine Sender oder Inhalte. Die Playlist bringst du selbst mit.']]
  ];

  /* ---------- Download: feste Links, die immer auf die neueste Version zeigen ---------- */
  var DL_BASE = 'https://github.com/Splix66/lumio-player/releases/download/';
  var DL = [
    { id: 'apk', icon: 'phone', name: 'Android', sub: 'Handy, Tablet und TV-Box', tag: 'neueste', file: 'lumio-player.apk', share: 'https://splix66.github.io/lumio-player/app' },
    // old: früherer Dateiname – wird nur verlinkt, solange auf GitHub noch keine Datei mit neuem Namen liegt
    { id: 'win', icon: 'monitor', name: 'Windows', sub: 'Windows 10 und 11', tag: 'pc', file: 'telvo-player-setup.exe', old: 'lumio-player-setup.exe' },
    { id: 'mac', icon: 'laptop', name: 'Mac', sub: 'Apple-Chip und Intel', tag: 'pc', file: 'telvo-player-mac.dmg', old: 'lumio-player-mac.dmg' }
  ];
  var DL_FAQ = [
    ['Android blockiert die Installation', [
      'Beim ersten Mal fragt Android nach einer Erlaubnis. Tippe auf „Einstellungen“ und erlaube „Aus dieser Quelle installieren“ für deinen Browser oder für Downloader. Danach geht die Installation weiter.',
      'Erscheint „App nicht installiert“, ist noch eine ältere Telvo-Version drauf. Deinstalliere sie einmal und installiere dann neu.']],
    ['Windows meldet „Der Computer wurde durch Windows geschützt“', [
      'Das erscheint bei neuen Programmen, die Windows noch nicht kennt. Klicke auf „Weitere Informationen“ und dann auf „Trotzdem ausführen“.',
      'Danach findest du Telvo Player im Startmenü und auf dem Desktop.']],
    ['Der Mac öffnet die App nicht', [
      'Öffne die heruntergeladene Datei und ziehe Telvo Player in den Ordner „Programme“.',
      'Meldet der Mac beim ersten Start, dass die App nicht überprüft werden kann: Systemeinstellungen → Datenschutz & Sicherheit → ganz unten „Dennoch öffnen“ wählen. Das ist nur einmal nötig.',
      'Steht dort, die App sei „beschädigt“: Programm „Terminal“ öffnen, xattr -cr "/Applications/Telvo Player.app" eingeben und Enter drücken. Danach startet die App normal.']],
    ['Wie bekomme ich Updates?', [
      'Lade die App hier einfach erneut herunter und installiere sie über die alte Version. Die Links liefern immer die neueste Version.',
      'Playlists, Favoriten und Einstellungen bleiben dabei erhalten.']]
  ];

  /* ---------- Sprachen: dieselben 14 wie in der App ----------
     Deutsch ist die Grundsprache (steht direkt im HTML). Jede andere Sprache liegt in assets/i18n/<code>.js
     und wird erst geladen, wenn sie gebraucht wird. Reihenfolge und Namen wie in der App (www/js/app.js). */
  var LANGS = [['de', 'Deutsch'], ['en', 'English'], ['tr', 'Türkçe'], ['pl', 'Polski'], ['ru', 'Русский'], ['ar', 'العربية'],
    ['uk', 'Українська'], ['ro', 'Română'], ['it', 'Italiano'], ['el', 'Ελληνικά'], ['ku', 'Kurdî (Kurmancî)'],
    ['hr', 'Bosanski / Hrvatski / Srpski'], ['es', 'Español'], ['fr', 'Français']];
  var LOCALES = { de: 'de-DE', en: 'en-GB', tr: 'tr-TR', pl: 'pl-PL', ru: 'ru-RU', ar: 'ar-u-nu-latn', uk: 'uk-UA', ro: 'ro-RO', it: 'it-IT', el: 'el-GR', ku: 'ku', hr: 'hr-HR', es: 'es-ES', fr: 'fr-FR' };
  var RTL = { ar: 1 };
  function known(l) { return LOCALES.hasOwnProperty(l); }
  function normLang(l) { l = String(l || '').slice(0, 2).toLowerCase(); return l === 'bs' || l === 'sr' ? 'hr' : l; }

  // Reihenfolge: ?lang= aus der App > zuletzt gewählt > Sprache des Browsers > Deutsch
  // Werte aus dem QR-Code der App: neu hinter „#“ (wird nie an einen Server geschickt),
  // ältere App-Versionen schicken sie als ?mac=…&key=… – beides wird gelesen.
  var qs0 = new URLSearchParams(location.search);
  var hs0 = /(^|&)(mac|key)=/i.test(location.hash.slice(1)) ? new URLSearchParams(location.hash.slice(1)) : null;
  function qp(k) { return (hs0 && hs0.get(k)) || qs0.get(k) || ''; }
  var lang = '';
  if (qp('lang')) lang = normLang(qp('lang'));
  if (!known(lang)) try { lang = sessionStorage.getItem('lumio.lang') || ''; } catch (e) {}
  if (!known(lang)) lang = normLang((navigator.languages && navigator.languages[0]) || navigator.language);
  if (!known(lang)) lang = 'de';
  function dict() { var all = window.LUMIO_I18N || {}; return lang !== 'de' ? all[lang] : null; }
  function tr(s) { var d = dict(); return d && d[s] != null ? d[s] : s; }
  var docTitle = document.title;

  // Lädt die Sprachdatei (einmal) und ruft dann done() auf. Fehlt sie, bleibt es bei Deutsch.
  var langLoading = {};
  function loadLang(l, done) {
    if (l === 'de' || (window.LUMIO_I18N && window.LUMIO_I18N[l])) { done(true); return; }
    if (langLoading[l]) { langLoading[l].push(done); return; }
    langLoading[l] = [done];
    var sc = document.createElement('script');
    sc.src = 'assets/i18n/' + l + '.js';
    function fin(ok) { var cbs = langLoading[l]; delete langLoading[l]; cbs.forEach(function (cb) { cb(ok); }); }
    sc.onload = function () { fin(!!(window.LUMIO_I18N && window.LUMIO_I18N[l])); };
    sc.onerror = function () { sc.parentNode && sc.parentNode.removeChild(sc); fin(false); };
    document.head.appendChild(sc);
  }
  function setLang(l, remember) {
    if (!known(l)) l = 'de';
    if (remember) try { sessionStorage.setItem('lumio.lang', l); } catch (e) {}
    loadLang(l, function (ok) { lang = ok ? l : 'de'; applyLang(); });
  }

  function buildFaq(box, list) {
    var open = {};
    Array.prototype.forEach.call(box.querySelectorAll('details'), function (d, i) { if (d.open) open[i] = 1; });
    box.textContent = '';
    list.forEach(function (f, i) {
      var d = document.createElement('details');
      if (open[i]) d.open = true;
      var s = document.createElement('summary'); s.textContent = tr(f[0]);
      var a = document.createElement('div'); a.className = 'a';
      f[1].forEach(function (p) { var el = document.createElement('p'); el.textContent = tr(p); a.appendChild(el); });
      d.appendChild(s); d.appendChild(a); box.appendChild(d);
    });
  }
  function applyLang() {
    document.documentElement.setAttribute('lang', lang);
    document.title = tr(docTitle);
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (el) {
      if (!el.hasAttribute('data-k')) el.setAttribute('data-k', el.textContent.trim());
      el.textContent = tr(el.getAttribute('data-k'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tp]'), function (el) {
      if (!el.hasAttribute('data-kp')) el.setAttribute('data-kp', el.placeholder);
      el.placeholder = tr(el.getAttribute('data-kp'));
    });
    document.documentElement.setAttribute('dir', RTL[lang] ? 'rtl' : 'ltr');
    paintLangPicker();
    buildFaq($('faq'), FAQ);
    buildFaq($('dlFaq'), DL_FAQ);
    renderDownloads();
    if (device) { $('tabMainLabel').textContent = tr('Playlists'); render(); paintEditor(); }
    else $('tabMainLabel').textContent = tr('Playlist hochladen');
    $('showPass').textContent = tr($('pass').type === 'password' ? 'Anzeigen' : 'Verbergen');
  }

  /* ---------- Sprachauswahl: Knopf mit aktueller Sprache, Liste erst nach Klick (wie in der App) ---------- */
  var langBtn = $('langBtn'), langMenu = $('langMenu');
  LANGS.forEach(function (l) {
    var li = document.createElement('li');
    li.setAttribute('role', 'none');
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('data-lang', l[0]);
    b.setAttribute('lang', l[0]);
    b.textContent = l[1];
    b.addEventListener('click', function () { closeLangMenu(true); if (l[0] !== lang) setLang(l[0], true); });
    li.appendChild(b); langMenu.appendChild(li);
  });
  function paintLangPicker() {
    var cur = LANGS.filter(function (l) { return l[0] === lang; })[0] || LANGS[0];
    $('langName').textContent = cur[1];
    $('langCode').textContent = cur[0].toUpperCase();
    langBtn.setAttribute('aria-label', 'Sprache / Language: ' + cur[1]);
    Array.prototype.forEach.call(langMenu.querySelectorAll('button'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-lang') === lang)); });
  }
  function langItems() { return Array.prototype.slice.call(langMenu.querySelectorAll('button')); }
  function openLangMenu() {
    langMenu.hidden = false; langBtn.setAttribute('aria-expanded', 'true');
    var cur = langMenu.querySelector('[aria-checked="true"]') || langItems()[0];
    cur.focus(); cur.scrollIntoView({ block: 'nearest' });
  }
  function closeLangMenu(focusBtn) {
    if (langMenu.hidden) return;
    langMenu.hidden = true; langBtn.setAttribute('aria-expanded', 'false');
    if (focusBtn) langBtn.focus();
  }
  langBtn.addEventListener('click', function () { if (langMenu.hidden) openLangMenu(); else closeLangMenu(true); });
  langMenu.addEventListener('keydown', function (e) {
    var items = langItems(), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeLangMenu(true); }
    else if (e.key === 'Tab') closeLangMenu(false);
  });
  document.addEventListener('click', function (e) { if (!langMenu.hidden && !$('langPick').contains(e.target)) closeLangMenu(false); });

  /* ---------- Hilfsfunktionen ---------- */
  var device = null, items = null, editing = null, mode = 'm3u', toastTimer = null;
  function rpc(fn, body) {
    // Zeitlimit 15 s: ohne Antwort blieb der Knopf sonst für immer auf „Verbinde …“ stehen
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    return fetch(API + fn, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { clearTimeout(timer); return r.json(); }).then(function (j) {
      return j && typeof j === 'object' && 'ok' in j ? j : { ok: false, error: (j && j.message) || 'Keine Verbindung. Bitte Internet prüfen und erneut versuchen.' };
    }, function () {
      return { ok: false, error: 'Keine Verbindung. Bitte Internet prüfen und erneut versuchen.' };
    });
  }
  function say(el, text, kind) { el.textContent = text ? tr(text) : ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }
  function toast(text) {
    var el = $('toast'); el.textContent = text; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('on'); }, 3200);
  }
  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), u = document.createElementNS(ns, 'use');
    s.setAttribute('class', 'i'); u.setAttribute('href', '#i-' + name); s.appendChild(u); return s;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function normMac(v) {
    var hex = String(v || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    if (hex.length !== 12) return null;
    return hex.match(/../g).join(':');
  }
  function hostOf(u) { var m = /^[a-z]+:\/\/([^\/?#]+)/i.exec(String(u || '')); return m ? m[1] : String(u || ''); }
  function parseXtream(link) {
    var m = /^(https?:\/\/[^\/?#]+)(?:\/[^?#]*)?\/(?:get|player_api)\.php\?(.*)$/i.exec(String(link || '').trim());
    if (!m) return null;
    var q = {};
    m[2].split('&').forEach(function (p) { var kv = p.split('='); try { q[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('=')); } catch (e) {} });
    return q.username && q.password ? { server: m[1], username: q.username, password: q.password } : null;
  }

  /* ---------- Bereiche umschalten ---------- */
  var TABS = { home: ['tabHome', 'viewHome', ''], main: ['tabMain', 'viewMain', '#playlist'], dl: ['tabDl', 'viewDl', '#download'], help: ['tabHelp', 'viewHelp', '#hilfe'] };
  var HASH = { '#start': 'home', '#playlist': 'main', '#download': 'dl', '#hilfe': 'help' };
  var curTab = 'home';
  function showTab(which, keepScroll) {
    curTab = TABS[which] ? which : 'home';
    Object.keys(TABS).forEach(function (k) {
      if (k === curTab) $(TABS[k][0]).setAttribute('aria-current', 'page'); else $(TABS[k][0]).removeAttribute('aria-current');
      $(TABS[k][1]).hidden = k !== curTab;
    });
    if (curTab === 'dl') { renderDownloads(); loadReleases(); }
    if (!keepScroll) try { window.scrollTo(0, 0); } catch (e) {}
    // Adresse merken, damit man z. B. …/lumio-player/#download direkt weitergeben kann
    var h = TABS[curTab][2];
    if (location.hash !== h) try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) {}
  }
  // Bereich wechseln und dabei einen Eintrag im Verlauf anlegen – so führt der Zurück-Knopf
  // des Handys/Browsers zum vorherigen Bereich statt aus der Seite heraus.
  function goTab(which) {
    var h = TABS[which][2] || '#start';
    if (location.hash.toLowerCase() === h || (!location.hash && which === 'home')) showTab(which);
    else location.hash = h; // löst „hashchange“ aus -> showTab
  }
  // Menüpunkte sind echte Links (#playlist …); erneutes Antippen des aktiven Bereichs springt nach oben
  Object.keys(TABS).forEach(function (k) {
    $(TABS[k][0]).addEventListener('click', function (e) { if (curTab === k) { e.preventDefault(); showTab(k); } });
  });
  // Knöpfe auf der Startseite („Playlist hochladen“, „App herunterladen“, Geräte)
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
    b.addEventListener('click', function () { goTab(b.getAttribute('data-go')); });
  });
  window.addEventListener('hashchange', function () { showTab(HASH[location.hash.toLowerCase()] || 'home'); });

  /* ---------- Download ---------- */
  var relInfo = null, relLoading = false;
  function myPlatform() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android|AFT|Silk/i.test(ua)) return 'apk';
    if (/Windows/.test(ua)) return 'win';
    if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
    return '';
  }
  function locale() { return LOCALES[lang] || 'de-DE'; }
  function dlMeta(x) {
    var i = relInfo && relInfo[x.id];
    if (!i || !i.date) return tr('Immer die neueste Version');
    var date = new Date(i.date).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
    var mb = (i.size / 1048576).toLocaleString(locale(), { maximumFractionDigits: i.size >= 100 * 1048576 ? 0 : 1 }) + ' MB';
    var s = i.v ? tr('Version {0} vom {1}').replace('{0}', i.v).replace('{1}', date) : tr('Stand: {0}').replace('{0}', date);
    return s + ' (' + mb + ')';
  }
  function copyText(text) {
    function fallback() {
      var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      return ok ? Promise.resolve() : Promise.reject();
    }
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text).catch(fallback) : fallback();
    p.then(function () { toast(tr('Link kopiert.')); }, function () { toast(text); });
  }
  function renderDownloads() {
    var keys = $('dlKeys');
    if (!keys.firstChild) '5619512'.split('').forEach(function (c) { keys.appendChild(el('span', null, c)); });
    var mine = myPlatform();
    $('dlIos').hidden = mine !== 'ios';
    var list = $('dlList'); list.textContent = '';
    var order = DL.slice().sort(function (a, b) { return (b.id === mine) - (a.id === mine); });
    order.forEach(function (x) {
      var url = DL_BASE + x.tag + '/' + ((relInfo && relInfo[x.id] && relInfo[x.id].file) || x.file);
      var li = el('li', 'pl' + (x.id === mine ? ' is-mine' : ''));
      var ic = el('span', 'ic'); ic.appendChild(icon(x.icon));
      var txt = el('div', 't');
      var b = el('b', null, x.name);
      if (x.id === mine) b.appendChild(el('span', 'mine', tr('Dein Gerät')));
      txt.appendChild(b);
      txt.appendChild(el('small', null, tr(x.sub)));
      txt.appendChild(el('small', 'meta', dlMeta(x)));
      var act = el('div', 'act');
      var a = el('a', 'btn small'); a.href = url; a.setAttribute('download', '');
      a.appendChild(icon('down')); a.appendChild(el('span', null, tr('Herunterladen')));
      var cp = el('button', 'ghost small'); cp.type = 'button';
      cp.setAttribute('aria-label', tr('Link kopieren')); cp.title = tr('Link kopieren');
      cp.appendChild(icon('copy'));
      cp.addEventListener('click', function () { copyText(x.share || url); });
      act.appendChild(a); act.appendChild(cp);
      li.appendChild(ic); li.appendChild(txt); li.appendChild(act);
      list.appendChild(li);
    });
  }
  /* Version, Datum und Größe direkt von GitHub holen (bei Fehlern bleibt es bei „Immer die neueste Version“) */
  function loadReleases() {
    if (relInfo || relLoading) return;
    try {
      var c = JSON.parse(sessionStorage.getItem('lumio.rel2') || 'null');
      if (c && Date.now() - c.t < 10 * 60 * 1000) { relInfo = c.d; renderDownloads(); return; }
    } catch (e) {}
    relLoading = true;
    fetch('https://api.github.com/repos/Splix66/lumio-player/releases?per_page=10', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rels) {
        var d = {};
        (rels || []).forEach(function (rel) {
          var v = (/(\d+\.\d+\.\d+)/.exec(rel.name || '') || [])[1] || '';
          (rel.assets || []).forEach(function (a) {
            DL.forEach(function (x) {
              if (x.tag !== rel.tag_name) return;
              // Neuer Dateiname hat Vorrang; der alte zählt nur, solange es den neuen noch nicht gibt
              if (a.name === x.file || (a.name === x.old && !(d[x.id] && d[x.id].file === x.file))) {
                d[x.id] = { size: a.size, date: a.updated_at, v: v, file: a.name };
              }
            });
          });
        });
        relInfo = d;
        try { sessionStorage.setItem('lumio.rel2', JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
        renderDownloads();
      }, function () {})
      .then(function () { relLoading = false; });
  }
  $('goConnect').addEventListener('click', function () { goTab('main'); $('mac').focus(); });

  /* ---------- Gerät verbinden ---------- */
  $('mac').addEventListener('input', function () {
    // Doppelpunkte automatisch setzen, während man tippt
    var hex = this.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
    var v = (hex.match(/.{1,2}/g) || []).join(':');
    if (v !== this.value) this.value = v;
  });
  function setConnected(on) {
    $('connect').hidden = on; $('dash').hidden = !on;
    $('supNeedDevice').hidden = on; $('supForm').hidden = !on;
    $('tabMainLabel').textContent = tr(on ? 'Playlists' : 'Playlist hochladen');
    if (!on) $('plCount').textContent = '';
  }
  function connect(mac, key, quiet) {
    var btn = $('loginBtn');
    btn.disabled = true; btn.textContent = tr('Verbinde …');
    return rpc('list_playlists', { p_mac: mac, p_key: key }).then(function (r) {
      btn.disabled = false; btn.textContent = tr('Verbinden');
      if (!r.ok) {
        say($('loginMsg'), r.error, 'bad');
        if (quiet) try { sessionStorage.removeItem('lumio.device'); } catch (e) {}
        return;
      }
      say($('loginMsg'), '');
      device = { mac: mac, key: key };
      try { sessionStorage.setItem('lumio.device', JSON.stringify(device)); } catch (e) {}
      $('devMac').textContent = mac;
      items = r.items || [];
      setConnected(true);
      render();
      if (!items.length) openEditor(null);
    });
  }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var mac = normMac($('mac').value);
    var key = $('key').value.trim().toUpperCase();
    if (!mac) { say($('loginMsg'), 'Bitte eine vollständige MAC-Adresse eingeben (12 Zeichen).', 'bad'); $('mac').focus(); return; }
    if (!/^[A-Z0-9]{6,12}$/.test(key)) { say($('loginMsg'), 'Bitte den KEY aus der App eingeben.', 'bad'); $('key').focus(); return; }
    say($('loginMsg'), '');
    connect(mac, key);
  });
  $('logoutBtn').addEventListener('click', function () {
    device = null; items = null; closeEditor();
    try { sessionStorage.removeItem('lumio.device'); } catch (e) {}
    setConnected(false);
    $('mac').value = ''; $('key').value = ''; $('mac').focus();
  });

  /* ---------- Playlists anzeigen ---------- */
  function refresh() {
    if (!device) return Promise.resolve();
    return rpc('list_playlists', { p_mac: device.mac, p_key: device.key }).then(function (r) {
      if (!r.ok) { toast(tr(r.error)); return; }
      items = r.items || [];
      render();
    });
  }
  function render() {
    var list = $('list');
    $('loading').hidden = items !== null;
    if (items === null) return;
    list.textContent = '';
    $('empty').hidden = items.length > 0 || !$('editor').hidden;
    $('plCount').textContent = items.length ? String(items.length) : '';
    items.forEach(function (it) {
      var li = el('li', 'pl' + (editing && editing.id === it.id ? ' is-editing' : ''));
      var ic = el('span', 'ic'); ic.appendChild(icon(it.type === 'xtream' ? 'server' : 'list'));
      var txt = el('div', 't');
      txt.appendChild(el('b', null, it.name));
      var line = el('small');
      line.appendChild(el('span', 'type', it.type === 'xtream' ? 'Xtream' : 'M3U'));
      line.appendChild(document.createTextNode(hostOf(it.type === 'xtream' ? it.server : it.url)));
      txt.appendChild(line);
      if (it.type === 'xtream' && it.username) txt.appendChild(el('small', null, tr('Benutzer') + ': ' + it.username));
      var act = el('div', 'act');
      var edit = el('button', 'ghost small'); edit.type = 'button';
      edit.appendChild(icon('edit')); edit.appendChild(el('span', null, tr('Bearbeiten')));
      edit.addEventListener('click', function () { openEditor(it); });
      var del = el('button', 'ghost small danger'); del.type = 'button';
      var delLabel = el('span', null, tr('Löschen'));
      del.appendChild(icon('trash')); del.appendChild(delLabel);
      var disarm = null;
      del.addEventListener('click', function () {
        if (!del.classList.contains('is-armed')) {
          // Zweimal tippen zum Löschen – schützt vor Versehen
          del.classList.add('is-armed'); delLabel.textContent = tr('Wirklich löschen?');
          disarm = setTimeout(function () { del.classList.remove('is-armed'); delLabel.textContent = tr('Löschen'); }, 4000);
          return;
        }
        clearTimeout(disarm); del.disabled = true;
        rpc('delete_playlist', { p_mac: device.mac, p_key: device.key, p_id: it.id }).then(function (r) {
          if (!r.ok) { del.disabled = false; toast(tr(r.error)); return; }
          if (editing && editing.id === it.id) closeEditor();
          toast(tr('Gelöscht.'));
          refresh();
        });
      });
      act.appendChild(edit); act.appendChild(del);
      li.appendChild(ic); li.appendChild(txt); li.appendChild(act);
      list.appendChild(li);
    });
  }

  /* ---------- Hinzufügen und Bearbeiten ---------- */
  function setMode(m) {
    mode = m;
    $('modeM3u').setAttribute('aria-selected', String(m === 'm3u'));
    $('modeXt').setAttribute('aria-selected', String(m === 'xtream'));
    $('m3uFields').hidden = m !== 'm3u';
    $('xtFields').hidden = m !== 'xtream';
  }
  $('modeM3u').addEventListener('click', function () { setMode('m3u'); });
  $('modeXt').addEventListener('click', function () { setMode('xtream'); });
  $('showPass').addEventListener('click', function () {
    var p = $('pass'); p.type = p.type === 'password' ? 'text' : 'password';
    this.textContent = tr(p.type === 'password' ? 'Anzeigen' : 'Verbergen');
  });
  function paintEditor() {
    $('edTitle').textContent = tr(editing ? 'Playlist bearbeiten' : 'Neue Playlist');
    $('edNote').textContent = tr(editing ? 'Favoriten und „Weiterschauen“ bleiben in der App erhalten.' : 'Die Playlist erscheint nach etwa 30 Sekunden in der App.');
    $('saveBtn').textContent = tr(editing ? 'Änderungen speichern' : 'Zum Gerät senden');
  }
  function openEditor(it) {
    editing = it || null;
    say($('edMsg'), '');
    $('name').value = it ? it.name : '';
    $('url').value = it && it.type === 'm3u' ? it.url || '' : '';
    $('server').value = it && it.type === 'xtream' ? it.server || '' : '';
    $('user').value = it && it.type === 'xtream' ? it.username || '' : '';
    $('pass').value = it && it.type === 'xtream' ? it.password || '' : '';
    $('pass').type = 'password'; $('showPass').textContent = tr('Anzeigen');
    setMode(it ? it.type : 'm3u');
    paintEditor();
    $('editor').hidden = false;
    $('newBtn').hidden = true;
    render();
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { (it ? $('name') : (mode === 'm3u' ? $('url') : $('server'))).focus({ preventScroll: true }); }, 250);
  }
  function closeEditor() {
    editing = null;
    $('editor').hidden = true; $('newBtn').hidden = false;
    if (items) render();
  }
  $('newBtn').addEventListener('click', function () { openEditor(null); });
  $('cancelBtn').addEventListener('click', closeEditor);

  $('editor').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { p_mac: device.mac, p_key: device.key, p_name: $('name').value.trim() };
    var x = mode === 'm3u' ? parseXtream($('url').value) : parseXtream($('server').value);
    if (x) {
      body.p_type = 'xtream'; body.p_server = x.server; body.p_username = x.username; body.p_password = x.password;
    } else if (mode === 'm3u') {
      body.p_type = 'm3u'; body.p_url = $('url').value.trim();
    } else {
      var srv = $('server').value.trim();
      if (srv && !/^https?:\/\//i.test(srv)) srv = 'http://' + srv;
      body.p_type = 'xtream'; body.p_server = srv.replace(/\/+$/, '');
      body.p_username = $('user').value.trim(); body.p_password = $('pass').value;
    }
    if (!body.p_name) body.p_name = body.p_type === 'xtream' ? (body.p_username || 'Xtream') : tr('Meine Playlist');
    var fn = 'add_playlist';
    if (editing) { fn = 'update_playlist'; body.p_id = editing.id; }
    var btn = $('saveBtn');
    btn.disabled = true; btn.textContent = tr(editing ? 'Speichere …' : 'Sende …');
    rpc(fn, body).then(function (r) {
      btn.disabled = false; paintEditor();
      if (!r.ok) { say($('edMsg'), r.error, 'bad'); return; }
      toast((x && mode === 'm3u' ? tr('Als Xtream-Zugang erkannt.') + ' ' : '') + tr(editing ? 'Gespeichert.' : 'Gesendet.') + ' ' + tr('Die Playlist erscheint nach etwa 30 Sekunden in der App.'));
      closeEditor();
      refresh();
    });
  });

  /* ---------- Kontakt per E-Mail (für alle ohne App) ---------- */
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(CONTACT_EMAIL)) {
    $('contactMail').hidden = false;
    $('contactMailLink').href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('Telvo Player');
    $('contactMailLink').appendChild(el('span', 'addr', ' · ' + CONTACT_EMAIL));
  }

  /* ---------- Support-Nachricht ---------- */
  $('supMsg').addEventListener('input', function () { $('supCount').textContent = this.value.length + ' / 2000'; });
  $('supForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('supMsg').value.trim();
    if (text.length < 5) { say($('supState'), 'Bitte beschreibe dein Anliegen etwas genauer.', 'bad'); $('supMsg').focus(); return; }
    var btn = $('supBtn');
    btn.disabled = true; btn.textContent = tr('Sende …');
    rpc('send_support', { p_mac: device.mac, p_key: device.key, p_topic: $('supTopic').value, p_message: text, p_contact: $('supContact').value.trim() }).then(function (r) {
      btn.disabled = false; btn.textContent = tr('Nachricht senden');
      if (!r.ok) { say($('supState'), r.error, 'bad'); return; }
      say($('supState'), 'Danke! Deine Nachricht ist angekommen.', 'ok');
      $('supMsg').value = ''; $('supCount').textContent = '0 / 2000';
    });
  });

  // Neue Playlists aus der App erscheinen, sobald man zur Seite zurückkehrt
  document.addEventListener('visibilitychange', function () { if (!document.hidden && device && $('editor').hidden) refresh(); });

    /* ---------- Sanftes Einblenden beim Scrollen ---------- */
  // Nur wenn der Browser es kann und „Bewegung reduzieren“ aus ist – sonst bleibt alles sofort sichtbar.
  (function () {
    var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    var sel = '.hero-txt > *, .hero-art, .avail, .block > h2, .steps li, .feat, .notice, .cta-band, .req, .page-head';
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (n, i) {
      n.classList.add('rv');
      var sib = n.parentNode ? Array.prototype.indexOf.call(n.parentNode.children, n) : 0;
      n.style.transitionDelay = Math.min(sib, 5) * 70 + 'ms';
      io.observe(n);
    });
  })();

  /* ---------- Start: Werte aus dem QR-Code übernehmen ---------- */
  // Erst sofort auf Deutsch zeichnen (steht im HTML), dann die gewünschte Sprache nachladen
  var wantLang = lang; lang = 'de';
  applyLang();
  if (wantLang !== 'de') setLang(wantLang, false);
  var qm = normMac(qp('mac')), qk = qp('key').toUpperCase();
  if (qm) $('mac').value = qm;
  if (qk) $('key').value = qk;
  // MAC und KEY sofort aus der Adresszeile entfernen (Verlauf, Lesezeichen, Bildschirmfotos)
  if (hs0 || qs0.has('mac') || qs0.has('key') || qs0.has('lang')) history.replaceState(null, '', location.pathname + (hs0 ? '' : location.hash));
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('lumio.device') || 'null'); } catch (e) {}
  // Startseite – außer man kommt per QR-Code aus der App, war schon verbunden oder hat einen Bereich verlinkt
  var h0 = HASH[location.hash.toLowerCase()];
  showTab(h0 || (qm || (saved && saved.mac) ? 'main' : 'home'), true);
  if (qm && /^[A-Z0-9]{6,12}$/.test(qk)) connect(qm, qk);
  else if (saved && saved.mac && saved.key) connect(saved.mac, saved.key, true);
})();
