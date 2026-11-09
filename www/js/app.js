/* ==========================================================
   Telvo Player – App-Logik
   Läuft auf: Android, Fire TV, Android TV, iPhone, iPad (über Capacitor),
   Samsung (Tizen), LG (webOS) und im Browser.
   Bewusst ohne Build-Werkzeuge geschrieben, damit auch ältere
   Fernseher (ca. ab 2019) den Code direkt ausführen können.
   ========================================================== */
(function () {
  'use strict';

  /* ---------------- Einstellungen ---------------- */
  var CONFIG = {
    appName: 'Telvo Player',          // Name der App (auch in config-Dateien ändern)
    version: '1.11.1',
    pageSize: 60,                     // So viele Einträge werden auf einmal gezeichnet
    /* Bibliotheken: werden beim Bauen nach www/lib kopiert (scripts/copy-libs.js) und von dort geladen.
       Nur wenn sie fehlen, aus dem Internet – mit fester Version und Prüfsumme (SRI): eine veränderte Datei
       führt der Browser nicht aus. Bei einem Versionswechsel Prüfsumme neu berechnen:
       openssl dgst -sha384 -binary DATEI | openssl base64 -A */
    hlsCdn: 'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js',
    hlsSri: 'sha384-cciJ0zi8d1uMKC2zJd7jvPY4HQt7W4ByUI/FlMkltvBi31aW61rcpVBhpmW8/NwX',
    tsCdn: 'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js',   // für rohe TV-Signale (.ts / „RAW“)
    tsSri: 'sha384-gWBszQzp4KdKY3PNUrFbTuvAcChcUSMKpSrt/OjDS3qe16Ef4OZSfP5E/+KcPueP',
    requestTimeout: 30000,
    // Online-Dienst für "Playlist per Handy hinzufügen" (Supabase + Webseite auf GitHub Pages)
    cloudUrl: 'https://oofzhklrbrpxjoicwbsf.supabase.co/rest/v1/rpc/',
    cloudKey: 'sb_publishable_cx6n8buREFat_yE7kKW6FA_SnMsOQX7',
    portalUrl: 'https://splix66.github.io/lumio-player/',
    qrCdn: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
    qrSri: 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k',
    syncInterval: 30000,
    cloudTimeout: 15000              // Zeitlimit für Anfragen an den Online-Dienst
  };
  // Zum Testen ohne Online-Dienst: …/index.html?nocloud (es wird dann kein Gerät angemeldet)
  if (/[?&]nocloud\b/.test(location.search || '')) CONFIG.cloudUrl = '';

  /* ---------------- Geräte-Erkennung ---------------- */
  var UA = navigator.userAgent || '';
  var Platform = {
    tizen: typeof window.tizen !== 'undefined' || /Tizen/i.test(UA),
    webos: typeof window.webOS !== 'undefined' || typeof window.PalmSystem !== 'undefined' || /Web0S|webOS/i.test(UA),
    capacitor: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
    ios: /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1),
    android: /Android/i.test(UA)
  };
  Platform.androidTV = Platform.android && (/AFT|Android TV|BRAVIA|SHIELD|\bTV\b/i.test(UA) || navigator.maxTouchPoints === 0);
  Platform.tv = Platform.tizen || Platform.webos || Platform.androidTV;
  Platform.safari = Platform.ios || (/Safari/.test(UA) && !/Chrome|Chromium|Android/.test(UA));
  // Wenig Arbeitsspeicher (≤ 2 GB) oder schwacher Prozessor (≤ 4 Kerne bei Android-Boxen) → Sparmodus für die Optik
  Platform.lite = (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2) || (Platform.androidTV && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);

  /* ---------------- Kleine Helfer ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    if (typeof c === 'string' || typeof c === 'number') { el.appendChild(document.createTextNode(String(c))); return; }
    el.appendChild(c);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  var ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    live: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 2l4 4 4-4"/>',
    movie: '<path d="M4 11h16v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M4 11L3.4 7.9a1.3 1.3 0 0 1 1-1.5l13.4-2.5a1.3 1.3 0 0 1 1.5 1l.5 2.5z"/><path d="M8.2 6.1l2.7 3.3M13.2 5.2l2.7 3.3"/>',
    series: '<path d="M12 3.5l9 4.6-9 4.6-9-4.6z"/><path d="M3.6 12.2L12 16.5l8.4-4.3"/><path d="M3.6 16.2L12 20.5l8.4-4.3"/>',
    heart: '<path d="M12 20.3s-7.6-4.6-9.3-9.2C1.5 7.8 3.6 4.6 7 4.6c2.1 0 3.6 1.1 5 2.9 1.4-1.8 2.9-2.9 5-2.9 3.4 0 5.5 3.2 4.3 6.5-1.7 4.6-9.3 9.2-9.3 9.2z"/>',
    heartFill: '<path d="M12 20.3s-7.6-4.6-9.3-9.2C1.5 7.8 3.6 4.6 7 4.6c2.1 0 3.6 1.1 5 2.9 1.4-1.8 2.9-2.9 5-2.9 3.4 0 5.5 3.2 4.3 6.5-1.7 4.6-9.3 9.2-9.3 9.2z" fill="currentColor"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 17.2v.1"/>',
    send: '<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5-7.5-4z"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.6 12.4a9.5 9.5 0 0 1 12.8 0M8.7 15.7a5 5 0 0 1 6.6 0"/><path d="M12 19.2v.1"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M11 18h2"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" stroke="none"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    tracks: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 11h3M13 11h4M7 15h7M16 15h1"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    aspect: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M6.5 11.5V9h3M17.5 12.5V15h-3"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    pencil: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l3 3"/>',
    starFill: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    rew: '<path d="M11 19l-7-7 7-7M20 19l-7-7 7-7"/>',
    fwd: '<path d="M13 5l7 7-7 7M4 5l7 7-7 7"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    upload: '<path d="M7 18.5a4.5 4.5 0 0 1-.7-8.9A6 6 0 0 1 17.9 11a3.8 3.8 0 0 1-.4 7.5"/><path d="M12 12.5v8M8.8 15.6L12 12.4l3.2 3.2"/>',
    playlist: '<path d="M4 6h12M4 11h12M4 16h7"/><path d="M15.5 14v6.5l5-3.25z"/>',
    refresh: '<path d="M20.5 11a8.5 8.5 0 0 0-15.3-4.6L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M3.5 13a8.5 8.5 0 0 0 15.3 4.6l1.7-2.1"/><path d="M20.5 20.5v-5h-5"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    vol: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    volOff: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7.6l3.2 2.3-1.2 3.8h-4L8.8 9.9z"/><path d="M12 3v4.6M15.2 9.9l4.3-1.5M14 13.7l2.7 3.7M10 13.7l-2.7 3.7M8.8 9.9L4.5 8.4"/>',
    radio: '<rect x="3" y="8.5" width="18" height="11.5" rx="2.2"/><path d="M6.5 8.5L17 3.5"/><circle cx="15.6" cy="14.2" r="2.7"/><path d="M6.8 12.2h3.6M6.8 15.2h3.6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/><path d="M12 14.5v2.2"/>',
    eyeOff: '<path d="M3 12s3.5-6.5 9-6.5c1.7 0 3.2.6 4.5 1.4M21 12s-3.5 6.5-9 6.5c-1.7 0-3.2-.6-4.5-1.4"/><path d="M4.5 19.5l15-15"/><path d="M9.7 14.3a3.3 3.3 0 0 1 4.6-4.6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5"/><path d="M14 6h7M14 11h5M14 16h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    archive: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5v4h4"/><path d="M12 7.5V12l3 2"/>',
    cc: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.6 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6"/>',
    device: '<rect x="2.5" y="4" width="13.5" height="10" rx="1.6"/><path d="M6 18.5h6.5M9.2 14v4.5"/><rect x="17.5" y="8" width="4" height="12" rx="1.1"/>',
    ext: '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
    update: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4 16.5v3h16v-3"/>',
    tvplay: '<rect x="3" y="4.5" width="18" height="13" rx="2"/><path d="M8 21h8"/><path d="M10.2 8.4v5.2l4.5-2.6z" fill="currentColor"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    player: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>'
  };
  function icon(name) {
    var span = document.createElement('span');
    span.innerHTML = '<svg class="i i-' + name + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    return span.firstChild;
  }
  /* Logo: "L" und Play-Zeichen in Textfarbe, der Lichtpunkt in der gewählten Akzentfarbe */
  var LOGO_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 22h56M34 22v62" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/><path class="play" d="M50 38.5c0-3.3 3.6-5.3 6.4-3.6l25.4 15.6c2.7 1.7 2.7 5.6 0 7.2L56.4 73.4C53.6 75.1 50 73.1 50 69.8z"/><circle class="dot" cx="84" cy="22" r="6"/><path class="star" d="M84 12L86.5 19.5L94 22L86.5 24.5L84 32L81.5 24.5L74 22L81.5 19.5Z"/></svg>';
  function brandMark() { var m = h('span', { class: 'brand-mark' }); m.innerHTML = LOGO_SVG; return m; }
  /* Schriftzug: "Telvo" kräftig, "Player" leicht */
  function wordmark() { return h('span', { class: 'wordmark' }, h('b', { text: 'Telvo' }), h('span', { text: 'Player' })); }

  function hashCode(s) { var x = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return Math.abs(x); }
  function colorFor(s) { var hue = hashCode(s) % 360; return 'hsl(' + hue + ',55%,38%)'; }
  function gradientFor(s) { var hue = hashCode(s) % 360; return 'linear-gradient(160deg,hsl(' + hue + ',60%,42%),hsl(' + ((hue + 40) % 360) + ',55%,18%))'; }
  function initials(s) {
    var parts = String(s || '?').replace(/[^\wÄÖÜäöüß ]/g, ' ').trim().split(/\s+/);
    return ((parts[0] || '?').charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
  }
  function norm(s) {
    s = String(s || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* alte Geräte */ }
    return s;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (hh ? hh + ':' + p(mm) : mm) + ':' + p(ss);
  }
  function fmtClock(ts) { return clockStr(new Date(ts * 1000)); }
  function fmtDate(ts) { if (!ts) return T('unbegrenzt'); var d = new Date(Number(ts) * 1000); return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function b64(s) {
    if (!s) return '';
    try { var bin = atob(s); try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; } } catch (e) { return s; }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  // Programmführer-Zeitverschiebung der Playlist in Sekunden (Einstellungen → „Programmführer-Zeit“)
  function epgShiftOf(p) { return p ? (Number(p.epgShift) || 0) * 60 : 0; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------------- Speicher (auf dem Gerät) ---------------- */
  var Store = {
    get: function (key, def) {
      try { var v = localStorage.getItem('lumio.' + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (key, val) {
      try { localStorage.setItem('lumio.' + key, JSON.stringify(val)); } catch (e) { /* Speicher voll */ }
    },
    del: function (key) { try { localStorage.removeItem('lumio.' + key); } catch (e) {} }
  };

  /* ---------- Fehlerprotokoll (bleibt auf dem Gerät) ----------
     Die letzten 15 Fehler – Links, Benutzernamen und Passwörter werden vorher entfernt. Verschickt wird es nur,
     wenn man selbst „Problem melden“ wählt und „Technische Angaben anhängen“ eingeschaltet lässt. */
  var ErrLog = {
    max: 15,
    clean: function (s) {
      return String(s == null ? '' : s)
        .replace(/[a-z][a-z0-9+.\-]*:\/\/[^\s"'<>]+/gi, '[Link]')
        .replace(/\b(user(name)?|pass(word)?|pwd|token|key|mac)=[^&\s]*/gi, '$1=…')
        .replace(/\s+/g, ' ').slice(0, 220);
    },
    list: function () { var l = Store.get('errlog', []); return Object.prototype.toString.call(l) === '[object Array]' ? l : []; },
    add: function (where, msg) {
      try {
        var l = this.list(), e = { t: Date.now(), w: String(where).slice(0, 20), m: this.clean(msg) }, last = l[l.length - 1];
        if (last && last.w === e.w && last.m === e.m) { last.n = (last.n || 1) + 1; last.t = e.t; }   // gleicher Fehler: nur zählen
        else l.push(e);
        if (l.length > this.max) l = l.slice(l.length - this.max);
        Store.set('errlog', l);
      } catch (x) {}
    }
  };
  window.addEventListener('error', function (e) {
    ErrLog.add('Programm', ((e && e.message) || 'Fehler') + (e && e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason; ErrLog.add('Programm', 'Promise: ' + ((r && r.message) || r));
  });

  var Settings = {
    data: Store.get('settings', { liveFormat: 'm3u8' }),
    get: function (k) { return this.data[k]; },
    set: function (k, v) { this.data[k] = v; Store.set('settings', this.data); }
  };
  // Gerätetyp von Hand (Einstellungen → Gerätetyp): Fernseher oder Handy/Tablet/PC erzwingen
  (function () {
    var dt = Settings.get('deviceType');
    if (dt === 'tv') { Platform.tv = true; Platform.androidTV = Platform.android; }
    else if (dt === 'touch' && !Platform.tizen && !Platform.webos) { Platform.tv = false; Platform.androidTV = false; }
  })();

  /* ---------------- Sprachen ----------------
     Texte stehen auf Deutsch im Code. Übersetzungen (Englisch, Türkisch) liegen in js/i18n.js.
     T('Text') liefert den Text in der gewählten Sprache, {0} {1} … werden ersetzt. */
  var LANGS = [['de', 'Deutsch'], ['en', 'English'], ['tr', 'Türkçe'], ['pl', 'Polski'], ['ru', 'Русский'], ['ar', 'العربية'],
    ['uk', 'Українська'], ['ro', 'Română'], ['it', 'Italiano'], ['el', 'Ελληνικά'], ['ku', 'Kurdî (Kurmancî)'],
    ['hr', 'Bosanski / Hrvatski / Srpski'], ['es', 'Español'], ['fr', 'Français']];
  // Datumsformat je Sprache
  var LOCALES = { de: 'de-DE', en: 'en-GB', tr: 'tr-TR', pl: 'pl-PL', ru: 'ru-RU', ar: 'ar-u-nu-latn', uk: 'uk-UA', ro: 'ro-RO', it: 'it-IT', el: 'el-GR', ku: 'ku', hr: 'hr-HR', es: 'es-ES', fr: 'fr-FR' };
  function locale() { return LOCALES[Lang.cur] || 'de-DE'; }
  var I18N = window.LUMIO_I18N || {};
  var Lang = {
    cur: 'de',
    init: function () {
      // Deutsch ist immer die Grundsprache – andere Sprachen nur, wenn man sie selbst auswählt
      var l = Settings.get('lang') || 'de';
      this.cur = (l === 'de' || I18N[l]) ? l : 'de';
      document.documentElement.setAttribute('lang', this.cur);
    },
    set: function (l) {
      Settings.set('lang', l);
      try { location.reload(); } catch (e) {}
    }
  };
  function T(s) {
    var d = Lang.cur !== 'de' ? I18N[Lang.cur] : null;
    var out = d && d[s] != null ? d[s] : s;
    for (var i = 1; i < arguments.length; i++) out = out.split('{' + (i - 1) + '}').join(String(arguments[i]));
    return out;
  }
  /* Ein Knopf mit der aktuellen Sprache („Deutsch“) – erst ein Druck darauf zeigt die Auswahl */
  function langButton() {
    var name = (LANGS.filter(function (l) { return l[0] === Lang.cur; })[0] || LANGS[0])[1];
    return h('button', { class: 'btn f lang-btn', title: 'Sprache / Language / Dil', 'aria-label': 'Sprache / Language / Dil: ' + name, onclick: pickLanguage },
      icon('globe'), h('span', { text: name }), icon('down'));
  }
  function pickLanguage() {
    Dialog.show('Sprache / Language / Dil', null, LANGS.map(function (l) {
      return { label: l[1], primary: l[0] === Lang.cur, action: function () { if (l[0] !== Lang.cur) Lang.set(l[0]); } };
    }), 'dlg-list');
  }

  /* ---------------- Geräte-Kennung (MAC-Adresse) ----------------
     Apps dürfen die echte Hardware-MAC nicht mehr auslesen. Darum wird beim
     ersten Start eine feste Kennung im MAC-Format erzeugt und gespeichert. */
  var Device = {
    mac: function () {
      var m = Store.get('mac');
      if (!m || !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(m)) {
        var rnd = window.crypto && window.crypto.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(6)) : null;
        var b = [];
        for (var i = 0; i < 6; i++) b.push(rnd ? rnd[i] : Math.floor(Math.random() * 256));
        b[0] = (b[0] & 0xFC) | 0x02;
        m = b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16).toUpperCase(); }).join(':');
        Store.set('mac', m);
      }
      return m;
    },
    key: function () {
      var k = Store.get('devkey');
      if (!k || !/^[A-Z2-9]{6}$/.test(k)) { k = this.newKey(); Store.set('devkey', k); }
      return k;
    },
    newKey: function () {
      var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k = '';
      var rnd = window.crypto && window.crypto.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(6)) : null;
      for (var i = 0; i < 6; i++) k += abc.charAt((rnd ? rnd[i] : Math.floor(Math.random() * 256)) % abc.length);
      return k;
    },
    /* Langer Geheimschlüssel nur für die App (128 Bit). Damit gleicht die App ab – ohne Sperre nach Fehlversuchen,
       weil er sich nicht erraten lässt. Der kurze KEY bleibt für die Webseite. Wird nie angezeigt. */
    token: function () {
      var t = Store.get('devtoken');
      if (!t || !/^[0-9a-f]{32}$/.test(t)) {
        var rnd = window.crypto && window.crypto.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(16)) : null;
        t = '';
        for (var i = 0; i < 16; i++) { var b = rnd ? rnd[i] : Math.floor(Math.random() * 256); t += (b < 16 ? '0' : '') + b.toString(16); }
        Store.set('devtoken', t);
      }
      return t;
    },
    // MAC und KEY stehen hinter „#“: Dieser Teil der Adresse wird nie an einen Server geschickt
    // (taucht also in keinem Server-Protokoll auf). Die Webseite liest ihn und löscht ihn sofort aus der Adresszeile.
    portalLink: function () { return CONFIG.portalUrl + '#mac=' + encodeURIComponent(this.mac()) + '&key=' + this.key() + '&lang=' + Lang.cur; }
  };
  function macTag(user, noCopy) {
    return h('div', { class: 'mac-tag' }, h('span', { text: 'MAC' }), h('b', { text: Device.mac() }), noCopy ? null : copyBtn(Device.mac(), 'MAC'),
      h('span', { text: 'KEY' }), h('b', { text: Device.key() }), noCopy ? null : copyBtn(Device.key(), 'KEY'),
      user ? h('span', { text: T('Benutzer') }) : null, user ? h('b', { text: user }) : null);
  }
  /* In die Zwischenablage kopieren (Handy, iPad, Windows/Mac). Fernseher haben keine Zwischenablage – dort kein Knopf. */
  function copyText(text) {
    function done() { toast(T('{0} kopiert', text)); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (e) {}
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (ok) done(); else toast(T('Kopieren hat nicht geklappt'));
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; }
    } catch (e) {}
    fallback();
  }
  function copyBtn(text, label) {
    if (Platform.tv) return null;
    var t = T('{0} kopieren', label);
    return h('button', { class: 'copy-btn', type: 'button', title: t, 'aria-label': t, onclick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); copyText(text); } }, icon('copy'));
  }
  /* Benutzername des Zugangs: bei Xtream direkt, bei M3U aus dem Link (…?username=…), sonst der Profilname */
  function profileUser(p) {
    if (!p) return '';
    if (p.username) return p.username;
    var m = /[?&]username=([^&#]+)/i.exec(p.url || '');
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    return p.type === 'demo' ? '' : (p.name || '');
  }

  /* ---------------- Darstellung: Hell/Dunkel mit fester Telvo-Farbe (Violett) ----------------
     Die Farben selbst stehen in css/style.css. Nur die Saison-Designs färben kurzzeitig um. */
  function rgba(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }
  var Theme = {
    media: window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null,
    apply: function () {
      var mode = Settings.get('theme') || 'dark';
      var light = mode === 'light' || (mode === 'auto' && !Platform.tv && !!(this.media && this.media.matches));
      var root = document.documentElement;
      root.setAttribute('data-theme', light ? 'light' : 'dark');
      root.setAttribute('data-poster', Settings.get('posterSize') || 'm');
      if (Platform.tv) root.classList.add('tv');
      var season = Season.current(), se = season ? SEASONS[season] : null;
      var vars = ['--accent', '--accent-2', '--accent-ink', '--season-dot'];
      if (se) {
        root.setAttribute('data-season', season);
        root.style.setProperty('--season-dot', se.dot);
        root.style.setProperty('--accent', se.a);
        root.style.setProperty('--accent-2', se.b);
        root.style.setProperty('--accent-ink', se.ink);
      } else {
        root.removeAttribute('data-season');
        vars.forEach(function (k) { root.style.removeProperty(k); });
      }
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', light ? '#f5f5f7' : '#0b0b0f');
      Fx.set(se ? se.fx : null);
    },
    watch: function () {
      var self = this;
      if (self.media && self.media.addListener) self.media.addListener(function () { self.apply(); });
    }
  };

  /* ---------------- Saison-Designs (Weihnachten, Silvester) ---------------- */
  var SEASONS = {
    christmas: { name: T('Weihnachten'), greet: 'Frohe Weihnachten', a: '#e63946', b: '#ff8a5c', ink: '#2a0507', dot: '#ffd166', fx: 'snow' },
    newyear: { name: T('Silvester'), greet: 'Guten Rutsch', a: '#ffc53d', b: '#ffe9a8', ink: '#261c02', dot: '#ffe27a', fx: 'sparks' }
  };
  var Season = {
    current: function () {
      var s = Settings.get('season') || 'auto';
      if (s === 'off') return null;
      if (s !== 'auto') return SEASONS[s] ? s : null;
      var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
      if (m === 12 && day <= 26) return 'christmas';
      if ((m === 12 && day >= 27) || (m === 1 && day <= 1)) return 'newyear';
      return null;
    }
  };

  /* Schneefall bzw. funkelnde Lichter, ganz leicht im Hintergrund */
  var Fx = {
    canvas: null, ctx: null, parts: [], kind: null, raf: 0, last: 0,
    set: function (kind) {
      var self = this;
      if (Settings.get('fx') === false) kind = null;
      try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) kind = null; } catch (e) {}
      if (!window.requestAnimationFrame) kind = null;
      if (kind === self.kind) return;
      self.kind = kind;
      self.parts = [];
      if (self.raf) cancelAnimationFrame(self.raf);
      self.raf = 0;
      if (!kind) { if (self.canvas) self.canvas.style.display = 'none'; return; }
      if (!self.canvas) {
        self.canvas = h('canvas', { class: 'fx', 'aria-hidden': 'true' });
        document.body.appendChild(self.canvas);
        self.ctx = self.canvas.getContext('2d');
        window.addEventListener('resize', function () { self.size(); });
      }
      self.canvas.style.display = '';
      self.size();
      var n = Platform.tv ? 34 : 48;
      for (var i = 0; i < n; i++) self.parts.push(self.spawn(true));
      var loop = function (t) { self.frame(t); if (self.kind) self.raf = requestAnimationFrame(loop); };
      self.raf = requestAnimationFrame(loop);
    },
    size: function () { if (this.canvas) { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; } },
    spawn: function (anywhere) {
      var W = window.innerWidth, H = window.innerHeight;
      if (this.kind === 'snow') return { x: Math.random() * W, y: anywhere ? Math.random() * H : -8, r: 1 + Math.random() * 2.4, vy: 0.35 + Math.random() * 0.8, vx: Math.random() * 0.5 - 0.25, ph: Math.random() * 6.28 };
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : H + 8, r: 0.8 + Math.random() * 1.7, vy: -(0.2 + Math.random() * 0.5), vx: Math.random() * 0.4 - 0.2, ph: Math.random() * 6.28, warm: Math.random() > 0.5 };
    },
    frame: function (t) {
      if (Platform.tv && t - this.last < 33) return;
      var dt = this.last ? Math.min(3, (t - this.last) / 16.7) : 1;
      this.last = t;
      var c = this.ctx, W = this.canvas.width, H = this.canvas.height;
      c.clearRect(0, 0, W, H);
      var top = Screens.top();
      if (top && top.name === 'player') return;
      var light = document.documentElement.getAttribute('data-theme') === 'light';
      for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        p.ph += 0.02 * dt;
        p.x += (p.vx + Math.sin(p.ph) * 0.3) * dt;
        p.y += p.vy * dt;
        if (p.y > H + 10 || p.y < -12 || p.x < -10 || p.x > W + 10) { this.parts[i] = this.spawn(false); continue; }
        var a;
        if (this.kind === 'snow') { a = 0.35 + p.r / 6; c.fillStyle = light ? 'rgba(120,140,175,' + a + ')' : 'rgba(255,255,255,' + a + ')'; }
        else { a = 0.35 + 0.65 * Math.abs(Math.sin(p.ph * 3)); c.fillStyle = p.warm ? 'rgba(255,205,90,' + a + ')' : (light ? 'rgba(200,150,40,' + a + ')' : 'rgba(255,240,205,' + a + ')'); }
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill();
      }
    }
  };

  /* ---------------- Netzwerk ---------------- */
  function fetchWithTimeout(url, ms) {
    var limit = ms || CONFIG.requestTimeout;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer, timedOut = false;
    // Ohne AbortController (Fernseher bis ca. 2019) bricht das Zeitlimit die Anfrage nicht ab –
    // deshalb zusätzlich ein Wettlauf gegen den Zeitgeber, damit die App nie endlos wartet.
    var deadline = new Promise(function (resolve, reject) {
      timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); reject(new Error(T('Zeitüberschreitung – der Server antwortet nicht.'))); }, limit);
    });
    var req = fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error(T('Server-Fehler (HTTP {0})', res.status));
      return res;
    }, function (err) {
      clearTimeout(timer);
      if (timedOut || (err && err.name === 'AbortError')) throw new Error(T('Zeitüberschreitung – der Server antwortet nicht.'));
      throw new Error(T('Keine Verbindung zum Server. Prüfe Adresse und Internet.'));
    });
    return Promise.race([req, deadline]);
  }
  /* Antwort als Text lesen – mit Überwachung: Kommen {idle} ms lang keine Daten mehr, wird abgebrochen
     (vorher hing die App endlos, wenn ein Server nach dem Kopf der Antwort stehen blieb).
     Große Playlists, die langsam aber stetig laden, werden nicht abgebrochen.
     Zeichensatz: UTF-8; ist die Datei kein gültiges UTF-8 (alte Playlists in Latin-1/Windows-1252), wird
     windows-1252 benutzt – sonst erscheinen Umlaute als „�“. */
  function readText(res, idle) {
    idle = idle || CONFIG.requestTimeout;
    var reader = res.body && res.body.getReader ? res.body.getReader() : null;
    var canDecode = typeof TextDecoder !== 'undefined';
    if (!reader || !canDecode) {
      var t;
      var stall = new Promise(function (resolve, reject) {
        // ohne Datenstrom kein Fortschritt messbar: großzügiges Gesamtlimit
        t = setTimeout(function () { reject(new Error(T('Zeitüberschreitung – der Server antwortet nicht.'))); }, Math.max(idle * 6, 180000));
      });
      return Promise.race([res.text(), stall]).then(function (x) { clearTimeout(t); return x; }, function (e) { clearTimeout(t); throw e; });
    }
    return new Promise(function (resolve, reject) {
      var parts = [], size = 0, timer = null;
      function arm() {
        clearTimeout(timer);
        timer = setTimeout(function () {
          try { reader.cancel(); } catch (e) {}
          reject(new Error(T('Zeitüberschreitung – der Server antwortet nicht.')));
        }, idle);
      }
      function pump() {
        reader.read().then(function (r) {
          if (r.done) {
            clearTimeout(timer);
            var all = new Uint8Array(size), off = 0;
            for (var i = 0; i < parts.length; i++) { all.set(parts[i], off); off += parts[i].length; }
            resolve(decodeBytes(all));
            return;
          }
          parts.push(r.value); size += r.value.length; arm(); pump();
        }, function (e) { clearTimeout(timer); reject(e); });
      }
      arm(); pump();
    });
  }
  function decodeBytes(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) {
      try { return new TextDecoder('windows-1252').decode(bytes); }
      catch (e2) { return new TextDecoder('utf-8').decode(bytes); }
    }
  }
  function fetchText(url) { return fetchWithTimeout(url).then(function (r) { return readText(r); }); }
  function fetchJson(url) {
    return fetchText(url).then(function (t) {
      t = t.replace(/^\uFEFF/, '').trim();
      if (!t) return null;
      try { return JSON.parse(t); } catch (e) { throw new Error(T('Unerwartete Antwort vom Server.')); }
    });
  }

  function normalizeServer(s) {
    s = String(s || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    s = s.replace(/\/(player_api\.php|get\.php|xmltv\.php).*$/i, '');
    return s.replace(/\/+$/, '');
  }
  /* Erkennt komplette Xtream-Links wie http://host:8080/get.php?username=a&password=b&type=m3u_plus */
  function parseXtreamLink(url) {
    var m = /^(https?:\/\/[^\/?#]+)(?:\/[^?#]*)?\/(?:get|player_api)\.php\?(.*)$/i.exec(String(url || '').trim());
    if (!m) return null;
    var q = {};
    m[2].split('&').forEach(function (p) { var kv = p.split('='); try { q[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('=') || ''); } catch (e) {} });
    if (!q.username || !q.password) return null;
    return { server: m[1], username: q.username, password: q.password };
  }

  /* ==========================================================
     Datenquellen: Xtream Codes, M3U-Playlist, Demo
     Alle liefern dieselbe Struktur, damit die Oberfläche
     nicht wissen muss, woher die Daten kommen.
     ========================================================== */
  function XtreamProvider(p) {
    var base = normalizeServer(p.server);
    var user = encodeURIComponent(p.username), pass = encodeURIComponent(p.password);
    var cache = {}, lists = {};
    var ACTIONS = {
      live: ['get_live_categories', 'get_live_streams'],
      movie: ['get_vod_categories', 'get_vod_streams'],
      series: ['get_series_categories', 'get_series']
    };
    function api(action, extra, noCache) {
      var url = base + '/player_api.php?username=' + user + '&password=' + pass + (action ? '&action=' + action : '') + (extra || '');
      if (!noCache && cache[url]) return cache[url];
      var pr = fetchJson(url);
      if (!noCache) { cache[url] = pr; pr.catch(function () { delete cache[url]; }); }
      return pr;
    }
    /* Antwort einer Listen-Abfrage prüfen. Bei abgelaufenem oder falschem Zugang schicken viele Server statt der
       Liste die Kontoauskunft (user_info) – das darf nicht als „leere Playlist“ durchgehen (sonst „Alles aktuell!“ und
       gespeicherte Zahlen = 0). Manche Server liefern Listen als Objekt {"0": {...}} statt als Array. */
    function asList(x) {
      if (Array.isArray(x)) return x;
      if (!x) return [];
      if (x.user_info) {
        var u = x.user_info;
        if (String(u.auth) !== '1') throw new Error(T('Benutzername oder Passwort falsch.'));
        if (u.status && u.status !== 'Active') throw new Error(T('Konto-Status: {0}', u.status));
        throw new Error(T('Unerwartete Antwort vom Server.'));
      }
      if (typeof x === 'object') {
        var v = Object.keys(x).map(function (k) { return x[k]; });
        if (!v.length || v.every(function (o) { return o && typeof o === 'object'; })) return v;
      }
      throw new Error(T('Unerwartete Antwort vom Server.'));
    }
    /* Catch-up braucht die Startzeit in der Uhrzeit des Servers. Am genauesten ist der Text aus dem Programm
       („2026-11-09 20:15:00“); sonst wird der Abstand Server – Weltzeit aus der Kontoauskunft berechnet. */
    var tzOff = null;
    function serverOffset() {
      if (tzOff !== null) return Promise.resolve(tzOff);
      return api('', '').then(function (d) {
        var sv = (d && d.server_info) || {}, now = Number(sv.timestamp_now);
        var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(sv.time_now || '');
        tzOff = m && now > 0 ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000 - now) / 900) * 900 : 0;
        return tzOff;
      }, function () { return 0; });
    }
    function tsStart(e, off) {
      var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(e.startText || '');
      if (m) return m[1] + ':' + m[2] + '-' + m[3];
      var d = new Date((e.start + off) * 1000), two = function (n) { return n < 10 ? '0' + n : '' + n; };
      return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()) + ':' + two(d.getUTCHours()) + '-' + two(d.getUTCMinutes());
    }
    function mapItem(kind, s) {
      // tv_archive = 1: der Anbieter zeichnet auf (Catch-up), tv_archive_duration = wie viele Tage zurück
      if (kind === 'live') return { kind: 'live', id: String(s.stream_id), name: s.name || T('Kanal'), logo: s.stream_icon, num: s.num, catId: String(s.category_id),
        archive: String(s.tv_archive) === '1' ? Math.max(1, Math.min(30, Number(s.tv_archive_duration) || 1)) : 0 };
      if (kind === 'movie') return { kind: 'movie', id: String(s.stream_id), name: s.name || T('Film'), logo: s.stream_icon, ext: s.container_extension || 'mp4', rating: s.rating, catId: String(s.category_id), added: s.added };
      return { kind: 'series', id: String(s.series_id), name: s.name || T('Serie'), logo: s.cover, rating: s.rating, catId: String(s.category_id), year: s.releaseDate || s.release_date, plot: s.plot, added: s.last_modified };
    }
    return {
      type: 'xtream',
      login: function () {
        // frische Abfrage – und gleich für account() merken, damit die Kontodaten nicht doppelt geladen werden
        var key = base + '/player_api.php?username=' + user + '&password=' + pass, pr = api('', '', true);
        cache[key] = pr; pr.catch(function () { delete cache[key]; });
        return pr.then(function (d) {
          if (!d || !d.user_info) throw new Error(T('Das ist kein gültiger Xtream-Server.'));
          if (String(d.user_info.auth) !== '1') throw new Error(T('Benutzername oder Passwort falsch.'));
          if (d.user_info.status && d.user_info.status !== 'Active') throw new Error(T('Konto-Status: {0}', d.user_info.status));
          return d;
        });
      },
      account: function () {
        return api('', '').then(function (d) {
          var u = (d && d.user_info) || {};
          return { expires: u.exp_date, status: u.status, maxCons: u.max_connections, activeCons: u.active_cons, created: u.created_at };
        });
      },
      categories: function (kind) {
        return api(ACTIONS[kind][0]).then(function (list) {
          return asList(list).map(function (c) { return { id: String(c.category_id), name: c.category_name || T('Ohne Name') }; });
        });
      },
      /* Listen werden nur einmal geladen und umgewandelt. Liegt die Gesamtliste schon vor,
         wird eine Kategorie daraus gefiltert – ohne neue Anfrage an den Server. */
      items: function (kind, catId) {
        var all = !catId || catId === '__all', key = kind + '|' + (all ? '__all' : catId);
        if (lists[key]) return lists[key];
        var whole = lists[kind + '|__all'];
        var pr = whole && whole.done
          ? whole.then(function (l) { return l.filter(function (x) { return x.catId === String(catId); }); })
          : api(ACTIONS[kind][1], all ? '' : '&category_id=' + encodeURIComponent(catId), true).then(function (list) {
            return asList(list).map(function (s) { return mapItem(kind, s); });
          });
        lists[key] = pr;
        pr.then(function () { pr.done = true; }, function () { delete lists[key]; });
        return pr;
      },
      movieInfo: function (item) {
        return api('get_vod_info', '&vod_id=' + item.id).then(function (d) {
          var i = (d && d.info) || {};
          var md = (d && d.movie_data) || {};
          return {
            plot: i.plot || i.description, genre: i.genre, year: (i.releasedate || i.release_date || '').slice(0, 4),
            rating: i.rating, duration: i.duration, cast: i.cast || i.actors, director: i.director,
            poster: i.movie_image || i.cover_big || item.logo,
            backdrop: Array.isArray(i.backdrop_path) ? i.backdrop_path[0] : i.backdrop_path,
            trailer: i.youtube_trailer || i.trailer,
            ext: md.container_extension || item.ext
          };
        });
      },
      seriesInfo: function (item) {
        return api('get_series_info', '&series_id=' + item.id).then(function (d) {
          var i = (d && d.info) || {};
          var eps = (d && d.episodes) || {};
          var groups = {};
          if (Array.isArray(eps)) {
            eps.forEach(function (e) { var s = String(e.season || 1); (groups[s] = groups[s] || []).push(e); });
          } else {
            Object.keys(eps).forEach(function (k) { groups[k] = eps[k]; });
          }
          var seasons = Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) {
            return {
              num: Number(k),
              episodes: (groups[k] || []).map(function (e) {
                var ei = e.info || {};
                return {
                  kind: 'episode', id: String(e.id), num: Number(e.episode_num) || 0, season: Number(k),
                  name: e.title || T('Folge {0}', e.episode_num), ext: e.container_extension || 'mp4',
                  plot: ei.plot, duration: ei.duration, seriesId: item.id, seriesName: item.name, logo: ei.movie_image || item.logo
                };
              }).sort(function (a, b) { return a.num - b.num; })
            };
          });
          return {
            plot: i.plot, genre: i.genre, year: (i.releaseDate || i.release_date || '').slice(0, 4), rating: i.rating,
            cast: i.cast, director: i.director, poster: i.cover || item.logo,
            backdrop: Array.isArray(i.backdrop_path) ? i.backdrop_path[0] : i.backdrop_path,
            trailer: i.youtube_trailer || i.trailer,
            seasons: seasons
          };
        });
      },
      epg: function (item, limit) {
        // Verschiebung nach später: Der Server liefert „ab jetzt“ – darum dann das ganze Programm holen und selbst filtern
        var sh = epgShiftOf(p), n = limit || 3;
        var pr = sh > 0 ? api('get_simple_data_table', '&stream_id=' + item.id, true)
          : api('get_short_epg', '&stream_id=' + item.id + '&limit=' + (sh < 0 ? n + 1 : n), true);
        return pr.then(function (d) {
          var now = Date.now() / 1000;
          var list = ((d && d.epg_listings) || []).map(function (e) {
            return { title: b64(e.title), desc: b64(e.description), start: Number(e.start_timestamp) + sh, end: Number(e.stop_timestamp) + sh };
          });
          if (sh > 0) list = list.filter(function (e) { return e.end > now; }).sort(function (a, b) { return a.start - b.start; }).slice(0, n);
          return list;
        }).catch(function () { return []; });
      },
      /* Catch-up: vergangene Sendungen eines Senders mit Aufzeichnung (neueste zuerst).
         Laufende Sendung ist dabei – sie lässt sich von Anfang an schauen. */
      archive: function (item) {
        var days = item.archive || 0;
        return Promise.all([api('get_simple_data_table', '&stream_id=' + item.id, true), serverOffset()]).then(function (r) {
          var now = Date.now() / 1000, from = now - days * 86400 - 3600, off = r[1], sh = epgShiftOf(p);
          return ((r[0] && r[0].epg_listings) || []).map(function (e) {
            var x = { title: b64(e.title), desc: b64(e.description), start: Number(e.start_timestamp), end: Number(e.stop_timestamp), startText: e.start, rec: e.has_archive };
            x.at = tsStart(x, off);                 // Adresse immer mit der echten Startzeit des Servers
            x.start += sh; x.end += sh;             // Anzeige mit Programmführer-Verschiebung
            return x;
          }).filter(function (e) {
            return e.start > 0 && e.end > e.start && e.start <= now && e.start >= from && (String(e.rec) !== '0' || e.end > now);
          }).sort(function (a, b) { return b.start - a.start; });
        });
      },
      // Abspielbarer Eintrag für eine vergangene Sendung: /timeshift/BENUTZER/PASSWORT/DAUER(MIN)/JJJJ-MM-TT:HH-MM/ID.ts
      catchup: function (item, e) {
        var path = base + '/timeshift/' + user + '/' + pass + '/' + Math.max(1, Math.ceil((e.end - e.start) / 60)) + '/' + e.at + '/' + item.id;
        return { kind: 'catchup', id: item.id + '@' + e.start, name: item.name + ' · ' + (e.title || T('Ohne Titel')), logo: item.logo, catId: item.catId,
          plot: e.desc, url: path + '.ts', alt: path + '.m3u8' };
      },
      streamUrl: function (item) {
        if (item.kind === 'catchup') return { url: item.url, alt: item.alt };
        if (item.kind === 'live') {
          var fmt = Settings.get('liveFormat') || 'm3u8';
          return {
            url: base + '/live/' + user + '/' + pass + '/' + item.id + '.' + fmt,
            alt: base + '/live/' + user + '/' + pass + '/' + item.id + '.' + (fmt === 'm3u8' ? 'ts' : 'm3u8')
          };
        }
        var dir = item.kind === 'movie' ? 'movie' : 'series';
        return { url: base + '/' + dir + '/' + user + '/' + pass + '/' + item.id + '.' + (item.ext || 'mp4') };
      },
      reset: function () { cache = {}; lists = {}; }
    };
  }

  /* ----- M3U ----- */
  function parseM3U(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [], cur = null, head = {};
    out.epgUrls = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXTM3U') === 0) {
        // Programmführer-Adresse(n) aus der Kopfzeile: url-tvg="…", x-tvg-url="…" (auch mehrere, mit Komma getrennt)
        var hm, hre = /(url-tvg|x-tvg-url|tvg-url)="([^"]*)"/gi;
        while ((hm = hre.exec(line))) hm[2].split(/[,\s]+/).forEach(function (u) { if (/^https?:\/\//i.test(u) && out.epgUrls.indexOf(u) < 0) out.epgUrls.push(u); });
        // Catch-up-Vorgaben für alle Sender (catchup="…" catchup-days="…" catchup-source="…")
        var cm, cre = /(catchup|catchup-type|catchup-days|catchup-source|timeshift|tvg-rec)="([^"]*)"/gi;
        while ((cm = cre.exec(line))) head[cm[1].toLowerCase()] = cm[2];
        continue;
      }
      if (line.indexOf('#EXTINF') === 0) {
        cur = { attrs: {}, name: '' };
        var re = /([\w-]+)="([^"]*)"/g, m;
        while ((m = re.exec(line))) cur.attrs[m[1].toLowerCase()] = m[2];
        // Name = Text nach dem ersten Komma außerhalb von Anführungszeichen
        var inQ = false, cut = -1;
        for (var j = 7; j < line.length; j++) {
          var ch = line.charAt(j);
          if (ch === '"') inQ = !inQ;
          else if (ch === ',' && !inQ) { cut = j; break; }
        }
        cur.name = cut >= 0 ? line.slice(cut + 1).trim() : (cur.attrs['tvg-name'] || '');
      } else if (line.indexOf('#EXTGRP:') === 0 && cur) {
        cur.attrs['group-title'] = cur.attrs['group-title'] || line.slice(8).trim();
      } else if (line.charAt(0) !== '#' && cur) {
        out.push({
          name: cur.name || cur.attrs['tvg-name'] || T('Ohne Name'),
          logo: cur.attrs['tvg-logo'] || '',
          group: cur.attrs['group-title'] || T('Ohne Kategorie'),
          url: line,
          tvgId: cur.attrs['tvg-id'] || '',
          tvgName: cur.attrs['tvg-name'] || '',
          cu: catchupOf(cur.attrs, head)
        });
        cur = null;
      }
    }
    return out;
  }

  /* Catch-up-Angaben eines M3U-Senders (wie Kodi „IPTV Simple“ und TiviMate sie lesen):
     catchup = default | append | shift | flussonic | xc, catchup-days = Tage, catchup-source = Adress-Vorlage.
     Ältere Form: timeshift="3" oder tvg-rec="3" (= shift). Ergebnis: { t: Art, d: Tage, s: Vorlage } oder null. */
  function catchupOf(a, head) {
    // Angaben am Sender haben Vorrang vor den Vorgaben aus der Kopfzeile
    function one(o) {
      var legacy = Number(o.timeshift || o['tvg-rec']) || 0;
      return { t: String(o.catchup || o['catchup-type'] || (legacy ? 'shift' : '')).toLowerCase(), d: Number(o['catchup-days']) || legacy, s: o['catchup-source'] || '' };
    }
    var own = one(a), def = one(head || {});
    var t = own.t || def.t, d = own.d || def.d, src = own.s || def.s;
    if (!t || t === 'vod' || t === 'none' || t === '0') return null;
    if (t === 'fs' || t.indexOf('flussonic') === 0) t = 'flussonic';
    if (t === 'timeshift') t = 'shift';
    if (['default', 'append', 'shift', 'flussonic', 'xc'].indexOf(t) < 0) return null;
    if (t === 'append' && !src) return null;
    return { t: t, d: Math.max(1, Math.min(14, d || 1)), s: src };
  }
  /* Adresse einer vergangenen Sendung bauen. start/end in Sekunden (UTC). Vorlagen-Platzhalter wie bei Kodi/TiviMate:
     {utc} {start} ${start} {utcend} {end} ${end} {lutc} {now} ${now} ${timestamp} {duration} ${duration} {offset} ${offset}
     und {Y} {m} {d} {H} {M} {S} (Startzeit, UTC). */
  function catchupUrl(item, start, end) {
    var c = item.cu, url = item.url, now = Math.floor(Date.now() / 1000), dur = Math.max(60, end - start);
    if (!c) return null;
    var dt = new Date(start * 1000), two = function (n) { return n < 10 ? '0' + n : '' + n; };
    function fill(tpl) {
      var v = { utc: start, start: start, utcend: end, end: end, lutc: now, now: now, timestamp: now, duration: dur, offset: now - start,
        Y: dt.getUTCFullYear(), m: two(dt.getUTCMonth() + 1), d: two(dt.getUTCDate()), H: two(dt.getUTCHours()), M: two(dt.getUTCMinutes()), S: two(dt.getUTCSeconds()) };
      return String(tpl).replace(/\$?\{(utc|start|utcend|end|lutc|now|timestamp|duration|offset|Y|m|d|H|M|S)\}/g, function (all, k) { return String(v[k]); });
    }
    if (c.t === 'append') return url + fill(c.s);
    if (c.t === 'default' && c.s) return /^https?:\/\//i.test(c.s) ? fill(c.s) : url + fill(c.s);
    if (c.t === 'shift' || c.t === 'default') return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'utc=' + start + '&lutc=' + now;
    if (c.t === 'flussonic') {
      var m = /^(.*\/)(index|video|mono|playlist)\.m3u8(\?.*)?$/.exec(url);
      if (m) return m[1] + m[2] + '-' + start + '-' + dur + '.m3u8' + (m[3] || '');
      var m2 = /^(.*\/)mpegts(\?.*)?$/.exec(url);
      if (m2) return m2[1] + 'timeshift_abs-' + start + '.ts' + (m2[2] || '');
      return null;
    }
    if (c.t === 'xc') {
      var x = /^(https?:\/\/[^/]+)\/(?:live\/)?([^/]+)\/([^/]+)\/(\d+)(?:\.\w+)?(\?.*)?$/.exec(url);
      if (x) return x[1] + '/timeshift/' + x[2] + '/' + x[3] + '/' + Math.ceil(dur / 60) + '/' + dt.getUTCFullYear() + '-' + two(dt.getUTCMonth() + 1) + '-' + two(dt.getUTCDate()) + ':' + two(dt.getUTCHours()) + '-' + two(dt.getUTCMinutes()) + '/' + x[4] + '.ts';
    }
    return null;
  }

  /* ----- Programmführer (EPG) für M3U-Playlists: XMLTV-Dateien -----
     EPG-Dateien sind oft 50–200 MB groß (teils gepackt als .gz). Darum wird die Datei Stück für Stück
     gelesen und nur behalten, was gebraucht wird: Sendungen der Sender aus der Playlist,
     von 3 Stunden zurück bis 36 Stunden voraus. So reicht der Speicher auch auf schwachen TV-Boxen. */

  // Sendernamen vergleichbar machen: „DE: Das Erste HD“ ≈ „Das Erste“
  function chanKey(s) {
    s = String(s || '').replace(/^\s*(\|[^|]{1,8}\|\s*|[A-Za-z]{2,3}\s*[:|]\s*|[A-Za-z]{2,3}\s+-\s+)/, '');
    var k = titleKey(s);
    return k || norm(s).replace(/[\s.,:;|_\-()[\]]+/g, '');   // z. B. arabische oder kyrillische Namen
  }

  var Xmltv = {
    // „20261109153000 +0100“ → Sekunden seit 1970 (UTC)
    time: function (s) {
      var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2}))?/.exec(String(s || '').trim());
      if (!m) return 0;
      var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000;
      if (m[7]) t -= (m[7] === '-' ? -1 : 1) * (+m[8] * 3600 + +m[9] * 60);
      return t;
    },
    // XML-Text in normalen Text umwandeln (Sonderzeichen, CDATA)
    text: function (s) {
      // nur echte HTML-Formatierungen entfernen (manche Anbieter schicken <br> oder <b>), Text wie „<Test>“ bleibt
      return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<\/?(b|i|u|em|strong|br|p|span|div|font|a|small|big)\b[^>]*>/gi, ' ')
        .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (all, e) {
          var l = e.toLowerCase();
          if (l === 'amp') return '&'; if (l === 'lt') return '<'; if (l === 'gt') return '>';
          if (l === 'quot') return '"'; if (l === 'apos') return '\'';
          var n = l.charAt(1) === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
          try { return String.fromCodePoint ? String.fromCodePoint(n) : String.fromCharCode(n); } catch (er) { return ''; }
        }).replace(/\s+/g, ' ').trim();
    },
    attrs: function (s) {
      var o = {}, m, re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      while ((m = re.exec(s))) o[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
      return o;
    },
    // Titel/Beschreibung – bevorzugt in der App-Sprache, sonst der erste Eintrag
    pick: function (inner, tag) {
      var re = new RegExp('<' + tag + '\\b([^>]*)>([\\s\\S]*?)</' + tag + '>', 'g'), m, first = null;
      while ((m = re.exec(inner))) {
        var lang = (/lang\s*=\s*["']([\w-]+)/i.exec(m[1]) || [])[1];
        if (first === null) first = m[2];
        if (lang && lang.slice(0, 2).toLowerCase() === Lang.cur) return Xmltv.text(m[2]);
      }
      return first === null ? '' : Xmltv.text(first);
    },
    // Sammelt Sender und Sendungen aus beliebig zerteilten Textstücken
    parser: function (want, win) {
      var st = { lc: {}, names: {}, progs: {}, channels: 0, count: 0, past: {} };
      var keep = {}, buf = '', past = want.past || { ids: {}, names: {} };
      // ab wann Sendungen eines Senders behalten werden
      function fromOf(ch) { var d = st.past[ch]; return d ? win.now - d * 86400 - 3600 : win.from; }
      var re = /<(channel|programme)\b([^>]*)>([\s\S]*?)<\/\1\s*>/g;
      function handle(tag, attrStr, inner) {
        var a = Xmltv.attrs(attrStr);
        if (tag === 'channel') {
          var id = a.id;
          if (!id || keep[id]) return;
          var hit = !!want.ids[id.toLowerCase()], keys = [], dn, dre = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/g;
          while ((dn = dre.exec(inner))) {
            var k = chanKey(Xmltv.text(dn[1]));
            if (k) { keys.push(k); if (want.names[k]) hit = true; }
          }
          if (!hit) return;
          keep[id] = true; st.lc[id.toLowerCase()] = id; st.channels++;
          var pd = past.ids[id.toLowerCase()] || 0;
          keys.forEach(function (k) { pd = Math.max(pd, past.names[k] || 0); });
          if (pd) st.past[id] = pd;
          keys.forEach(function (k) { if (!st.names[k]) st.names[k] = id; });
          return;
        }
        var ch = a.channel;
        if (!ch) return;
        if (!keep[ch]) {
          // Sendung ohne vorherigen <channel>-Eintrag: nur über die tvg-id zuordnen
          if (!want.ids[ch.toLowerCase()]) return;
          keep[ch] = true; st.lc[ch.toLowerCase()] = ch; st.channels++;
          if (past.ids[ch.toLowerCase()]) st.past[ch] = past.ids[ch.toLowerCase()];
        }
        var s = Xmltv.time(a.start), e = Xmltv.time(a.stop);
        if (!s || s >= win.to || (e && e <= fromOf(ch))) return;
        var title = Xmltv.pick(inner, 'title');
        if (!title) return;
        var desc = Xmltv.pick(inner, 'desc');
        if (desc.length > 400) desc = desc.slice(0, 397) + '…';
        (st.progs[ch] = st.progs[ch] || []).push([s, e, title, desc]);
        st.count++;
      }
      function push(chunk) {
        buf += chunk;
        var m, end = 0;
        re.lastIndex = 0;
        while ((m = re.exec(buf))) { handle(m[1], m[2], m[3]); end = re.lastIndex; }
        if (end) buf = buf.slice(end);
        else if (buf.length > 8e6) buf = buf.slice(-1e6);   // Schutz vor endlos wachsendem Puffer bei kaputten Dateien
      }
      return {
        push: push,
        done: function () {
          push('');
          buf = '';
          Object.keys(st.progs).forEach(function (ch) {
            var seen = {}, l = st.progs[ch].sort(function (a, b) { return a[0] - b[0]; }).filter(function (x) {
              if (seen[x[0]]) return false;   // doppelte Sendungen aus mehreren EPG-Quellen
              seen[x[0]] = 1; return true;
            });
            // fehlende Endzeit = Beginn der nächsten Sendung
            for (var i = 0; i < l.length; i++) if (!l[i][1]) l[i][1] = l[i + 1] ? l[i + 1][0] : l[i][0] + 3600;
            var from = fromOf(ch);
            st.progs[ch] = l.filter(function (x) { return x[1] > from; });
          });
          return st;
        }
      };
    },
    // Zeichensatz aus der XML-Kopfzeile (<?xml … encoding="ISO-8859-1"?>)
    decoder: function (bytes) {
      var s = '';
      for (var i = 0; i < Math.min(200, bytes.length); i++) s += String.fromCharCode(bytes[i]);
      var enc = ((/encoding\s*=\s*["']([\w-]+)["']/i.exec(s) || [])[1] || 'utf-8').toLowerCase();
      if (/^(iso-8859-1|latin-?1|windows-1252|cp1252)$/.test(enc)) enc = 'windows-1252';
      try { return new TextDecoder(enc); } catch (e) { return new TextDecoder('utf-8'); }
    },
    // Datei laden und Stück für Stück an onText geben (entpackt .gz automatisch, wenn das Gerät es kann)
    read: function (url, onText) {
      return fetchWithTimeout(url, 60000).then(function (res) {
        var canStream = res.body && res.body.getReader && typeof TextDecoder !== 'undefined' && typeof ReadableStream !== 'undefined';
        if (!canStream) return res.text().then(function (t) { onText(t); });   // ältere Fernseher: alles auf einmal
        var reader = res.body.getReader();
        return reader.read().then(function (first) {
          var head = first.value || new Uint8Array(0), rd = reader, pending = first;
          if (head.length > 1 && head[0] === 0x1f && head[1] === 0x8b) {
            if (typeof DecompressionStream === 'undefined') {
              try { reader.cancel(); } catch (e) {}
              throw new Error(T('Dieses Gerät kann gepackte EPG-Dateien (.gz) nicht lesen. Bitte eine Adresse mit .xml verwenden.'));
            }
            var packed = new ReadableStream({
              start: function (c) { if (head.length) c.enqueue(head); if (first.done) c.close(); },
              pull: function (c) { return reader.read().then(function (r) { if (r.done) c.close(); else c.enqueue(r.value); }); },
              cancel: function (why) { return reader.cancel(why); }
            });
            rd = packed.pipeThrough(new DecompressionStream('gzip')).getReader();
            pending = null;
          }
          var dec = null, total = 0;
          function step(r) {
            if (r.done) { if (dec) onText(dec.decode()); return; }
            if (!dec) dec = Xmltv.decoder(r.value);
            total += r.value.length;
            if (total > 500 * 1048576) { try { rd.cancel(); } catch (e) {} throw new Error(T('Die EPG-Datei ist zu groß.')); }
            onText(dec.decode(r.value, { stream: true }));
            return rd.read().then(step);
          }
          return pending ? step(pending) : rd.read().then(step);
        });
      });
    },
    // Alle Quellen nacheinander laden; eine kaputte Quelle stoppt die anderen nicht
    load: function (urls, want) {
      var now = Date.now() / 1000, win = { now: now, from: now - 3 * 3600, to: now + 36 * 3600 };
      var ps = Xmltv.parser(want, win), ok = 0, errors = [];
      return urls.reduce(function (chain, url) {
        return chain.then(function () {
          return Xmltv.read(url, ps.push).then(function () { ok++; }, function (e) { errors.push(e); });
        });
      }, Promise.resolve()).then(function () {
        if (!ok) throw errors[0] || new Error(T('Der Programmführer konnte nicht geladen werden.'));
        return ps.done();
      });
    },
    // Sendungen zu einem Sender finden: erst über tvg-id, dann über den Namen
    find: function (E, item) {
      if (!E || !E.progs) return null;
      var k = item.epgId ? E.lc[String(item.epgId).toLowerCase()] : null;
      if (!k) k = E.names[chanKey(item.name)];
      if (!k && item.epgName) k = E.names[chanKey(item.epgName)];
      return k ? E.progs[k] || null : null;
    }
  };

  /* Zwischenspeicher für den Programmführer im Gerät (IndexedDB – localStorage ist dafür zu klein).
     Funktioniert er nicht (privater Modus, alte Geräte), wird einfach neu geladen. */
  var EpgStore = {
    pr: null,
    open: function () {
      if (this.pr) return this.pr;
      this.pr = new Promise(function (resolve) {
        try {
          if (!window.indexedDB) { resolve(null); return; }
          var req = indexedDB.open('lumio-epg', 1);
          req.onupgradeneeded = function () { try { req.result.createObjectStore('epg'); } catch (e) {} };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = req.onblocked = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
      return this.pr;
    },
    run: function (mode, fn) {
      return this.open().then(function (db) {
        if (!db) return null;
        return new Promise(function (resolve) {
          try {
            var r = fn(db.transaction('epg', mode).objectStore('epg'));
            r.onsuccess = function () { resolve(r.result === undefined ? null : r.result); };
            r.onerror = function () { resolve(null); };
          } catch (e) { resolve(null); }
        });
      });
    },
    get: function (key) { return this.run('readonly', function (s) { return s.get(key); }); },
    set: function (key, val) { return this.run('readwrite', function (s) { return s.put(val, key); }); },
    del: function (key) { return this.run('readwrite', function (s) { return s.delete(key); }); }
  };
  var EPG_TTL = 12 * 3600000;   // Programmführer höchstens alle 12 Stunden neu laden

  function M3UProvider(p) {
    var data = null, loading = null;
    var epgData = null, epgLoading = null, epgFail = null, epgFresh = false;
    // Eigene EPG-Adresse (Profil) hat Vorrang vor der Adresse aus der Playlist
    function epgSources(d) {
      var own = String(p.epgUrl || '').split(/[\s,]+/).filter(function (u) { return /^https?:\/\//i.test(u); });
      return (own.length ? own : (d && d.epgUrls) || []).slice(0, 3);
    }
    function loadEpg() {
      if (epgData && Date.now() - epgData.at < EPG_TTL) return Promise.resolve(epgData);
      // Nach einem Fehler 10 Minuten warten – sonst würde die große Datei bei jedem Senderwechsel neu geladen
      if (epgFail && Date.now() - epgFail.at < 600000) return Promise.reject(epgFail.err);
      if (epgLoading) return epgLoading;
      epgLoading = load().then(function (d) {
        var urls = epgSources(d);
        if (!urls.length) return null;
        var src = urls.join(' '), key = 'epg.' + (p.id || 'neu'), fresh = epgFresh;
        epgFresh = false;
        return (fresh ? Promise.resolve(null) : EpgStore.get(key)).then(function (c) {
          // v2: Sender mit Catch-up behalten die vergangenen Tage (ältere Zwischenspeicher haben nur 3 Stunden)
          if (c && c.src === src && c.v === 2 && Date.now() - c.at < EPG_TTL) return c;
          var want = { ids: {}, names: {}, past: { ids: {}, names: {} } };
          d.live.forEach(function (x) {
            var k = chanKey(x.name), k2 = x.epgName ? chanKey(x.epgName) : '';
            if (x.epgId) want.ids[String(x.epgId).toLowerCase()] = true;
            if (k) want.names[k] = true;
            if (k2) want.names[k2] = true;
            if (x.archive) {
              if (x.epgId) want.past.ids[String(x.epgId).toLowerCase()] = x.archive;
              if (k) want.past.names[k] = x.archive;
              if (k2) want.past.names[k2] = x.archive;
            }
          });
          return Xmltv.load(urls, want).then(function (r) {
            r.src = src; r.at = Date.now(); r.v = 2;
            if (p.id) EpgStore.set(key, r);
            return r;
          });
        });
      }).then(function (r) {
        epgLoading = null; epgFail = null;
        epgData = r || { none: true, at: Date.now(), progs: {}, lc: {}, names: {} };
        if (r) setTimeout(epgReady, 0);
        return epgData;
      }, function (e) { epgLoading = null; epgFail = { at: Date.now(), err: e }; throw e; });
      return epgLoading;
    }
    function epgItem(item) {
      // Favoriten/Verlauf speichern nur eine Kurzform – den vollständigen Eintrag (mit tvg-id) nachschlagen
      var full = data && data.liveById[item.id];
      return full && full.name === item.name ? full : item;
    }
    /* Kennung eines Eintrags aus Adresse und Name – NICHT aus der Position in der Datei. Früher 'l' + Position:
       kam beim Anbieter oben ein Sender dazu, rutschten Favoriten, „Weiterschauen“ und Häkchen auf den Nachbarn.
       Zwei 32-Bit-Prüfwerte (≈ 64 Bit) machen Verwechslungen auch bei 100.000 Einträgen praktisch unmöglich;
       exakt doppelte Einträge bekommen ~2, ~3 … */
    function stableId(prefix, e, used) {
      var base = prefix + '-' + hashCode(e.url).toString(36) + '-' + hashCode(e.name + '|' + e.group).toString(36);
      var id = base, k = 1;
      while (used.has(id)) id = base + '~' + (++k);
      used.add(id);
      return id;
    }
    // Schneller Merker für schon vergebene Kennungen (Set, wo vorhanden – sonst Objekt für sehr alte Fernseher)
    function idSet() {
      if (typeof Set === 'function') { var st = new Set(); return { has: function (x) { return st.has(x); }, add: function (x) { st.add(x); } }; }
      var o = {}; return { has: function (x) { return o.hasOwnProperty(x); }, add: function (x) { o[x] = 1; } };
    }
    function build(entries) {
      var d = { live: [], movie: [], series: [], cats: { live: [], movie: [], series: [] }, seriesMap: {}, liveById: {}, idAt: [] };
      var seenCat = { live: {}, movie: {}, series: {} };
      var n = 0, used = idSet();
      function cat(kind, g) { if (!seenCat[kind][g]) { seenCat[kind][g] = 1; d.cats[kind].push({ id: g, name: g }); } }
      entries.forEach(function (e, idx) {
        var u = e.url.toLowerCase();
        var se = /^(.*?)[\s._-]*S(\d{1,2})\s*E(\d{1,3})/i.exec(e.name);
        if (u.indexOf('/series/') >= 0 || (se && /\.(mp4|mkv|avi|mov|m4v)(\?|$)/.test(u))) {
          var sName = se ? se[1].trim() : e.name;
          var key = e.group + '|' + sName;
          var s = d.seriesMap[key];
          if (!s) {
            s = d.seriesMap[key] = { kind: 'series', id: 's' + hashCode(key), name: sName, logo: e.logo, catId: e.group, _eps: [] };
            d.series.push(s); cat('series', e.group);
          }
          var eid = stableId('e', e, used); d.idAt[idx] = eid;
          s._eps.push({ kind: 'episode', id: eid, url: e.url, name: e.name, season: se ? Number(se[2]) : 1, num: se ? Number(se[3]) : s._eps.length + 1, seriesId: s.id, seriesName: sName, logo: e.logo });
        } else if (u.indexOf('/movie/') >= 0 || /\.(mp4|mkv|avi|mov|m4v)(\?|$)/.test(u)) {
          var mid = stableId('m', e, used); d.idAt[idx] = mid;
          d.movie.push({ kind: 'movie', id: mid, name: e.name, logo: e.logo, url: e.url, catId: e.group });
          cat('movie', e.group);
        } else {
          n++;
          var lid = stableId('l', e, used); d.idAt[idx] = lid;
          var li = { kind: 'live', id: lid, name: e.name, logo: e.logo, url: e.url, catId: e.group, num: n };
          if (e.tvgId) li.epgId = e.tvgId;
          if (e.tvgName && e.tvgName !== e.name) li.epgName = e.tvgName;
          // Catch-up nur anbieten, wenn sich aus der Senderadresse wirklich eine Archiv-Adresse bauen lässt
          if (e.cu) { li.cu = e.cu; if (catchupUrl(li, 1700000000, 1700003600)) li.archive = e.cu.d; else delete li.cu; }
          d.live.push(li);
          d.liveById[li.id] = li;
          cat('live', e.group);
        }
      });
      d.epgUrls = entries.epgUrls || [];
      return d;
    }
    function load() {
      if (data) return Promise.resolve(data);
      if (!loading) {
        loading = fetchText(p.url).then(function (t) {
          if (t.indexOf('#EXT') < 0) throw new Error(T('Das ist keine gültige M3U-Playlist.'));
          data = build(parseM3U(t));
          migrateM3uIds(p.id, data);
          return data;
        });
        loading.catch(function () { loading = null; });
      }
      return loading;
    }
    function findSeries(id) { return data.series.filter(function (s) { return s.id === id; })[0]; }
    return {
      type: 'm3u',
      login: function () { return load(); },
      account: function () { return load().then(function (d) { return { count: d.live.length + d.movie.length + d.series.length }; }); },
      categories: function (kind) { return load().then(function (d) { return d.cats[kind]; }); },
      items: function (kind, catId) {
        return load().then(function (d) {
          if (!catId || catId === '__all') return d[kind];
          return d[kind].filter(function (x) { return x.catId === catId; });
        });
      },
      movieInfo: function (item) { return Promise.resolve({ poster: item.logo }); },
      seriesInfo: function (item) {
        return load().then(function () {
          var s = findSeries(item.id) || item;
          var groups = {};
          (s._eps || []).forEach(function (e) { (groups[e.season] = groups[e.season] || []).push(e); });
          return {
            poster: s.logo,
            seasons: Object.keys(groups).sort(function (a, b) { return a - b; }).map(function (k) {
              return { num: Number(k), episodes: groups[k].sort(function (a, b) { return a.num - b.num; }) };
            })
          };
        });
      },
      // Programmführer: wird erst geladen, wenn er zum ersten Mal gebraucht wird (Live TV, Player)
      epg: function (item, limit) {
        return loadEpg().then(function (E) {
          var list = Xmltv.find(E, epgItem(item));
          if (!list) return [];
          var sh = epgShiftOf(p), t = Date.now() / 1000 - sh;
          return list.filter(function (x) { return x[1] > t; }).slice(0, limit || 8)
            .map(function (x) { return { title: x[2], desc: x[3], start: x[0] + sh, end: x[1] + sh }; });
        }).catch(function () { return []; });
      },
      /* Catch-up (M3U): vergangene Sendungen aus dem Programmführer. Ohne Programmdaten: Stundenblöcke.
         Die Programmführer-Zeit (Verschiebung) korrigiert falsche EPG-Zeiten – darum gilt sie auch für die Adresse. */
      archive: function (item) {
        return load().then(function () {
          var it = epgItem(item), days = it.archive || item.archive || 0, sh = epgShiftOf(p);
          var now = Date.now() / 1000, from = now - days * 86400 - 3600;
          return loadEpg().then(function (E) { return Xmltv.find(E, it) || []; }, function () { return []; }).then(function (list) {
            var out = list.map(function (x) { return { title: x[2], desc: x[3], start: x[0] + sh, end: x[1] + sh }; })
              .filter(function (e) { return e.end > e.start && e.start <= now && e.start >= from; });
            if (!out.length && days) {
              var h0 = Math.floor(now / 3600) * 3600;
              for (var t = h0; t >= from; t -= 3600) out.push({ title: T('Ohne Programmdaten'), desc: '', start: t, end: t + 3600 });
            }
            return out.sort(function (a, b) { return b.start - a.start; });
          });
        });
      },
      catchup: function (item, e) {
        var it = epgItem(item), url = catchupUrl(it.cu ? it : item, Math.floor(e.start), Math.floor(e.end));
        return { kind: 'catchup', id: item.id + '@' + e.start, name: item.name + ' · ' + (e.title || T('Ohne Titel')), logo: item.logo, catId: item.catId,
          plot: e.desc, url: url || it.url };
      },
      // Sofort (ohne Laden): was läuft gerade? Für die Titel in der Senderliste.
      epgNow: function (item) {
        if (!epgData || epgData.none) return null;
        var sh = epgShiftOf(p), list = Xmltv.find(epgData, epgItem(item)), t = Date.now() / 1000 - sh;
        if (!list) return null;
        for (var i = 0; i < list.length; i++) if (list[i][0] <= t && list[i][1] > t) return { title: list[i][2], start: list[i][0] + sh, end: list[i][1] + sh };
        return null;
      },
      epgStatus: function () {
        var s = { sources: data ? epgSources(data) : [], own: !!p.epgUrl };
        if (epgLoading) s.state = 'loading';
        else if (epgFail) { s.state = 'error'; s.error = epgFail.err && epgFail.err.message; }
        else if (epgData) { s.state = epgData.none ? 'none' : 'ok'; s.channels = epgData.channels; s.count = epgData.count; s.at = epgData.at; }
        else s.state = data && !s.sources.length ? 'none' : 'idle';
        return s;
      },
      // Neu laden (z. B. nach Ändern der EPG-Adresse) – ohne den Zwischenspeicher
      epgReload: function () {
        epgData = null; epgFail = null; epgFresh = true;
        return loadEpg();
      },
      streamUrl: function (item) { return { url: item.url }; },
      // „Playlist aktualisieren“: auch den Programmführer frisch holen
      reset: function () { data = null; loading = null; epgData = null; epgFail = null; epgFresh = true; }
    };
  }

  /* ----- Demo (öffentliche Test-Streams, damit man die App ohne Zugang ausprobieren kann) ----- */
  function DemoProvider() {
    var S = {
      live1: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
      bbb: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      bip: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
      sintel: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
      tos: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8'
    };
    var live = [
      [T('Demo Live 1'), 'news', S.live1], [T('Demo Test-Bild'), 'news', S.bip], [T('Demo Kino 24/7'), 'film', S.bbb],
      [T('Demo Animation'), 'film', S.sintel], [T('Demo Science-Fiction'), 'film', S.tos], [T('Demo Live 2'), 'news', S.live1]
    ].map(function (x, i) { return { kind: 'live', id: 'd' + i, name: x[0], catId: x[1], url: x[2], num: i + 1, archive: i === 2 || i === 3 ? 2 : 0 }; });
    var movies = [
      { id: 'm1', name: 'Big Buck Bunny', url: S.bbb, catId: 'anim', year: '2008', plot: T('Ein gutmütiger Riesenhase rächt sich mit viel Fantasie an drei frechen Nagern. Offener Animationsfilm der Blender Foundation.'), genre: T('Animation, Komödie'), duration: '00:09:56', rating: '7.2' },
      { id: 'm2', name: 'Sintel', url: S.sintel, catId: 'anim', year: '2010', plot: T('Eine junge Frau sucht ihren verlorenen Drachen und findet dabei mehr, als sie erwartet hat. Offener Kurzfilm der Blender Foundation.'), genre: T('Animation, Fantasy'), duration: '00:14:48', rating: '7.4' },
      { id: 'm3', name: 'Tears of Steel', url: S.tos, catId: 'scifi', year: '2012', plot: T('Eine Gruppe Wissenschaftler versucht in Amsterdam, die Welt vor Robotern zu retten. Offener Kurzfilm der Blender Foundation.'), genre: T('Science-Fiction'), duration: '00:12:14', rating: '6.1' },
      { id: 'm4', name: T('Apple Testbild'), url: S.bip, catId: 'scifi', year: '2014', plot: T('Ein technischer Teststream zum Prüfen der Wiedergabe.'), genre: 'Test', duration: '00:30:00', rating: '' }
    ].map(function (m) { m.kind = 'movie'; return m; });
    var series = [{ kind: 'series', id: 's1', name: 'Open Movie Classics', catId: 'anim', year: '2008', plot: T('Eine kleine Demo-Serie aus freien Kurzfilmen, um Staffeln und Folgen auszuprobieren.'), genre: T('Animation') }];
    var eps = [
      { season: 1, num: 1, name: 'Big Buck Bunny', url: S.bbb }, { season: 1, num: 2, name: 'Sintel', url: S.sintel },
      { season: 2, num: 1, name: 'Tears of Steel', url: S.tos }
    ].map(function (e, i) { e.kind = 'episode'; e.id = 'e' + i; e.seriesId = 's1'; e.seriesName = 'Open Movie Classics'; return e; });
    var cats = {
      live: [{ id: 'news', name: T('Demo Nachrichten') }, { id: 'film', name: T('Demo Filmkanäle') }],
      movie: [{ id: 'anim', name: T('Animation') }, { id: 'scifi', name: T('Science-Fiction') }],
      series: [{ id: 'anim', name: T('Animation') }]
    };
    var all = { live: live, movie: movies, series: series };
    return {
      type: 'demo',
      login: function () { return Promise.resolve(true); },
      account: function () { return Promise.resolve({ demo: true }); },
      categories: function (kind) { return Promise.resolve(cats[kind]); },
      items: function (kind, catId) {
        var list = all[kind];
        return wait(150).then(function () { return !catId || catId === '__all' ? list : list.filter(function (x) { return x.catId === catId; }); });
      },
      movieInfo: function (item) { return Promise.resolve({ plot: item.plot, genre: item.genre, year: item.year, duration: item.duration, rating: item.rating }); },
      seriesInfo: function (item) {
        return Promise.resolve({
          plot: item.plot, genre: item.genre, year: item.year,
          seasons: [{ num: 1, episodes: eps.slice(0, 2) }, { num: 2, episodes: eps.slice(2) }]
        });
      },
      // Demo-Archiv: alle zwei Stunden einer der freien Filme, zwei Tage zurück
      archive: function () {
        var films = [['Big Buck Bunny', S.bbb], ['Sintel', S.sintel], ['Tears of Steel', S.tos]], out = [];
        var now = Math.floor(Date.now() / 1000), t = now - (now % 7200);
        for (var i = 0; t - i * 7200 > now - 2 * 86400; i++) {
          var f = films[i % 3], st = t - i * 7200;
          out.push({ title: f[0], desc: T('Freier Film der Blender Foundation (CC BY).'), start: st, end: st + 7200, url: f[1] });
        }
        return Promise.resolve(out);
      },
      catchup: function (item, e) {
        return { kind: 'catchup', id: item.id + '@' + e.start, name: item.name + ' · ' + e.title, logo: item.logo, catId: item.catId, plot: e.desc, url: e.url };
      },
      epg: function () {
        var now = Math.floor(Date.now() / 1000), start = now - (now % 3600);
        return Promise.resolve([
          { title: T('Demo-Sendung'), desc: T('Beispiel für den Programmführer.'), start: start, end: start + 3600 },
          { title: T('Nächste Demo-Sendung'), desc: '', start: start + 3600, end: start + 7200 }
        ]);
      },
      streamUrl: function (item) { return { url: item.url }; },
      reset: function () {}
    };
  }

  /* ==========================================================
     Profile, Favoriten, Verlauf
     ========================================================== */
  var Profiles = {
    list: function () { return Store.get('profiles', []); },
    save: function (list) { Store.set('profiles', list); },
    add: function (p) { var l = this.list(); p.id = p.id || uid(); l.push(p); this.save(l); return p; },
    remove: function (id) {
      var gone = this.get(id);
      // Online-Kopie löschen. Klappt das gerade nicht (offline, Server weg), wird es gemerkt und beim nächsten
      // Abgleich wiederholt – sonst käme die gelöschte Playlist mit dem nächsten Abgleich zurück.
      if (gone && gone.remoteId) { Cloud.markDeleted(gone.remoteId); Cloud.flushDeletes(); }
      this.save(this.list().filter(function (p) { return p.id !== id; }));
      this.dropData(id);
    },
    /* Alles löschen, was zu einer Playlist auf dem Gerät gespeichert ist (Datenschutz: keine Reste) */
    DATA_KEYS: ['fav', 'resume', 'recent', 'seen', 'last', 'stats', 'seenNew', 'cats', 'expiry', 'idv', 'hidech'],
    dropData: function (id) {
      this.DATA_KEYS.forEach(function (k) { Store.del(k + '.' + id); });
      EpgStore.del('epg.' + id);   // zwischengespeicherter Programmführer
      if (Store.get('active') === id) Store.del('active');
    },
    get: function (id) { return this.list().filter(function (p) { return p.id === id; })[0]; }
  };

  /* ==========================================================
     Playlist per Handy: Abgleich mit dem Online-Dienst (MAC + Key)
     ========================================================== */
  function sameConnection(a, b) {
    if (!a || !b || a.type !== b.type) return false;
    if (a.type === 'm3u') return String(a.url || '').trim() === String(b.url || '').trim();
    return normalizeServer(a.server || '') === normalizeServer(b.server || '') && (a.username || '') === (b.username || '') && (a.password || '') === (b.password || '');
  }
  var Cloud = {
    registered: false, timer: null, busy: false, uploading: {},
    /* Mit Zeitlimit: Hängt eine Anfrage (schlechtes WLAN, Captive Portal), blieb der Abgleich
       früher für immer auf „busy“ stehen – neue Playlists kamen dann bis zum Neustart nicht mehr an. */
    rpc: function (fn, body) {
      if (!CONFIG.cloudUrl) return Promise.reject(new Error('offline'));
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = null;
      var limit = new Promise(function (resolve, reject) {
        timer = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error('timeout')); }, CONFIG.cloudTimeout);
      });
      var req = fetch(CONFIG.cloudUrl + fn, {
        method: 'POST',
        headers: { apikey: CONFIG.cloudKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) { return r.json(); });
      var cloud = this;
      // Ergebnis merken und die Statusanzeige der Willkommensseite sofort auffrischen
      function seen() { if (WelcomeStatus.box && document.body.contains(WelcomeStatus.box)) WelcomeStatus.paint(); }
      return Promise.race([req, limit]).then(function (j) { clearTimeout(timer); cloud.lastOk = Date.now(); seen(); return j; }, function (e) { clearTimeout(timer); cloud.lastFail = Date.now(); seen(); throw e; });
    },
    /* Gelöschte Playlists, deren Online-Kopie noch nicht entfernt werden konnte */
    pendingDeletes: function () { return Store.get('cloudDel', []); },
    markDeleted: function (remoteId) {
      var l = this.pendingDeletes();
      if (l.indexOf(remoteId) < 0) { l.push(remoteId); Store.set('cloudDel', l); }
    },
    /* Sicherer Weg (seit server/sicherheit-2026-11.sql): app_*-Funktionen mit Token. Fehlen sie in der Datenbank
       (SQL noch nicht eingespielt) oder passt das Token nicht, wie bisher mit MAC + KEY ('legacy'). */
    mode: null,
    call: function (fn, body) {
      var b = {}, k;
      for (k in body) if (body.hasOwnProperty(k)) b[k] = body[k];
      if (this.mode === 'token') { delete b.p_key; b.p_token = Device.token(); return this.rpc('app_' + fn, b); }
      b.p_key = Device.key();
      return this.rpc(fn, b);
    },
    register: function () {
      var self = this, mac = Device.mac(), key = Device.key();
      function legacy() { self.mode = 'legacy'; return self.rpc('register_device', { p_mac: mac, p_key: key }); }
      return self.rpc('app_register', { p_mac: mac, p_key: key, p_token: Device.token() }).then(function (r) {
        if (r && r.ok) { self.mode = 'token'; return r; }
        return legacy();   // Funktion fehlt (PGRST202) oder Token unbekannt → bisheriger Weg
      }, legacy);
    },
    flushDeletes: function () {
      var self = this, l = self.pendingDeletes();
      if (!l.length || !CONFIG.cloudUrl) return Promise.resolve();
      return Promise.all(l.map(function (rid) {
        return self.call('delete_playlist', { p_mac: Device.mac(), p_id: rid }).then(function (r) {
          if (r && r.ok) {
            Store.set('cloudDel', self.pendingDeletes().filter(function (x) { return x !== rid; }));
          }
        }, function () {});
      }));
    },
    sync: function () {
      var self = this;
      if (self.busy || !CONFIG.cloudUrl) return Promise.resolve(null);
      self.busy = true;
      var mac = Device.mac(), key = Device.key();
      var first = self.registered ? Promise.resolve({ ok: true }) : self.register();
      return first.then(function (r) {
        if (!r || !r.ok) return null;
        self.registered = true;
        // erst ausstehende Löschungen nachholen, dann die Liste holen
        return self.flushDeletes().then(function () { return self.call('list_playlists', { p_mac: mac }); });
      }).then(function (r) {
        self.busy = false;
        if (!r || !r.ok) return null;
        var res = self.apply(r.items || []);
        self.upload();
        return res;
      }, function () { self.busy = false; return null; });
    },
    apply: function (items) {
      // Playlists, die auf diesem Gerät gelöscht wurden, deren Online-Löschung aber noch aussteht: ignorieren
      var pend = this.pendingDeletes();
      if (pend.length) items = items.filter(function (it) { return pend.indexOf(it.id) < 0; });
      var byId = {};
      items.forEach(function (it) { byId[it.id] = it; });
      var list = Profiles.list(), added = [], removed = [], edited = [], changed = false;
      list = list.filter(function (p) {
        if (p.remoteId && !byId[p.remoteId]) { removed.push(p); changed = true; return false; }
        return true;
      });
      items.forEach(function (it) {
        var data = it.type === 'xtream'
          ? { type: 'xtream', server: normalizeServer(it.server), username: it.username, password: it.password }
          : { type: 'm3u', url: it.url };
        data.name = it.name; data.remoteId = it.id;
        var ex = list.filter(function (p) { return p.remoteId === it.id; })[0];
        if (!ex) {
          // Gleiche Playlist, die dieses Gerät selbst hochgeladen hat, deren Antwort aber zu spät kam (Zeitlimit):
          // verknüpfen statt doppelt anlegen – sonst entstünde bei jedem Abgleich eine weitere Kopie.
          var twin = list.filter(function (p) { return !p.remoteId && sameConnection(p, data); })[0];
          if (twin) { twin.remoteId = it.id; changed = true; if (App.profile && App.profile.id === twin.id) App.profile.remoteId = it.id; return; }
          data.id = uid(); list.push(data); added.push(data); changed = true; return;
        }
        var conn = false;
        ['type', 'name', 'url', 'server', 'username', 'password'].forEach(function (k) {
          if ((ex[k] || '') !== (data[k] || '')) { ex[k] = data[k]; changed = true; if (k !== 'name') conn = true; }
        });
        if (conn) edited.push(ex);
      });
      if (!changed) return { changed: false };
      Profiles.save(list);
      removed.forEach(function (p) { Profiles.dropData(p.id); });
      if (added.length) toast(T('Neue Playlist empfangen: {0}', added.map(function (p) { return p.name; }).join(', ')), 4000);
      var top = Screens.top();
      var cur = App.profile && list.filter(function (p) { return p.id === App.profile.id; })[0];
      if (cur) App.profile.name = cur.name;
      if (App.profile && removed.some(function (p) { return p.id === App.profile.id; })) { App.profile = null; showProfiles(); }
      else if (App.profile && edited.some(function (p) { return p.id === App.profile.id; })) {
        // Zugangsdaten der laufenden Playlist wurden auf der Webseite geändert: neu laden (außer während der Wiedergabe)
        if (Player.el && !Player.mini) toast(T('Playlist „{0}“ wurde geändert – gilt nach dem nächsten Start.', cur.name), 5000);
        else { toast(T('Playlist „{0}“ wurde geändert.', cur.name), 2000); reloadApp(); }
      }
      else if (top && top.name === 'profiles' && !App.profile && added.length) {
        // Erste Playlist kommt von der Webseite, während der QR-Code angezeigt wird: direkt öffnen
        activateProfile(added[0]);
      }
      else if (top && top.name === 'profiles') showProfiles();
      return { changed: true, added: added, removed: removed, edited: edited };
    },
    /* Playlists, die direkt in der App eingetragen wurden, online speichern (damit sie auf der Webseite erscheinen) –
       nur wenn man das beim Anlegen oder in der Playlist-Übersicht ausdrücklich eingeschaltet hat. */
    upload: function () {
      var self = this;
      if (!self.registered) return;
      Profiles.list().forEach(function (p) {
        // nur Playlists, bei denen „Auch auf der Webseite verwalten“ eingeschaltet wurde
        if (p.remoteId || p.cloud !== true || (p.type !== 'm3u' && p.type !== 'xtream') || self.uploading[p.id]) return;
        self.uploading[p.id] = true;
        var body = { p_mac: Device.mac(), p_name: p.name || T('Playlist'), p_type: p.type };
        if (p.type === 'm3u') body.p_url = p.url;
        else { body.p_server = p.server; body.p_username = p.username; body.p_password = p.password; }
        self.call('add_playlist', body).then(function (r) {
          delete self.uploading[p.id];
          if (!r || !r.ok || !r.id) return;
          var list = Profiles.list();
          var x = list.filter(function (q) { return q.id === p.id; })[0];
          if (x && !x.remoteId) { x.remoteId = r.id; Profiles.save(list); }
          if (App.profile && App.profile.id === p.id) App.profile.remoteId = r.id;
        }, function () { delete self.uploading[p.id]; });
      });
    },
    start: function () {
      var self = this;
      self.sync();
      clearInterval(self.timer);
      self.timer = setInterval(function () { if (!document.hidden) self.sync(); }, CONFIG.syncInterval);
    }
  };

  /* Skript laden: zuerst die mitgelieferte Datei (lib/…), sonst aus dem Internet mit Prüfsumme. get() liefert das Ergebnis. */
  function loadLib(localSrc, cdnSrc, sri, get) {
    function add(src, integrity) {
      return new Promise(function (resolve) {
        var s = document.createElement('script');
        if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
        s.src = src;
        s.onload = function () { resolve(get() || null); };
        s.onerror = function () { if (s.parentNode) s.parentNode.removeChild(s); resolve(null); };
        document.head.appendChild(s);
      });
    }
    return add(localSrc).then(function (x) { return x || add(cdnSrc, sri); });
  }
  var qrLoading = null;
  function loadQrLib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLoading) qrLoading = loadLib('lib/qrcode.js', CONFIG.qrCdn, CONFIG.qrSri, function () { return window.qrcode; });
    return qrLoading;
  }
  /* Webseite im normalen Browser öffnen (Handy/PC). Auf dem Fernseher gibt es keinen Browser – dort scannt man. */
  function openExternal(url) {
    if (Platform.tv) { toast(T('Scanne den QR-Code mit deinem Handy.')); return; }
    if (Platform.capacitor) { window.location.href = url; return; }   // Handy-App: öffnet den System-Browser
    var w = null;
    try { w = window.open(url, '_blank'); } catch (e) {}
    // Windows/Mac-App (Electron): Das Fenster leitet den Link selbst an den Browser weiter und meldet „kein Fenster“ –
    // ein zusätzliches location.href würde die Seite ein zweites Mal öffnen.
    if (!w && !/Electron\//.test(navigator.userAgent || '')) window.location.href = url;
  }
  function qrBox(text, cls) {
    var box = h('button', { class: 'qr f' + (cls ? ' ' + cls : ''), title: T('Webseite öffnen'), 'aria-label': T('Webseite öffnen'), onclick: function () { openExternal(text); } });
    loadQrLib().then(function (qrcode) {
      if (!qrcode) { box.style.display = 'none'; return; }
      try {
        var qr = qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        box.appendChild(h('img', { src: qr.createDataURL(6, 2), alt: 'QR-Code' }));
      } catch (e) { box.style.display = 'none'; }
    });
    return box;
  }
  function portalLinkBtn() {
    return h('button', { class: 'link f', onclick: function () { openExternal(Device.portalLink()); } },
      CONFIG.portalUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  }
  function appearancePanel() {
    var modes = [['dark', T('Dunkel')], ['light', T('Hell')], ['auto', T('Automatisch')]];
    var seg = h('div', { class: 'seg' });
    var btns = modes.map(function (m) {
      var b = h('button', { class: 'btn f', onclick: function () { Settings.set('theme', m[0]); Theme.apply(); paint(); } }, m[1]);
      seg.appendChild(b);
      return [m[0], b];
    });
    function paint() { var t = Settings.get('theme') || 'dark'; btns.forEach(function (x) { x[1].classList.toggle('is-on', x[0] === t); }); }
    paint();
    var s = Season.current();
    return h('div', { class: 'panel' }, h('h3', null, icon('sun'), T('Darstellung')), seg,
      h('p', { class: 'hint', text: s ? T('Gerade läuft das {0}-Design. Danach gilt wieder das Telvo-Violett.', T(SEASONS[s].name)) : T('Automatisch richtet sich nach deinem Gerät. Fernseher bleiben dunkel.') }));
  }

  /* Hintergrund für Startseite und Playlists: dezenter Lichtschein und ein großes, kaum sichtbares Play-Zeichen.
     Nur das Dreieck aus dem Logo – der Querbalken des „T“ sah hinter der Menüleiste wie ein grauer Fehlerbalken aus. */
  function heroArt() {
    var box = h('div', { class: 'hero-art', 'aria-hidden': 'true' });
    box.innerHTML = '<svg viewBox="44 30 44 50" aria-hidden="true" focusable="false">' +
      '<path d="M50 38.5c0-3.3 3.6-5.3 6.4-3.6l25.4 15.6c2.7 1.7 2.7 5.6 0 7.2L56.4 73.4C53.6 75.1 50 73.1 50 69.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
      '</svg>';
    return box;
  }

  function remotePanel() {
    return h('div', { class: 'remote' },
      qrBox(Device.portalLink()),
      h('div', { class: 'remote-text' },
        h('h3', { text: T('Playlist per Handy hinzufügen') }),
        h('p', { text: T('QR-Code scannen oder antippen. MAC und KEY sind auf der Seite schon eingetragen – du gibst nur noch deinen M3U-Link oder Xtream-Zugang ein.') }),
        portalLinkBtn()));
  }

  /* ==========================================================
     Geheimer Admin-Bereich
     Zugang: Mehr → Über → 7× auf die Versionsnummer, dann PIN
     ========================================================== */
  function pinHash(p) {
    var s = 'lumio-admin:' + p, x = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    return x.toString(16);
  }
  /* Schutz gegen Durchprobieren von PINs (Kindersicherung hat nur 10.000 Möglichkeiten):
     ab dem 5. Fehlversuch Wartezeit 30 s, danach jeweils doppelt so lang (höchstens 30 Minuten).
     Der Zähler bleibt auch nach einem Neustart der App erhalten. */
  var PinGuard = {
    FREE: 5,
    get: function (scope) { return Store.get('pinguard.' + scope, null) || { fails: 0, until: 0 }; },
    wait: function (scope) { return Math.max(0, Math.ceil((this.get(scope).until - Date.now()) / 1000)); },
    fail: function (scope) {
      var g = this.get(scope);
      g.fails = (g.fails || 0) + 1;
      if (g.fails >= this.FREE) g.until = Date.now() + Math.min(1800, 30 * Math.pow(2, g.fails - this.FREE)) * 1000;
      Store.set('pinguard.' + scope, g);
      return this.wait(scope);
    },
    ok: function (scope) { Store.del('pinguard.' + scope); },
    msg: function (sec) {
      return sec > 90 ? T('Zu viele Fehlversuche. Bitte in {0} Minuten erneut versuchen.', Math.ceil(sec / 60))
        : T('Zu viele Fehlversuche. Bitte in {0} Sekunden erneut versuchen.', sec);
    }
  };
  function platformName() {
    if (Platform.tizen) return 'Samsung (Tizen)';
    if (Platform.webos) return 'LG (webOS)';
    if (/Electron/.test(UA)) return T('PC-App');
    if (Platform.androidTV) return 'Android TV / Fire TV';
    if (Platform.ios) return 'iPhone / iPad';
    if (Platform.android) return 'Android';
    return T('Browser');
  }
  function storageKB() {
    var n = 0;
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('lumio.') === 0) n += k.length + (localStorage.getItem(k) || '').length; } } catch (e) {}
    return Math.round(n * 2 / 1024);
  }
  /* ==========================================================
     Sichern & Wiederherstellen (Online-Dienst, server/sicherung-2026-11.sql)
     Gesichert: Einstellungen und pro Playlist Favoriten, Weiterschauen, Verlauf, Gesehen, Kategorien, ausgeblendete
     Sender, Programmführer-Zeit. KEINE Passwörter und keine Playlist-Adressen: Playlists werden über einen
     Fingerabdruck (Prüfwert der Verbindung) wiedererkannt. Daten für eine Playlist, die es auf dem Gerät (noch) nicht
     gibt, warten und werden übernommen, sobald man sie einträgt und öffnet.
     ========================================================== */
  var BACKUP_DATA = ['fav', 'resume', 'recent', 'seen', 'seenNew', 'last', 'cats', 'hidech'];
  var BACKUP_SKIP = ['parentPin', 'adminPin', 'deviceType', 'engine', 'extPlayer', 'volume', 'muted'];   // Sicherheit / gerätespezifisch
  function profileFp(p) {
    if (!p) return '';
    var s = p.type === 'xtream' ? 'x|' + normalizeServer(p.server).toLowerCase() + '|' + String(p.username || '').toLowerCase()
      : p.type === 'm3u' ? 'm|' + String(p.url || '').trim() : 'd|' + p.type;
    return hashCode(s).toString(36) + hashCode(s + '#telvo').toString(36);
  }
  var Backup = {
    build: function () {
      var settings = {}, sd = Settings.data || {};
      Object.keys(sd).forEach(function (k) { if (BACKUP_SKIP.indexOf(k) < 0) settings[k] = sd[k]; });
      var lists = Profiles.list().filter(function (p) { return p.type === 'xtream' || p.type === 'm3u'; }).map(function (p) {
        var o = { fp: profileFp(p), name: p.name, type: p.type, d: {} };
        if (p.epgShift) o.epgShift = p.epgShift;
        BACKUP_DATA.forEach(function (k) { var v = Store.get(k + '.' + p.id, null); if (v !== null) o.d[k] = v; });
        return o;
      });
      return { v: 1, at: Date.now(), app: CONFIG.version, settings: settings, lists: lists };
    },
    ready: function () {
      if (!CONFIG.cloudUrl) return Promise.reject(new Error(T('Online-Dienst nicht erreichbar')));
      return (Cloud.registered ? Promise.resolve({ ok: true }) : Cloud.register()).then(function (r) {
        if (!r || !r.ok) throw new Error(rpcErr(r) || T('Online-Dienst nicht erreichbar'));
        Cloud.registered = true;
        if (Cloud.mode !== 'token') throw new Error(T('Der Online-Dienst kennt diese Funktion noch nicht.'));
      });
    },
    err: function (r) {
      var m = rpcErr(r);
      if ((r && r.code === 'PGRST202') || /could not find the function/i.test(m)) return T('Der Online-Dienst kennt diese Funktion noch nicht.');
      return m ? T(m) : T('Online-Dienst nicht erreichbar');
    },
    save: function (quiet) {
      var self = this;
      return self.ready().then(function () {
        return Cloud.rpc('app_save_backup', { p_mac: Device.mac(), p_token: Device.token(), p_data: self.build() });
      }).then(function (r) {
        if (!r || !r.ok) throw new Error(self.err(r));
        Store.set('backupAt', Date.now());
        if (!quiet) toast(T('Gesichert'), 2500);
        return r;
      });
    },
    remove: function () {
      var self = this;
      return self.ready().then(function () { return Cloud.rpc('app_delete_backup', { p_mac: Device.mac(), p_token: Device.token() }); })
        .then(function (r) { if (!r || !r.ok) throw new Error(self.err(r)); Store.del('backupAt'); return r; });
    },
    fetch: function (mac, key) {
      var self = this;
      if (!CONFIG.cloudUrl) return Promise.reject(new Error(T('Online-Dienst nicht erreichbar')));
      return Cloud.rpc('restore_backup', { p_mac: mac, p_key: key }).then(function (r) { if (!r || !r.ok) throw new Error(self.err(r)); return r; });
    },
    // Daten einer gesicherten Playlist in eine Playlist auf diesem Gerät schreiben
    applyList: function (p, l) {
      BACKUP_DATA.forEach(function (k) { if (l.d && l.d[k] !== undefined) Store.set(k + '.' + p.id, l.d[k]); });
      if (l.epgShift) p.epgShift = l.epgShift; else delete p.epgShift;
    },
    // Wiederherstellen: Playlists von der Webseite ergänzen, Einstellungen ersetzen (außer gerätespezifische), Daten zuordnen
    apply: function (r) {
      var self = this, b = r.backup || {}, list = Profiles.list(), added = 0;
      (r.playlists || []).forEach(function (it) {
        var data = it.type === 'xtream' ? { type: 'xtream', server: normalizeServer(it.server), username: it.username, password: it.password } : { type: 'm3u', url: it.url };
        data.name = it.name;
        if (list.some(function (q) { return sameConnection(q, data); })) return;
        data.id = uid(); list.push(data); added++;
      });
      if (b.settings) {
        var keep = {};
        BACKUP_SKIP.forEach(function (k) { if (Settings.data[k] !== undefined) keep[k] = Settings.data[k]; });
        var ns = {};
        Object.keys(b.settings).forEach(function (k) { if (BACKUP_SKIP.indexOf(k) < 0) ns[k] = b.settings[k]; });
        Object.keys(keep).forEach(function (k) { ns[k] = keep[k]; });
        Settings.data = ns; Store.set('settings', ns);
      }
      var pending = Store.get('restorePending', {}), matched = 0;
      (b.lists || []).forEach(function (l) {
        var p = list.filter(function (q) { return profileFp(q) === l.fp; })[0];
        if (p) { self.applyList(p, l); matched++; delete pending[l.fp]; } else pending[l.fp] = l;
      });
      Profiles.save(list);
      if (Object.keys(pending).length) Store.set('restorePending', pending); else Store.del('restorePending');
      return { added: added, matched: matched, waiting: Object.keys(pending).length };
    },
    // Beim Öffnen einer Playlist: wartende Daten aus einer Sicherung übernehmen
    pendingFor: function (p) {
      var pending = Store.get('restorePending', null), fp = p && profileFp(p);
      if (!pending || !fp || !pending[fp]) return false;
      var list = Profiles.list(), x = list.filter(function (q) { return q.id === p.id; })[0];
      this.applyList(x || p, pending[fp]);
      if (x) { if (x.epgShift) p.epgShift = x.epgShift; else delete p.epgShift; Profiles.save(list); }
      delete pending[fp];
      if (Object.keys(pending).length) Store.set('restorePending', pending); else Store.del('restorePending');
      return true;
    },
    // „Täglich automatisch sichern“ (Einstellung): beim Start, wenn die letzte Sicherung älter als ein Tag ist
    daily: function () {
      if (!Settings.get('backupAuto') || !CONFIG.cloudUrl) return;
      if (Date.now() - (Store.get('backupAt', 0) || 0) < 86400000) return;
      this.save(true).catch(function (e) { ErrLog.add('Sicherung', e && e.message); });
    }
  };
  function fmtWhen(ms) { return ms ? fmtDate(ms / 1000) + ' ' + fmtClock(ms / 1000) : ''; }
  function showBackup() {
    var status = h('p', { class: 'up-status' }), err = h('div', { class: 'error' }), actions = h('div', { class: 'row' });
    function paintStatus() {
      var at = Store.get('backupAt', 0);
      status.textContent = at ? T('Letzte Sicherung: {0}', fmtWhen(at)) : T('Auf diesem Gerät wurde noch nichts gesichert.');
      status.className = 'up-status' + (at ? ' is-ok' : '');
    }
    function busy(btn, on, label) { btn.disabled = on; btn.lastChild.textContent = label; }
    var saveBtn = sheetBtn('upload', T('Jetzt sichern'), function () {
      err.textContent = ''; busy(saveBtn, true, T('Wird gesichert …'));
      Backup.save().then(function () { busy(saveBtn, false, T('Jetzt sichern')); paintStatus(); },
        function (e) { busy(saveBtn, false, T('Jetzt sichern')); err.textContent = e.message; });
    }, 'primary');
    var restoreBtn = sheetBtn('restart', T('Wiederherstellen'), function () { askRestore(Device.mac(), Device.key()); });
    var otherBtn = sheetBtn('device', T('Von anderem Gerät übernehmen'), function () {
      var fm = inputField(T('MAC-Adresse des alten Geräts'), '00:1A:79:…', 'text'), fk = inputField('KEY', '', 'text'), e2 = h('div', { class: 'error' });
      fm.input.setAttribute('data-autofocus', '');
      fk.input.setAttribute('autocapitalize', 'characters');
      function go() {
        var mac = String(fm.input.value).toUpperCase().replace(/[^0-9A-F]/g, '').replace(/(..)(?!$)/g, '$1:');
        var key = String(fk.input.value).trim().toUpperCase();
        if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) { e2.textContent = T('Bitte eine vollständige MAC-Adresse eingeben (12 Zeichen).'); return; }
        if (!/^[A-Z0-9]{6,12}$/.test(key)) { e2.textContent = T('Bitte den KEY eingeben.'); return; }
        goBack();
        setTimeout(function () { askRestore(mac, key); }, 40);
      }
      fk.input.addEventListener('keydown', function (e) { if (e.keyCode === 13) go(); });
      openSheet(T('Von anderem Gerät übernehmen'), 'device', [
        h('p', { class: 'hint', text: T('MAC und KEY stehen auf dem alten Gerät unten am Bildschirm oder unter „Profil“.') }),
        fm.wrap, h('div', { class: 'rep-mail' }, fk.wrap), e2, h('div', { class: 'row' }, sheetBtn('check', T('Weiter'), go, 'primary'))]);
    });
    var delBtn = sheetBtn('trash', T('Sicherung löschen'), function () {
      confirmBox(T('Sicherung löschen?'), T('Die online gespeicherte Sicherung dieses Geräts wird gelöscht.'), T('Löschen'), function () {
        Backup.remove().then(function () { toast(T('Sicherung gelöscht')); paintStatus(); }, function (e) { err.textContent = e.message; });
      });
    });
    var auto = toggleRow(T('Täglich automatisch sichern'), T('Beim Start, höchstens einmal am Tag.'),
      function () { return !!Settings.get('backupAuto'); }, function (v) { Settings.set('backupAuto', v); if (v) Backup.daily(); });
    actions.appendChild(saveBtn); actions.appendChild(restoreBtn); actions.appendChild(otherBtn); actions.appendChild(delBtn);
    paintStatus();
    openSheet(T('Sichern & Wiederherstellen'), 'upload', [
      h('p', { class: 'hint', text: T('Sichert Einstellungen, Favoriten, Weiterschauen, Verlauf und Kategorien online – ohne Passwörter. Wiederherstellen geht auch auf einem neuen Gerät mit MAC und KEY von diesem Gerät.') }),
      status, actions, auto, err], { wide: true, onClose: paintSettings });
  }
  function askRestore(mac, key) {
    var w = h('p', { class: 'hint', text: T('Sicherung wird gesucht …') });
    openSheet(T('Wiederherstellen'), 'restart', [w]);
    Backup.fetch(mac, key).then(function (r) {
      var n = (r.playlists || []).length, has = !!r.backup;
      if (!has && !n) { w.textContent = T('Für dieses Gerät gibt es keine Sicherung.'); return; }
      goBack();
      setTimeout(function () {
        confirmBox(has ? T('Sicherung vom {0} übernehmen?', fmtWhen(r.at ? Date.parse(r.at) : 0)) : T('Playlists übernehmen?'),
          (has ? T('Einstellungen, Favoriten und Verlauf werden durch die Sicherung ersetzt.') + ' ' : '') + (n ? T('{0} Playlists von der Webseite kommen dazu.', n) : ''),
          T('Übernehmen'), function () {
            var res = Backup.apply(r);
            try { sessionStorage.setItem('lumio.restored', JSON.stringify(res)); } catch (e) {}
            reloadApp();
          });
      }, 60);
    }, function (e) { w.textContent = e.message; w.className = 'error'; });
  }

  function resetAll() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      // Geräte-Kennung bleibt: MAC, KEY und der App-Token (sonst könnte das Gerät danach nichts mehr online sichern)
      keys.forEach(function (k) { if (k.indexOf('lumio.') === 0 && k !== 'lumio.mac' && k !== 'lumio.devkey' && k !== 'lumio.devtoken') localStorage.removeItem(k); });
    } catch (e) {}
    // auch den zwischengespeicherten Programmführer löschen, dann neu starten
    var done = false;
    function go() { if (done) return; done = true; location.reload(); }
    setTimeout(go, 1500);
    EpgStore.open().then(function (db) {
      try { if (db) db.close(); var r = indexedDB.deleteDatabase('lumio-epg'); r.onsuccess = r.onerror = go; } catch (e) { go(); }
    });
  }
  var Admin = {
    taps: 0, tapTimer: null,
    tap: function () {
      var self = this;
      self.taps++;
      clearTimeout(self.tapTimer);
      self.tapTimer = setTimeout(function () { self.taps = 0; }, 3000);
      if (self.taps >= 7) { self.taps = 0; self.unlock(); }
    },
    unlock: function () {
      var self = this, has = !!Settings.get('adminPin');
      // Ohne Admin-PIN könnte sonst jeder (z. B. ein Kind) eine neue PIN festlegen und über
      // „Alles zurücksetzen“ die Kindersicherung abschalten. Darum vorher die Kindersicherungs-PIN abfragen.
      if (!has && Parental.on() && !self.parentOk) {
        Parental.ask(function () { self.parentOk = true; self.unlock(); },
          { keep: true, text: T('Die Kindersicherung ist aktiv. Bitte zuerst die Kindersicherungs-PIN eingeben.') });
        return;
      }
      self.parentOk = false;
      var f = inputField(has ? T('Admin-PIN') : T('Neue Admin-PIN (4 bis 8 Ziffern)'), '', 'password');
      f.input.setAttribute('inputmode', 'numeric');
      f.input.setAttribute('data-autofocus', '');
      var f2 = has ? null : inputField(T('PIN wiederholen'), '', 'password');
      if (f2) f2.input.setAttribute('inputmode', 'numeric');
      var err = h('div', { class: 'error' });
      function go() {
        var a = f.input.value.trim();
        var w = has ? PinGuard.wait('admin') : 0;
        if (w) { err.textContent = PinGuard.msg(w); f.input.value = ''; return; }
        if (!/^\d{4,8}$/.test(a)) { err.textContent = T('Bitte 4 bis 8 Ziffern eingeben.'); return; }
        if (!has) {
          if (f2.input.value.trim() !== a) { err.textContent = T('Die PINs stimmen nicht überein.'); return; }
          Settings.set('adminPin', pinHash(a));
        } else if (pinHash(a) !== Settings.get('adminPin')) {
          var left = PinGuard.fail('admin');
          err.textContent = left ? PinGuard.msg(left) : T('Falsche PIN.'); f.input.value = ''; return;
        }
        PinGuard.ok('admin');
        Screens.pop();
        setTimeout(function () { self.show(); }, 40);
      }
      (f2 ? f2 : f).input.addEventListener('keydown', function (e) { if (e.keyCode === 13) go(); });
      var panel = h('div', { class: 'modal-panel admin-lock' },
        h('div', { class: 'admin-lock-in' },
          h('h2', { text: has ? T('Admin-Bereich') : T('Admin-PIN festlegen') }),
          h('p', { class: 'hint', text: has ? T('Bitte gib deine PIN ein.') : T('Mit dieser PIN öffnest du künftig den Admin-Bereich auf diesem Gerät.') }),
          f.wrap, f2 ? f2.wrap : null, err,
          h('div', { class: 'row' },
            h('button', { class: 'btn f primary', onclick: go }, has ? T('Öffnen') : T('Speichern & öffnen')),
            h('button', { class: 'btn f ghost', onclick: goBack }, T('Abbrechen')))));
      Screens.push('admin-lock', h('div', { class: 'modal' }, h('div', { class: 'modal-backdrop', onclick: goBack }), panel), { overlay: true });
    },
    show: function () {
      var self = this;
      function seg(options, get, set, after) {
        var row = h('div', { class: 'row' });
        var btns = options.map(function (o) {
          var b = h('button', { class: 'btn f', onclick: function () { set(o[0]); paint(); if (after) after(); } }, o[1]);
          row.appendChild(b);
          return [o[0], b];
        });
        function paint() { var v = get(); btns.forEach(function (x) { x[1].classList.toggle('is-on', x[0] === v); }); }
        paint();
        return row;
      }
      var seasonInfo = h('p', { class: 'hint' });
      function paintSeason() { var s = Season.current(); seasonInfo.textContent = T('Gerade aktiv: {0}', s ? T('{0}-Design', T(SEASONS[s].name)) : T('normales Design')); }
      paintSeason();
      var kv = h('div', { class: 'kv' });
      function row(k, v) { kv.appendChild(h('span', { text: k })); kv.appendChild(h('b', { text: String(v) })); }
      row(T('Version'), CONFIG.version);
      row(T('Gerät'), platformName());
      row('MAC', Device.mac());
      row('KEY', Device.key());
      row(T('Playlists'), Profiles.list().length);
      row(T('Online-Dienst'), Cloud.registered ? T('verbunden') : T('nicht verbunden'));
      row(T('Gespeichert'), storageKB() + ' KB');
      var el = h('div', { class: 'page admin' },
        h('div', { class: 'admin-head' },
          h('button', { class: 'btn f ghost', onclick: goBack, 'data-autofocus': true }, icon('back'), T('Zurück')),
          h('h1', { text: T('Admin-Bereich') })),
        h('div', { class: 'panel' },
          h('h3', { text: T('Saison-Design') }),
          h('p', { class: 'hint', text: T('Automatisch: Weihnachten vom 1. bis 26. Dezember, Silvester vom 27. Dezember bis 1. Januar.') }),
          seg([['auto', T('Automatisch')], ['christmas', T('Weihnachten')], ['newyear', T('Silvester')], ['off', T('Aus')]],
            function () { return Settings.get('season') || 'auto'; },
            function (v) { Settings.set('season', v); Theme.apply(); }, paintSeason),
          seasonInfo,
          h('h3', { text: T('Schnee & Funkeln') }),
          seg([[true, T('An')], [false, T('Aus')]],
            function () { return Settings.get('fx') !== false; },
            function (v) { Settings.set('fx', v); Theme.apply(); })),
        h('div', { class: 'panel' }, h('h3', { text: T('Geräte-Info') }), kv),
        h('div', { class: 'panel' },
          h('h3', { text: T('Sicherheit') }),
          h('div', { class: 'row' },
            h('button', { class: 'btn f', onclick: function () { Settings.set('adminPin', null); goBack(); setTimeout(function () { self.unlock(); }, 60); } }, T('Admin-PIN ändern')))),
        h('div', { class: 'panel' },
          h('h3', { text: T('App zurücksetzen') }),
          h('p', { class: 'hint', text: T('Löscht Playlists, Favoriten, Verlauf und Einstellungen auf diesem Gerät. MAC und KEY bleiben erhalten.') }),
          h('div', { class: 'row' },
            h('button', { class: 'btn f danger', onclick: function () { confirmBox(T('Wirklich alles zurücksetzen?'), T('Das kann nicht rückgängig gemacht werden.'), T('Zurücksetzen'), resetAll); } }, icon('trash'), T('Alles zurücksetzen')))));
      Screens.push('admin', el);
    }
  };

  var App = { profile: null, provider: null };

  /* Erinnert 30 Tage, 7 Tage und 24 Stunden vor Ablauf des Zugangs (und nach Ablauf) – jeweils einmal.
     Später kann hier auch eine eigene Nachricht, ein Bild oder Video des Anbieters erscheinen. */
  /* ---------- Nutzungsbedingungen: einmaliger Hinweis beim ersten Start ----------
     Erscheint erneut nur, wenn sich die Bedingungen ändern (dann „version“ erhöhen). */
  var Terms = {
    version: '2026-11',
    check: function () {
      if (Store.get('terms') === this.version) return;
      var self = this, url = CONFIG.portalUrl + 'nutzungsbedingungen.html';
      var show = function () {
        if (Dialog.open) { setTimeout(show, 1500); return; }
        var btns = [{ label: T('Verstanden'), primary: true, action: function () { Store.set('terms', self.version); } }];
        // Auf dem Fernseher gibt es keinen Browser – dort steht die Adresse im Text
        if (!Platform.tv) btns.unshift({ label: T('Nutzungsbedingungen lesen'), action: function () { openExternal(url); } });
        Dialog.show(T('Bevor es losgeht'), T('Telvo ist ein Player ohne eigene Sender oder Inhalte. Du trägst deine eigene Playlist ein und nutzt nur Quellen, für die du eine Berechtigung hast. Mit „Verstanden“ stimmst du den Nutzungsbedingungen zu: {0}', url.replace(/^https?:\/\//, '')), btns);
      };
      setTimeout(show, 600);
    }
  };

  var Expiry = {
    timer: null,
    check: function () {
      var self = this, p = App.profile;
      // Geräte laufen oft tagelang durch: alle 6 Stunden erneut prüfen
      if (!self.timer) self.timer = setInterval(function () { self.check(); }, 6 * 3600000);
      if (!p || !App.provider || !App.provider.account) return;
      App.provider.account().then(function (a) {
        if (!a || !a.expires || App.profile !== p) return;
        var exp = Number(a.expires) * 1000;
        if (!(exp > 0)) return;
        var left = exp - Date.now(), day = 86400000;
        var stage = left <= 0 ? 'over' : left <= day ? 'd1' : left <= 7 * day ? 'd7' : left <= 30 * day ? 'd30' : null;
        if (!stage) return;
        var key = 'expiry.' + p.id, seen = Store.get(key, {});
        if (seen.exp !== a.expires) seen = { exp: a.expires };
        if (seen[stage]) return;
        // diese und alle früheren Stufen als erledigt merken
        var order = ['d30', 'd7', 'd1', 'over'];
        order.slice(0, order.indexOf(stage) + 1).forEach(function (k) { if (!seen[k]) seen[k] = Date.now(); });
        Store.set(key, seen);
        var when = fmtDate(a.expires), days = Math.max(1, Math.ceil(left / day));
        var title = stage === 'over' ? T('Dein Zugang ist abgelaufen') : T('Dein Zugang läuft bald ab');
        var text = stage === 'over' ? T('„{0}“ ist am {1} abgelaufen. Bitte melde dich bei deinem Anbieter, um den Zugang zu verlängern.', p.name, when)
          : stage === 'd1' ? T('„{0}“ läuft in weniger als 24 Stunden ab ({1}). Bitte melde dich bei deinem Anbieter, um den Zugang zu verlängern.', p.name, when)
          : T('„{0}“ läuft in {1} Tagen ab ({2}). Bitte melde dich rechtzeitig bei deinem Anbieter, um den Zugang zu verlängern.', p.name, days, when);
        var show = function () {
          if (Dialog.open || (Screens.top() && Screens.top().name === 'player')) { setTimeout(show, 5000); return; }
          Dialog.show(title, text, [{ label: T('Verstanden'), primary: true }]);
        };
        setTimeout(show, 1200);
      }).catch(function () {});
    }
  };

  /* Einmalige Umstellung gespeicherter M3U-Einträge von der alten Kennung ('l12', 'm3', 'e40' = Position in der Datei)
     auf die neue, stabile Kennung. Bevorzugt über die gespeicherte Adresse (stimmt auch, wenn sich die Reihenfolge
     inzwischen geändert hat), sonst über die Position. Danach Merker 'idv.<Playlist>' = 2, läuft nie wieder. */
  function migrateM3uIds(profileId, d) {
    if (!profileId || Store.get('idv.' + profileId) === 2) return;
    // Nichts gespeichert (z. B. neue Playlist)? Dann nur merken – keine großen Nachschlagelisten bauen.
    var OLD = /^[lme]\d+$/, any = false;
    function hasOld(x) { return x && OLD.test(String(x.id)); }
    var f0 = Store.get('fav.' + profileId, null), r0 = Store.get('recent.' + profileId, null), l0 = Store.get('last.' + profileId, null);
    var s0 = Store.get('seen.' + profileId, null), z0 = Store.get('resume.' + profileId, null);
    if (f0) Object.keys(f0).forEach(function (k) { if ((f0[k] || []).some(hasOld)) any = true; });
    if ((r0 || []).some(hasOld) || (l0 && hasOld(l0.item))) any = true;
    if (s0 && Object.keys(s0).some(function (k) { return OLD.test(k.slice(k.indexOf(':') + 1)); })) any = true;
    if (z0 && Object.keys(z0).some(function (k) { return OLD.test(k.slice(k.indexOf(':') + 1)); })) any = true;
    if (!any) { Store.set('idv.' + profileId, 2); return; }
    var byUrl = {};
    d.live.forEach(function (x) { byUrl['live|' + x.url] = x.id; });
    d.movie.forEach(function (x) { byUrl['movie|' + x.url] = x.id; });
    d.series.forEach(function (sr) { sr._eps.forEach(function (x) { byUrl['episode|' + x.url] = x.id; }); });
    function conv(kind, id, url) {
      if (!OLD.test(String(id))) return id;
      return (url && byUrl[kind + '|' + url]) || d.idAt[Number(String(id).slice(1))] || id;
    }
    function fixItem(x) { if (x && x.id !== undefined) x.id = conv(x.kind, x.id, x.url); return x; }
    var fav = Store.get('fav.' + profileId, null);
    if (fav) { Object.keys(fav).forEach(function (k) { (fav[k] || []).forEach(fixItem); }); Store.set('fav.' + profileId, fav); }
    var rec = Store.get('recent.' + profileId, null);
    if (rec) Store.set('recent.' + profileId, rec.map(fixItem));
    var last = Store.get('last.' + profileId, null);
    if (last && last.item) { fixItem(last.item); Store.set('last.' + profileId, last); }
    var res = Store.get('resume.' + profileId, null);
    if (res) {
      var nr = {};
      Object.keys(res).forEach(function (k) {
        var v = res[k], i = k.indexOf(':'), kind = k.slice(0, i), id = k.slice(i + 1);
        var nid = conv(kind, id, v && v.item && v.item.url);
        if (v && v.item) v.item.id = nid;
        nr[kind + ':' + nid] = v;
      });
      Store.set('resume.' + profileId, nr);
    }
    var seen = Store.get('seen.' + profileId, null);
    if (seen) {
      var ns = {};
      Object.keys(seen).forEach(function (k) { var i = k.indexOf(':'), kind = k.slice(0, i); ns[kind + ':' + conv(kind, k.slice(i + 1), null)] = seen[k]; });
      Store.set('seen.' + profileId, ns);
    }
    Store.set('idv.' + profileId, 2);
  }
  function makeProvider(p) {
    if (p.type === 'xtream') return XtreamProvider(p);
    if (p.type === 'm3u') return M3UProvider(p);
    return DemoProvider();
  }
  function pid() { return App.profile ? App.profile.id : 'none'; }
  function slim(item) {
    var o = {};
    ['kind', 'id', 'name', 'logo', 'backdrop', 'num', 'ext', 'url', 'catId', 'season', 'seriesId', 'seriesName', 'year', 'rating', 'plot', 'genre', 'duration', 'archive'].forEach(function (k) {
      if (item[k] !== undefined && item[k] !== null && item[k] !== '') o[k] = item[k];
    });
    return o;
  }

  var Favs = {
    all: function () { return Store.get('fav.' + pid(), { live: [], movie: [], series: [] }); },
    list: function (kind) { return this.all()[kind] || []; },
    has: function (item) { return this.list(item.kind).some(function (x) { return x.id === item.id; }); },
    toggle: function (item) {
      var a = this.all(); var l = a[item.kind] || [];
      var on = l.some(function (x) { return x.id === item.id; });
      a[item.kind] = on ? l.filter(function (x) { return x.id !== item.id; }) : [slim(item)].concat(l);
      Store.set('fav.' + pid(), a);
      toast(on ? T('Aus Favoriten entfernt') : T('Zu Favoriten hinzugefügt'));
      return !on;
    }
  };

  var Resume = {
    all: function () { return Store.get('resume.' + pid(), {}); },
    key: function (item) { return item.kind + ':' + item.id; },
    get: function (item) { return this.all()[this.key(item)]; },
    set: function (item, t, d) {
      if (item && item.kind === 'catchup') return;    // vergangene Sendungen nicht unter „Weiterschauen“
      var a = this.all(); var k = this.key(item);
      if (d && t > d - 60) Seen.add(item);          // bis (fast) zum Ende geschaut = gesehen
      if (!d || t < 30 || t > d - 60) delete a[k];
      else a[k] = { t: Math.floor(t), d: Math.floor(d), at: Date.now(), item: slim(item) };
      var keys = Object.keys(a).sort(function (x, y) { return a[y].at - a[x].at; });
      keys.slice(40).forEach(function (x) { delete a[x]; });
      Store.set('resume.' + pid(), a);
    },
    recent: function () { var a = this.all(); return Object.keys(a).map(function (k) { return a[k]; }).sort(function (x, y) { return y.at - x.at; }); },
    clear: function () { Store.del('resume.' + pid()); }
  };

  /* Fertig geschaute Filme und Folgen (für Häkchen und „nächste ungesehene Folge“) */
  var Seen = {
    all: function () { return Store.get('seen.' + pid(), {}); },
    has: function (item) { return !!this.all()[item.kind + ':' + item.id]; },
    add: function (item) {
      if (!item || (item.kind !== 'movie' && item.kind !== 'episode')) return;
      var a = this.all(), k = item.kind + ':' + item.id;
      if (a[k]) return;
      a[k] = Date.now();
      var keys = Object.keys(a);
      if (keys.length > 2500) keys.sort(function (x, y) { return a[x] - a[y]; }).slice(0, keys.length - 2000).forEach(function (x) { delete a[x]; });
      Store.set('seen.' + pid(), a);
    }
  };

  /* Was zuletzt lief (Sender, Film oder Serie) – beim nächsten App-Start landet man genau dort */
  var Last = {
    get: function () { return Store.get('last.' + pid(), null); },
    set: function (item) {
      var it = item;
      if (item.kind === 'episode') {
        var s = App.openSeries && App.openSeries.id === item.seriesId ? App.openSeries : { kind: 'series', id: item.seriesId, name: item.seriesName, logo: item.logo };
        it = s;
      }
      if (!it || !it.id || it.kind === 'catchup') return;
      Store.set('last.' + pid(), { item: slim(it), at: Date.now() });
    }
  };

  var Recent = {
    list: function () { return Store.get('recent.' + pid(), []); },
    push: function (item) {
      var l = this.list().filter(function (x) { return x.id !== item.id; });
      l.unshift(slim(item)); Store.set('recent.' + pid(), l.slice(0, 15));
    }
  };

  /* ==========================================================
     Toast & Dialog
     ========================================================== */
  /* Kurze Meldung unten. Immer nur eine auf einmal – eine neue ersetzt die alte
     (sonst stapeln sich z. B. beim schnellen Drücken auf „Merken“ viele Meldungen übereinander). */
  var toastTimer = null;
  function toast(msg, ms) {
    var layer = $('#toast-layer');
    clear(layer);
    clearTimeout(toastTimer);
    var t = h('div', { class: 'toast', text: msg });
    layer.appendChild(t);
    toastTimer = setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 2500);
  }

  var Dialog = {
    open: false, prevFocus: null, onClose: null,
    show: function (title, text, buttons, cls) {
      var layer = $('#dialog-layer');
      // Im Vollbild ist nur der Player sichtbar – dann muss die Abfrage in den Player hinein
      var fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs && layer.parentNode !== fs) fs.appendChild(layer);
      var self = this;
      self.prevFocus = document.activeElement;
      clear(layer);
      var row = h('div', { class: 'row' });
      var first = null;
      buttons.forEach(function (b) {
        var btn = h('button', { class: 'btn f ' + (b.primary ? 'primary' : ''), onclick: function () { self.close(); if (b.action) b.action(); } }, b.label);
        if (b.primary || !first) first = btn;
        row.appendChild(btn);
      });
      layer.appendChild(h('div', { class: 'dialog' + (cls ? ' ' + cls : ''), role: 'dialog' }, h('h3', { text: title }), text ? h('p', { text: text }) : null, row));
      self.open = true;
      setTimeout(function () { Nav.focus(first); }, 30);
    },
    close: function () {
      var layer = $('#dialog-layer'), app = $('#app');
      clear(layer); this.open = false;
      if (app && layer.parentNode !== app) app.appendChild(layer);
      if (this.prevFocus && document.body.contains(this.prevFocus)) Nav.focus(this.prevFocus);
    }
  };
  function confirmBox(title, text, okLabel, onOk) {
    Dialog.show(title, text, [{ label: T('Abbrechen') }, { label: okLabel || T('OK'), primary: true, action: onOk }]);
  }

  /* ==========================================================
     Navigation mit der Fernbedienung (Pfeiltasten)
     Sucht in der gedrückten Richtung das nächstgelegene Element.
     ========================================================== */
  var Nav = {
    root: function () {
      if (Dialog.open) return $('#dialog-layer');
      var top = Screens.top();
      return top ? top.el : document.body;
    },
    candidates: function () {
      var all = $all('.f', this.root());
      if (!Dialog.open && Player.mini && Player.el) all = all.concat($all('.mini-ui .f', Player.el));
      return all.filter(function (el) {
        if (el.disabled) return false;
        if (el.closest && el.closest('.is-hidden, .is-off')) return false;
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    },
    focus: function (el) {
      if (!el) return;
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      ensureVisible(el);
    },
    focusFirst: function (root) {
      root = root || this.root();
      var el = $('[data-autofocus]', root) || $('.f.is-on', root) || $('.f', root);
      if (el) this.focus(el);
    },
    /* Bestes Ziel in Pfeilrichtung: nah, und möglichst in derselben Zeile/Spalte */
    pick: function (cur, list, dir) {
      var a = cur.getBoundingClientRect();
      var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      var best = null, bestScore = Infinity, bestOverlap = false;
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el === cur) continue;
        var b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        var bx = b.left + b.width / 2, by = b.top + b.height / 2;
        var main, side, overlap;
        if (dir === 'right') { if (b.left < a.right - 2 && bx <= ax + 1) continue; main = b.left - a.right; side = Math.abs(by - ay); overlap = b.bottom > a.top && b.top < a.bottom; }
        else if (dir === 'left') { if (b.right > a.left + 2 && bx >= ax - 1) continue; main = a.left - b.right; side = Math.abs(by - ay); overlap = b.bottom > a.top && b.top < a.bottom; }
        else if (dir === 'down') { if (b.top < a.bottom - 2 && by <= ay + 1) continue; main = b.top - a.bottom; side = Math.abs(bx - ax); overlap = b.right > a.left && b.left < a.right; }
        else { if (b.bottom > a.top + 2 && by >= ay - 1) continue; main = a.top - b.bottom; side = Math.abs(bx - ax); overlap = b.right > a.left && b.left < a.right; }
        var score = Math.max(main, 0) + (overlap ? side * 0.1 : side * 2.5 + 200);
        if (score < bestScore) { bestScore = score; best = el; bestOverlap = overlap; }
      }
      return best ? { el: best, overlap: bestOverlap } : null;
    },
    move: function (dir) {
      var cur = document.activeElement;
      // Schnellweg für große Listen und Raster: zuerst nur die Nachbarn in derselben Liste prüfen
      var par = cur && cur.parentNode;
      if (par && par.children && par.children.length > 60 && !Dialog.open) {
        var sib = Array.prototype.slice.call(par.children), idx = sib.indexOf(cur);
        var local = sib.slice(Math.max(0, idx - 40), idx + 41).filter(function (el) { return el.classList && el.classList.contains('f') && !el.disabled; });
        var near = this.pick(cur, local, dir);
        if (near && near.overlap) { this.focus(near.el); return true; }
      }
      var list = this.candidates();
      if (!cur || list.indexOf(cur) < 0) { if (list[0]) this.focus(list[0]); return; }
      // Links/Rechts im Inhalt springt nie in die Menüleiste oben (dorthin nur mit Hoch)
      if ((dir === 'left' || dir === 'right') && cur.closest && !cur.closest('.topnav')) {
        list = list.filter(function (el) { return !(el.closest && el.closest('.topnav')); });
      }
      // Filme/Serien: von den Kategorien links geht es mit Rechts direkt zu den Covern (nicht hoch zur Top 10)
      if (dir === 'right' && cur.closest && cur.closest('.mv-side')) {
        var inMain = list.filter(function (el) { return el.closest && el.closest('.mv-main'); });
        if (inMain.length) {
          var vis = inMain.filter(function (el) { var r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; });
          var first = (vis.length ? vis : inMain)[0];
          this.focus(first);
          return true;
        }
      }
      var hit = this.pick(cur, list, dir);
      if (hit) this.focus(hit.el);
      return !!hit;
    }
  };

  function scrollParent(el) {
    var p = el.parentElement;
    while (p && p !== document.body) {
      var cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) return p;
      p = p.parentElement;
    }
    return null;
  }
  function ensureVisible(el) {
    var p = scrollParent(el);
    while (p) {
      var r = el.getBoundingClientRect(), pr = p.getBoundingClientRect(), pad = 24;
      // feststehende Leiste oben (z. B. Genre-Leiste) nicht über das gewählte Element legen
      var sticky = p._stickyTop && !(el.closest && el.closest('.chipbar-wrap')) ? p._stickyTop() : 0;
      var top = pad + sticky;
      if (r.top < pr.top + top) p.scrollTop -= (pr.top + top - r.top);
      else if (r.bottom > pr.bottom - pad) p.scrollTop += (r.bottom - pr.bottom + pad);
      if (r.left < pr.left + pad) p.scrollLeft -= (pr.left + pad - r.left);
      else if (r.right > pr.right - pad) p.scrollLeft += (r.right - pr.right + pad);
      p = scrollParent(p);
    }
  }

  /* ==========================================================
     Bildschirme (Stapel: Start → Detail → Player …)
     ========================================================== */
  var Screens = {
    stack: [],
    top: function () { return this.stack[this.stack.length - 1]; },
    push: function (name, el, opts) {
      opts = opts || {};
      var cur = this.top();
      if (cur) { cur.lastFocus = document.activeElement; if (!opts.overlay) cur.el.classList.add('is-off'); }
      el.classList.add('screen');
      $('#screens').appendChild(el);
      var s = { name: name, el: el, onLeave: opts.onLeave, onBack: opts.onBack, onShow: opts.onShow, overlay: !!opts.overlay };
      this.stack.push(s);
      this.mark();
      setTimeout(function () { Nav.focusFirst(el); }, 20);
      return s;
    },
    pop: function () {
      var s = this.stack.pop();
      if (!s) return;
      if (s.onLeave) s.onLeave();
      if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
      var prev = this.top();
      this.mark();
      if (prev) {
        prev.el.classList.remove('is-off');
        if (prev.onShow && !s.overlay) prev.onShow();
        var f = prev.lastFocus;
        setTimeout(function () { if (f && document.body.contains(f)) Nav.focus(f); else Nav.focusFirst(prev.el); }, 20);
      }
    },
    /* Merkt sich, ob gerade ein Pop-up offen ist (damit der Mini-Player Platz bekommt) */
    mark: function () {
      var t = this.top();
      document.body.classList.toggle('modal-open', !!(t && t.overlay));
    },
    reset: function (name, el, opts) {
      if (Player.mini) Player.close();
      while (this.stack.length) {
        var s = this.stack.pop();
        if (s.onLeave) s.onLeave();
        if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
      }
      return this.push(name, el, opts);
    }
  };

  function goBack() {
    if (Dialog.open) { Dialog.close(); return; }
    var top = Screens.top();
    if (top && top.onBack && top.onBack() === true) return;
    if (Screens.stack.length > 1) { Screens.pop(); return; }
    askExit();
  }
  function askExit() {
    confirmBox(T('App beenden?'), null, T('Beenden'), exitApp);
  }
  function exitApp() {
    try {
      if (Platform.tizen && window.tizen) { tizen.application.getCurrentApplication().exit(); return; }
      if (Platform.webos) { if (window.webOS && webOS.platformBack) webOS.platformBack(); else window.close(); return; }
      if (Platform.capacitor && window.Capacitor.Plugins.App) { window.Capacitor.Plugins.App.exitApp(); return; }
    } catch (e) { /* weiter */ }
    window.close();
  }

  /* ==========================================================
     Gemeinsame Bausteine
     ========================================================== */
  function loader() { return h('div', { class: 'state' }, h('div', { class: 'spinner' })); }
  function stateBox(title, text, btnLabel, onBtn) {
    return h('div', { class: 'state' }, h('h3', { text: title }), text ? h('p', { text: text }) : null,
      btnLabel ? h('button', { class: 'btn f primary', onclick: onBtn }, btnLabel) : null);
  }
  function img(src, cls, onFail) {
    if (!src) return null;
    // erst „lazy“ setzen, dann die Adresse – sonst laden manche Browser sofort alle Bilder
    var i = h('img', { class: cls || '', loading: 'lazy', decoding: 'async', alt: '' });
    // ohne Herkunftsangabe laden: viele Logo-Server sperren fremde Apps/Webseiten („Hotlink-Schutz“)
    i.setAttribute('referrerpolicy', 'no-referrer');
    try { i.referrerPolicy = 'no-referrer'; } catch (e) {}
    i.src = src;
    i.onerror = function () { if (onFail) onFail(i); else i.style.display = 'none'; };
    return i;
  }

  /* Senderlogo: die Initialen liegen immer darunter und verschwinden erst, wenn das Logo wirklich geladen ist.
     So bleibt kein Feld leer – auch nicht bei langsamen Logo-Servern oder leeren Platzhalter-Bildern des Anbieters. */
  function fillLogo(box, item) {
    box.appendChild(h('span', { class: 'ph', text: initials(item.name) }));
    if (!item.logo) return box;
    var i = img(item.logo, '', function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
    i.onload = function () {
      if (i.naturalWidth > 2 && i.naturalHeight > 2) box.classList.add('has-logo');
      else if (i.parentNode) i.parentNode.removeChild(i);   // 1×1-Pixel = kein echtes Logo
    };
    box.appendChild(i);
    return box;
  }
  function logoBox(item) { return fillLogo(h('span', { class: 'logo-box' }), item); }

  function posterArt(item, extra) {
    var art = h('span', { class: 'art' });
    // Titelbild liegt über dem Platzhalter: lädt es langsam oder gar nicht, sieht man den Titel
    art.appendChild(h('span', { class: 'ph', style: 'background:' + gradientFor(item.name), text: item.name }));
    if (item.logo) art.appendChild(img(item.logo, '', function (i) { if (i.parentNode) i.parentNode.removeChild(i); }));
    if (extra) add(art, extra);
    return art;
  }

  /* Programmdaten (EPG) pro Sender, kurz zwischengespeichert */
  var EpgCache = {
    data: {},
    get: function (item) {
      var k = pid() + ':' + item.id, c = this.data[k];
      if (c && Date.now() - c.at < 180000) return c.pr;
      c = { at: Date.now(), list: null };
      c.pr = App.provider.epg(item, 6).then(function (l) { c.list = l || []; return c.list; }, function () { c.list = []; return c.list; });
      this.data[k] = c;
      var keys = Object.keys(this.data);
      if (keys.length > 300) { var d = this.data; keys.sort(function (a, b) { return d[a].at - d[b].at; }).slice(0, keys.length - 250).forEach(function (x) { delete d[x]; }); }
      return c.pr;
    },
    now: function (item) {
      var c = this.data[pid() + ':' + item.id];
      if (!c || !c.list) return null;
      var t = Date.now() / 1000;
      return c.list.filter(function (e) { return e.start <= t && e.end > t; })[0] || null;
    }
  };

  /* Sender als Zeile (Senderliste) */
  function channelRow(item, onClick, onFocus) {
    var cur = EpgCache.now(item) || (App.provider && App.provider.epgNow ? App.provider.epgNow(item) : null);
    var playing = Player.item && Player.item.kind === 'live' && String(Player.item.id) === String(item.id);
    var row = h('button', { class: 'chan f' + (playing ? ' is-playing' : ''), 'data-cid': item.id, onclick: onClick },
      h('span', { class: 'num', text: item.num ? String(item.num) : '' }),
      logoBox(item),
      h('span', { class: 'ch-txt' }, h('span', { class: 'name', text: item.name }), h('span', { class: 'now', text: cur ? cur.title : '' })),
      item.archive ? h('span', { class: 'arch', title: T('Verpasste Sendungen verfügbar') }, icon('archive')) : null,
      Favs.has(item) ? h('span', { class: 'fav', title: T('Favorit') }, icon('heartFill')) : null);
    if (onFocus) {
      row.addEventListener('focus', function () { onFocus(item); });
      row.addEventListener('mouseenter', function () { onFocus(item); });
    }
    row._item = item;
    return row;
  }
  /* Programmführer (M3U) ist fertig geladen: bereits sichtbare Senderzeilen mit „läuft gerade“ füllen */
  function epgReady() {
    if (!App.provider || !App.provider.epgNow) return;
    $all('.chan[data-cid]').forEach(function (r) {
      var n = $('.now', r);
      if (!n || n.textContent || !r._item) return;
      var c = App.provider.epgNow(r._item);
      if (c) n.textContent = c.title;
    });
  }

  /* Laufenden Sender in allen sichtbaren Senderlisten markieren */
  function markPlaying(item) {
    var id = item && item.kind === 'live' ? String(item.id) : null;
    $all('.chan[data-cid]').forEach(function (r) { r.classList.toggle('is-playing', r.getAttribute('data-cid') === id); });
  }

  /* Sender als Kachel (Startseite, Favoriten, Suche) */
  function chanTile(item, onClick) {
    var box = fillLogo(h('span', { class: 'ct-logo' }), item);
    box.appendChild(h('span', { class: 'ct-live', text: 'LIVE' }));
    return h('button', { class: 'chan-tile f', title: item.name, onclick: onClick }, box, h('span', { class: 'ct-name', text: item.name }));
  }

  /* Film- oder Serien-Cover */
  function posterCard(item, onClick, opts) {
    opts = opts || {};
    var prog = opts.progress ? h('span', { class: 'prog' }, h('i', { style: 'width:' + Math.round(opts.progress * 100) + '%' })) : null;
    if (opts.badge) prog = [prog, h('span', { class: 'badge', text: opts.badge })];
    if (opts.seen) prog = [prog, h('span', { class: 'seen-mark', title: T('Gesehen') }, icon('check'))];
    var r = Number(item.rating), yr = item.year ? String(item.year).slice(0, 4) : '';
    var sub = (r > 0 || yr) ? h('span', { class: 'sub' },
      r > 0 ? h('span', { class: 'rate', text: '★ ' + r.toFixed(1) }) : null,
      yr || null) : null;
    return h('button', { class: 'poster f', title: item.name, onclick: onClick },
      posterArt(item, prog),
      h('span', { class: 'title', text: opts.title || item.name }),
      sub);
  }

  /* Breite Karte für "Weiterschauen" */
  function fmtLeft(sec) {
    var m = Math.max(1, Math.round(sec / 60));
    return m >= 60 ? T('{0} Std. {1} Min.', Math.floor(m / 60), m % 60) : T('{0} Min.', m);
  }
  function continueCard(r) {
    var it = r.item, ep = it.kind === 'episode';
    var title = ep ? (it.seriesName || it.name) : it.name;
    var sub = ep ? 'S' + it.season + ' E' + it.num : T('Noch {0}', fmtLeft(r.d - r.t));
    var src = it.backdrop || it.logo;
    var pic = src ? h('span', { class: 'cw-img' }, img(src, '', function (i) { var b = i.parentNode; if (b && b.parentNode) b.parentNode.removeChild(b); })) : null;
    return h('button', { class: 'cw f k-' + (ep || it.kind === 'series' ? 'series' : it.kind === 'live' ? 'live' : 'movie') + (it.backdrop ? '' : ' is-poster'), 'data-key': (ep ? 'series:' + it.seriesId : it.kind + ':' + it.id), title: title, onclick: function () { playItem(it, { list: [it], index: 0 }); } },
      pic,
      h('span', { class: 'cw-txt' },
        h('span', { class: 'cw-title', text: title }),
        h('span', { class: 'cw-sub', text: sub }),
        h('span', { class: 'cw-bar' }, h('i', { style: 'width:' + Math.max(2, Math.round(r.t / r.d * 100)) + '%' }))));
  }

  /* Lange Listen werden stückweise gezeichnet, damit auch 10.000 Sender flüssig laufen */
  function renderChunked(container, scroller, items, makeEl) {
    var done = 0;
    function more() {
      if (done >= items.length) return;
      var end = Math.min(items.length, done + CONFIG.pageSize);
      var frag = document.createDocumentFragment();
      for (var i = done; i < end; i++) { var el = makeEl(items[i], i); el.setAttribute('data-idx', i); frag.appendChild(el); }
      container.appendChild(frag);
      done = end;
    }
    more();
    container.addEventListener('focusin', function (e) {
      var idx = Number(e.target.getAttribute('data-idx'));
      if (idx >= done - 18) more();
    });
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      setTimeout(function () {
        ticking = false;
        if (scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 900) more();
      }, 80);
    }
    scroller.addEventListener('scroll', onScroll);
    return {
      upTo: function (idx) { while (done <= idx && done < items.length) more(); },
      dispose: function () { scroller.removeEventListener('scroll', onScroll); }
    };
  }

  /* Waagerechte Reihe mit Überschrift (Startseite, Filme, Serien, Detailseiten) */
  function railEl(title, kids, kind) {
    return h('section', { class: 'rail' + (kind ? ' k-' + kind : '') }, h('h2', null, kind ? icon(kind) : null, h('span', { text: title })), h('div', { class: 'rail-track' }, kids));
  }
  /* Fortschritt pro Serie aus „Weiterschauen“: { serienId: 'S2 E5' } */
  function seriesBadges() {
    var out = {};
    Resume.recent().forEach(function (r) { var it = r.item; if (it.kind === 'episode' && it.seriesId && !out[it.seriesId]) out[it.seriesId] = 'S' + it.season + ' E' + it.num; });
    return out;
  }
  /* Top 10 (wie bei Streaming-Diensten): große Platzziffer neben dem Cover */
  function top10Card(it, n) {
    return h('button', { class: 't10 f', title: it.name, 'aria-label': n + '. ' + it.name, onclick: function () { openItem(it); } },
      h('span', { class: 't10-n' + (n > 9 ? ' is-wide' : ''), text: String(n) }), posterArt(it));
  }
  /* Gleicher Titel in mehreren Qualitäten (4K, HD …) zählt nur einmal */
  function titleKey(s) { return norm(s).replace(/\b(4k|uhd|fhd|hd|sd|hevc|h265|multi|dual|dublaj|altyazili)\b/g, '').replace(/[^a-z0-9]/g, ''); }
  /* Die 10 bestbewerteten Titel – bevorzugt unter den neuesten, damit die Liste aktuell bleibt.
     Echte Abrufzahlen liefern IPTV-Anbieter nicht; Bewertungen von 9,8 und mehr sind meist Platzhalter und zählen nicht. */
  function topTen(list, newestFirst) {
    function best(pool) {
      var seen = {};
      return pool.filter(function (x) { var r = Number(x.rating); return r > 0 && r < 9.8; })
        .sort(function (a, b) { return Number(b.rating) - Number(a.rating) || Number(b.added || 0) - Number(a.added || 0); })
        .filter(function (x) { var k = titleKey(x.name); if (!k || seen[k]) return false; seen[k] = 1; return true; })
        .slice(0, 10);
    }
    var top = newestFirst ? best(list.slice(0, 400)) : [];
    return top.length >= 10 ? top : best(list);
  }

  function mediaCard(it, badges) {
    var r = it.kind === 'movie' ? Resume.get(it) : null;
    return posterCard(it, function () { openItem(it); }, {
      progress: r ? r.t / r.d : 0,
      badge: badges && badges[it.id] ? badges[it.id] : null,
      seen: it.kind === 'movie' && !r && Seen.has(it)
    });
  }

  /* Großes Titelbild oben (wie bei Streaming-Diensten): Hintergrundbild, Titel, Infos und Knöpfe */
  function featureHero(item, opts) {
    opts = opts || {};
    var isSeries = item.kind === 'series';
    var bg = h('div', { class: 'fh-bg' });
    var meta = h('div', { class: 'fh-meta' });
    var plot = h('p', { class: 'fh-plot', text: item.plot || '' });
    var actions = h('div', { class: 'row fh-actions' });
    var el = h('section', { class: 'fhero k-' + (isSeries ? 'series' : 'movie') }, bg, h('div', { class: 'fh-shade' }),
      h('div', { class: 'fh-in' },
        opts.top || null,
        opts.kicker ? h('span', { class: 'fh-kicker' }, icon(isSeries ? 'series' : 'movie'), h('span', { text: opts.kicker })) : null,
        h('h1', { class: 'fh-title', text: item.name }), meta, plot, actions, opts.bottom || null));
    var shownBg = '', wantBg = '';
    function setBg(url, blur) {
      if (!url || url === shownBg) return;
      wantBg = url;
      var im = new Image();
      im.onload = function () {
        if (wantBg !== url) return;      // ein besseres Bild (Hintergrundbild statt Cover) wurde inzwischen angefordert
        shownBg = url;
        bg.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
        bg.classList.toggle('is-blur', !!blur);
        bg.classList.add('is-in');
      };
      im.src = url;
    }
    function paintActions() {
      clear(actions);
      if (isSeries) {
        actions.appendChild(h('button', { class: 'btn f primary', onclick: function () { showSeries(item); } }, icon('play'), h('span', { text: T('Ansehen') })));
      } else {
        var r = Resume.get(item);
        actions.appendChild(h('button', { class: 'btn f primary', onclick: function () { playItem(item, { list: [item], index: 0 }); } }, icon('play'), h('span', { text: r ? T('Weiter bei {0}', fmtTime(r.t)) : T('Abspielen') })));
        actions.appendChild(h('button', { class: 'btn f ghost', onclick: function () { showMovie(item); } }, icon('info'), h('span', { text: T('Details') })));
      }
      actions.appendChild(favButton(item));
    }
    paintActions();
    if (item.rating || item.year) meta.appendChild(metaLine(item));
    if (item.backdrop) setBg(item.backdrop); else setBg(item.logo, true);
    (isSeries ? App.provider.seriesInfo(item) : App.provider.movieInfo(item)).then(function (d) {
      if (!d || !el.parentNode) return;
      clear(meta).appendChild(metaLine(d.rating || d.year || d.genre ? d : item));
      if (d.plot) plot.textContent = d.plot;
      if (d.ext && !isSeries) item.ext = d.ext;
      if (d.backdrop) { item.backdrop = d.backdrop; setBg(d.backdrop); }
    }).catch(function () {});
    el._refresh = paintActions;
    return el;
  }

  /* ==========================================================
     Filme & Serien: eigene Oberfläche
     Großes Titelbild, darunter eine Leiste (Sprache → Genre, jeweils mit Anzahl) und große Cover.
     Serien zeigen zusätzlich „Weiterschauen“ und den Stand pro Serie („S2 E5“).
     ========================================================== */
  function MediaView(kind) {
    var key = pid() + kind, isSeries = kind === 'series';
    var allCat = { id: '__all', name: isSeries ? T('Alle Serien') : T('Alle Filme') };
    // Oben: Top 10 über die ganze Breite. Darunter links die Kategorien, rechts die Cover.
    var topSlot = h('div', { class: 'mv-top' });
    var side = h('div', { class: 'mv-cats' });
    var title = h('h2', { class: 'mv-title' }), count = h('span', { class: 'count' });
    var resumeSlot = h('div', { class: 'mv-resume' });
    var grid = h('div', { class: 'poster-grid mv-grid' });
    var el = h('div', { class: 'page media mv2 media-' + kind + ' k-' + kind },
      topSlot,
      h('div', { class: 'mv-body' }, h('aside', { class: 'mv-side' }, side), h('div', { class: 'mv-main' }, resumeSlot, h('div', { class: 'mv-head' }, title, count), grid)));
    var flat = [], groups = null, curGroup = null, activeId = null, counts = null, req = 0, chunker = null;

    function grpCat(g) { return { id: '__grp:' + g.key, name: T('Alle'), group: g }; }
    function inGroup(g, id) { if (id === '__grp:' + g.key) return grpCat(g); for (var i = 0; i < g.cats.length; i++) if (g.cats[i].id === id) return g.cats[i]; return null; }
    function row(c, label) {
      var real = String(c.id || '').charAt(0) !== '_';
      var b = h('button', { class: 'cat f has-n', title: c.full || label, onclick: function () { selectCat(c, true); } },
        real && Parental.isLocked(kind, c) ? h('span', { class: 'cat-ic cat-ic-lock' }, icon('lock')) : real ? catIcon(c.full || c.name) : null,
        h('span', { class: 'cat-name', text: label }), h('span', { class: 'lc-n' }));
      b._cat = c;
      return b;
    }
    function paintSide() {
      clear(side);
      if (groups && !curGroup) {
        side.appendChild(row(allCat, allCat.name));
        groups.forEach(function (g) {
          var b = h('button', { class: 'cat lang-cat f', title: g.name, onclick: function () { openGroup(g); } },
            langBadge(g), h('span', { class: 'lc-name', text: g.name }), h('span', { class: 'lc-n' }), icon('next'));
          b._group = g;
          side.appendChild(b);
        });
      } else if (groups && curGroup) {
        side.appendChild(h('button', { class: 'cat cat-back f', title: T('Zurück zu den Sprachen'), onclick: function () { showLanguages(curGroup); } },
          icon('back'), langBadge(curGroup), h('span', { class: 'lc-name', text: curGroup.name })));
        side.appendChild(row(grpCat(curGroup), T('Alle')));
        curGroup.cats.forEach(function (c) { side.appendChild(row(c, c.name)); });
      } else {
        side.appendChild(row(allCat, allCat.name));
        flat.forEach(function (c) { side.appendChild(row(c, c.name)); });
      }
      markActive(); paintCounts();
    }
    function markActive() {
      $all('.cat', side).forEach(function (b) {
        if (b._cat) b.classList.toggle('is-on', b._cat.id === activeId);
        else if (b._group) b.classList.toggle('is-on', !!inGroup(b._group, activeId));
      });
    }
    function paintCounts() {
      if (!counts) return;
      $all('.cat', side).forEach(function (b) {
        var slot = $('.lc-n', b), n = null, g = b._group || (b._cat && b._cat.group);
        if (!slot) return;
        if (g) { n = 0; g.cats.forEach(function (c) { n += counts.by[c.id] || 0; }); }
        else if (b._cat) n = b._cat.id === '__all' ? counts.total : (counts.by[b._cat.id] || 0);
        if (n !== null) slot.textContent = fmtCount(n);
      });
    }
    function openGroup(g) {
      curGroup = g; lastGroup[key] = g.key;
      paintSide();
      selectCat(grpCat(g));
      side.scrollTop = 0;
      Nav.focus($('.cat.is-on', side) || side.children[1]);
    }
    function showLanguages(g) {
      curGroup = null; lastGroup[key] = null;
      paintSide();
      var b = null;
      $all('.lang-cat', side).forEach(function (x) { if (x._group === g) b = x; });
      Nav.focus(b || side.firstChild);
    }
    Shell.viewBack = function () {
      if (curGroup && document.body.contains(el)) { showLanguages(curGroup); return true; }
      return false;
    };

    function itemsFor(cat) {
      if (cat.group) {
        return visibleItems(kind, App.provider.items(kind, '__all')).then(function (all) {
          var ids = {};
          cat.group.cats.forEach(function (c) { ids[c.id] = 1; });
          var out = all.filter(function (x) { return ids[x.catId]; });
          return some(out, function (x) { return Number(x.added) > 0; }) ? out.sort(byAdded) : out;
        });
      }
      return (cat.id === '__all' ? visibleItems(kind, App.provider.items(kind, cat.id)) : App.provider.items(kind, cat.id)).then(function (list) {
        return cat.id === '__all' && some(list, function (x) { return Number(x.added) > 0; }) ? list.slice().sort(byAdded) : list;
      });
    }
    function paintResume() {
      clear(resumeSlot);
      if (activeId !== '__all' && activeId.indexOf('__grp:') !== 0) return;
      var mine = Resume.recent().filter(function (r) { return isSeries ? r.item.kind === 'episode' : r.item.kind === 'movie'; }).slice(0, 12);
      if (mine.length) resumeSlot.appendChild(railEl(T('Weiterschauen'), mine.map(continueCard), kind));
    }
    // Top 10 immer aus allen Titeln – so bleibt der obere Bereich gleich, egal welche Kategorie gewählt ist
    function paintTop() {
      visibleItems(kind, App.provider.items(kind, '__all')).then(function (list) {
        if (!document.body.contains(el)) return;
        clear(topSlot);
        var top = topTen(list, some(list, function (x) { return Number(x.added) > 0; }));
        if (top.length < 5) return;
        var sec = railEl(isSeries ? T('Top 10 Serien') : T('Top 10 Filme'), top.map(function (it, i) { return top10Card(it, i + 1); }), kind);
        sec.classList.add('rail-top');
        $('h2', sec).appendChild(h('span', { class: 'rail-note', text: T('nach Bewertung') }));
        topSlot.appendChild(sec);
      }).catch(function () {});
    }
    function selectCat(cat, byUser) {
      if (!cat.group && cat.id !== '__all' && Parental.blocked(kind, cat)) {
        if (byUser) { Parental.ask(function () { selectCat(cat, true); }); return; }
        cat = allCat;
      }
      lastCat[key] = cat.id; activeId = cat.id;
      markActive();
      var my = ++req;
      if (chunker) { chunker.dispose(); chunker = null; }
      clear(grid).appendChild(loader());
      title.textContent = cat.group ? T('Alle in {0}', cat.group.name) : cat.name;
      count.textContent = '';
      paintResume();
      itemsFor(cat).then(function (list) {
        if (my !== req) return;
        clear(grid);
        count.textContent = fmtCount(list.length);
        if (!list.length) { grid.appendChild(stateBox(T('Keine Einträge'), T('In dieser Kategorie ist gerade nichts enthalten.'))); return; }
        var badges = isSeries ? seriesBadges() : null;
        var rc = chunker = renderChunked(grid, el, list, function (it) { return mediaCard(it, badges); });
        var pf = Shell.pendingFocus;
        if (pf && pf.kind === kind) {
          Shell.pendingFocus = null;
          for (var k = 0; k < list.length; k++) if (list[k].id === pf.id) {
            rc.upTo(k);
            var target = grid.querySelector('[data-idx="' + k + '"]');
            setTimeout(function () {
              var st = Screens.stack, own = null;
              for (var q = 0; q < st.length; q++) if (st[q].el.contains(grid)) own = st[q];
              if (own && Screens.top() === own) Nav.focus(target); else if (own) own.lastFocus = target;
            }, 60);
            break;
          }
        }
      }, function (e) {
        if (my !== req) return;
        clear(grid).appendChild(stateBox(T('Laden fehlgeschlagen'), e.message, T('Erneut versuchen'), function () { selectCat(cat); }));
      });
    }
    el._dispose = function () { req++; if (chunker) { chunker.dispose(); chunker = null; } clear(grid); clear(topSlot); clear(resumeSlot); };
    // Nach dem Schauen: Fortschritt und „Weiterschauen“ auffrischen, ohne die Liste neu zu laden
    el._refresh = function () {
      var st = Screens.top(), lf = st && st.lastFocus, inResume = lf && resumeSlot.contains(lf), k0 = inResume && lf.getAttribute('data-key');
      paintResume();
      if (inResume && st) st.lastFocus = (k0 && $('[data-key="' + k0 + '"]', resumeSlot)) || $('.f', resumeSlot) || $('.cat.is-on', side);
    };

    App.provider.categories(kind).then(function (list) {
      flat = visibleCats(kind, list || []);
      groups = groupCats(flat);
      var want = lastCat[key], target = null;
      if (groups) {
        var g = null;
        groups.forEach(function (x) { if (!g && want && inGroup(x, want)) g = x; });
        if (!g && lastGroup[key]) groups.forEach(function (x) { if (x.key === lastGroup[key]) g = x; });
        if (g) { curGroup = g; lastGroup[key] = g.key; target = (want && inGroup(g, want)) || grpCat(g); }
      } else if (want) {
        flat.forEach(function (c) { if (c.id === want) target = c; });
      }
      paintSide();
      selectCat(target || allCat);
      paintTop();
      if (document.activeElement === document.body) Nav.focus($('.cat.is-on', side) || side.firstChild);
      catCounts(kind).then(function (c) { counts = c; paintCounts(); Shell.setCount(kind, fmtCount(c.total)); }).catch(function () {});
    }, function (e) {
      clear(grid).appendChild(stateBox(T('Laden fehlgeschlagen'), e.message, T('Erneut versuchen'), function () { Shell.show(kind, true); }));
    });
    return el;
  }

  /* ==========================================================
     Startbildschirm: Profile / Playlists
     ========================================================== */
  /* Statusanzeige der Willkommensseite – nur echte, geprüfte Werte:
     Internet: letzte Antwort des Online-Dienstes (bzw. Gerät meldet offline); Player: Gerät kann Streams abspielen
     (TV-Player, eingebautes HLS oder hls.js mit MediaSource); Playlist: tatsächlich gespeicherte Playlists. */
  var WelcomeStatus = {
    player: null, timer: null,
    el: function () {
      this.box = h('div', { class: 'wl-status', role: 'status', 'aria-live': 'polite' });
      this.paint();
      return this.box;
    },
    net: function () {
      if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return ['off', T('Kein Internet')];
      if (!CONFIG.cloudUrl) return ['ok', T('Internet')];
      if (Cloud.lastOk && (!Cloud.lastFail || Cloud.lastOk > Cloud.lastFail)) return ['ok', T('Internet verbunden')];
      if (Cloud.lastFail) return ['warn', T('Online-Dienst nicht erreichbar')];
      return ['wait', T('Verbindung wird geprüft …')];
    },
    checkPlayer: function () {
      var self = this;
      if (self.player) return;
      var v = document.createElement('video'), hlsNative = false, mse = false;
      try { hlsNative = !!v.canPlayType('application/vnd.apple.mpegurl'); } catch (e) {}
      try { mse = !!(window.MediaSource && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"')); } catch (e) {}
      if (NativePlayer.available() || hlsNative) { self.player = 'ok'; return; }
      if (!mse) { self.player = 'off'; return; }
      self.player = 'wait';
      ensureHls().then(function (Hls) { self.player = Hls && Hls.isSupported() ? 'ok' : 'off'; self.paint(); }, function () { self.player = 'off'; self.paint(); });
    },
    paint: function () {
      if (!this.box) return;
      this.checkPlayer();
      var n = this.net(), pl = Profiles.list().length;
      var items = [
        [n[0], 'wifi', n[1]],
        [this.player, 'player', this.player === 'ok' ? T('Player bereit') : this.player === 'wait' ? T('Player wird geprüft …') : T('Player eingeschränkt')],
        [pl ? 'ok' : 'none', 'playlist', pl ? T('Playlist hinterlegt') : T('Keine Playlist')]
      ];
      clear(this.box);
      var box = this.box;
      items.forEach(function (it) { box.appendChild(h('span', { class: 'wl-chip is-' + it[0] }, h('i', { 'aria-hidden': 'true' }), icon(it[1]), h('span', { text: it[2] }))); });
    },
    start: function (screenEl) {
      var self = this;
      clearInterval(self.timer);
      function tick() { if (!document.body.contains(screenEl)) { clearInterval(self.timer); window.removeEventListener('online', tick); window.removeEventListener('offline', tick); return; } self.paint(); }
      self.timer = setInterval(tick, 3000);
      window.addEventListener('online', tick); window.addEventListener('offline', tick);
    }
  };
  /* Kurze Hilfe auf der Willkommensseite */
  function showWelcomeHelp() {
    var qa = [
      [T('Wo finde ich MAC und KEY?'), T('Hier auf dieser Seite. Später auch unter „Profil“ und unten am Bildschirmrand.')],
      [T('Woher bekomme ich eine Playlist?'), T('Von deinem IPTV-Anbieter: ein M3U-Link oder ein Xtream-Zugang. Telvo enthält selbst keine Sender.')],
      [T('Die Playlist erscheint nicht?'), T('Die App prüft alle 30 Sekunden. Stimmen MAC und KEY auf der Webseite genau? Ist das Gerät online?')],
      [T('Kein Handy zur Hand?'), T('„Playlist hinzufügen“ wählen und die Daten direkt hier eingeben.')]
    ];
    var body = h('div', { class: 'wl-faq' });
    qa.forEach(function (x) { body.appendChild(h('div', { class: 'wl-faq-item' }, h('b', { text: x[0] }), h('p', { text: x[1] }))); });
    body.appendChild(h('p', { class: 'hint wl-faq-more' }, h('span', { text: T('Mehr Hilfe:') + ' ' }), portalLinkBtn()));
    openSheet(T('Hilfe'), 'help', body);
  }
  /* „Auch auf der Webseite verwalten“: an = Playlist liegt online (von der Webseite gesendet oder freigegeben) */
  function onWeb(p) { return !!p.remoteId || p.cloud === true; }
  function toggleWeb(p) {
    var list = Profiles.list(), x = list.filter(function (q) { return q.id === p.id; })[0];
    if (!x) return;
    if (!onWeb(x)) {
      x.cloud = true; Profiles.save(list);
      Cloud.upload();
      toast(T('„{0}“ ist jetzt auf der Webseite verfügbar.', x.name), 3000);
      showProfiles();
      return;
    }
    confirmBox(T('Von der Webseite entfernen?'), T('„{0}“ bleibt auf diesem Gerät, die Online-Kopie samt Zugangsdaten wird gelöscht.', x.name), T('Entfernen'), function () {
      var l2 = Profiles.list(), y = l2.filter(function (q) { return q.id === p.id; })[0];
      if (!y) return;
      if (y.remoteId) { Cloud.markDeleted(y.remoteId); Cloud.flushDeletes(); }
      delete y.remoteId; y.cloud = false; Profiles.save(l2);
      if (App.profile && App.profile.id === y.id) { delete App.profile.remoteId; App.profile.cloud = false; }
      showProfiles();
    });
  }
  function showProfiles() {
    var list = Profiles.list();
    if (!list.length) {
      // Willkommensseite (noch keine Playlist): eigenes Premium-Design, Klassen „wl-…“ in css/style.css.
      // MAC, KEY und QR-Code kommen wie bisher aus Device / qrBox – nichts Festes eingebaut.
      function idTile(label, value, copyLabel) {
        return h('div', { class: 'wl-id' },
          h('span', { class: 'wl-id-label', text: label }),
          h('span', { class: 'wl-id-row' }, h('b', { class: 'wl-id-value', text: value }), copyBtn(value, copyLabel)));
      }
      function step(n, title, sub) {
        return h('li', { class: 'wl-step' }, h('span', { class: 'wl-step-n', text: String(n) }),
          h('span', { class: 'wl-step-t' }, h('b', { text: title }), h('small', { text: sub })));
      }
      var status = WelcomeStatus.el();
      // Handy/Tablet: nicht vorwählen – sonst springt die Seite beim Öffnen nach unten zum Knopf
      var touchOnly = !Platform.tv && !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      // „Aktualisieren“: sofort beim Online-Dienst nachsehen, ob eine Playlist von der Webseite da ist
      // (sonst prüft die App alle 30 Sekunden von selbst). Kommt eine an, öffnet Cloud.apply sie direkt.
      var refreshBtn = CONFIG.cloudUrl ? h('button', { class: 'wl-btn wl-ghost f', onclick: function () {
        if (refreshBtn.classList.contains('is-busy')) return;
        var label = refreshBtn.querySelector('span');
        refreshBtn.classList.add('is-busy'); label.textContent = T('Wird geprüft …');
        var tries = 0;
        function run() {
          // läuft gerade ein automatischer Abgleich: kurz warten statt doppelt fragen
          if (Cloud.busy && tries++ < 20) return new Promise(function (r) { setTimeout(r, 300); }).then(run);
          return Cloud.sync();
        }
        run().then(function (r) {
          refreshBtn.classList.remove('is-busy'); label.textContent = T('Aktualisieren');
          WelcomeStatus.paint();
          if (!r) toast(navigator.onLine === false ? T('Kein Internet') : T('Online-Dienst nicht erreichbar'), 3000);
          else if (!r.added || !r.added.length) toast(T('Noch keine Playlist gefunden.'), 3000);
        });
      } }, icon('refresh'), h('span', { text: T('Aktualisieren') })) : null;
      var host = CONFIG.portalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      var welcome = h('div', { class: 'profiles is-empty wl' },
        h('div', { class: 'wl-top' },
          h('div', { class: 'brand' }, brandMark(), wordmark()),
          status,   // mittig zwischen Logo und Knöpfen
          h('div', { class: 'wl-tools' },
            h('button', { class: 'wl-help f', title: T('Hilfe'), 'aria-label': T('Hilfe'), onclick: showWelcomeHelp }, icon('help')),
            langButton())),
        h('div', { class: 'wl-main' },
          h('div', { class: 'wl-head' },
            h('h1', { class: 'wl-title', text: T('Willkommen bei Telvo.') }),
            h('p', { class: 'wl-sub', text: T('Dein Entertainment. Alles an einem Ort.') })),
          h('div', { class: 'wl-card' },
            h('ol', { class: 'wl-steps', 'aria-label': T('Einrichtung') },
              step(1, T('QR-Code scannen'), T('Mit dem Handy – MAC und KEY sind schon eingetragen.')),
              step(2, T('Playlist eintragen'), T('M3U-Link oder Xtream-Zugang')),
              step(3, T('Loslegen'), T('Erscheint hier automatisch'))),
            // QR-Code in der Mitte – das Wichtigste auf dieser Seite
            h('div', { class: 'wl-qr' },
              h('div', { class: 'wl-qr-frame' }, qrBox(Device.portalLink(), 'wl-qrcode')),
              h('p', { class: 'wl-qr-title', text: T('Mit dem Handy einrichten') }),
              h('button', { class: 'wl-link f', title: T('Webseite öffnen'), onclick: function () { openExternal(Device.portalLink()); } }, icon('globe'), h('span', { text: host }))),
            // rechts: MAC, KEY und die Knöpfe untereinander
            h('div', { class: 'wl-side' },
              idTile(T('MAC-Adresse'), Device.mac(), 'MAC'),
              idTile('KEY', Device.key(), 'KEY'),
              h('div', { class: 'wl-actions' },
                h('button', { class: 'wl-btn wl-primary f', onclick: showAddProfile, 'data-autofocus': touchOnly ? null : true }, icon('plus'), h('span', { text: T('Playlist hinzufügen') })),
                h('button', { class: 'wl-btn wl-ghost f', onclick: startDemo, title: T('Mit freien Test-Videos – ohne Zugang.') }, icon('play'), h('span', { text: T('Demo') })),
                refreshBtn))),
          h('p', { class: 'wl-legal', text: T('Diese App enthält keine Sender oder Inhalte. Du benötigst einen eigenen Zugang von deinem Anbieter.') })));
      WelcomeStatus.start(welcome);
      Screens.reset('profiles', welcome);
      return;
    }
    var grid = h('div', { class: 'profile-grid' });
    list.forEach(function (p) {
      var sub = p.type === 'xtream' ? T('Xtream Codes') : p.type === 'm3u' ? T('M3U-Playlist') : T('Demo');
      grid.appendChild(h('div', { class: 'profile' },
        h('button', { class: 'card f', onclick: function () { activateProfile(p); }, 'data-autofocus': p.id === Store.get('active') ? true : null },
          h('span', { class: 'avatar', style: 'background:' + colorFor(p.name), text: initials(p.name) }),
          h('span', { class: 'label', text: p.name }),
          h('span', { class: 'sub', text: sub })),
        p.type === 'demo' ? null : h('button', {
          class: 'btn small ghost f web-toggle' + (onWeb(p) ? ' is-on' : ''),
          title: T('Auch auf der Webseite verwalten'), onclick: function () { toggleWeb(p); }
        }, icon('globe'), h('span', { text: onWeb(p) ? T('Webseite: an') : T('Webseite: aus') })),
        h('button', {
          class: 'btn small ghost f danger', onclick: function () {
            confirmBox(T('„{0}“ löschen?', p.name), T('Favoriten und Verlauf dieses Profils werden ebenfalls entfernt.'), T('Löschen'), function () { Profiles.remove(p.id); showProfiles(); });
          }
        }, T('Löschen'))));
    });
    grid.appendChild(h('div', { class: 'profile' },
      h('button', { class: 'card add f', onclick: showAddProfile, 'data-autofocus': list.length ? null : true },
        icon('plus'), h('span', { class: 'label', text: T('Playlist hinzufügen') }), h('span', { class: 'sub', text: T('Xtream oder M3U') }))));
    var el = h('div', { class: 'profiles' }, heroArt(),
      h('div', { class: 'profiles-top' }, h('div', { class: 'brand' }, brandMark(), wordmark()), langButton()),
      h('div', { class: 'profiles-in' },
        h('h2', { text: T('Welche Playlist möchtest du öffnen?') }),
        grid,
        remotePanel(),
        h('div', { class: 'profiles-mac' }, macTag())));
    Screens.reset('profiles', el);
  }

  /* Demo-Modus: freie Test-Videos ohne eigenen Zugang – zum Ausprobieren und für die App-Store-Prüfung.
     Die Demo bleibt nur auf dem Gerät (wird nicht online gespeichert). */
  function startDemo() {
    var p = Profiles.list().filter(function (x) { return x.type === 'demo'; })[0] || Profiles.add({ type: 'demo', name: T('Demo') });
    activateProfile(p, true);
  }

  function showAddProfile() {
    var mode = 'xtream';
    var err = h('div', { class: 'error' });
    var fName = inputField(T('Name (frei wählbar)'), T('z. B. Wohnzimmer'), 'text');
    var fServer = inputField(T('Server-Adresse'), 'http://beispiel.de:8080', 'url');
    var fUser = inputField(T('Benutzername'), '', 'text');
    var fPass = inputField(T('Passwort'), '', 'password');
    var fUrl = inputField(T('M3U-Link'), 'http://…/playlist.m3u', 'url');
    var fEpg = inputField(T('EPG-Adresse (optional)'), 'http://…/epg.xml', 'url');
    // Passwort anzeigen/verbergen – Tippfehler sind bei langen Zugangsdaten die häufigste Ursache für „Login falsch“
    var passWrap = h('div', { class: 'pass-wrap' });
    fPass.input.parentNode.replaceChild(passWrap, fPass.input);
    passWrap.appendChild(fPass.input);
    var eye = h('button', { class: 'pass-toggle f', type: 'button', title: T('Passwort anzeigen'), 'aria-label': T('Passwort anzeigen'), onclick: function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var show = fPass.input.type === 'password';
      fPass.input.type = show ? 'text' : 'password';
      clear(eye).appendChild(icon(show ? 'eyeOff' : 'eye'));
      var l = show ? T('Passwort verbergen') : T('Passwort anzeigen');
      eye.title = l; eye.setAttribute('aria-label', l);
    } }, icon('eye'));
    passWrap.appendChild(eye);
    // Enter im letzten Feld = Speichern
    [fPass.input, fUrl.input, fEpg.input].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) { if (e.keyCode === 13 && !saveBtn.disabled) save(); });
    });
    var xBox = h('div', { class: 'form-sub' }, fServer.wrap, fUser.wrap, fPass.wrap,
      h('p', { class: 'hint', text: T('Tipp: Du kannst auch einen kompletten Link (…/get.php?username=…&password=…) in das Feld „Server-Adresse“ einfügen.') }));
    var mBox = h('div', { class: 'form-sub', style: 'display:none' }, fUrl.wrap,
      h('p', { class: 'hint', text: T('Funktioniert mit jeder .m3u oder .m3u8 Playlist-Adresse.') }),
      fEpg.wrap,
      h('p', { class: 'hint', text: T('Für den Programmführer (XMLTV, auch .xml.gz). Nur nötig, wenn deine Playlist keinen mitbringt.') }));
    var tX = h('button', { class: 'btn f is-on', onclick: function () { setMode('xtream'); } }, T('Xtream Codes'));
    var tM = h('button', { class: 'btn f', onclick: function () { setMode('m3u'); } }, T('M3U-Link'));
    function setMode(m) {
      mode = m;
      tX.classList.toggle('is-on', m === 'xtream'); tM.classList.toggle('is-on', m === 'm3u');
      xBox.style.display = m === 'xtream' ? '' : 'none'; mBox.style.display = m === 'm3u' ? '' : 'none';
      err.textContent = '';
    }
    var saveBtn = h('button', { class: 'btn f primary', onclick: save }, T('Speichern & verbinden'));
    // Datenschutz: Zugangsdaten verlassen das Gerät nur, wenn man das ausdrücklich einschaltet (Voreinstellung: aus)
    var toWeb = false;
    var webRow = toggleRow(T('Auch auf der Webseite verwalten'),
      T('Speichert die Zugangsdaten online, damit du die Playlist im Browser bearbeiten kannst. Ohne diese Option bleiben sie nur auf diesem Gerät.'),
      function () { return toWeb; }, function (v) { toWeb = v; });

    function save() {
      err.textContent = '';
      var name = fName.input.value.trim();
      var p;
      if (mode === 'xtream') {
        var link = parseXtreamLink(fServer.input.value);
        p = link ? { type: 'xtream', server: link.server, username: link.username, password: link.password }
          : { type: 'xtream', server: normalizeServer(fServer.input.value), username: fUser.input.value.trim(), password: fPass.input.value };
        if (!p.server || !p.username || !p.password) { err.textContent = T('Bitte Server, Benutzername und Passwort ausfüllen.'); return; }
      } else {
        var u = fUrl.input.value.trim();
        if (!/^https?:\/\//i.test(u)) { err.textContent = T('Bitte einen gültigen Link (http:// oder https://) eingeben.'); return; }
        var xl = parseXtreamLink(u);
        var eu = fEpg.input.value.trim();
        if (eu && !/^https?:\/\//i.test(eu)) { err.textContent = T('Bitte eine gültige EPG-Adresse (http:// oder https://) eingeben oder das Feld leer lassen.'); return; }
        if (xl) { p = { type: 'xtream', server: xl.server, username: xl.username, password: xl.password }; toast(T('Als Xtream-Zugang erkannt – mit Kategorien, Serien und EPG')); }
        else { p = { type: 'm3u', url: u }; if (eu) p.epgUrl = eu; }
      }
      p.name = name || (p.type === 'xtream' ? p.username : T('Meine Playlist'));
      if (toWeb) p.cloud = true;
      saveBtn.disabled = true; saveBtn.textContent = T('Verbinde …');
      makeProvider(p).login().then(function () {
        var saved = Profiles.add(p);
        Cloud.upload();
        activateProfile(saved, true);
      }, function (e) {
        err.textContent = e.message || T('Verbindung fehlgeschlagen.');
        saveBtn.disabled = false; saveBtn.textContent = T('Speichern & verbinden');
      });
    }

    var el = h('div', { class: 'form-wrap' }, heroArt(),
      h('div', { class: 'form form-card' },
        h('h1', { text: T('Playlist hinzufügen') }),
        h('div', null, macTag()),
        h('div', { class: 'tabs' }, tX, tM),
        fName.wrap, xBox, mBox, webRow, err,
        h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn f ghost', onclick: goBack }, T('Abbrechen'))),
        h('p', { class: 'hint', text: T('Diese App enthält keine Sender oder Inhalte. Du benötigst einen eigenen Zugang von deinem Anbieter.') })));
    Screens.push('add', el);
    setTimeout(function () { Nav.focus(tX); }, 30);
  }

  function inputField(label, ph, type) {
    var input = h('input', { class: 'f', type: type, placeholder: ph || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    return { input: input, wrap: h('label', { class: 'field' }, h('span', { text: label }), input) };
  }

  function activateProfile(p, isNew) {
    if (Backup.pendingFor(p)) toast(T('Favoriten und Verlauf aus der Sicherung übernommen'), 3500);
    App.profile = p;
    App.provider = makeProvider(p);
    Store.set('active', p.id);
    if (isNew || p.type === 'demo') { Shell.open(); Expiry.check(); return; }
    // Kurz prüfen, ob der Zugang noch funktioniert – die Startseite erscheint trotzdem sofort
    App.provider.login().catch(function (e) { toast(T('Hinweis: {0}', e.message), 4000); });
    Shell.open();
    Expiry.check();
  }

  /* ==========================================================
     Hauptansicht mit Seitenleiste
     ========================================================== */
  var Shell = {
    el: null, view: null, current: null, buttons: {}, pendingFocus: null,
    open: function () {
      var self = this;
      self.buttons = {}; self.current = null;
      self.view = h('div', { class: 'view' });
      var tabs = h('nav', { class: 'main-tabs', 'aria-label': T('Hauptmenü') });
      var homeBtn = null;
      [['home', T('Start'), 'home'], ['live', T('Live TV'), 'live'], ['movie', T('Filme'), 'movie'], ['series', T('Serien'), 'series']].forEach(function (it) {
        var b = h('button', { class: 'tab f k-' + it[0] + (it[0] === 'home' ? ' tab-home' : ''), title: it[1], 'aria-label': it[1], onclick: function () { self.show(it[0], true); } },
          icon(it[2]), h('span', { class: 'tab-label', text: it[1] }), it[0] === 'home' ? null : h('span', { class: 'tab-n' }));
        self.buttons[it[0]] = b;
        if (it[0] === 'home') homeBtn = b; else tabs.appendChild(b);
      });
      // Die drei Reiter reagieren sichtbar aufeinander: der Nachbar des gerade gewählten hebt sich leicht mit
      tabs.addEventListener('focusin', function (e) { self.hint(e.target && e.target._tabKey); });
      tabs.addEventListener('focusout', function (e) {
        if (!e.relatedTarget || !tabs.contains(e.relatedTarget)) self.hint(null);
      });
      tabs.addEventListener('mouseleave', function () { if (!tabs.contains(document.activeElement)) self.hint(null); });
      ['live', 'movie', 'series'].forEach(function (k) {
        self.buttons[k]._tabKey = k;
        self.buttons[k].addEventListener('mouseenter', function () { self.hint(k); });
      });
      var reloadTop = h('button', { class: 'icon-btn f', title: T('Playlist aktualisieren'), 'aria-label': T('Playlist aktualisieren'), onclick: reloadWithSplash }, icon('refresh'));
      function tool(name, label, ic) {
        var b = h('button', { class: 'icon-btn f', title: label, 'aria-label': label, onclick: function () { self.show(name, true); } }, icon(ic || name));
        self.buttons[name] = b;
        return b;
      }
      var searchBtn = h('button', { class: 'icon-btn f', title: T('Suche'), 'aria-label': T('Suche'), onclick: function () { QuickSearch.toggle(); } }, icon('search'));
      var head = h('header', { class: 'topnav' },
        h('div', { class: 'nav-left' }, h('div', { class: 'brand brand-sm' }, brandMark(), h('span', { class: 'wordmark' }, h('b', { text: 'Telvo' }))), homeBtn),
        tabs,
        h('div', { class: 'top-tools' }, searchBtn, reloadTop, tool('favs', T('Favoriten'), 'heart'), tool('settings', T('Einstellungen')), tool('profile', T('Profil'))));
      var runTime = h('div', { class: 'mac-tag sb-days' });
      App.provider.account().then(function (a) {
        if (!a || a.expires === undefined) return;
        var d = a.expires ? Math.ceil((Number(a.expires) * 1000 - Date.now()) / 86400000) : null;
        var txt = d === null ? T('unbegrenzt') : d <= 0 ? T('abgelaufen') : d === 1 ? T('1 Tag') : T('{0} Tage', d);
        runTime.appendChild(h('span', { text: T('Laufzeit') }));
        runTime.appendChild(h('b', { text: txt }));
        if (d !== null && d <= 30) runTime.classList.add(d <= 0 ? 'is-expired' : 'is-warn');
      }).catch(function () {});
      self.el = h('div', { class: 'shell' }, head, h('main', { class: 'content' }, self.view), h('footer', { class: 'statusbar' }, macTag(profileUser(App.profile), true), runTime, h('span', { class: 'sb-clock' })));
      QuickSearch.build(self.el, searchBtn);
      Screens.reset('shell', self.el, {
        // Beim Verlassen (Playlist-Wechsel, Zurücksetzen) die offene Ansicht aufräumen –
        // sonst laufen z. B. die Timer des Startbildschirms für die alte Playlist weiter.
        onLeave: function () {
          var v = self.view && self.view.firstChild;
          if (v && v._dispose) { try { v._dispose(); } catch (e) {} }
          if (QuickSearch.isOpen) { try { QuickSearch.close(true); } catch (e) {} }
        },
        onBack: function () {
          if (QuickSearch.isOpen) { QuickSearch.close(); return true; }
          if (self.viewBack && self.viewBack() === true) return true;
          if (self.current !== 'home') { self.show('home', true); return true; }
          return false;
        },
        onShow: function () {
          var v = self.view.firstChild;
          if (v && v._refresh) v._refresh();
          else if (self.current === 'home') self.show('home', false, true);
        }
      });
      // Die App startet immer auf dem Startbildschirm (Zugang + Live TV / Filme / Serien)
      self.show('home');
    },
    show: function (name, focusContent, keepFocus) {
      var self = this, prev = self.current;
      self.current = name;
      // Mini-Player beenden, wenn man zu Filmen, Serien oder zum Startbildschirm wechselt
      if ((name === 'movie' || name === 'series' || name === 'home') && Player.mini) Player.close();
      if (QuickSearch.isOpen) QuickSearch.close(true);
      // Startbildschirm ohne Menüleiste – er ist selbst das Menü
      self.el.classList.toggle('is-launcher', name === 'home');
      Object.keys(self.buttons).forEach(function (k) {
        self.buttons[k].classList.toggle('is-on', k === name);
        if (k !== name) self.setCount(k, '');
      });
      self.hint(null);
      self.viewBack = null;
      // alte Ansicht aufräumen (lange Listen sofort freigeben – wichtig für Boxen mit wenig Speicher)
      var old = self.view.firstChild;
      if (old && old._dispose) { try { old._dispose(); } catch (e) {} }
      clear(self.view);
      var view;
      if (name === 'movie' || name === 'series') NewMark.mark(name);
      if (name === 'home') view = LauncherView(prev);
      else if (name === 'settings') view = SettingsView();
      else if (name === 'profile') view = ProfileView();
      else if (name === 'favs') view = FavoritesView();
      else if (name === 'movie' || name === 'series') view = MediaView(name);
      else view = SectionView(name);
      if (!keepFocus) view.classList.add('view-in');
      self.view.appendChild(view);
      if (keepFocus) return;
      setTimeout(function () {
        if (focusContent || !document.activeElement || document.activeElement === document.body) Nav.focusFirst(self.view);
      }, 30);
    },
    /* Anzahl direkt am Reiter statt einer eigenen Überschrift auf der Seite */
    setCount: function (name, txt) {
      var b = this.buttons[name];
      if (!b) return;
      var n = $('.tab-n', b);
      if (n) n.textContent = txt || '';
    },
    /* Nachbar-Reiter hebt sich leicht mit, damit man beim Wandern nach links/rechts sieht, wo man ist */
    hint: function (key) {
      var self = this, order = ['live', 'movie', 'series'], i = key ? order.indexOf(key) : -1;
      order.forEach(function (k, j) {
        var b = self.buttons[k];
        if (!b) return;
        b.classList.toggle('is-near', i >= 0 && Math.abs(i - j) === 1);
        b.classList.toggle('is-hint', i === j);
      });
    }
  };

  var INPUT = { mode: 'key' };

  /* ---------- Gemeinsame Listen (Start, Suche, Empfehlungen) ---------- */
  var searchCache = {};
  /* Alle Einträge einer Art (für die Suche) */
  function allItems(kind) {
    var k = pid() + kind;
    if (!searchCache[k]) { searchCache[k] = visibleItems(kind, App.provider.items(kind, '__all')); searchCache[k].catch(function () { delete searchCache[k]; }); }
    return searchCache[k];
  }
  function byAdded(a, b) { return Number(b.added || 0) - Number(a.added || 0); }
  function byRating(a, b) { return Number(b.rating || 0) - Number(a.rating || 0); }
  function some(list, fn) { for (var i = 0; i < list.length; i++) if (fn(list[i])) return true; return false; }

  /* ---------- Startbildschirm ----------
     Oben Suche, Aktualisieren, Einstellungen. Darunter Live TV / Filme / Serien mit Anzahl und Stand,
     rechts Favoriten und die aktive Playlist mit Laufzeit, unten kompakt „Zuletzt geschaut“. */
  function LauncherView(focusKind) {
    var p = App.profile, busy = false;
    // Kindersicherung: entsperrte Kategorien sind wieder zu, sobald man zum Startbildschirm zurückkommt
    if (Parental.unlocked) { Parental.unlocked = false; searchCache = {}; }
    var want = focusKind === 'movie' || focusKind === 'series' || focusKind === 'favs' || focusKind === 'profile' || focusKind === 'settings' ? focusKind : 'live';

    // Kopfzeile
    var searchBtn = h('button', { class: 'ln-search f', 'data-key': 'ln:search', onclick: function () { QuickSearch.toggle(searchBtn); } },
      icon('search'), h('span', { text: T('Suche') }));
    var reloadBtn = h('button', { class: 'ln-round f', 'data-key': 'ln:reload', title: T('Playlist aktualisieren'), 'aria-label': T('Playlist aktualisieren'), onclick: reloadWithSplash }, icon('refresh'));
    var setBtn = h('button', { class: 'ln-round f', 'data-key': 'ln:settings', 'data-autofocus': want === 'settings' ? true : null, title: T('Einstellungen'), 'aria-label': T('Einstellungen'), onclick: function () { Shell.show('settings', true); } }, icon('settings'));
    var head = h('header', { class: 'ln-head' }, h('div', { class: 'brand' }, brandMark(), wordmark()), h('div', { class: 'ln-tools' }, searchBtn, reloadBtn, setBtn));

    // Live TV / Filme / Serien
    function tile(kind, label, unit, none) {
      var upd = h('span', { class: 'lt-upd' }), cnt = h('span', { class: 'lt-sub' });
      var b = h('button', { class: 'ln-tile f k-' + kind, 'data-key': 'ln:' + kind, 'data-autofocus': kind === want ? true : null, onclick: function () { Shell.show(kind, true); } },
        upd, h('span', { class: 'lt-ic' }, icon(kind), kind !== 'live' ? h('span', { class: 'lt-new', text: T('NEU') }) : null), h('span', { class: 'lt-label', text: label }), cnt,
        h('span', { class: 'lt-go', 'aria-hidden': 'true' }, icon('next')));
      b._upd = upd; b._cnt = cnt; b._unit = unit; b._none = none; b._kind = kind;
      return b;
    }
    var tiles = [tile('live', T('Live TV'), '{0} Sender', T('Alle Sender')), tile('movie', T('Filme'), '{0} Filme', T('Alle Filme')), tile('series', T('Serien'), '{0} Serien', T('Alle Serien'))];
    function paintStats() {
      var st = Stats.get();
      tiles.forEach(function (t) {
        var x = st[t._kind];
        t.classList.toggle('is-busy', busy);
        t._upd.textContent = busy ? T('Wird aktualisiert …') : x ? T('Aktualisiert {0}', ago(x.at)) : '';
        t._cnt.textContent = x ? T(t._unit, fmtCount(x.n)) : t._none;
        if (t._kind !== 'live') {
          var isNew = !busy && NewMark.has(t._kind);
          t.classList.toggle('has-new', isNew);
          t.setAttribute('aria-label', t._kind === 'movie' ? T('Filme') + (isNew ? ' – ' + T('Neue Filme') : '') : T('Serien') + (isNew ? ' – ' + T('Neue Serien oder Folgen') : ''));
        }
      });
    }

    // Favoriten
    var favN = h('small');
    var favCard = h('button', { class: 'ln-card ln-fav f', 'data-key': 'ln:favs', 'data-autofocus': want === 'favs' ? true : null, onclick: function () { Shell.show('favs', true); } },
      h('span', { class: 'lc-ic' }, icon('heart')), h('span', { class: 'lc-txt' }, h('b', { text: T('Favoriten') }), favN), icon('next'));
    function paintFavs() {
      var a = Favs.all(), n = (a.live || []).length + (a.movie || []).length + (a.series || []).length;
      favN.textContent = n === 1 ? T('1 Eintrag') : T('{0} Einträge', n);
    }

    // Aktive Playlist mit Laufzeit
    var nPl = Profiles.list().length;
    var expEl = h('b', { text: '…' }), leftEl = h('small', { class: 'lp-left' });
    var plCard = h('div', { class: 'ln-card ln-pl' },
      h('div', { class: 'lp-top' },
        h('span', { class: 'lc-ic' }, icon('playlist')),
        h('span', { class: 'lc-txt' }, h('b', { text: T('Playlist') }), h('small', { text: nPl === 1 ? T('1 Playlist') : T('{0} Playlists', nPl) })),
        h('button', { class: 'ln-mini f', 'data-key': 'ln:profile', 'data-autofocus': want === 'profile' ? true : null, onclick: function () { Shell.show('profile', true); } }, T('Verwalten'))),
      h('div', { class: 'lp-row' },
        h('div', { class: 'lp-cell' }, h('small', { text: T('Aktuelle Playlist') }), h('b', { text: p.type === 'demo' ? T('Demo-Modus') : p.name })),
        h('div', { class: 'lp-cell lp-exp' }, h('small', { text: T('Gültig bis') }), expEl, leftEl)));
    function paintExpiry() {
      App.provider.account().then(function (a) {
        if (!a || a.expires === undefined) { expEl.textContent = '—'; return; }
        if (!a.expires) { expEl.textContent = T('unbegrenzt'); return; }
        var days = Math.ceil((Number(a.expires) * 1000 - Date.now()) / 86400000);
        expEl.textContent = fmtDate(a.expires);
        leftEl.textContent = days <= 0 ? T('abgelaufen') : days === 1 ? T('noch 1 Tag') : T('noch {0} Tage', days);
        plCard.classList.toggle('is-warn', days > 0 && days <= 30);
        plCard.classList.toggle('is-off', days <= 0);
      }).catch(function () { expEl.textContent = T('keine Verbindung'); plCard.classList.add('is-off'); });
    }

    // Zuletzt geschaut: angefangene Filme (gelb) und Serien (blau) als Bildkarten – keine Live-Sender
    var recent = h('section', { class: 'ln-recent' });
    function recCard(r) {
      var it = r.item, ep = it.kind === 'episode', kind = ep ? 'series' : 'movie';
      var src = it.logo || it.backdrop;
      var thumb = h('span', { class: 'lr-thumb' }, h('span', { class: 'ph', style: 'background:' + gradientFor(it.seriesName || it.name) }));
      if (src) {
        // Cover vollständig zeigen, dahinter dasselbe Bild unscharf als Hintergrund
        if (!Platform.lite) thumb.appendChild(img(src, 'lr-blur', function (i) { if (i.parentNode) i.parentNode.removeChild(i); }));
        thumb.appendChild(img(src, 'lr-cover', function (i) { if (i.parentNode) i.parentNode.removeChild(i); }));
      }
      thumb.appendChild(h('span', { class: 'lr-tag', text: ep ? T('Serie') : T('Film') }));
      thumb.appendChild(h('span', { class: 'lr-bar' }, h('i', { style: 'width:' + Math.max(3, Math.round(r.t / r.d * 100)) + '%' })));
      return h('button', { class: 'lr-card f k-' + kind, 'data-key': 'lr:' + (ep ? 'series:' + it.seriesId : 'movie:' + it.id), title: ep ? (it.seriesName || it.name) : it.name, onclick: function () { playItem(it, { list: [it], index: 0 }); } },
        thumb,
        h('span', { class: 'lr-txt' },
          h('b', { text: ep ? (it.seriesName || it.name) : it.name }),
          h('small', null, ep ? h('span', { class: 'lr-ep', text: 'S' + it.season + ' E' + it.num }) : null, h('span', { text: T('Noch {0}', fmtLeft(r.d - r.t)) }))));
    }
    function paintRecent() {
      clear(recent);
      var res = Resume.recent().filter(function (r) { return r.item && (r.item.kind === 'movie' || r.item.kind === 'episode'); }).slice(0, 10);
      recent.hidden = !res.length;
      if (!res.length) return;
      var track = h('div', { class: 'lr-track' });
      res.forEach(function (r) { track.appendChild(recCard(r)); });
      recent.appendChild(h('h2', { class: 'lr-title', text: T('Zuletzt geschaut') }));
      recent.appendChild(track);
    }

    // byUser: Knopf gedrückt (mit Bestätigung). quiet: automatisch im Hintergrund (ohne Fehlermeldung)
    function doRefresh(byUser, quiet) {
      if (busy) return;
      busy = true; reloadBtn.classList.add('is-busy'); paintStats();
      refreshPlaylist().then(function (r) {
        busy = false; reloadBtn.classList.remove('is-busy');
        paintStats(); paintExpiry();
        // alles frisch: die 30-Minuten-Pause gilt nur nach einem Fehlschlag
        if (!Stats.stale()) autoTried = 0;
        if (r.error) { if (!quiet) toast(T('Hinweis: {0}', r.error.message || T('Verbindung fehlgeschlagen.')), 4000); }
        else if (byUser) toast(T('Playlist aktualisiert'));
      });
    }
    // Listen veraltet? Dann still im Hintergrund neu laden
    function autoCheck() {
      if (busy || !el.parentNode || !autoRefreshDue()) return;
      var first = !Stats.get().live && !Stats.get().movie && !Stats.get().series;
      autoTried = Date.now();
      doRefresh(false, !first);
    }

    var el = h('div', { class: 'launcher' }, heroArt(), head,
      h('div', { class: 'ln-grid' }, tiles[0], tiles[1], tiles[2], h('div', { class: 'ln-side' }, favCard, plCard)),
      recent);
    paintStats(); paintFavs(); paintExpiry(); paintRecent();

    // Uhr und Datum unten rechts (in der Fußleiste), „vor X Min.“ laufend aktualisieren
    function tick() {
      var c = $('.sb-clock'), d = new Date();
      if (c) {
        clear(c);
        c.appendChild(h('b', { text: clockStr(d) }));
        c.appendChild(h('span', { class: 'sb-date' },
          h('i', { text: d.toLocaleDateString(locale(), { weekday: 'long' }) }),
          h('small', { text: d.toLocaleDateString(locale(), { day: '2-digit', month: 'short' }) })));
      }
      if (!busy) paintStats();
    }
    setTimeout(tick, 0);
    // alle 20 Sekunden: Uhr und „vor X Min.“ aktualisieren, veraltete Listen nachladen (Box bleibt oft tagelang an)
    var timer = setInterval(function () { tick(); autoCheck(); }, 20000);
    // Erste Nutzung oder Listen älter als 12 Stunden: kurz nach dem Öffnen im Hintergrund neu laden
    setTimeout(autoCheck, 1500);

    // nach dem Schauen nur die Inhalte auffrischen, Fokus bleibt auf derselben Karte
    el._refresh = function () {
      var sc = Screens.top(), lf = sc && sc.lastFocus, key = lf && lf.getAttribute && lf.getAttribute('data-key');
      paintRecent(); paintFavs(); paintStats();
      if (sc && key && !el.contains(lf)) sc.lastFocus = $('[data-key="' + key + '"]', el) || tiles[0];
      setTimeout(autoCheck, 1500);
    };
    // App kommt aus dem Hintergrund zurück (z. B. Box-Fernbedienung, Handy entsperrt)
    el._wake = function () { setTimeout(autoCheck, 800); };
    el._dispose = function () { clearInterval(timer); };
    return el;
  }

  /* ---------- Kategorien nach Sprache ordnen ----------
     Viele Anbieter schreiben die Sprache vor den Namen, z. B. „TR ⚡ AKSİYON“ oder „DE | Action“.
     Wird das erkannt, zeigt die App zuerst die Sprachen und darin die Kategorien (ohne das Kürzel). */
  var LANG_CODES = {
    de: 'DE GER DEU DEUTSCH DEUTSCHLAND GERMAN GERMANY AT AUT AUSTRIA OSTERREICH CH',
    en: 'EN ENG ENGLISH UK GB',
    tr: 'TR TUR TURK TURKEY TURKISH TURKIYE TURKCE',
    fr: 'FR FRA FRENCH FRANCE',
    it: 'IT ITA ITALY ITALIA',
    es: 'ES ESP SPAIN ESPANA SPANISH LAT LATINO',
    nl: 'NL NLD NED DUTCH NEDERLAND',
    pl: 'PL POL POLSKA POLISH',
    pt: 'PT POR PORTUGAL',
    ar: 'AR ARA ARAB ARABIC',
    ru: 'RU RUS RUSSIA',
    ua: 'UA UKR UKRAINE',
    ku: 'KU KUR KRD KURD KURDI KURDISH',
    al: 'AL ALB ALBANIA SHQIP',
    bg: 'BG BUL BULGARIA',
    ro: 'RO ROM ROU ROMANIA',
    gr: 'GR GRE GREECE',
    yu: 'EXYU YU HR CRO RS SRB BA BIH MK SI SLO',
    se: 'SE SWE SWEDEN',
    no: 'NOR NORWAY',
    dk: 'DK DEN DENMARK',
    fi: 'FI FIN FINLAND',
    hu: 'HU HUN HUNGARY',
    cz: 'CZ CZE',
    sk: 'SK SVK',
    in: 'IND INDIA HINDI',
    fa: 'IR IRAN FA PERSIAN FARSI',
    az: 'AZ AZE AZERBAIJAN',
    be: 'BE BEL BELGIUM BELGIE BELGIQUE BELGIEN',
    us: 'US USA AMERICA',
    ca: 'CA CAN CANADA',
    au: 'AU AUS AUSTRALIA',
    br: 'BR BRA BRASIL BRAZIL',
    mx: 'MX MEX MEXICO',
    ie: 'IE IRL IRELAND',
    il: 'IL ISR ISRAEL HEBREW',
    am: 'ARM ARMENIA ARMENIAN',
    ge: 'GEO GEORGIA',
    lt: 'LT LTU LITHUANIA',
    lv: 'LV LVA LATVIA',
    ee: 'EE EST ESTONIA',
    af: 'AF AFG AFGHAN AFGHANISTAN',
    pk: 'PK PAK PAKISTAN URDU',
    cn: 'CN CHN CHINA CHINESE',
    jp: 'JP JPN JAPAN',
    kr: 'KR KOR KOREA',
    ph: 'PH PHI PHILIPPINES FILIPINO',
    th: 'TH THA THAI THAILAND',
    vn: 'VN VIE VIETNAM',
    ma: 'MA MAR MAROC MOROCCO',
    tn: 'TN TUN TUNISIA TUNISIE',
    dz: 'DZ ALG ALGERIA ALGERIE',
    eg: 'EG EGY EGYPT',
    iq: 'IQ IRQ IRAQ',
    lb: 'LB LBN LEBANON LIBAN',
    sy: 'SY SYR SYRIA'
  };
  var LANG_NAMES = {
    de: 'Deutsch', en: 'Englisch', tr: 'Türkisch', fr: 'Französisch', it: 'Italienisch', es: 'Spanisch',
    nl: 'Niederländisch', pl: 'Polnisch', pt: 'Portugiesisch', ar: 'Arabisch', ru: 'Russisch', ua: 'Ukrainisch',
    ku: 'Kurdisch', al: 'Albanisch', bg: 'Bulgarisch', ro: 'Rumänisch', gr: 'Griechisch', yu: 'Ex-Jugoslawien',
    se: 'Schwedisch', no: 'Norwegisch', dk: 'Dänisch', fi: 'Finnisch', hu: 'Ungarisch', cz: 'Tschechisch',
    sk: 'Slowakisch', 'in': 'Indisch', fa: 'Persisch', az: 'Aserbaidschanisch',
    be: 'Belgien', us: 'USA', ca: 'Kanada', au: 'Australien', br: 'Brasilien', mx: 'Mexiko', ie: 'Irland', il: 'Israel', am: 'Armenien', ge: 'Georgien', lt: 'Litauen', lv: 'Lettland', ee: 'Estland', af: 'Afghanistan', pk: 'Pakistan', cn: 'China', jp: 'Japan', kr: 'Korea', ph: 'Philippinen', th: 'Thailand', vn: 'Vietnam', ma: 'Marokko', tn: 'Tunesien', dz: 'Algerien', eg: 'Ägypten', iq: 'Irak', lb: 'Libanon', sy: 'Syrien'
  };
  /* Flaggen für die Sprachen (vereinfacht, 3:2) */
  var FLAGS = {
    de: "<path fill=\"#000\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#DD0000\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#FFCE00\" d=\"M0 13.33h30v6.67H0z\"/>",
    en: "<path fill=\"#012169\" d=\"M0 0h30v20H0z\"/><path d=\"M0 0l30 20M30 0L0 20\" stroke=\"#fff\" stroke-width=\"4\"/><path d=\"M0 0l30 20M30 0L0 20\" stroke=\"#C8102E\" stroke-width=\"1.5\"/><path d=\"M15 0v20M0 10h30\" stroke=\"#fff\" stroke-width=\"6.5\"/><path d=\"M15 0v20M0 10h30\" stroke=\"#C8102E\" stroke-width=\"3.6\"/>",
    tr: "<path fill=\"#E30A17\" d=\"M0 0h30v20H0z\"/><circle cx=\"11\" cy=\"10\" r=\"5\" fill=\"#fff\"/><circle cx=\"12.3\" cy=\"10\" r=\"4\" fill=\"#E30A17\"/><path fill=\"#fff\" d=\"M14.7 10L16.33 9.44L16.36 7.72L17.39 9.1L19.04 8.59L18.05 10L19.04 11.41L17.39 10.9L16.36 12.28L16.33 10.56Z\"/>",
    fr: "<path fill=\"#002395\" d=\"M0 0h10v20H0z\"/><path fill=\"#fff\" d=\"M10 0h10v20H10z\"/><path fill=\"#ED2939\" d=\"M20 0h10v20H20z\"/>",
    it: "<path fill=\"#009246\" d=\"M0 0h10v20H0z\"/><path fill=\"#fff\" d=\"M10 0h10v20H10z\"/><path fill=\"#CE2B37\" d=\"M20 0h10v20H20z\"/>",
    es: "<path fill=\"#AA151B\" d=\"M0 0h30v5H0z\"/><path fill=\"#F1BF00\" d=\"M0 5h30v10H0z\"/><path fill=\"#AA151B\" d=\"M0 15h30v5H0z\"/>",
    nl: "<path fill=\"#AE1C28\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#21468B\" d=\"M0 13.33h30v6.67H0z\"/>",
    pl: "<path fill=\"#fff\" d=\"M0 0h30v10H0z\"/><path fill=\"#DC143C\" d=\"M0 10h30v10H0z\"/>",
    pt: "<path fill=\"#006600\" d=\"M0 0h12v20H0z\"/><path fill=\"#FF0000\" d=\"M12 0h18v20H12z\"/><circle cx=\"12\" cy=\"10\" r=\"3.6\" fill=\"none\" stroke=\"#FFCC00\" stroke-width=\"1.2\"/><path fill=\"#fff\" stroke=\"#D00\" stroke-width=\".5\" d=\"M10.4 8.2h3.2v2.6a1.6 1.6 0 0 1-3.2 0z\"/>",
    ar: "<path fill=\"#006C35\" d=\"M0 0h30v20H0z\"/><path d=\"M8.5 7.6c1.2-1 2 .8 3 0s1.6-1 2.6 0 1.8.7 2.6-.2 1.6-.6 2.4.3 1.4.4 2.4-.4\" fill=\"none\" stroke=\"#fff\" stroke-width=\".9\" stroke-linecap=\"round\"/><path d=\"M9 12.6h12.5\" stroke=\"#fff\" stroke-width=\"1\" stroke-linecap=\"round\"/><path d=\"M21.5 12.6l-1.6-1v2z\" fill=\"#fff\"/>",
    ru: "<path fill=\"#fff\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#0039A6\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#D52B1E\" d=\"M0 13.33h30v6.67H0z\"/>",
    ua: "<path fill=\"#0057B7\" d=\"M0 0h30v10H0z\"/><path fill=\"#FFD700\" d=\"M0 10h30v10H0z\"/>",
    ku: "<path fill=\"#ED2024\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#278E43\" d=\"M0 13.33h30v6.67H0z\"/><path fill=\"#FEBD11\" d=\"M15 6.4L15.34 7.73L16.06 6.56L16 7.93L17.03 7.03L16.56 8.31L17.81 7.76L16.99 8.85L18.35 8.68L17.24 9.49L18.59 9.73L17.29 10.17L18.51 10.8L17.14 10.84L18.12 11.8L16.8 11.43L17.45 12.64L16.3 11.9L16.56 13.24L15.68 12.2L15.54 13.56L15 12.3L14.46 13.56L14.32 12.2L13.44 13.24L13.7 11.9L12.55 12.64L13.2 11.43L11.88 11.8L12.86 10.84L11.49 10.8L12.71 10.17L11.41 9.73L12.76 9.49L11.65 8.68L13.01 8.85L12.19 7.76L13.44 8.31L12.97 7.03L14 7.93L13.94 6.56L14.66 7.73Z\"/>",
    al: "<path fill=\"#E41E20\" d=\"M0 0h30v20H0z\"/><path fill=\"#000\" d=\"M15 5.2l1 1.6 1.6-1.6.4 1.4 2.4-1.4-.4 2.2 2.6-.8-1.2 2.2 2.2.2-2.4 1.6 1.4 1-3 .2-1.6 1.8-1.4-.6.8 2.4-1.4.6-.6-1.6-.6 1.6-1.4-.6.8-2.4-1.4.6-1.6-1.8-3-.2 1.4-1-2.4-1.6 2.2-.2-1.2-2.2 2.6.8-.4-2.2 2.4 1.4.4-1.4 1.6 1.6z\"/>",
    bg: "<path fill=\"#fff\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#00966E\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#D62612\" d=\"M0 13.33h30v6.67H0z\"/>",
    ro: "<path fill=\"#002B7F\" d=\"M0 0h10v20H0z\"/><path fill=\"#FCD116\" d=\"M10 0h10v20H10z\"/><path fill=\"#CE1126\" d=\"M20 0h10v20H20z\"/>",
    gr: "<path fill=\"#0D5EAF\" d=\"M0 0h30v20H0z\"/><path fill=\"#fff\" d=\"M0 2.22h30v2.22H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v2.22H0z\"/><path fill=\"#fff\" d=\"M0 11.11h30v2.22H0z\"/><path fill=\"#fff\" d=\"M0 15.56h30v2.22H0z\"/><path fill=\"#0D5EAF\" d=\"M0 0h11.11v11.11H0z\"/><path fill=\"#fff\" d=\"M0 4.44h11.11v2.22H0z\"/><path fill=\"#fff\" d=\"M4.44 0h2.22v11.11H4.44z\"/>",
    yu: "<path fill=\"#003893\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#DE0000\" d=\"M0 13.33h30v6.67H0z\"/><path fill=\"#DE0000\" stroke=\"#FFD100\" stroke-width=\".6\" d=\"M15 6.3L15.94 9.01L18.8 9.06L16.52 10.79L17.35 13.54L15 11.9L12.65 13.54L13.48 10.79L11.2 9.06L14.06 9.01Z\"/>",
    se: "<path fill=\"#006AA7\" d=\"M0 0h30v20H0z\"/><path fill=\"#FECC00\" d=\"M9 0h3.4v20H9z\"/><path fill=\"#FECC00\" d=\"M0 8.3h30v3.4H0z\"/>",
    no: "<path fill=\"#BA0C2F\" d=\"M0 0h30v20H0z\"/><path fill=\"#fff\" d=\"M8 0h5.6v20H8z\"/><path fill=\"#fff\" d=\"M0 7.2h30v5.6H0z\"/><path fill=\"#00205B\" d=\"M9.4 0h2.8v20H9.4z\"/><path fill=\"#00205B\" d=\"M0 8.6h30v2.8H0z\"/>",
    dk: "<path fill=\"#C8102E\" d=\"M0 0h30v20H0z\"/><path fill=\"#fff\" d=\"M9 0h3.2v20H9z\"/><path fill=\"#fff\" d=\"M0 8.4h30v3.2H0z\"/>",
    fi: "<path fill=\"#fff\" d=\"M0 0h30v20H0z\"/><path fill=\"#002F6C\" d=\"M8.5 0h5v20H8.5z\"/><path fill=\"#002F6C\" d=\"M0 7.5h30v5H0z\"/>",
    hu: "<path fill=\"#CE2939\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#477050\" d=\"M0 13.33h30v6.67H0z\"/>",
    cz: "<path fill=\"#fff\" d=\"M0 0h30v10H0z\"/><path fill=\"#D7141A\" d=\"M0 10h30v10H0z\"/><path fill=\"#11457E\" d=\"M0 0l15 10L0 20z\"/>",
    sk: "<path fill=\"#fff\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#0B4EA2\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#EE1C25\" d=\"M0 13.33h30v6.67H0z\"/><path fill=\"#EE1C25\" stroke=\"#fff\" stroke-width=\".6\" d=\"M6.5 4.6h7.5v6.2c0 3-1.9 4.6-3.75 5.4-1.85-.8-3.75-2.4-3.75-5.4z\"/><path d=\"M10.25 6v8M8.5 8.2h3.5M8 10.6h4.5\" stroke=\"#fff\" stroke-width=\"1\"/><path fill=\"#0B4EA2\" d=\"M7.4 13.2c.8-.9 1.8-.9 2.85 0 1-.9 2-.9 2.85 0-.6 1.1-1.6 1.9-2.85 2.5-1.25-.6-2.25-1.4-2.85-2.5z\"/>",
    'in': "<path fill=\"#FF9933\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#138808\" d=\"M0 13.33h30v6.67H0z\"/><circle cx=\"15\" cy=\"10\" r=\"2.6\" fill=\"none\" stroke=\"#000080\" stroke-width=\".55\"/><circle cx=\"15\" cy=\"10\" r=\".7\" fill=\"#000080\"/>",
    fa: "<path fill=\"#239F40\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#DA0000\" d=\"M0 13.33h30v6.67H0z\"/><path d=\"M15 7.6v4.6M13.6 8.4c-.9 1.4-.4 3 .9 3.6M16.4 8.4c.9 1.4.4 3-.9 3.6\" fill=\"none\" stroke=\"#DA0000\" stroke-width=\".7\" stroke-linecap=\"round\"/>",
    az: "<path fill=\"#0092BC\" d=\"M0 0h30v6.67H0z\"/><path fill=\"#E4002B\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#00AF66\" d=\"M0 13.33h30v6.67H0z\"/><circle cx=\"14.2\" cy=\"10\" r=\"2.6\" fill=\"#fff\"/><circle cx=\"14.85\" cy=\"10\" r=\"2.1\" fill=\"#E4002B\"/><path fill=\"#fff\" d=\"M17.4 8.7L17.63 9.45L18.32 9.08L17.95 9.77L18.7 10L17.95 10.23L18.32 10.92L17.63 10.55L17.4 11.3L17.17 10.55L16.48 10.92L16.85 10.23L16.1 10L16.85 9.77L16.48 9.08L17.17 9.45Z\"/>",
    be: "<path fill=\"#000\" d=\"M0.00 0h10.00v20H0.00z\"/><path fill=\"#FDDA24\" d=\"M10.00 0h10.00v20H10.00z\"/><path fill=\"#EF3340\" d=\"M20.00 0h10.00v20H20.00z\"/>",
    us: "<path fill=\"#fff\" d=\"M0 0h30v20H0z\"/><path fill=\"#B22234\" d=\"M0 0.000h30v1.538H0z\"/><path fill=\"#B22234\" d=\"M0 3.077h30v1.538H0z\"/><path fill=\"#B22234\" d=\"M0 6.154h30v1.538H0z\"/><path fill=\"#B22234\" d=\"M0 9.231h30v1.538H0z\"/><path fill=\"#B22234\" d=\"M0 12.308h30v1.538H0z\"/><path fill=\"#B22234\" d=\"M0 15.385h30v1.538H0z\"/><path fill=\"#B22234\" d=\"M0 18.462h30v1.538H0z\"/><path fill=\"#3C3B6E\" d=\"M0 0h12v10.77H0z\"/><circle cx=\"2.00\" cy=\"1.80\" r=\".55\" fill=\"#fff\"/><circle cx=\"2.00\" cy=\"4.20\" r=\".55\" fill=\"#fff\"/><circle cx=\"2.00\" cy=\"6.60\" r=\".55\" fill=\"#fff\"/><circle cx=\"2.00\" cy=\"9.00\" r=\".55\" fill=\"#fff\"/><circle cx=\"4.60\" cy=\"1.80\" r=\".55\" fill=\"#fff\"/><circle cx=\"4.60\" cy=\"4.20\" r=\".55\" fill=\"#fff\"/><circle cx=\"4.60\" cy=\"6.60\" r=\".55\" fill=\"#fff\"/><circle cx=\"4.60\" cy=\"9.00\" r=\".55\" fill=\"#fff\"/><circle cx=\"7.20\" cy=\"1.80\" r=\".55\" fill=\"#fff\"/><circle cx=\"7.20\" cy=\"4.20\" r=\".55\" fill=\"#fff\"/><circle cx=\"7.20\" cy=\"6.60\" r=\".55\" fill=\"#fff\"/><circle cx=\"7.20\" cy=\"9.00\" r=\".55\" fill=\"#fff\"/><circle cx=\"9.80\" cy=\"1.80\" r=\".55\" fill=\"#fff\"/><circle cx=\"9.80\" cy=\"4.20\" r=\".55\" fill=\"#fff\"/><circle cx=\"9.80\" cy=\"6.60\" r=\".55\" fill=\"#fff\"/><circle cx=\"9.80\" cy=\"9.00\" r=\".55\" fill=\"#fff\"/>",
    ca: "<path fill=\"#fff\" d=\"M0 0h30v20H0z\"/><path fill=\"#D80621\" d=\"M0 0h7.5v20H0zM22.5 0H30v20h-7.5z\"/><path fill=\"#D80621\" d=\"M15 3.6l1.1 2.1 1.5-.7-.5 3.4 2-2 .5 1.2 2.2-.5-.9 2.4 1 .6-3.3 2.6.4 1.3-3.3-.5V16h-1.4v-2.5l-3.3.5.4-1.3-3.3-2.6 1-.6-.9-2.4 2.2.5.5-1.2 2 2-.5-3.4 1.5.7z\"/>",
    au: "<path fill=\"#00008B\" d=\"M0 0h30v20H0z\"/><g transform=\"scale(.5)\"><path d=\"M0 0l30 20M30 0L0 20\" stroke=\"#fff\" stroke-width=\"4\"/><path d=\"M0 0l30 20M30 0L0 20\" stroke=\"#C8102E\" stroke-width=\"1.5\"/><path d=\"M15 0v20M0 10h30\" stroke=\"#fff\" stroke-width=\"6.5\"/><path d=\"M15 0v20M0 10h30\" stroke=\"#C8102E\" stroke-width=\"3.6\"/></g><path fill=\"#fff\" d=\"M7.50 12.60L8.06 14.22L9.78 14.26L8.41 15.30L8.91 16.94L7.50 15.96L6.09 16.94L6.59 15.30L5.22 14.26L6.94 14.22Z\"/><path fill=\"#fff\" d=\"M22.50 3.40L22.76 4.14L23.55 4.16L22.92 4.64L23.15 5.39L22.50 4.94L21.85 5.39L22.08 4.64L21.45 4.16L22.24 4.14Z\"/><path fill=\"#fff\" d=\"M19.50 7.90L19.76 8.64L20.55 8.66L19.92 9.14L20.15 9.89L19.50 9.44L18.85 9.89L19.08 9.14L18.45 8.66L19.24 8.64Z\"/><path fill=\"#fff\" d=\"M25.50 6.90L25.76 7.64L26.55 7.66L25.92 8.14L26.15 8.89L25.50 8.44L24.85 8.89L25.08 8.14L24.45 7.66L25.24 7.64Z\"/><path fill=\"#fff\" d=\"M22.50 14.80L22.78 15.61L23.64 15.63L22.96 16.15L23.21 16.97L22.50 16.48L21.79 16.97L22.04 16.15L21.36 15.63L22.22 15.61Z\"/>",
    br: "<path fill=\"#009C3B\" d=\"M0 0h30v20H0z\"/><path fill=\"#FFDF00\" d=\"M15 2.3L27.6 10 15 17.7 2.4 10z\"/><circle cx=\"15\" cy=\"10\" r=\"4.4\" fill=\"#002776\"/><path d=\"M10.8 9.2c2.8-.6 5.9-.2 8.3 1.3\" fill=\"none\" stroke=\"#fff\" stroke-width=\".8\"/>",
    mx: "<path fill=\"#006847\" d=\"M0.00 0h10.00v20H0.00z\"/><path fill=\"#fff\" d=\"M10.00 0h10.00v20H10.00z\"/><path fill=\"#CE1126\" d=\"M20.00 0h10.00v20H20.00z\"/><circle cx=\"15\" cy=\"10\" r=\"2\" fill=\"#8C5A2B\"/><path d=\"M13.2 11.4c1.1 1 2.5 1 3.6 0\" fill=\"none\" stroke=\"#006847\" stroke-width=\".6\"/>",
    ie: "<path fill=\"#169B62\" d=\"M0.00 0h10.00v20H0.00z\"/><path fill=\"#fff\" d=\"M10.00 0h10.00v20H10.00z\"/><path fill=\"#FF883E\" d=\"M20.00 0h10.00v20H20.00z\"/>",
    il: "<path fill=\"#fff\" d=\"M0 0h30v20H0z\"/><path fill=\"#0038B8\" d=\"M0 2h30v2.6H0zM0 15.4h30V18H0z\"/><path d=\"M15 6.4l3.1 5.4h-6.2zM15 13.6l3.1-5.4h-6.2z\" fill=\"none\" stroke=\"#0038B8\" stroke-width=\".7\"/>",
    am: "<path fill=\"#D90012\" d=\"M0 0.00h30v6.67H0z\"/><path fill=\"#0033A0\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#F2A800\" d=\"M0 13.33h30v6.67H0z\"/>",
    ge: "<path fill=\"#fff\" d=\"M0 0h30v20H0z\"/><path fill=\"#FF0000\" d=\"M13.3 0h3.4v20h-3.4zM0 8.3h30v3.4H0z\"/><path d=\"M6.5 2.6v3.4M4.8 4.3h3.4M23.5 2.6v3.4M21.8 4.3h3.4M6.5 14v3.4M4.8 15.7h3.4M23.5 14v3.4M21.8 15.7h3.4\" stroke=\"#FF0000\" stroke-width=\"1\"/>",
    lt: "<path fill=\"#FDB913\" d=\"M0 0.00h30v6.67H0z\"/><path fill=\"#006A44\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#C1272D\" d=\"M0 13.33h30v6.67H0z\"/>",
    lv: "<path fill=\"#9E3039\" d=\"M0 0h30v20H0z\"/><path fill=\"#fff\" d=\"M0 8h30v4H0z\"/>",
    ee: "<path fill=\"#0072CE\" d=\"M0 0.00h30v6.67H0z\"/><path fill=\"#000\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 13.33h30v6.67H0z\"/>",
    af: "<path fill=\"#000\" d=\"M0.00 0h10.00v20H0.00z\"/><path fill=\"#D32011\" d=\"M10.00 0h10.00v20H10.00z\"/><path fill=\"#007A36\" d=\"M20.00 0h10.00v20H20.00z\"/><circle cx=\"15\" cy=\"10\" r=\"2.6\" fill=\"none\" stroke=\"#fff\" stroke-width=\".8\"/><path d=\"M15 8.6v2.4\" stroke=\"#fff\" stroke-width=\".8\"/>",
    pk: "<path fill=\"#fff\" d=\"M0 0h7.5v20H0z\"/><path fill=\"#01411C\" d=\"M7.5 0H30v20H7.5z\"/><circle cx=\"18.5\" cy=\"10.5\" r=\"5\" fill=\"#fff\"/><circle cx=\"20.1\" cy=\"10.5\" r=\"4.0\" fill=\"#01411C\"/><path fill=\"#fff\" d=\"M22.05 6.33L21.82 7.52L22.86 8.15L21.66 8.31L21.38 9.49L20.86 8.39L19.65 8.49L20.53 7.66L20.06 6.54L21.13 7.12Z\"/>",
    cn: "<path fill=\"#EE1C25\" d=\"M0 0h30v20H0z\"/><path fill=\"#FFFF00\" d=\"M5.50 2.50L6.21 4.53L8.35 4.57L6.64 5.87L7.26 7.93L5.50 6.70L3.74 7.93L4.36 5.87L2.65 4.57L4.79 4.53Z\"/><path fill=\"#FFFF00\" d=\"M10.50 1.20L10.74 1.88L11.45 1.89L10.88 2.32L11.09 3.01L10.50 2.60L9.91 3.01L10.12 2.32L9.55 1.89L10.26 1.88Z\"/><path fill=\"#FFFF00\" d=\"M12.30 3.40L12.54 4.08L13.25 4.09L12.68 4.52L12.89 5.21L12.30 4.80L11.71 5.21L11.92 4.52L11.35 4.09L12.06 4.08Z\"/><path fill=\"#FFFF00\" d=\"M12.30 6.40L12.54 7.08L13.25 7.09L12.68 7.52L12.89 8.21L12.30 7.80L11.71 8.21L11.92 7.52L11.35 7.09L12.06 7.08Z\"/><path fill=\"#FFFF00\" d=\"M10.50 8.40L10.74 9.08L11.45 9.09L10.88 9.52L11.09 10.21L10.50 9.80L9.91 10.21L10.12 9.52L9.55 9.09L10.26 9.08Z\"/>",
    jp: "<path fill=\"#fff\" d=\"M0 0h30v20H0z\"/><circle cx=\"15\" cy=\"10\" r=\"5.8\" fill=\"#BC002D\"/>",
    kr: "<path fill=\"#fff\" d=\"M0 0h30v20H0z\"/><path fill=\"#CD2E3A\" d=\"M10 10a5 5 0 0 1 10 0z\"/><path fill=\"#0047A0\" d=\"M10 10a5 5 0 0 0 10 0z\"/><circle cx=\"12.5\" cy=\"10\" r=\"2.5\" fill=\"#CD2E3A\"/><circle cx=\"17.5\" cy=\"10\" r=\"2.5\" fill=\"#0047A0\"/><path d=\"M4.2 3.6l2.8 3.2M3.2 4.6L6 7.8M25.8 3.6L23 6.8M26.8 4.6L24 7.8M4.2 16.4l2.8-3.2M3.2 15.4L6 12.2M25.8 16.4L23 13.2M26.8 15.4L24 12.2\" stroke=\"#000\" stroke-width=\".9\"/>",
    ph: "<path fill=\"#0038A8\" d=\"M0 0h30v10H0z\"/><path fill=\"#CE1126\" d=\"M0 10h30v10H0z\"/><path fill=\"#fff\" d=\"M0 0l17.3 10L0 20z\"/><circle cx=\"5.8\" cy=\"10\" r=\"2\" fill=\"#FCD116\"/><path fill=\"#FCD116\" d=\"M1.80 1.80L1.99 2.34L2.56 2.35L2.10 2.70L2.27 3.25L1.80 2.92L1.33 3.25L1.50 2.70L1.04 2.35L1.61 2.34Z\"/><path fill=\"#FCD116\" d=\"M1.80 16.60L1.99 17.14L2.56 17.15L2.10 17.50L2.27 18.05L1.80 17.72L1.33 18.05L1.50 17.50L1.04 17.15L1.61 17.14Z\"/><path fill=\"#FCD116\" d=\"M14.20 9.20L14.39 9.74L14.96 9.75L14.50 10.10L14.67 10.65L14.20 10.32L13.73 10.65L13.90 10.10L13.44 9.75L14.01 9.74Z\"/>",
    th: "<path fill=\"#A51931\" d=\"M0 0h30v20H0z\"/><path fill=\"#F4F5F8\" d=\"M0 3.33h30v13.34H0z\"/><path fill=\"#2D2A4A\" d=\"M0 6.67h30v6.66H0z\"/>",
    vn: "<path fill=\"#DA251D\" d=\"M0 0h30v20H0z\"/><path fill=\"#FFFF00\" d=\"M15.00 5.40L16.18 8.78L19.76 8.85L16.90 11.02L17.94 14.45L15.00 12.40L12.06 14.45L13.10 11.02L10.24 8.85L13.82 8.78Z\"/>",
    ma: "<path fill=\"#C1272D\" d=\"M0 0h30v20H0z\"/><path d=\"M15 5.6l2.6 8-6.8-4.9h8.4l-6.8 4.9z\" fill=\"none\" stroke=\"#006233\" stroke-width=\".8\" stroke-linejoin=\"round\"/>",
    tn: "<path fill=\"#E70013\" d=\"M0 0h30v20H0z\"/><circle cx=\"15\" cy=\"10\" r=\"5\" fill=\"#fff\"/><circle cx=\"14.4\" cy=\"10\" r=\"3.6\" fill=\"#E70013\"/><circle cx=\"15.4\" cy=\"10\" r=\"2.8800000000000003\" fill=\"#fff\"/><path fill=\"#E70013\" d=\"M16.30 8.40L16.68 9.48L17.82 9.51L16.91 10.20L17.24 11.29L16.30 10.64L15.36 11.29L15.69 10.20L14.78 9.51L15.92 9.48Z\"/>",
    dz: "<path fill=\"#006233\" d=\"M0 0h15v20H0z\"/><path fill=\"#fff\" d=\"M15 0h15v20H15z\"/><circle cx=\"15\" cy=\"10\" r=\"4.6\" fill=\"#D21034\"/><circle cx=\"16.4\" cy=\"10\" r=\"3.6799999999999997\" fill=\"#fff\"/><path fill=\"#D21034\" d=\"M15.60 10.00L16.82 9.58L16.84 8.29L17.62 9.32L18.86 8.94L18.12 10.00L18.86 11.06L17.62 10.68L16.84 11.71L16.82 10.42Z\"/>",
    eg: "<path fill=\"#CE1126\" d=\"M0 0.00h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#000\" d=\"M0 13.33h30v6.67H0z\"/><path d=\"M15 7.6l1.3 1.4-.4 2.6h-1.8l-.4-2.6z\" fill=\"#C09300\"/>",
    iq: "<path fill=\"#CE1126\" d=\"M0 0.00h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#000\" d=\"M0 13.33h30v6.67H0z\"/><path d=\"M10.5 10.8h2.2M13.6 9.2v1.6h2M17 9.4v1.4h2.4\" fill=\"none\" stroke=\"#007A3D\" stroke-width=\".8\"/>",
    lb: "<path fill=\"#ED1C24\" d=\"M0 0h30v20H0z\"/><path fill=\"#fff\" d=\"M0 5h30v10H0z\"/><path fill=\"#00A651\" d=\"M15 6.2l3.6 5.6h-2.2l1.6 2.2h-6l1.6-2.2h-2.2z\"/>",
    sy: "<path fill=\"#CE1126\" d=\"M0 0.00h30v6.67H0z\"/><path fill=\"#fff\" d=\"M0 6.67h30v6.67H0z\"/><path fill=\"#000\" d=\"M0 13.33h30v6.67H0z\"/><path fill=\"#007A3D\" d=\"M11.50 8.30L11.90 9.45L13.12 9.47L12.15 10.21L12.50 11.38L11.50 10.68L10.50 11.38L10.85 10.21L9.88 9.47L11.10 9.45Z\"/><path fill=\"#007A3D\" d=\"M18.50 8.30L18.90 9.45L20.12 9.47L19.15 10.21L19.50 11.38L18.50 10.68L17.50 11.38L17.85 10.21L16.88 9.47L18.10 9.45Z\"/>"
  };
  /* Flagge der Sprache statt „DE“, „TR“ … – ohne Flagge (z. B. „Weitere“) bleibt das Kürzel */
  function langBadge(g) {
    var svg = FLAGS[g.key];
    if (!svg && g.key === '_') return h('span', { class: 'lc-code lc-globe', title: g.name }, icon('globe'));
    if (!svg) return h('span', { class: 'lc-code', text: g.code || '…' });
    var f = h('span', { class: 'flag', title: g.name });
    f.innerHTML = '<svg viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">' + svg + '</svg>';
    return f;
  }
  /* Sport-Kategorien bekommen einen Fußball, Radio-Kategorien ein kleines Radio */
  var SPORT_RE = /(^|[^0-9A-Za-zÀ-ɏ])(SPORTS?|SPOR|SPORTIF|DEPORTES?|FUSSBALL|FUẞBALL|FUßBALL|FUTBOL|FOOTBALL|SOCCER|BUNDESLIGA|BEIN|DAZN|ESPN|EUROSPORT)($|[^0-9A-Za-zÀ-ɏ])/i;
  var RADIO_RE = /(^|[^0-9A-Za-zÀ-ɏ])(RADIO|RADYO|RADIOS|RÁDIO|РАДИО)($|[^0-9A-Za-zÀ-ɏ])/i;
  function catIcon(name) {
    var n = String(name || '');
    if (RADIO_RE.test(n)) return h('span', { class: 'cat-ic cat-ic-radio', title: T('Radio') }, icon('radio'));
    if (SPORT_RE.test(n)) return h('span', { class: 'cat-ic cat-ic-sport', title: T('Sport') }, icon('ball'));
    return null;
  }
  var CODE_MAP = null;
  var WORD_CH = '0-9A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u0600-\\u06FF';
  var WORD_RE = new RegExp('[' + WORD_CH + ']+', 'g');
  var SEP_HEAD = new RegExp('^[^' + WORD_CH + '(\\[]+'), SEP_TAIL = new RegExp('[^' + WORD_CH + ')\\]!?]+$');
  function foldUp(s) {
    return s.replace(/[İı]/g, 'I').replace(/[Üü]/g, 'U').replace(/[Öö]/g, 'O').replace(/[Çç]/g, 'C')
      .replace(/[Şş]/g, 'S').replace(/[Ğğ]/g, 'G').replace(/[Ää]/g, 'A').replace(/[Ññ]/g, 'N').toUpperCase();
  }
  function trimSep(x) { return x.replace(SEP_HEAD, '').replace(SEP_TAIL, '').replace(/^[(\[]\s*[)\]]$/, ''); }
  /* Liefert { g: 'tr', label: 'AKSİYON' } oder null, wenn kein Sprach-Kürzel erkannt wird */
  function langOf(name) {
    var s = String(name || ''), m, tokens = [];
    if (!CODE_MAP) {
      CODE_MAP = {};
      Object.keys(LANG_CODES).forEach(function (k) { LANG_CODES[k].split(' ').forEach(function (c) { CODE_MAP[c] = k; }); });
    }
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(s)) && tokens.length < 16) tokens.push({ t: m[0], i: m.index });
    function hit(k) {
      var tk = tokens[k];
      // nur groß geschriebene Kürzel zählen („DE“, nicht „De Niro“)
      if (!tk || /^[0-9]/.test(tk.t) || tk.t !== tk.t.toUpperCase()) return null;
      var g = CODE_MAP[foldUp(tk.t)];
      return g ? { g: g, tk: tk } : null;
    }
    if (!tokens.length) return null;
    var r = hit(0) || (tokens.length > 1 && tokens[0].t.length <= 4 ? hit(1) : null) || (tokens.length > 1 ? hit(tokens.length - 1) : null);
    if (!r) return null;
    var before = trimSep(s.slice(0, r.tk.i)), after = trimSep(s.slice(r.tk.i + r.tk.t.length));
    var label = (before + ' ' + after).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return { g: r.g, label: label || s };
  }
  /* Teilt die Kategorien in Sprachen auf – oder null, wenn sich das nicht lohnt */
  function groupCats(list) {
    var groups = [], byKey = {}, tagged = 0;
    (list || []).forEach(function (c) {
      var r = langOf(c.name), key = r ? r.g : '_';
      if (r) tagged++;
      var g = byKey[key];
      if (!g) {
        g = byKey[key] = { key: key, ord: groups.length, code: key === '_' ? '' : key.toUpperCase(), name: key === '_' ? T('Weitere') : T(LANG_NAMES[key]), cats: [] };
        groups.push(g);
      }
      g.cats.push({ id: c.id, name: r ? r.label : c.name, full: c.name, orig: c.orig });
    });
    if (groups.filter(function (g) { return g.key !== '_'; }).length < 2 || tagged < list.length * 0.4) return null;
    // Sprache der App zuerst, „Weitere“ zuletzt, sonst wie beim Anbieter sortiert
    function rank(g) { return g.key === Lang.cur ? -1 : g.key === '_' ? 1e6 : g.ord; }
    groups.sort(function (a, b) { return rank(a) - rank(b); });
    return groups;
  }

  /* Anzahl der Einträge je Kategorie (aus der Gesamtliste, die beim Anbieter ohnehin zwischengespeichert wird) */
  var countCache = {};
  /* Anzahl Sender/Filme/Serien und wann zuletzt geladen – pro Playlist gespeichert, für den Startbildschirm */
  var Stats = {
    get: function (id) { return Store.get('stats.' + (id || pid()), {}); },
    // id: Playlist, für die gezählt wurde – nicht die, die beim Ende des Ladens gerade aktiv ist
    set: function (kind, n, newest, id) { id = id || pid(); var s = this.get(id); s[kind] = { n: n, at: Date.now(), newest: newest || 0 }; Store.set('stats.' + id, s); },
    // Listen zu alt (älter als 12 Stunden) oder noch nie geladen?
    stale: function () {
      var s = this.get(), oldest = Infinity;
      ['live', 'movie', 'series'].forEach(function (k) { if (s[k] && s[k].at < oldest) oldest = s[k].at; });
      if (oldest === Infinity) return true;
      var hrs = Settings.get('autoRefresh');
      hrs = typeof hrs === 'number' ? hrs : 12;
      return hrs > 0 && Date.now() - oldest > hrs * 3600000;
    }
  };
  /* „Neu“-Hinweis auf den Kacheln Filme und Serien: Seit dem letzten Besuch neue Titel oder neue Folgen?
     Gemerkt wird der neueste Zeitstempel (bei Serien ändert er sich auch durch neue Folgen) – ohne Zeitstempel die Anzahl. */
  var NewMark = {
    key: function () { return 'seenNew.' + pid(); },
    has: function (kind) {
      var st = Stats.get()[kind], seen = Store.get(this.key(), {}), s = seen[kind];
      if (!st) return false;
      if (!s) { seen[kind] = { t: st.newest || 0, n: st.n }; Store.set(this.key(), seen); return false; }   // erste Nutzung: nichts als neu zeigen
      return st.newest && s.t ? st.newest > s.t : st.n > s.n;
    },
    mark: function (kind) {
      var st = Stats.get()[kind];
      if (!st) return;
      var seen = Store.get(this.key(), {});
      seen[kind] = { t: st.newest || 0, n: st.n };
      Store.set(this.key(), seen);
    }
  };
  /* Automatisch aktualisieren: Boxen lassen die App oft tagelang im Hintergrund laufen.
     Sind die Listen älter als 12 Stunden, lädt der Startbildschirm sie selbst neu – nie während etwas läuft,
     und nach einem Fehlschlag (z. B. kein Internet) erst nach 30 Minuten wieder. */
  var AUTO_RETRY_MS = 30 * 60000, autoTried = 0;
  function autoRefreshDue() {
    if (!App.profile || !App.provider || refreshing || Player.el) return false;
    var top = Screens.top();
    if (top && top.name !== 'shell') return false;
    if (Date.now() - autoTried < AUTO_RETRY_MS) return false;
    return Stats.stale();
  }
  /* Playlist mit einem Klick neu laden: alles frisch vom Anbieter holen und neu zählen */
  var refreshing = null, refreshingFor = null;

  /* Aktualisieren mit Ladebildschirm: Der goldene Punkt fällt herunter und hüpft, das Play-Zeichen verliert
     die Anziehung, schwebt kurz und klatscht auf den Boden – dann setzt sich das Logo wieder zusammen.
     Darunter sieht man, was gerade geladen wird. Danach landet man immer auf dem Startbildschirm. */
  var RL_LOGO = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<g class="rl-l"><path d="M14 22h56M34 22v62" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/></g>' +
    '<g class="rl-dust"><circle cx="41" cy="77.5" r="1.7"/><circle cx="58" cy="76.5" r="1.3"/><circle cx="77" cy="77.5" r="1.7"/></g>' +
    '<g class="rl-play"><path d="M50 38.5c0-3.3 3.6-5.3 6.4-3.6l25.4 15.6c2.7 1.7 2.7 5.6 0 7.2L56.4 73.4C53.6 75.1 50 73.1 50 69.8z"/></g>' +
    '<g class="rl-dot"><circle cx="84" cy="22" r="6"/></g></svg>';
  var reloadingNow = false;
  function reloadWithSplash() {
    if (reloadingNow || !App.provider) return;
    reloadingNow = true;
    if (Player.el) Player.close();
    if (QuickSearch.isOpen) QuickSearch.close(true);
    var logo = h('div', { class: 'rl-logo' });
    logo.innerHTML = RL_LOGO;
    var title = h('h2', { class: 'rl-title' }, h('span', { class: 'rl-ok' }, icon('check')), h('span', { text: T('Playlist wird aktualisiert …') }));
    var sub = h('p', { class: 'rl-sub', text: T('Neue Sender, Filme und Serien werden vom Anbieter geladen.') });
    var rows = {}, steps = h('div', { class: 'rl-steps' });
    [['live', T('Live TV')], ['movie', T('Filme')], ['series', T('Serien')]].forEach(function (k) {
      var st = h('span', { class: 'rl-st' }, h('i', { class: 'rl-spin' }));
      var r = h('div', { class: 'rl-step k-' + k[0] }, h('span', { class: 'rl-ic' }, icon(k[0])), h('b', { text: k[1] }), st);
      rows[k[0]] = { el: r, st: st };
      steps.appendChild(r);
    });
    var el = h('div', { class: 'rl-screen' }, h('div', { class: 'rl-in' }, logo, title, sub, steps));
    Screens.push('reloading', el, { onBack: function () { return true; } });
    var start = Date.now();
    refreshPlaylist(function (kind, ok, n) {
      var r = rows[kind];
      if (!r) return;
      clear(r.st);
      r.el.classList.add(ok ? 'is-done' : 'is-fail');
      r.st.appendChild(icon(ok ? 'check' : 'close'));
      r.st.appendChild(h('span', { text: ok ? fmtCount(n) : T('Fehler') }));
    }).then(function (res) {
      // Die Animation soll man mindestens einmal ganz sehen
      setTimeout(function () {
        el.classList.add(res.ok ? 'is-finished' : 'is-failed');
        title.lastChild.textContent = res.ok ? T('Alles aktuell!') : T('Aktualisieren hat nicht geklappt');
        sub.textContent = res.ok ? T('Deine Playlist ist auf dem neuesten Stand.') : ((res.error && res.error.message) || T('Bitte prüfe die Internetverbindung und versuche es noch einmal.'));
        setTimeout(function () {
          el.classList.add('is-out');
          setTimeout(function () {
            reloadingNow = false;
            var top = Screens.top();
            if (top && top.el === el) Screens.pop();
            Shell.show('home', true);
          }, 380);
        }, res.ok ? 1400 : 3200);
      }, Math.max(0, 3000 - (Date.now() - start)));
    });
  }
  function refreshPlaylist(onStep) {
    // Läuft gerade eine Aktualisierung für eine ANDERE Playlist, nicht auf deren Ergebnis warten
    if (refreshing && refreshingFor !== pid()) refreshing = null;
    if (refreshing) {
      // läuft schon (z. B. automatisch im Hintergrund): auf das Ergebnis warten und es melden
      return refreshing.then(function (r) {
        var s = Stats.get();
        if (onStep) ['live', 'movie', 'series'].forEach(function (k) { onStep(k, !!s[k], s[k] ? s[k].n : 0); });
        return r;
      });
    }
    var prov = App.provider;
    if (prov.reset) prov.reset();
    searchCache = {}; countCache = {}; EpgCache.data = {};
    var jobs = ['live', 'movie', 'series'].map(function (k) {
      return catCounts(k).then(function (c) { if (onStep) onStep(k, true, c.total); return true; }, function () { if (onStep) onStep(k, false, 0); return false; });
    });
    var acc = prov.login ? prov.login().then(function () { return null; }, function (e) { return e; }) : Promise.resolve(null);
    var mine = refreshingFor = pid();
    var job = refreshing = Promise.all([acc].concat(jobs)).then(function (r) {
      if (refreshing === job) refreshing = null;
      return { error: r[0], ok: r.slice(1).some(function (x) { return x; }), owner: mine };
    });
    return job;
  }
  function ago(ts) {
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return T('gerade eben');
    if (m < 60) return T('vor {0} Min.', m);
    var hrs = Math.round(m / 60);
    if (hrs < 24) return T('vor {0} Std.', hrs);
    var d = Math.round(hrs / 24);
    return d === 1 ? T('vor 1 Tag') : T('vor {0} Tagen', d);
  }
  function catCounts(kind) {
    var owner = pid(), k = owner + kind;
    if (!countCache[k]) {
      countCache[k] = App.provider.items(kind, '__all').then(function (list) {
        var by = {};
        var newest = 0;
        list.forEach(function (x) { var c = String(x.catId); by[c] = (by[c] || 0) + 1; var a = Number(x.added) || 0; if (a > newest) newest = a; });
        // Ergebnis gehört zur Playlist, die beim Start aktiv war (Wechsel während des Ladens → keine falschen Zahlen)
        Stats.set(kind, list.length, newest, owner);
        return { by: by, total: list.length };
      });
      countCache[k].catch(function () { delete countCache[k]; });
    }
    return countCache[k];
  }
  function fmtCount(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, Lang.cur === 'en' ? ',' : '.'); }

  /* ---------- Live TV / Filme / Serien ---------- */
  var lastCat = {}, lastGroup = {};
  function SectionView(kind) {
    var allNames = { live: T('Alle Sender'), movie: T('Alle Filme'), series: T('Alle Serien') };
    var cats = h('div', { class: 'cats' });
    var items = h('div', { class: 'items' }, loader());
    var panel = kind === 'live' ? LivePanel() : null;
    var el = h('div', { class: 'section section-' + kind + ' k-' + kind + ' no-head' },
      h('div', { class: 'section-body' }, cats, items, panel ? panel.el : null));
    var key = pid() + kind;
    var allCat = { id: '__all', name: allNames[kind] };
    // Live TV: eigene Listen „Favoriten“ und „Zuletzt gesehen“ ganz oben
    var extraCats = kind !== 'live' ? [] : [
      { id: '__fav', name: T('Favoriten'), ic: 'heart', local: function () { return Favs.list('live'); } },
      { id: '__recent', name: T('Zuletzt gesehen'), ic: 'history', local: function () { return Recent.list(); } }
    ];
    var groups = null, curGroup = null, activeId = null, req = 0, counts = null, chunker = null;
    // Zahlen hinter Sprachen und Kategorien: bei einer Sprache alle Einträge dieser Sprache, sonst je Kategorie
    function paintCounts() {
      if (!counts) return;
      for (var i = 0; i < cats.children.length; i++) {
        var b = cats.children[i], n = null, slot = b.querySelector('.lc-n');
        if (!slot) continue;
        if (b._group) { n = 0; b._group.cats.forEach(function (c) { n += counts.by[c.id] || 0; }); }
        else if (b._cat && b._cat.local) n = b._cat.local().length;
        else if (b._cat) n = b._cat.id === '__all' ? counts.total : (counts.by[b._cat.id] || 0);
        if (n !== null) slot.textContent = fmtCount(n);
      }
    }

    function inGroup(g, id) { for (var i = 0; i < g.cats.length; i++) if (g.cats[i].id === id) return g.cats[i]; return null; }
    function markActive() {
      for (var i = 0; i < cats.children.length; i++) {
        var b = cats.children[i];
        if (b._cat) b.classList.toggle('is-on', b._cat.id === activeId);
        else if (b._group) b.classList.toggle('is-on', !!inGroup(b._group, activeId));
      }
    }
    function activeButton() {
      for (var i = 0; i < cats.children.length; i++) if (cats.children[i].classList.contains('is-on')) return cats.children[i];
      return null;
    }
    function catBtn(c) {
      var locked = !c.ic && c.id !== '__all' && Parental.isLocked(kind, c);
      var b = h('button', { class: 'cat f has-n' + (c.ic ? ' cat-special' : ''), title: c.full || c.name },
        c.ic ? icon(c.ic) : locked ? h('span', { class: 'cat-ic cat-ic-lock' }, icon('lock')) : catIcon(c.full || c.name),
        h('span', { class: 'cat-name', text: c.name }), h('span', { class: 'lc-n', text: c.local ? String(c.local().length) : '' }));
      b._cat = c;
      b.addEventListener('click', function () { selectCat(c, true); });
      return b;
    }
    function langBtn(g) {
      var b = h('button', { class: 'cat lang-cat f', title: g.name },
        langBadge(g), h('span', { class: 'lc-name', text: g.name }),
        h('span', { class: 'lc-n' }), icon('next'));
      b._group = g;
      b.addEventListener('click', function () { openGroup(g, true); });
      return b;
    }
    // Oberste Ebene: „Alle …“ und die Sprachen
    function showLanguages(focusGroup) {
      curGroup = null; lastGroup[key] = null;
      clear(cats);
      cats.appendChild(catBtn(allCat));
      extraCats.forEach(function (c) { cats.appendChild(catBtn(c)); });
      var focusBtn = null;
      groups.forEach(function (g) { var b = langBtn(g); cats.appendChild(b); if (g === focusGroup) focusBtn = b; });
      markActive(); paintCounts();
      if (focusBtn) { Nav.focus(focusBtn); }
    }
    // Eine Sprache geöffnet: Zurück-Knopf und ihre Kategorien
    function openGroup(g, byUser) {
      curGroup = g; lastGroup[key] = g.key;
      clear(cats);
      var back = h('button', { class: 'cat cat-back f', title: T('Zurück zu den Sprachen') },
        icon('back'), langBadge(g), h('span', { class: 'lc-name', text: g.name }));
      back.addEventListener('click', function () { showLanguages(g); });
      cats.appendChild(back);
      g.cats.forEach(function (c) { cats.appendChild(catBtn(c)); });
      cats.scrollTop = 0;
      markActive(); paintCounts();
      if (byUser) {
        if (!inGroup(g, activeId)) selectCat(g.cats[0], false);
        Nav.focus(activeButton() || cats.children[1] || back);
      }
    }
    el._dispose = function () { req++; if (chunker) { chunker.dispose(); chunker = null; } clear(items); };
    Shell.viewBack = function () {
      if (curGroup && document.body.contains(el)) { showLanguages(curGroup); return true; }
      return false;
    };

    function selectCat(cat, focusList) {
      // Gesperrte Kategorie (Kindersicherung): nur nach PIN – beim automatischen Öffnen stattdessen „Alle“
      if (!cat.local && cat.id !== '__all' && Parental.blocked(kind, cat)) {
        if (focusList) { Parental.ask(function () { selectCat(cat, true); }); return; }
        cat = allCat;
      }
      lastCat[key] = cat.id;
      activeId = cat.id;
      markActive();
      var my = ++req;
      if (chunker) { chunker.dispose(); chunker = null; }
      clear(items).appendChild(loader());
      Shell.setCount(kind, '');
      (cat.local ? Promise.resolve(cat.local()) : cat.id === '__all' ? visibleItems(kind, App.provider.items(kind, cat.id)) : App.provider.items(kind, cat.id)).then(function (list) {
        if (my !== req) return;
        if (kind === 'live' && !cat.local) list = ChanHide.filter(list);
        if (kind === 'live' && cat.id !== '__recent') list = sortChannels(list);
        // „Alle Filme/Serien“: die neuesten zuerst
        if (cat.id === '__all' && kind !== 'live' && some(list, function (x) { return Number(x.added) > 0; })) list = list.slice().sort(byAdded);
        clear(items);
        items.scrollTop = 0;
        Shell.setCount(kind, fmtCount(list.length));
        if (!list.length) {
          items.appendChild(cat.id === '__fav' ? stateBox(T('Noch keine Lieblingssender'), T('Wähle im Player bei einem Sender „Merken“ – dann erscheint er hier.'))
            : cat.id === '__recent' ? stateBox(T('Noch nichts geschaut'), T('Die zuletzt gesehenen Sender erscheinen hier.'))
            : stateBox(T('Keine Einträge'), T('In dieser Kategorie ist gerade nichts enthalten.')));
          return;
        }
        var box = h('div', { class: kind === 'live' ? 'chan-list' : 'poster-grid' });
        items.appendChild(box);
        var rc = chunker = renderChunked(box, items, list, function (it, i) {
          return kind === 'live' ? channelRow(it, function () { playItem(it, { list: list, index: i }); }, panel ? panel.show : null)
            : posterCard(it, function () { openItem(it); });
        });
        // Nach dem App-Start: zuletzt geschauten Sender markieren
        var pf = Shell.pendingFocus;
        if (pf && pf.kind === kind) {
          Shell.pendingFocus = null;
          var at = -1;
          for (var k = 0; k < list.length; k++) if (list[k].id === pf.id) { at = k; break; }
          if (at >= 0) {
            rc.upTo(at);
            if (panel) panel.show(list[at]);
            var target = box.querySelector('[data-idx="' + at + '"]');
            if (target) {
              setTimeout(function () {
                // Liegt schon die Film-/Serienseite darüber, wird der Fokus erst beim Schließen dorthin gesetzt
                var st = Screens.stack, own = null;
                for (var q = 0; q < st.length; q++) if (st[q].el.contains(box)) own = st[q];
                if (own && Screens.top() === own) Nav.focus(target); else if (own) own.lastFocus = target;
              }, 60);
              return;
            }
          }
        }
        if (panel && !panel.current()) panel.show(list[0]);
        if (focusList) Nav.focusFirst(box);
      }, function (e) {
        if (my !== req) return;
        clear(items).appendChild(stateBox(T('Laden fehlgeschlagen'), e.message, T('Erneut versuchen'), function () { selectCat(cat, true); }));
      });
    }

    App.provider.categories(kind).then(function (list) {
      list = visibleCats(kind, list || []);
      var want = lastCat[key], target = null;
      groups = groupCats(list);
      if (!groups) {
        // Keine Sprachen erkannt: alle Kategorien untereinander wie bisher
        var all = [allCat].concat(extraCats, list);
        all.forEach(function (c) { cats.appendChild(catBtn(c)); if (c.id === want) target = c; });
        if (!target) target = kind === 'live' ? (list[0] || allCat) : allCat;
      } else {
        var g = null;
        groups.forEach(function (x) { if (x.key === lastGroup[key]) g = x; });
        if (!g && Shell.pendingFocus && Shell.pendingFocus.kind === kind && want) groups.forEach(function (x) { if (!g && inGroup(x, want)) g = x; });
        if (g) { openGroup(g, false); target = inGroup(g, want) || g.cats[0]; }
        else {
          showLanguages(null);
          if (want === '__all' || (!want && kind !== 'live')) target = allCat;
          else groups.forEach(function (x) { target = target || inGroup(x, want); });
          if (!target) target = groups[0].cats[0];
        }
      }
      selectCat(target, false);
      if (document.activeElement === document.body) Nav.focus(activeButton() || cats.children[0]);
      catCounts(kind).then(function (c) { counts = c; paintCounts(); }).catch(function () {});
    }, function (e) {
      clear(items).appendChild(stateBox(T('Laden fehlgeschlagen'), e.message, T('Erneut versuchen'), function () { Shell.show(kind, true); }));
    });
    return el;
  }

  /* Rechte Spalte bei Live TV: Vorschau (hier dockt der Mini-Player an) und Programm des gewählten Senders */
  function LivePanel() {
    var ph = h('div', { class: 'lp-ph' });
    var box = h('div', { class: 'mini-slot-box' }, ph);
    var name = h('h2', { class: 'lp-name' });
    var arch = h('div', { class: 'lp-arch' });
    var epg = h('div', { class: 'lp-epg' });
    var el = h('aside', { class: 'live-panel' }, box,
      h('p', { class: 'lp-hint', text: T('Denselben Sender noch einmal wählen öffnet das Vollbild.') }), name, arch, epg);
    var cur = null, timer = null;
    function show(item) {
      if (!item || (cur && cur.id === item.id)) return;
      cur = item;
      clear(ph).appendChild(logoBox(item));
      ph.appendChild(h('span', null, icon('play'), T('Zum Abspielen auswählen')));
      name.textContent = item.name;
      clear(arch);
      if (item.archive && App.provider && App.provider.archive) {
        arch.appendChild(h('button', { class: 'btn f', onclick: function () { showArchive(item); } },
          icon('archive'), h('span', { text: T('Verpasste Sendungen') }), h('small', { text: T('{0} Tage', item.archive) })));
      }
      // Sender ausblenden – direkt hier, weil der TV-Player auf Android-Boxen keinen eigenen Knopf dafür hat
      arch.appendChild(h('button', { class: 'btn f lp-hide', title: T('Sender ausblenden'), onclick: function () {
        askHideChannel(item, function () {
          $all('.chan[data-cid]').forEach(function (r) {
            if (r.getAttribute('data-cid') !== String(item.id)) return;
            var nx = r.nextElementSibling || r.previousElementSibling;
            r.classList.add('is-hidden');
            if (nx && nx.classList.contains('chan')) Nav.focus(nx);
          });
        });
      } }, icon('eyeOff'), h('span', { text: T('Ausblenden') })));
      clear(epg);
      clearTimeout(timer);
      timer = setTimeout(function () {
        EpgCache.get(item).then(function (list) { if (cur === item) paint(item, list); });
      }, 250);
    }
    function paint(item, list) {
      clear(epg);
      var t = Date.now() / 1000;
      var now = list.filter(function (e) { return e.start <= t && e.end > t; })[0];
      var next = list.filter(function (e) { return e.start >= (now ? now.end - 1 : t); }).slice(0, 4);
      if (!now && !next.length) { epg.appendChild(h('p', { class: 'hint', text: T('Für diesen Sender gibt es keine Programmdaten.') })); return; }
      if (now) {
        var pct = Math.max(0, Math.min(100, (t - now.start) / (now.end - now.start) * 100));
        epg.appendChild(h('div', { class: 'lp-now' },
          h('span', { class: 'lp-tag', text: T('Jetzt') }), h('b', { text: now.title }),
          h('span', { class: 'lp-time', text: T('{0} – {1}, noch {2} Min.', fmtClock(now.start), fmtClock(now.end), Math.max(1, Math.round((now.end - t) / 60))) }),
          h('div', { class: 'bar' }, h('i', { style: 'width:' + pct + '%' })),
          now.desc ? h('p', { class: 'lp-desc', text: now.desc }) : null));
        // Laufende Sendung auch in der Senderliste anzeigen
        $all('.chan[data-cid]').forEach(function (r) {
          if (r.getAttribute('data-cid') === String(item.id)) { var n = $('.now', r); if (n) n.textContent = now.title; }
        });
      }
      if (next.length) {
        var ul = h('ul', { class: 'lp-next' });
        next.forEach(function (e) { ul.appendChild(h('li', null, h('span', { class: 't', text: fmtClock(e.start) }), h('span', { class: 'n', text: e.title }))); });
        epg.appendChild(ul);
      }
    }
    return { el: el, show: show, current: function () { return cur; } };
  }

  /* ---------- Catch-up: vergangene Sendungen eines Senders, nach Tagen ---------- */
  function archDayLabel(d) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    return diff === 0 ? T('Heute') : diff === 1 ? T('Gestern') : d.toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
  }
  function showArchive(ch) {
    var days = h('div', { class: 'seg arch-days' });
    var list = h('div', { class: 'arch-list' }, h('p', { class: 'hint', text: T('Wird geladen …') }));
    openSheet(T('Verpasste Sendungen') + ': ' + ch.name, 'archive', [days, list], { wide: true });
    function progBtn(e) {
      var now = Date.now() / 1000, running = e.end > now, mins = Math.max(1, Math.round((e.end - e.start) / 60));
      return h('button', { class: 'ch-opt f arch-prog' + (running ? ' is-running' : ''), onclick: function () {
        var it = App.provider.catchup(ch, e);
        goBack();
        setTimeout(function () { playItem(it, { list: [it], index: 0 }); }, 40);
      } },
        h('span', { class: 'arch-time', text: fmtClock(e.start) }),
        h('span', { class: 'ch-txt' }, h('b', { text: e.title || T('Ohne Titel') }),
          h('small', { text: running ? T('Läuft gerade – von Anfang an') : fmtClock(e.start) + ' – ' + fmtClock(e.end) + ' · ' + T('{0} Min.', mins) })),
        h('span', { class: 'arch-go' }, icon('play')));
    }
    App.provider.archive(ch).then(function (progs) {
      clear(list);
      if (!progs || !progs.length) { list.appendChild(h('p', { class: 'hint', text: T('Für diesen Sender gibt es gerade keine Aufzeichnungen.') })); return; }
      var groups = [], byDay = {};
      progs.forEach(function (e) {
        var d = new Date(e.start * 1000), k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
        if (!byDay[k]) { byDay[k] = []; groups.push({ k: k, d: d }); }
        byDay[k].push(e);
      });
      var btns = groups.map(function (g, i) {
        var b = h('button', { class: 'btn f', onclick: function () { pick(i, true); } }, archDayLabel(g.d));
        days.appendChild(b);
        return b;
      });
      function pick(i, focusList) {
        btns.forEach(function (b, j) { b.classList.toggle('is-on', i === j); });
        clear(list);
        byDay[groups[i].k].forEach(function (e) { list.appendChild(progBtn(e)); });
        if (focusList) { var f = $('.f', list); if (f) Nav.focus(f); }
      }
      pick(0, false);
      // auf die neueste Sendung – nach dem Öffnen des Fensters (das setzt den Fokus kurz danach selbst)
      setTimeout(function () {
        var a = document.activeElement, f = $('.f', list);
        if (f && document.body.contains(f) && (!a || a === document.body || days.contains(a) || (a.classList && a.classList.contains('sh-close')))) Nav.focus(f);
      }, 60);
    }, function (err) {
      clear(list).appendChild(h('p', { class: 'error', text: T('Aufzeichnungen konnten nicht geladen werden.') + (err && err.message ? ' ' + err.message : '') }));
    });
  }

  /* ---------- Favoriten ---------- */
  var favTab = null;
  function FavoritesView() {
    var kinds = [['live', T('Sender')], ['movie', T('Filme')], ['series', T('Serien')]];
    if (!favTab) {
      favTab = 'live';
      for (var i = 0; i < kinds.length; i++) if (Favs.list(kinds[i][0]).length) { favTab = kinds[i][0]; break; }
    }
    var seg = h('div', { class: 'seg' });
    var body = h('div', { class: 'fav-body' });
    var btns = kinds.map(function (k) {
      var b = h('button', { class: 'btn f k-' + k[0], onclick: function () { favTab = k[0]; paint(); render(); } },
        icon(k[0]), h('span', { text: k[1] }), h('span', { class: 'count-pill', text: String(Favs.list(k[0]).length) }));
      seg.appendChild(b);
      return [k[0], b];
    });
    function paint() { btns.forEach(function (x) { x[1].classList.toggle('is-on', x[0] === favTab); }); }
    function render() {
      clear(body);
      var list = Favs.list(favTab);
      if (!list.length) {
        body.appendChild(h('div', { class: 'state' }, icon('heart'), h('h3', { text: T('Noch nichts gemerkt') }),
          h('p', { text: T('Wähle bei einem Sender, Film oder einer Serie „Merken“ – dann findest du es hier wieder.') })));
        return;
      }
      var box = h('div', { class: favTab === 'live' ? 'tile-grid' : 'poster-grid' });
      list.forEach(function (it, i) {
        box.appendChild(favTab === 'live' ? chanTile(it, function () { playItem(it, { list: list, index: i }); }) : posterCard(it, function () { openItem(it); }));
      });
      body.appendChild(box);
    }
    paint(); render();
    return h('div', { class: 'page favs' }, h('div', { class: 'page-head' }, h('h1', { text: T('Favoriten') }), seg), body);
  }

  /* ---------- Schnellsuche: Leiste klappt oben links neben der Lupe auf, Treffer erscheinen direkt darunter ---------- */
  var QuickSearch = {
    isOpen: false, el: null, input: null, pop: null, btn: null, timer: null, wired: false,
    build: function (root, btn) {
      var self = this;
      self.btn = self.navBtn = btn;
      self.input = h('input', { class: 'f', type: 'search', placeholder: T('Sender, Filme oder Serien suchen …'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': T('Suche') });
      self.input.addEventListener('input', function () { clearTimeout(self.timer); self.timer = setTimeout(function () { self.run(); }, 350); });
      self.input.addEventListener('keydown', function (e) {
        if (e.keyCode === 13) { var f = self.pop.querySelector('.f'); if (f) { e.preventDefault(); e.stopPropagation(); Nav.focus(f); } }
      });
      self.el = h('div', { class: 'qs is-hidden' }, icon('search'), self.input);
      self.pop = h('div', { class: 'qs-pop is-hidden' });
      root.appendChild(self.el); root.appendChild(self.pop);
      self.isOpen = false;
      if (self.wired) return;
      self.wired = true;
      function outside(t) { return !(self.el.contains(t) || self.pop.contains(t) || (self.btn && self.btn.contains(t))); }
      document.addEventListener('pointerdown', function (e) { if (self.isOpen && outside(e.target)) self.close(true); }, true);
      document.addEventListener('focusin', function (e) { if (self.isOpen && !Dialog.open && outside(e.target)) self.close(true); });
      window.addEventListener('resize', function () { if (self.isOpen) self.place(); });
    },
    place: function () {
      var r = this.btn.getBoundingClientRect(), W = window.innerWidth;
      var rem = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16, hh = 2.8 * rem;
      var navEl = this.btn.closest ? this.btn.closest('.topnav') : null;
      var st = this.el.style, ps = this.pop.style;
      st.left = st.right = ps.left = ps.right = 'auto';
      var nav = navEl ? navEl.getBoundingClientRect() : null;
      if (!nav || !nav.width) {
        // Startbildschirm (ohne Menüleiste): Suchfeld mittig oben
        var head = document.querySelector('.ln-head'), hb = head ? head.getBoundingClientRect().bottom : 0;
        var w = Math.min(40 * rem, W - 24), lx = (W - w) / 2, top = hb ? hb + 0.8 * rem : 1.4 * rem;
        st.left = ps.left = lx + 'px'; st.width = ps.width = w + 'px';
        st.top = top + 'px'; ps.top = (top + hh + 8) + 'px';
        return;
      }
      if (r.left < W * 0.3) {
        // Seitenleiste (Handy quer): Leiste oben im Inhaltsbereich
        var left = nav.right + 12;
        st.left = left + 'px'; st.top = '8px'; st.width = Math.min(30 * rem, W - left - 12) + 'px';
        ps.left = left + 'px'; ps.top = (8 + hh + 8) + 'px'; ps.width = Math.min(40 * rem, W - left - 12) + 'px';
      } else {
        st.right = (W - r.left + 8) + 'px'; st.top = (r.top + (r.height - hh) / 2) + 'px';
        st.width = Math.min(28 * rem, r.left - 20) + 'px';
        ps.top = (nav.bottom + 8) + 'px';
        if (W < 700) { ps.left = '12px'; ps.right = '12px'; ps.width = 'auto'; }
        else { var pr = W - r.left + 8; ps.right = pr + 'px'; ps.width = Math.min(40 * rem, W - pr - 12) + 'px'; }
      }
    },
    open: function (anchor) {
      var self = this;
      self.btn = anchor || self.navBtn;
      self.isOpen = true;
      self.el.classList.remove('is-hidden'); self.pop.classList.remove('is-hidden');
      self.btn.classList.add('is-on');
      self.place();
      self.run();
      setTimeout(function () { Nav.focus(self.input); }, 30);
    },
    close: function (keepFocus) {
      if (!this.isOpen) return;
      this.isOpen = false;
      clearTimeout(this.timer);
      clear(this.pop);
      this.el.classList.add('is-hidden'); this.pop.classList.add('is-hidden');
      this.btn.classList.remove('is-on');
      if (!keepFocus) Nav.focus(this.btn);
    },
    toggle: function (anchor) { if (this.isOpen) this.close(); else this.open(anchor); },
    run: function () {
      var self = this, pop = self.pop, q = norm(self.input.value.trim());
      if (q.length < 2) { clear(pop).appendChild(h('p', { class: 'hint qs-hint', text: T('Gib mindestens zwei Buchstaben ein. Gesucht wird in allen Sendern, Filmen und Serien deiner Playlist.') })); return; }
      clear(pop).appendChild(loader());
      var kinds = ['live', 'movie', 'series'], labels = [T('Sender'), T('Filme'), T('Serien')];
      Promise.all(kinds.map(function (k) { return allItems(k).catch(function () { return []; }); })).then(function (lists) {
        if (!self.isOpen || norm(self.input.value.trim()) !== q) return;
        clear(pop);
        var total = 0;
        lists.forEach(function (list, i) {
          // Normalisierten Namen am Eintrag merken: bei großen Playlists sonst bei jedem Tastendruck zigtausend Mal neu berechnet
          var all = list.filter(function (x) { if (x._n === undefined) x._n = norm(x.name); return x._n.indexOf(q) >= 0; });
          if (!all.length) return;
          total += all.length;
          var hits = all.slice(0, 12), kind = kinds[i];
          var sec = h('section', { class: 'qs-sec k-' + kind }, h('h3', null, icon(kind), h('span', { text: labels[i] }), h('small', { text: String(all.length) })));
          hits.forEach(function (it, j) {
            var thumb = kind === 'live' ? logoBox(it) : h('span', { class: 'qs-poster' }, posterArt(it));
            sec.appendChild(h('button', { class: 'qs-item f', title: it.name, onclick: function () {
              self.close();
              if (kind === 'live') playItem(it, { list: hits, index: j }); else openItem(it);
            } }, thumb, h('span', { class: 'qs-name', text: it.name })));
          });
          pop.appendChild(sec);
        });
        if (!total) pop.appendChild(h('p', { class: 'hint qs-hint', text: T('Nichts gefunden') }));
      });
    }
  };

  function panel(ic, title, kids, cls) {
    return h('div', { class: 'panel' + (cls ? ' ' + cls : '') }, h('h3', null, icon(ic), title), kids);
  }
  /* „Schaust du noch?“ – wie bei Netflix: Wurde lange keine Taste gedrückt und nichts angetippt,
     fragt die App nach. Kommt keine Antwort, stoppt die Wiedergabe – so bleibt der Zugang beim Anbieter frei. */
  var StillWatching = {
    last: Date.now(), timer: null, countdown: null,
    hours: function () { var v = Settings.get('idleHours'); return typeof v === 'number' ? v : 3; },
    touch: function () { StillWatching.last = Date.now(); },
    start: function () {
      var self = this, lastMove = 0;
      ['keydown', 'pointerdown', 'touchstart', 'wheel'].forEach(function (ev) { document.addEventListener(ev, self.touch, true); });
      document.addEventListener('mousemove', function () { var n = Date.now(); if (n - lastMove > 5000) { lastMove = n; self.touch(); } }, true);
      clearInterval(self.timer);
      self.timer = setInterval(function () { self.check(); }, 30000);
    },
    playing: function () { var v = Player.video; return !!(Player.el && v && !v.paused && !v.ended); },
    check: function () {
      var hrs = this.hours();
      if (!hrs || this.countdown || Dialog.open || !this.playing()) return;
      if (Date.now() - this.last >= hrs * 3600000) this.ask();
    },
    ask: function () {
      var self = this, left = 60;
      Dialog.show(T('Schaust du noch?'), T('Die Wiedergabe stoppt in {0} Sekunden, damit dein Zugang nicht unnötig belegt bleibt.', left), [
        { label: T('Wiedergabe beenden'), action: function () { self.stop(false); } },
        { label: T('Weiter schauen'), primary: true }
      ], 'dlg-idle');
      self.countdown = setInterval(function () {
        var box = $('#dialog-layer .dlg-idle');
        if (!box) { clearInterval(self.countdown); self.countdown = null; return; }   // jemand hat reagiert
        left--;
        var p = $('p', box);
        if (p) p.textContent = T('Die Wiedergabe stoppt in {0} Sekunden, damit dein Zugang nicht unnötig belegt bleibt.', left);
        if (left <= 0) self.stop(true);
      }, 1000);
    },
    stop: function (auto) {
      clearInterval(this.countdown); this.countdown = null;
      if (Dialog.open) Dialog.close();
      if (Player.el) Player.close();
      if (auto) toast(T('Wiedergabe beendet – du warst eine Weile nicht aktiv.'), 5000);
    }
  };

  /* „Daten neu laden“: die ganze App startet sichtbar neu und holt alles frisch vom Anbieter */
  function reloadApp() {
    if (Player.el) Player.close();
    document.body.appendChild(h('div', { class: 'reload-screen' },
      h('div', { class: 'brand' }, brandMark(), wordmark()),
      h('div', { class: 'spinner' }),
      h('p', { text: T('Daten werden neu geladen …') })));
    try { sessionStorage.setItem('lumio.reloaded', '1'); } catch (e) {}
    setTimeout(function () { try { location.reload(); } catch (e) {} }, 1200);
  }

  /* ---------- Profil: Zugangsdaten und Gerät (eigene Seite, oben rechts über das Profil-Symbol) ---------- */
  function ProfileView() {
    var p = App.profile;
    function kvBox() { return h('div', { class: 'kv' }); }
    function row(kv, k, v) { if (v === undefined || v === null || v === '') return; kv.appendChild(h('span', { text: k })); kv.appendChild(h('b', { text: String(v) })); }
    var user = profileUser(p);
    var status = h('span', { class: 'hero-status' }, h('i', { class: 'dot' }), h('span', { text: T('Wird geprüft …') }));
    var acc = kvBox();
    row(acc, T('Typ'), p.type === 'xtream' ? T('Xtream Codes') : p.type === 'm3u' ? T('M3U-Playlist') : T('Demo'));
    if (p.type === 'xtream') { row(acc, T('Server'), p.server); row(acc, T('Benutzer'), p.username); }
    if (p.type === 'm3u') { row(acc, T('Benutzer'), user !== p.name ? user : ''); row(acc, T('Playlist'), p.url); }
    App.provider.account().then(function (a) {
      if (!a || a.expires === undefined) { status.lastChild.textContent = T('Verbunden'); return; }
      var days = a.expires ? Math.ceil((Number(a.expires) * 1000 - Date.now()) / 86400000) : null;
      if (days !== null && days <= 0) { status.classList.add('is-off'); status.lastChild.textContent = T('Abgelaufen am {0}', fmtDate(a.expires)); }
      else if (days !== null && days <= 30) { status.classList.add('is-warn'); status.lastChild.textContent = days === 1 ? T('Läuft in 1 Tag ab') : T('Läuft in {0} Tagen ab', days); }
      else status.lastChild.textContent = T('Gültig bis {0}', fmtDate(a.expires));
      row(acc, T('Gültig bis'), fmtDate(a.expires));
      row(acc, T('Status'), a.status);
      if (a.maxCons) row(acc, T('Verbindungen'), T('{0} von {1} aktiv', a.activeCons || 0, a.maxCons));
    }).catch(function () { status.classList.add('is-off'); status.lastChild.textContent = T('Keine Verbindung'); });
    var dev = kvBox();
    function copyRow(k, v, label) { dev.appendChild(h('span', { text: k })); dev.appendChild(h('b', { class: 'kv-copy' }, h('span', { text: v }), copyBtn(v, label))); }
    copyRow(T('MAC-Adresse'), Device.mac(), 'MAC');
    copyRow('KEY', Device.key(), 'KEY');
    var initial = String(p.name || user || 'L').replace(/^\s+/, '').charAt(0).toUpperCase() || 'L';
    var epgPanel = p.type === 'm3u' && App.provider.epgStatus ? epgSettingsPanel(p) : null;
    return h('div', { class: 'page profile-page' },
      h('div', { class: 'page-head' }, h('h1', { text: T('Profil') })),
      h('div', { class: 'profile-card' },
        h('span', { class: 'avatar', text: initial }),
        h('div', { class: 'pc-txt' }, h('h2', { text: p.name }), user && user !== p.name ? h('p', { text: user }) : null, status),
        h('div', { class: 'row' },
          h('button', { class: 'btn f primary', onclick: showProfiles, 'data-autofocus': true }, icon('profile'), h('span', { text: T('Playlist wechseln') })),
          h('button', { class: 'btn f', onclick: reloadApp }, icon('restart'), h('span', { text: T('Daten neu laden') })))),
      h('div', { class: 'settings-grid' },
        panel('live', T('Zugang'), [acc]),
        panel('phone', T('Dieses Gerät'), [dev, h('p', { class: 'hint', text: T('Mit MAC-Adresse und KEY kannst du Playlists per Handy oder über die Webseite auf dieses Gerät schicken.') }),
          Cloud.mode === 'token' ? h('div', { class: 'row' }, h('button', { class: 'btn f', onclick: rotateKey }, icon('restart'), h('span', { text: T('Neuen KEY erzeugen') }))) : null]),
        epgPanel));
  }

  /* Neuen KEY erzeugen: Wer den alten kennt (z. B. von einem Foto des Bildschirms), kommt nicht mehr an die Playlists */
  function rotateKey() {
    confirmBox(T('Neuen KEY erzeugen?'), T('Der alte KEY funktioniert danach nicht mehr – auch nicht auf der Webseite. Deine Playlists bleiben erhalten.'), T('Neuen KEY erzeugen'), function () {
      var nk = Device.newKey();
      Cloud.rpc('app_rotate_key', { p_mac: Device.mac(), p_token: Device.token(), p_new_key: nk }).then(function (r) {
        if (!r || !r.ok) { toast(T('KEY konnte nicht erneuert werden.'), 3000); return; }
        Store.set('devkey', nk);
        toast(T('Neuer KEY: {0}', nk), 3000);
        setTimeout(function () { location.reload(); }, 1600);   // KEY steht an mehreren Stellen (Fußleiste, QR-Code)
      }, function () { toast(T('KEY konnte nicht erneuert werden.'), 3000); });
    });
  }

  /* Profil (nur M3U): Programmführer – Stand anzeigen, Adresse ändern, neu laden */
  function epgSettingsPanel(p) {
    var kv = h('div', { class: 'kv' }), state = h('p', { class: 'hint' });
    var prov = App.provider;
    function paint() {
      var s = prov.epgStatus();
      clear(kv);
      kv.appendChild(h('span', { text: T('Quelle') }));
      kv.appendChild(h('b', { class: 'kv-url', text: s.sources.length ? s.sources.join(', ') : T('keine') }));
      kv.appendChild(h('span', { text: T('Herkunft') }));
      kv.appendChild(h('b', { text: s.own ? T('selbst eingetragen') : s.sources.length ? T('aus der Playlist') : '–' }));
      state.classList.toggle('error', s.state === 'error');
      state.textContent = s.state === 'ok' ? T('{0} Sender mit Programmdaten · geladen {1}', fmtCount(s.channels || 0), fmtDate(s.at / 1000) + ' ' + fmtClock(s.at / 1000))
        : s.state === 'loading' ? T('Programmführer wird geladen …')
        : s.state === 'error' ? T('Programmführer konnte nicht geladen werden: {0}', s.error || '')
        : s.state === 'none' ? T('Deine Playlist bringt keinen Programmführer mit. Trage eine EPG-Adresse ein, wenn dein Anbieter eine hat.')
        : T('Wird automatisch geladen, sobald du Live TV öffnest.');
    }
    function reload() {
      EpgCache.data = {};
      var pr = prov.epgReload();
      paint();
      pr.then(function (E) {
        paint();
        if (E && !E.none) toast(T('Programmführer geladen: {0} Sender', fmtCount(E.channels || 0)), 3000);
      }, function (e) { paint(); toast(T('Programmführer konnte nicht geladen werden: {0}', e.message), 5000); });
    }
    function edit() {
      var f = inputField(T('EPG-Adresse (XMLTV)'), 'http://…/epg.xml', 'url');
      f.input.value = p.epgUrl || '';
      f.input.setAttribute('data-autofocus', '');
      var err = h('div', { class: 'error' });
      function save(val) {
        val = String(val || '').trim();
        if (val && !/^https?:\/\//i.test(val)) { err.textContent = T('Bitte eine gültige EPG-Adresse (http:// oder https://) eingeben oder das Feld leer lassen.'); return; }
        var list = Profiles.list(), x = list.filter(function (q) { return q.id === p.id; })[0];
        if (val) p.epgUrl = val; else delete p.epgUrl;
        if (x) { if (val) x.epgUrl = val; else delete x.epgUrl; Profiles.save(list); }
        goBack();
        reload();
      }
      f.input.addEventListener('keydown', function (e) { if (e.keyCode === 13) save(f.input.value); });
      openSheet(T('EPG-Adresse'), 'clock', [
        h('p', { class: 'hint', text: T('Adresse einer XMLTV-Datei (.xml oder .xml.gz) von deinem Anbieter. Leer lassen, um die Adresse aus der Playlist zu verwenden.') }),
        f.wrap, err,
        h('div', { class: 'row' },
          sheetBtn('check', T('Speichern'), function () { save(f.input.value); }, 'primary'),
          p.epgUrl ? sheetBtn('restart', T('Adresse aus der Playlist verwenden'), function () { save(''); }) : null)]);
    }
    paint();
    return panel('clock', T('Programmführer (EPG)'), [kv, state,
      h('div', { class: 'row' },
        h('button', { class: 'btn f', onclick: edit }, icon('settings'), h('span', { text: T('EPG-Adresse ändern') })),
        h('button', { class: 'btn f', onclick: reload }, icon('refresh'), h('span', { text: T('Jetzt neu laden') })))]);
  }

  /* ==========================================================
     Einstellungen
     Große Kacheln wie bei TV-Boxen üblich. Jede Kachel öffnet ein Fenster mit den Möglichkeiten.
     ========================================================== */
  // Ein Einstellungs-Fenster (Pop-up) mit Symbol, Titel, Inhalt und „Schließen“
  function openSheet(title, ic, body, opts) {
    opts = opts || {};
    var panel = h('div', { class: 'modal-panel set-sheet' + (opts.wide ? ' is-wide' : '') },
      h('div', { class: 'sh-head' }, h('span', { class: 'sh-ic' }, icon(ic)), h('h2', { text: title }),
        h('button', { class: 'sh-close f', title: T('Schließen'), 'aria-label': T('Schließen'), onclick: goBack }, icon('close'))),
      h('div', { class: 'sh-body' }, body));
    // Fokus auf den ersten Knopf im Inhalt (nicht auf „Schließen“)
    var body = panel.lastChild;
    if (!$('[data-autofocus]', body)) { var first = $('.f', body); if (first) first.setAttribute('data-autofocus', ''); }
    Screens.push('sheet', h('div', { class: 'modal set-modal' }, h('div', { class: 'modal-backdrop', onclick: goBack }), panel), { overlay: true, onLeave: opts.onClose });
    return panel;
  }
  // Auswahl als Liste großer Knöpfe mit Häkchen – gut mit der Fernbedienung
  function choiceList(options, get, set) {
    var box = h('div', { class: 'choice' });
    var btns = options.map(function (o) {
      var b = h('button', { class: 'ch-opt f', onclick: function () { set(o[0]); paint(); } },
        o[3] || null,
        h('span', { class: 'ch-txt' }, h('b', { text: o[1] }), o[2] ? h('small', { text: o[2] }) : null),
        h('span', { class: 'ch-mark' }, icon('check')));
      box.appendChild(b);
      return [o[0], b];
    });
    function paint() {
      var v = get();
      btns.forEach(function (x) {
        var on = x[0] === v;
        x[1].classList.toggle('is-on', on);
        if (on) x[1].setAttribute('data-autofocus', ''); else x[1].removeAttribute('data-autofocus');
      });
    }
    paint();
    return box;
  }
  // Schalter An/Aus als großer Knopf
  function toggleRow(label, hint, get, set) {
    var b = h('button', { class: 'ch-opt ch-toggle f', role: 'switch' },
      h('span', { class: 'ch-txt' }, h('b', { text: label }), hint ? h('small', { text: hint }) : null),
      h('span', { class: 'switch' }, h('i')));
    function paint() { var on = !!get(); b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
    b.onclick = function () { set(!get()); paint(); };
    paint();
    return b;
  }
  function sheetBtn(ic, label, onClick, cls) {
    return h('button', { class: 'btn f' + (cls ? ' ' + cls : ''), onclick: onClick }, icon(ic), h('span', { text: label }));
  }

  /* ---------- Kategorien ausblenden / sperren (pro Playlist gespeichert) ---------- */
  var CatPrefs = {
    key: function () { return 'cats.' + pid(); },
    all: function () { return Store.get(this.key(), {}); },
    map: function (kind, mode) { var a = this.all(); return (a[mode] && a[mode][kind]) || {}; },
    is: function (kind, mode, id) { return !!this.map(kind, mode)[String(id)]; },
    save: function (a) { Store.set(this.key(), a); searchCache = {}; },
    set: function (kind, mode, id, on) {
      var a = this.all(); a[mode] = a[mode] || {};
      var m = a[mode][kind] = a[mode][kind] || {};
      if (on) m[String(id)] = 1; else delete m[String(id)];
      this.save(a);
    },
    setAll: function (kind, mode, list, on) {
      var a = this.all(), m = {};
      a[mode] = a[mode] || {};
      if (on) list.forEach(function (c) { m[String(c.id)] = 1; });
      a[mode][kind] = m;
      this.save(a);
    },
    count: function (kind, mode) { return Object.keys(this.map(kind, mode)).length; },
    // eigene Namen: { id: 'Name' }
    names: function (kind) { var a = this.all(); return (a.name && a.name[kind]) || {}; },
    setName: function (kind, id, name) {
      var a = this.all(); a.name = a.name || {}; var m = a.name[kind] = a.name[kind] || {};
      name = String(name || '').trim().slice(0, 60);
      if (name) m[String(id)] = name; else delete m[String(id)];
      this.save(a);
    },
    // oben angeheftet, in dieser Reihenfolge: [id, id, …]
    pins: function (kind) { var a = this.all(); return (a.pin && a.pin[kind]) || []; },
    togglePin: function (kind, id) {
      var a = this.all(); a.pin = a.pin || {}; var l = (a.pin[kind] || []).slice(), i = l.indexOf(String(id));
      if (i >= 0) l.splice(i, 1); else l.push(String(id));
      a.pin[kind] = l; this.save(a);
      return i < 0;
    }
  };
  // Kategorien, die man sehen soll: ausgeblendete fallen weg, eigene Namen, angeheftete zuerst.
  // orig = Originalname – die Kindersicherung prüft immer diesen (Umbenennen hebt keine Sperre auf).
  function visibleCats(kind, list) {
    var hid = CatPrefs.map(kind, 'hide'), names = CatPrefs.names(kind), pins = CatPrefs.pins(kind);
    var out = (list || []).filter(function (c) { return !hid[String(c.id)]; }).map(function (c) {
      var nn = names[String(c.id)];
      if (!nn) return c;
      var o = {}; for (var k in c) if (c.hasOwnProperty(k)) o[k] = c[k];
      o.orig = c.orig || c.name; o.name = nn;
      return o;
    });
    if (!pins.length) return out;
    var pos = {}; pins.forEach(function (id, i) { pos[id] = i; });
    return out.map(function (c, i) { return [c, i]; }).sort(function (x, y) {
      var a = pos[String(x[0].id)], b = pos[String(y[0].id)];
      if (a !== undefined || b !== undefined) return a === undefined ? 1 : b === undefined ? -1 : a - b;
      return x[1] - y[1];
    }).map(function (x) { return x[0]; });
  }
  // Einträge aus ausgeblendeten und (noch) gesperrten Kategorien aus „Alle …“ und der Suche entfernen
  function blockedMap(kind) {
    var hid = CatPrefs.map(kind, 'hide'), lockOn = Parental.on() && !Parental.unlocked;
    if (!Object.keys(hid).length && !lockOn) return Promise.resolve(null);
    return App.provider.categories(kind).then(function (cats) {
      var m = {}, n = 0;
      (cats || []).forEach(function (c) { if (hid[String(c.id)] || (lockOn && Parental.isLocked(kind, c))) { m[String(c.id)] = 1; n++; } });
      return n ? m : null;
    }, function () { return null; });
  }
  function visibleItems(kind, p) {
    return Promise.all([p, blockedMap(kind)]).then(function (r) {
      var bad = r[1], list = bad ? r[0].filter(function (x) { return !bad[String(x.catId)]; }) : r[0];
      return kind === 'live' ? ChanHide.filter(list) : list;
    });
  }
  function askHideChannel(it, done) {
    Dialog.show(T('Sender ausblenden?'), T('„{0}“ erscheint dann nicht mehr in den Senderlisten. Wieder einblenden: Einstellungen → Ausgeblendete Sender.', it.name),
      [{ label: T('Abbrechen') }, { label: T('Ausblenden'), primary: true, action: function () { ChanHide.set(it, true); toast(T('„{0}“ ausgeblendet', it.name)); if (done) done(); } }]);
  }
  /* Einzelne Sender ausblenden (pro Playlist): { id: Name } – Favoriten und „Zuletzt gesehen“ bleiben unberührt */
  var ChanHide = {
    key: function () { return 'hidech.' + pid(); },
    all: function () { return Store.get(this.key(), {}); },
    has: function (item) { return !!this.all()[String(item.id)]; },
    set: function (item, on) {
      var a = this.all();
      if (on) a[String(item.id)] = item.name || ''; else delete a[String(item.id)];
      Store.set(this.key(), a); searchCache = {};
    },
    count: function () { return Object.keys(this.all()).length; },
    filter: function (list) {
      var a = this.all();
      if (!Object.keys(a).length) return list;
      return (list || []).filter(function (x) { return !a[String(x.id)]; });
    }
  };

  /* ---------- Kindersicherung: Kategorien mit PIN sperren ---------- */
  var ADULT_RE = /(^|[^0-9A-Za-zÀ-ɏ])(XXX|ADULTS?|18\+|\+18|PORNO?|EROTI[CK]|EROTIK|SEX|SEXY|PLAYBOY|BRAZZERS|FOR ADULTS)($|[^0-9A-Za-zÀ-ɏ])/i;
  var Parental = {
    unlocked: false,
    on: function () { return !!Settings.get('parentPin'); },
    hash: function (p) { return pinHash('parent:' + p); },
    adult: function () { return Settings.get('lockAdult') !== false; },
    isAdult: function (c) { return ADULT_RE.test(String(c.orig || c.full || c.name || '')); },
    isLocked: function (kind, c) { return this.on() && (CatPrefs.is(kind, 'lock', c.id) || (this.adult() && this.isAdult(c))); },
    blocked: function (kind, c) { return !this.unlocked && this.isLocked(kind, c); },
    // PIN abfragen. keep: true = nur für die Einstellungen, Inhalte bleiben gesperrt
    ask: function (onOk, opts) {
      var self = this;
      opts = opts || {};
      var err = h('div', { class: 'error' });
      var pad = pinPad(function (v) {
        var w = PinGuard.wait('parent');
        if (w) { err.textContent = PinGuard.msg(w); return; }
        if (self.hash(v) !== Settings.get('parentPin')) {
          var left = PinGuard.fail('parent');
          err.textContent = left ? PinGuard.msg(left) : T('Falsche PIN.');
          return;
        }
        PinGuard.ok('parent');
        if (!opts.keep) self.unlocked = true;
        Screens.pop();
        setTimeout(onOk, 40);
      });
      var panel = h('div', { class: 'modal-panel pin-panel' },
        h('div', { class: 'sh-head' }, h('span', { class: 'sh-ic' }, icon('lock')), h('h2', { text: T('Kindersicherung') }),
          h('button', { class: 'sh-close f', title: T('Schließen'), 'aria-label': T('Schließen'), onclick: goBack }, icon('close'))),
        h('div', { class: 'sh-body' }, h('p', { class: 'hint', text: opts.text || T('Dieser Bereich ist gesperrt. Bitte gib die PIN ein.') }), pad.el, err));
      Screens.push('pin', h('div', { class: 'modal set-modal' }, h('div', { class: 'modal-backdrop', onclick: goBack }), panel), { overlay: true, onLeave: pad.stop });
    }
  };
  // Zahlenfeld für die 4-stellige PIN: mit der Fernbedienung, per Fingertipp oder mit den Zifferntasten
  function pinPad(onDone) {
    var val = '', dots = h('div', { class: 'pin-dots' });
    function paint() { clear(dots); for (var i = 0; i < 4; i++) dots.appendChild(h('i', { class: i < val.length ? 'on' : '' })); }
    function press(d) {
      if (val.length >= 4) return;
      val += d; paint();
      if (val.length === 4) { var v = val; val = ''; setTimeout(paint, 180); onDone(v); }
    }
    function del() { val = val.slice(0, -1); paint(); }
    var grid = h('div', { class: 'pin-pad' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'clr'].forEach(function (k, i) {
      var b = k === 'del' ? h('button', { class: 'pin-key f', title: T('Löschen'), 'aria-label': T('Löschen'), onclick: del }, icon('back'))
        : k === 'clr' ? h('button', { class: 'pin-key pin-c f', onclick: function () { val = ''; paint(); } }, 'C')
        : h('button', { class: 'pin-key f', 'data-autofocus': i === 4 ? true : null, onclick: function () { press(k); } }, k);
      grid.appendChild(b);
    });
    function onKey(e) {
      var c = e.keyCode;
      if ((c >= 48 && c <= 57) || (c >= 96 && c <= 105)) { press(String(c >= 96 ? c - 96 : c - 48)); e.preventDefault(); e.stopPropagation(); }
      else if (c === 8) { del(); e.preventDefault(); e.stopPropagation(); }
    }
    window.addEventListener('keydown', onKey, true);
    paint();
    return { el: h('div', { class: 'pin-box' }, dots, grid), stop: function () { window.removeEventListener('keydown', onKey, true); } };
  }
  // Neue PIN festlegen (zweimal eingeben)
  function setParentPin(done) {
    var first = null, title = h('p', { class: 'hint', text: T('Wähle eine 4-stellige PIN.') }), err = h('div', { class: 'error' });
    var pad = pinPad(function (v) {
      if (first === null) { first = v; title.textContent = T('Bitte die PIN noch einmal eingeben.'); err.textContent = ''; return; }
      if (v !== first) { first = null; title.textContent = T('Wähle eine 4-stellige PIN.'); err.textContent = T('Die PINs stimmen nicht überein.'); return; }
      Settings.set('parentPin', Parental.hash(v));
      Parental.unlocked = false;
      Screens.pop();
      toast(T('Kindersicherung ist an'));
      setTimeout(done, 40);
    });
    var panel = h('div', { class: 'modal-panel pin-panel' },
      h('div', { class: 'sh-head' }, h('span', { class: 'sh-ic' }, icon('lock')), h('h2', { text: T('PIN festlegen') }),
        h('button', { class: 'sh-close f', title: T('Schließen'), 'aria-label': T('Schließen'), onclick: goBack }, icon('close'))),
      h('div', { class: 'sh-body' }, title, pad.el, err));
    Screens.push('pin', h('div', { class: 'modal set-modal' }, h('div', { class: 'modal-backdrop', onclick: goBack }), panel), { overlay: true, onLeave: pad.stop });
  }

  // Liste der Kategorien zum Ausblenden (mode 'hide') oder Sperren (mode 'lock')
  function catPicker(kind, mode) {
    var box = h('div', { class: 'cat-pick' }, loader());
    App.provider.categories(kind).then(function (list) {
      clear(box);
      list = list || [];
      if (!list.length) { box.appendChild(h('p', { class: 'hint', text: T('Keine Kategorien gefunden.') })); return; }
      var hide = mode === 'hide', painters = [], cnt = h('p', { class: 'hint cp-count' });
      function paintCount() {
        var n = CatPrefs.count(kind, mode);
        cnt.textContent = hide ? (n ? T('{0} von {1} ausgeblendet', n, list.length) : T('Alle {0} Kategorien sind sichtbar.', list.length))
          : (n ? T('{0} von {1} gesperrt', n, list.length) : T('Keine Kategorie von Hand gesperrt.'));
      }
      function paintAll() { painters.forEach(function (f) { f(); }); paintCount(); }
      box.appendChild(h('div', { class: 'row' },
        sheetBtn(hide ? 'eye' : 'check', hide ? T('Alle einblenden') : T('Alle entsperren'), function () { CatPrefs.setAll(kind, mode, list, false); paintAll(); }),
        sheetBtn(hide ? 'eyeOff' : 'lock', hide ? T('Alle ausblenden') : T('Alle sperren'), function () { CatPrefs.setAll(kind, mode, list, true); paintAll(); })));
      box.appendChild(cnt);
      var rows = h('div', { class: 'cp-list' });
      list.forEach(function (c) {
        var r = langOf(c.name);
        var st = h('span', { class: 'cp-state' }), nm = h('span', { class: 'cp-name', text: c.name });
        var b = h('button', { class: 'cp-row f', title: c.name },
          r ? langBadge({ key: r.g, name: T(LANG_NAMES[r.g]), code: r.g.toUpperCase() }) : null,
          catIcon(c.name), nm, st);
        var auto = !hide && Parental.adult() && Parental.isAdult(c);
        // Verwalten: zusätzlich „oben anheften“ (Stern) und „umbenennen“ (Stift) – nur beim Ausblenden, nicht bei der Kindersicherung
        var pinB = hide ? h('button', { class: 'cp-act f', title: T('Oben anheften'), 'aria-label': T('Oben anheften'), onclick: function () {
          toast(CatPrefs.togglePin(kind, c.id) ? T('„{0}“ steht jetzt oben.', c.name) : T('„{0}“ ist nicht mehr angeheftet.', c.name)); paint();
        } }) : null;
        var renB = hide ? h('button', { class: 'cp-act f', title: T('Umbenennen'), 'aria-label': T('Umbenennen'), onclick: function () { renameCat(kind, c, paint); } }, icon('pencil')) : null;
        function paint() {
          var on = CatPrefs.is(kind, mode, c.id) || auto;
          b.classList.toggle('is-on', on);
          clear(st);
          st.appendChild(icon(hide ? (on ? 'eyeOff' : 'eye') : (on ? 'lock' : 'check')));
          st.appendChild(h('span', { text: hide ? (on ? T('Ausgeblendet') : T('Sichtbar')) : auto ? T('18+ gesperrt') : (on ? T('Gesperrt') : T('Frei')) }));
          if (!hide) return;
          var own = CatPrefs.names(kind)[String(c.id)], pinned = CatPrefs.pins(kind).indexOf(String(c.id)) >= 0;
          nm.textContent = own || c.name;
          b.title = own ? own + ' (' + c.name + ')' : c.name;
          clear(pinB).appendChild(icon(pinned ? 'starFill' : 'star'));
          pinB.classList.toggle('is-on', pinned);
          renB.classList.toggle('is-on', !!own);
        }
        b.onclick = function () {
          if (auto) { toast(T('Wird automatisch gesperrt (Erwachsenen-Inhalte).'), 3500); return; }
          CatPrefs.set(kind, mode, c.id, !CatPrefs.is(kind, mode, c.id)); paint(); paintCount();
        };
        paint(); painters.push(paint);
        if (!rows.firstChild) b.setAttribute('data-autofocus', '');
        rows.appendChild(hide ? h('div', { class: 'cp-line' }, b, pinB, renB) : b);
      });
      box.appendChild(rows);
      paintCount();
      // Liste kam später: Fokus vom „Schließen“-Knopf in die Liste holen
      var ae = document.activeElement;
      if (document.body.contains(box) && (!ae || ae === document.body || (ae.classList && ae.classList.contains('sh-close')))) Nav.focus($('.cp-row', rows) || $('.f', box));
    }, function (e) { clear(box).appendChild(h('p', { class: 'error', text: e.message })); });
    return box;
  }
  var KIND_LABEL = function (kind) { return kind === 'live' ? T('Live TV') : kind === 'movie' ? T('Filme') : T('Serien'); };
  function hideCatsSheet(kind) {
    openSheet(T('{0}: Kategorien verwalten', KIND_LABEL(kind)), 'eyeOff',
      [h('p', { class: 'hint', text: T('Antippen blendet eine Kategorie aus oder ein. Mit dem Stern kommt sie ganz nach oben, mit dem Stift bekommt sie einen eigenen Namen.') }), catPicker(kind, 'hide')],
      { wide: true, onClose: function () { paintSettings(); searchCache = {}; } });
  }
  // Eigener Name für eine Kategorie (leer = Originalname)
  function renameCat(kind, c, done) {
    var f = inputField(T('Name'), c.name, 'text');
    f.input.value = CatPrefs.names(kind)[String(c.id)] || c.name;
    f.input.setAttribute('maxlength', '60');
    f.input.setAttribute('data-autofocus', '');
    function save(v) { CatPrefs.setName(kind, c.id, String(v).trim() === c.name ? '' : v); goBack(); if (done) setTimeout(done, 40); }
    f.input.addEventListener('keydown', function (e) { if (e.keyCode === 13) save(f.input.value); });
    openSheet(T('Umbenennen'), 'pencil', [
      h('p', { class: 'hint', text: T('Original: {0}', c.name) }), f.wrap,
      h('div', { class: 'row' }, sheetBtn('check', T('Speichern'), function () { save(f.input.value); }, 'primary'),
        sheetBtn('restart', T('Originalname'), function () { save(''); }))]);
  }

  /* ---------- Verlauf löschen ---------- */
  function clearHistory(kind) {
    if (kind === 'live') { Store.del('recent.' + pid()); }
    else {
      var want = kind === 'movie' ? 'movie' : 'episode';
      var r = Resume.all();
      Object.keys(r).forEach(function (k) { if (r[k].item && r[k].item.kind === want) delete r[k]; });
      Store.set('resume.' + pid(), r);
      var s = Seen.all();
      Object.keys(s).forEach(function (k) { if (k.indexOf(want + ':') === 0) delete s[k]; });
      Store.set('seen.' + pid(), s);
    }
    var l = Last.get();
    if (l && l.item && (l.item.kind === kind || (kind === 'series' && l.item.kind === 'series'))) Store.del('last.' + pid());
  }
  function askClearHistory(kind) {
    var txt = kind === 'live' ? T('„Zuletzt gesehen“ bei Live TV wird geleert.')
      : kind === 'movie' ? T('„Weiterschauen“ und „Zuletzt geschaut“ für Filme werden geleert.')
      : T('„Weiterschauen“, gesehene Folgen und „Zuletzt geschaut“ für Serien werden geleert.');
    confirmBox(T('{0}: Verlauf löschen?', KIND_LABEL(kind)), txt, T('Löschen'), function () { clearHistory(kind); toast(T('Verlauf gelöscht')); });
  }

  /* ---------- Sender sortieren ---------- */
  function sortChannels(list) {
    var m = Settings.get('chanSort') || 'default';
    if (m === 'default') return list;
    var a = list.slice();
    if (m === 'num') a.sort(function (x, y) { return (Number(x.num) || 1e9) - (Number(y.num) || 1e9); });
    else {
      a.sort(function (x, y) { return String(x.name || '').localeCompare(String(y.name || ''), undefined, { numeric: true, sensitivity: 'base' }); });
      if (m === 'za') a.reverse();
    }
    return a;
  }

  /* ---------- Untertitel: Größe, Farbe, Hintergrund (eingebauter Player und TV-Player) ---------- */
  var SUB_SIZES = { s: 0.8, m: 1, l: 1.3, xl: 1.65 };
  var SubStyle = {
    get: function () { return { size: Settings.get('subSize') || 'm', color: Settings.get('subColor') || 'white', bg: Settings.get('subBg') || 'none' }; },
    apply: function () {
      var s = this.get(), el = document.getElementById('sub-style');
      if (!el) { el = document.createElement('style'); el.id = 'sub-style'; document.head.appendChild(el); }
      el.textContent = 'video::cue{font-size:' + (4.4 * (SUB_SIZES[s.size] || 1)).toFixed(2) + 'vh;line-height:1.25;color:' + (s.color === 'yellow' ? '#ffe24a' : '#fff') +
        ';background-color:' + (s.bg === 'black' ? '#000' : s.bg === 'half' ? 'rgba(0,0,0,.6)' : 'transparent') +
        ';text-shadow:' + (s.bg === 'none' ? '0 0 4px #000,0 0 2px #000,0 1px 2px #000' : 'none') + '}';
    },
    native: function () {
      var s = this.get();
      return { subScale: SUB_SIZES[s.size] || 1, subColor: s.color === 'yellow' ? '#FFFFE24A' : '#FFFFFFFF', subBg: s.bg === 'black' ? '#FF000000' : s.bg === 'half' ? '#99000000' : '#00000000' };
    }
  };

  /* ---------- Externer Player (Android): VLC, MX Player, Just Player oder Auswahl ---------- */
  var EXT_PLAYERS = { vlc: ['org.videolan.vlc'], mx: ['com.mxtech.videoplayer.ad', 'com.mxtech.videoplayer.pro'], just: ['com.brouken.player'] };
  var EXT_NAMES = { vlc: 'VLC', mx: 'MX Player', just: 'Just Player' };
  function extPlayerOn() { var e = Settings.get('extPlayer'); return !!(e && e !== 'off' && Platform.android && NativePlayer.plugin()); }
  function playExternal(item) {
    var pl = NativePlayer.plugin(), e = Settings.get('extPlayer'), s = App.provider.streamUrl(item);
    var title = item.kind === 'episode' ? (item.seriesName ? item.seriesName + ' – ' : '') + 'S' + item.season + ' E' + item.num : item.name;
    var pk = (EXT_PLAYERS[e] || []).slice();
    if (item.kind === 'live') Recent.push(item);
    Last.set(item);
    function chooser() {
      return pl.openExternal({ url: s.url, type: 'video/*', title: title }).catch(function () { toast(T('Kein passender Player gefunden.'), 4000); });
    }
    function next() {
      var p = pk.shift();
      if (!p) return chooser();
      return pl.openExternal({ url: s.url, type: 'video/*', pkg: p, title: title }).catch(function () {
        if (pk.length) return next();
        toast(T('{0} ist nicht installiert. Bitte zuerst aus dem App-Store laden.', EXT_NAMES[e]), 5000);
        return chooser();
      });
    }
    next();
  }

  /* ---------- Uhrzeit: 24 Stunden oder 12 Stunden (AM/PM) ---------- */
  function clockStr(d) {
    var hh = d.getHours(), mm = d.getMinutes(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
    if (Settings.get('clock12')) return (hh % 12 || 12) + ':' + p(mm) + ' ' + (hh < 12 ? 'AM' : 'PM');
    return p(hh) + ':' + p(mm);
  }

  /* ---------- App-Updates: neue Version bei GitHub prüfen ---------- */
  var Updates = {
    tag: function () { return /Electron/.test(UA) ? 'pc' : 'neueste'; },
    possible: function () { return /Electron/.test(UA) || (Platform.capacitor && Platform.android); },
    newer: function (a, b) {
      var x = String(a).split('.'), y = String(b).split('.');
      for (var i = 0; i < 3; i++) { var d = (Number(x[i]) || 0) - (Number(y[i]) || 0); if (d) return d > 0; }
      return false;
    },
    cached: function () { var u = Store.get('update', null); return u && u.v && this.newer(u.v, CONFIG.version) ? u.v : null; },
    check: function () {
      var self = this;
      return fetch('https://api.github.com/repos/Splix66/lumio-player/releases/tags/' + self.tag(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) {
          var m = /(\d+\.\d+\.\d+)/.exec(j && j.name || '');
          var v = m ? m[1] : null;
          Store.set('update', { v: v, at: Date.now() });
          return v && self.newer(v, CONFIG.version) ? v : null;
        });
    },
    // einmal am Tag still im Hintergrund nachsehen
    daily: function () {
      if (!this.possible()) return;
      var u = Store.get('update', null);
      if (u && Date.now() - u.at < 86400000) return;
      this.check().then(function (v) { if (v) toast(T('Neue Version {0} verfügbar – Einstellungen → Über & Updates', v), 6000); }).catch(function () {});
    },
    url: function () {
      var base = 'https://github.com/Splix66/lumio-player/releases/download/';
      if (/Electron/.test(UA)) return base + 'pc/' + (/Mac/.test(UA) ? 'lumio-player-mac.dmg' : 'lumio-player-setup.exe');
      return base + 'neueste/lumio-player.apk';
    },
    download: function () {
      var url = this.url(), pl = NativePlayer.plugin();
      if (pl && pl.openExternal) {
        pl.openExternal({ url: url }).catch(function () {
          Dialog.show(T('Neue Version laden'), T('Auf diesem Gerät gibt es keinen Browser. Öffne die App „Downloader“ und gib den Code 5619512 ein.'), [{ label: T('OK'), primary: true }]);
        });
        return;
      }
      try { window.open(url, '_blank'); } catch (e) {}
    }
  };

  var LANG_FLAG = { de: 'de', en: 'en', tr: 'tr', pl: 'pl', ru: 'ru', ar: 'ar', uk: 'ua', ro: 'ro', it: 'it', el: 'gr', ku: 'ku', hr: 'yu', es: 'es', fr: 'fr' };
  function flagFor(lang) { return FLAGS[LANG_FLAG[lang]] ? langBadge({ key: LANG_FLAG[lang], name: lang }) : null; }

  /* Die Kachel-Seite. paintSettings() frischt die kleinen Werte unter den Kacheln auf. */
  var settingsPaint = null;
  function paintSettings() { if (settingsPaint) settingsPaint(); }

  /* ---------- Problem melden ----------
     Geht über denselben Weg wie das Support-Formular der Webseite (send_support) und erscheint im Verwaltungsbereich.
     Technische Angaben nur, wenn eingeschaltet – nie Links, Benutzernamen oder Passwörter. */
  // Themen wie im Support-Formular der Webseite (der deutsche Wert geht an den Verwaltungsbereich)
  function reportTopics() {
    return [['Wiedergabe', T('Sender oder Filme starten nicht')], ['Ruckeln', T('Bild ruckelt oder bleibt hängen')],
      ['Playlist erscheint nicht', T('Playlist erscheint nicht in der App')], ['Frage', T('Frage zur App')], ['Sonstiges', T('Sonstiges')]];
  }
  function techInfo() {
    var p = App.profile, sys = /\(([^)]*)\)/.exec(UA), chrome = /Chrom(e|ium)\/(\d+)/.exec(UA);
    var kind = Platform.tizen ? 'Samsung (Tizen)' : Platform.webos ? 'LG (webOS)' : /Electron/.test(UA) ? 'PC-App'
      : Platform.capacitor ? (Platform.androidTV ? 'Android-TV-App' : 'Android-App') : 'Browser';
    function two(n) { return n < 10 ? '0' + n : '' + n; }
    var lines = [
      'Telvo ' + CONFIG.version + ' · ' + kind + (Platform.tv ? ' · Fernseher' : '') + ' · ' + screen.width + 'x' + screen.height + ' · ' + Lang.cur,
      'System: ' + (sys ? sys[1].slice(0, 90) : '?') + (chrome ? ' · Chrome ' + chrome[2] : ''),
      'Player: ' + NativePlayer.engine() + (extPlayerOn() ? ' · extern' : '') + ' · Playlist: ' + (p ? p.type : 'keine') + ' (' + Profiles.list().length + ')',
      'Internet: ' + (navigator.onLine === false ? 'aus' : 'an') + ' · Online-Dienst: ' + (Cloud.mode || '–')
    ];
    var errs = ErrLog.list().slice(-8);
    if (!errs.length) lines.push('Keine Fehler gespeichert.');
    errs.forEach(function (e) {
      var d = new Date(e.t);
      lines.push('- ' + two(d.getDate()) + '.' + two(d.getMonth() + 1) + '. ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ' ' + e.w + ': ' + e.m + (e.n > 1 ? ' (' + e.n + 'x)' : ''));
    });
    return lines.join('\n');
  }
  /* ---------- Open-Source-Lizenzen (Einstellungen → Über & Updates) ----------
     Daten und vollständige Lizenztexte stehen in js/licenses.js und werden erst beim Öffnen geladen. */
  var licLoading = null;
  function loadLicenses() {
    if (window.LUMIO_LICENSES) return Promise.resolve(window.LUMIO_LICENSES);
    if (!licLoading) licLoading = new Promise(function (resolve) {
      var sc = document.createElement('script');
      sc.src = 'js/licenses.js';
      sc.onload = function () { resolve(window.LUMIO_LICENSES || null); };
      sc.onerror = function () { licLoading = null; resolve(null); };
      document.head.appendChild(sc);
    });
    return licLoading;
  }
  function showLicenses() {
    var USE = { hls: T('Wiedergabe von HLS-Streams'), mpegts: T('Wiedergabe von MPEG-TS-Streams'), qr: T('QR-Code'), font: T('Schrift'),
      cap: T('Android-App'), media3: T('TV-Player auf Android'), electron: T('Windows- und Mac-App'), blender: T('Demo-Filme') };
    var box = h('div', { class: 'lic-list' }, h('p', { class: 'hint', text: T('Wird geladen …') }));
    openSheet(T('Open-Source-Lizenzen'), 'info', [h('p', { class: 'hint', text: T('Telvo nutzt diese freie Software. Vielen Dank an alle, die daran mitarbeiten.') }), box], { wide: true });
    loadLicenses().then(function (L) {
      clear(box);
      if (!L) { box.appendChild(h('p', { class: 'error', text: T('Lizenztexte konnten nicht geladen werden.') })); return; }
      L.list.forEach(function (x) {
        var hasText = !!L.texts[x.lic];
        box.appendChild(h('button', { class: 'ch-opt f lic-item', onclick: hasText ? function () { showLicenseText(x.lic, L.texts[x.lic]); } : null },
          h('span', { class: 'ch-txt' }, h('b', { text: x.name + (x.ver ? ' ' + x.ver : '') }),
            h('small', { text: (USE[x.id] || '') + ' · ' + x.lic + ' · ' + x.by + ' · ' + x.url })),
          hasText ? h('span', { class: 'lic-go', text: T('Lizenztext') }) : null));
      });
      box.appendChild(h('p', { class: 'hint', text: T('Windows und Mac: Weitere Lizenzen (Chromium) liegen dem Programm bei – Datei LICENSES.chromium.html.') }));
      // auf den ersten Eintrag – nach dem Öffnen des Fensters (das setzt den Fokus kurz danach selbst)
      var f = $('.f', box);
      if (f) setTimeout(function () {
        var a = document.activeElement;
        if (document.body.contains(f) && (!a || a === document.body || (a.classList && a.classList.contains('sh-close')))) Nav.focus(f);
      }, 60);
    });
  }
  // Langer Text in Abschnitten – so lässt er sich auch mit der Fernbedienung Stück für Stück durchblättern
  function showLicenseText(name, text) {
    var parts = String(text).split(/\n\s*\n/), chunks = [], cur = '';
    parts.forEach(function (p) {
      if (cur && (cur + '\n\n' + p).length > 900) { chunks.push(cur); cur = p; } else cur = cur ? cur + '\n\n' + p : p;
    });
    if (cur) chunks.push(cur);
    openSheet(name, 'info', chunks.map(function (c) { return h('pre', { class: 'f lic-text', tabindex: '0', text: c }); }), { wide: true });
  }

  // Fehlermeldung aus einer Antwort des Online-Dienstes ({ ok:false, error:'…' } oder PostgREST { message })
  function rpcErr(r) { return (r && (typeof r.error === 'string' ? r.error : (r.error && r.error.message) || r.message)) || ''; }
  function showReport() {
    var topic = 'Wiedergabe', withTech = true;
    var msg = h('textarea', { class: 'f', rows: 3, maxlength: 1200, placeholder: T('Was ist passiert? Bei welchem Sender oder Film?') });
    var mail = inputField(T('E-Mail für eine Antwort (freiwillig)'), '', 'email');
    mail.wrap.className += ' rep-mail';
    var preview = h('pre', { class: 'rep-tech', hidden: true });
    var err = h('div', { class: 'error' });
    var send = sheetBtn('send', T('Senden'), go, 'primary');
    function go() {
      var text = msg.value.trim();
      if (text.length < 5) { err.textContent = T('Bitte beschreibe dein Anliegen etwas genauer.'); msg.focus(); return; }
      if (!CONFIG.cloudUrl) { err.textContent = T('Online-Dienst nicht erreichbar'); return; }
      err.textContent = ''; send.disabled = true; send.lastChild.textContent = T('Wird gesendet …');
      var body = text;
      if (withTech) body = (text + '\n\n— Technik —\n' + techInfo()).slice(0, 2000);
      (Cloud.registered ? Promise.resolve({ ok: true }) : Cloud.register()).then(function (r) {
        if (!r || !r.ok) throw new Error(rpcErr(r));
        Cloud.registered = true;
        return Cloud.rpc('send_support', { p_mac: Device.mac(), p_key: Device.key(), p_topic: topic, p_message: body, p_contact: mail.input.value.trim() || null });
      }).then(function (r) {
        if (!r || !r.ok) throw new Error(rpcErr(r));
        goBack();
        toast(T('Danke! Deine Nachricht ist angekommen.'), 3500);
      }).catch(function (e) {
        send.disabled = false; send.lastChild.textContent = T('Senden');
        err.textContent = (e && e.message && e.message !== 'timeout' && e.message !== 'offline') ? T(e.message)
          : (navigator.onLine === false ? T('Kein Internet') : T('Online-Dienst nicht erreichbar'));
      });
    }
    var techRow = toggleRow(T('Technische Angaben anhängen'), T('App-Version, Gerät und die letzten Fehler – ohne Links und Passwörter.'),
      function () { return withTech; }, function (v) { withTech = v; if (!v) preview.hidden = true; });
    var showTech = h('button', { class: 'link f rep-show', onclick: function () { preview.textContent = techInfo(); preview.hidden = !preview.hidden; } }, T('Angaben anzeigen'));
    openSheet(T('Problem melden'), 'help', [
      h('p', { class: 'hint', text: T('Worum geht es?') }),
      choiceList(reportTopics(), function () { return topic; }, function (v) { topic = v; }),
      h('label', { class: 'field rep-msg' }, h('span', { text: T('Deine Nachricht') }), msg),
      mail.wrap, techRow, showTech, preview, err,
      h('div', { class: 'row' }, send)], { wide: true });
  }

  function SettingsView() {
    var p = App.profile, tiles = [];
    function opt(list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return ''; }
    function tile(ic, label, value, onClick, cls) {
      var val = h('small', { class: 'st-val' });
      var b = h('button', { class: 'st-tile f' + (cls ? ' ' + cls : ''), onclick: onClick },
        h('span', { class: 'st-ic' }, icon(ic)), h('span', { class: 'st-txt' }, h('b', { text: label }), val));
      b._val = function () { var v = typeof value === 'function' ? value() : value; val.textContent = v || ''; val.hidden = !v; };
      tiles.push(b);
      return b;
    }
    function group(title, kids) {
      kids = kids.filter(Boolean);
      return kids.length ? h('section', { class: 'st-group' }, h('h2', { text: title }), h('div', { class: 'st-grid' }, kids)) : null;
    }

    // Auswahl-Listen
    var THEMES = [['dark', T('Dunkel')], ['light', T('Hell')], ['auto', T('Automatisch'), T('Richtet sich nach dem Gerät. Fernseher bleiben dunkel.')]];
    var POSTERS = [['s', T('Klein'), T('Mehr Cover auf einmal')], ['m', T('Normal')], ['l', T('Groß'), T('Besser lesbar aus der Entfernung')]];
    var SORTS = [['default', T('Wie beim Anbieter')], ['num', T('Nach Sendernummer')], ['az', T('Name A–Z')], ['za', T('Name Z–A')]];
    var FORMATS = [['m3u8', 'HLS (.m3u8)', T('Funktioniert auf den meisten Geräten am besten.')], ['ts', 'MPEG-TS (.ts)', T('Probiere das, wenn Sender nicht starten oder ruckeln.')]];
    var EXTS = [['off', T('Aus – Telvo-Player verwenden')], ['ask', T('Jedes Mal fragen'), T('Android zeigt eine Auswahl deiner Player-Apps.')], ['vlc', 'VLC'], ['mx', 'MX Player'], ['just', 'Just Player']];
    var AUTOS = [[6, T('Alle 6 Stunden')], [12, T('Alle 12 Stunden'), T('Empfohlen')], [24, T('Einmal am Tag')], [0, T('Aus – nur von Hand')]];
    var IDLES = [[0, T('Aus')], [2, T('Nach {0} Stunden', 2)], [3, T('Nach {0} Stunden', 3)], [4, T('Nach {0} Stunden', 4)]];
    var CLOCKS = [[false, T('24 Stunden'), '20:15'], [true, T('12 Stunden'), '8:15 PM']];
    var DEVICES = [['auto', T('Automatisch erkennen')], ['tv', T('Fernseher / TV-Box'), T('Große Schrift, Bedienung mit der Fernbedienung')], ['touch', T('Handy / Tablet / PC'), T('Bedienung mit Finger oder Maus')]];
    var SIZES = [['s', T('Klein')], ['m', T('Normal')], ['l', T('Groß')], ['xl', T('Sehr groß')]];
    var SCOLORS = [['white', T('Weiß')], ['yellow', T('Gelb')]];
    var SBGS = [['none', T('Ohne (mit Schatten)')], ['half', T('Halb durchsichtig')], ['black', T('Schwarz')]];
    function autoH() { var v = Settings.get('autoRefresh'); return typeof v === 'number' ? v : 12; }
    function engines() {
      var o = [['auto', T('Android-Player'), T('Der eingebaute Player von Android.')], ['hlsjs', T('Telvo-Player'), T('Hilft bei manchen Sendern, die sonst hängen.')]];
      if (NativePlayer.available()) o.unshift(['native', T('TV-Player'), T('Für Android-Boxen gemacht: stabil und sparsam.')]);
      return o;
    }

    // ---- Playlist ----
    var tAdd = tile('plus', T('Playlist hinzufügen'), T('Per Handy oder von Hand'), function () {
      openSheet(T('Playlist hinzufügen'), 'plus', [h('div', { class: 'sh-remote' }, remotePanel()),
        h('div', { class: 'row' }, sheetBtn('profile', T('Von Hand eingeben'), function () { Screens.pop(); setTimeout(showAddProfile, 40); }))], { wide: true });
    });
    var tPl = tile('playlist', T('Playlists'), function () { return p.type === 'demo' ? T('Demo-Modus') : p.name; }, showProfiles);
    var tUpd = tile('refresh', T('Jetzt aktualisieren'), function () {
      var st = Stats.get(), x = st.live || st.movie || st.series;
      return x ? T('Aktualisiert {0}', ago(x.at)) : T('Listen neu laden');
    }, reloadWithSplash);
    var SHIFTS = [-300, -240, -180, -120, -90, -60, -30, 0, 30, 60, 90, 120, 180, 240, 300];
    function fmtShift(m) {
      if (!m) return T('Keine Verschiebung');
      var a = Math.abs(m), hh = Math.floor(a / 60), mm = a % 60;
      return (m > 0 ? '+' : '−') + (hh && mm ? T('{0} Std. {1} Min.', hh, mm) : hh ? T('{0} Std.', hh) : T('{0} Min.', mm));
    }
    var tShift = !p || p.type === 'demo' ? null : tile('clock', T('Programmführer-Zeit'), function () { return fmtShift(Number(p.epgShift) || 0); }, function () {
      openSheet(T('Programmführer-Zeit'), 'clock', [
        h('p', { class: 'hint', text: T('Zeigt der Programmführer die Sendungen zu früh oder zu spät an? Dann hier die Zeit verschieben. Gilt nur für diese Playlist.') }),
        choiceList(SHIFTS.map(function (m) { return [m, fmtShift(m)]; }), function () { return Number(p.epgShift) || 0; }, function (m) {
          var list = Profiles.list(), x = list.filter(function (q) { return q.id === p.id; })[0];
          if (m) p.epgShift = m; else delete p.epgShift;
          if (x) { if (m) x.epgShift = m; else delete x.epgShift; Profiles.save(list); }
          EpgCache.data = {};
          paint();
        })], { onClose: function () { var v = Shell.view && Shell.view.firstChild; if (v && v._refresh) v._refresh(); } });
    });
    var tAuto = tile('bolt', T('Automatisch aktualisieren'), function () { return opt(AUTOS, autoH()); }, function () {
      openSheet(T('Automatisch aktualisieren'), 'bolt', [
        h('p', { class: 'hint', text: T('Dein Anbieter fügt regelmäßig neue Filme und Serien hinzu. Die App lädt die Listen dann von selbst neu – im Hintergrund, nie während etwas läuft.') }),
        choiceList(AUTOS, autoH, function (v) { Settings.set('autoRefresh', v); })], { onClose: paint });
    });

    // ---- Kindersicherung & Kategorien ----
    function parentalSheet() {
      var body = h('div');
      function render() {
        clear(body);
        if (!Parental.on()) {
          body.appendChild(h('p', { class: 'hint', text: T('Mit einer PIN kannst du Kategorien sperren, zum Beispiel Erwachsenen-Inhalte. Gesperrte Kategorien öffnen sich erst nach Eingabe der PIN.') }));
          body.appendChild(h('div', { class: 'row' }, sheetBtn('lock', T('PIN festlegen und einschalten'), function () { setParentPin(render); }, 'primary')));
          return;
        }
        body.appendChild(h('p', { class: 'hint', text: T('Die Kindersicherung ist an. Gesperrte Kategorien zeigen ein Schloss und fragen nach der PIN.') }));
        body.appendChild(toggleRow(T('Erwachsenen-Kategorien automatisch sperren'), T('Erkennt Kategorien wie „XXX“, „Adult“ oder „18+“.'),
          function () { return Parental.adult(); }, function (v) { Settings.set('lockAdult', v); searchCache = {}; }));
        ['live', 'movie', 'series'].forEach(function (k) {
          body.appendChild(h('button', { class: 'ch-opt f', onclick: function () {
            openSheet(T('{0}: Kategorien sperren', KIND_LABEL(k)), 'lock', catPicker(k, 'lock'), { wide: true });
          } }, h('span', { class: 'ch-ic' }, icon(k)), h('span', { class: 'ch-txt' }, h('b', { text: T('{0}: Kategorien sperren', KIND_LABEL(k)) }),
            h('small', { text: CatPrefs.count(k, 'lock') ? T('{0} von Hand gesperrt', CatPrefs.count(k, 'lock')) : T('Keine von Hand gesperrt') })), icon('next')));
        });
        body.appendChild(h('div', { class: 'row' },
          sheetBtn('restart', T('PIN ändern'), function () { setParentPin(render); }),
          sheetBtn('close', T('Kindersicherung ausschalten'), function () {
            confirmBox(T('Kindersicherung ausschalten?'), T('Alle Kategorien sind danach ohne PIN offen. Deine Auswahl der gesperrten Kategorien bleibt gespeichert.'), T('Ausschalten'), function () {
              Settings.set('parentPin', null); Parental.unlocked = false; searchCache = {}; render(); toast(T('Kindersicherung ist aus'));
            });
          })));
      }
      render();
      openSheet(T('Kindersicherung'), 'lock', body, { onClose: function () { Parental.unlocked = false; searchCache = {}; paint(); } });
    }
    var tPar = tile('lock', T('Kindersicherung'), function () { return Parental.on() ? T('An') : T('Aus'); }, function () {
      if (Parental.on()) Parental.ask(parentalSheet, { keep: true, text: T('Bitte gib die PIN ein, um die Kindersicherung zu ändern.') });
      else parentalSheet();
    });
    function hideTile(kind, label) {
      return tile('eyeOff', label, function () {
        var n = CatPrefs.count(kind, 'hide'), pn = CatPrefs.pins(kind).length, rn = Object.keys(CatPrefs.names(kind)).length, out = [];
        if (n) out.push(T('{0} ausgeblendet', n));
        if (pn) out.push(T('{0} oben', pn));
        if (rn) out.push(T('{0} umbenannt', rn));
        return out.length ? out.join(' · ') : T('Alle sichtbar');
      }, function () { hideCatsSheet(kind); });
    }
    var tHideCh = p && p.type === 'demo' ? null : tile('eyeOff', T('Ausgeblendete Sender'), function () { var n = ChanHide.count(); return n ? T('{0} ausgeblendet', n) : T('Keine'); }, function () {
      var box = h('div', { class: 'cp-list' });
      function render() {
        clear(box);
        var a = ChanHide.all(), ids = Object.keys(a);
        if (!ids.length) { box.appendChild(h('p', { class: 'hint', text: T('Keine Sender ausgeblendet. Ausblenden geht bei Live TV rechts neben der Senderliste oder im Player (Auge-Symbol).') })); return; }
        box.appendChild(h('div', { class: 'row' }, sheetBtn('eye', T('Alle einblenden'), function () { ids.forEach(function (id) { ChanHide.set({ id: id }, false); }); render(); paint(); })));
        ids.forEach(function (id) {
          box.appendChild(h('button', { class: 'cp-row f is-on', onclick: function () { ChanHide.set({ id: id }, false); toast(T('„{0}“ wird wieder angezeigt.', a[id] || id)); render(); paint(); } },
            h('span', { class: 'cp-name', text: a[id] || id }), h('span', { class: 'cp-state' }, icon('eye'), h('span', { text: T('Einblenden') }))));
        });
      }
      render();
      openSheet(T('Ausgeblendete Sender'), 'eyeOff', [box], { wide: true, onClose: paintSettings });
    });
    var tHideL = hideTile('live', T('Live-Kategorien verwalten'));
    var tHideM = hideTile('movie', T('Film-Kategorien verwalten'));
    var tHideS = hideTile('series', T('Serien-Kategorien verwalten'));
    var tHisL = tile('trash', T('Verlauf löschen: Sender'), null, function () { askClearHistory('live'); });
    var tHisM = tile('trash', T('Verlauf löschen: Filme'), null, function () { askClearHistory('movie'); });
    var tHisS = tile('trash', T('Verlauf löschen: Serien'), null, function () { askClearHistory('series'); });

    // ---- Wiedergabe ----
    var tSort = tile('sort', T('Sender sortieren'), function () { return opt(SORTS, Settings.get('chanSort') || 'default'); }, function () {
      openSheet(T('Sender sortieren'), 'sort', choiceList(SORTS, function () { return Settings.get('chanSort') || 'default'; }, function (v) { Settings.set('chanSort', v); }), { onClose: paint });
    });
    var tFmt = p.type !== 'xtream' ? null : tile('live', T('Live-Stream-Format'), function () { return Settings.get('liveFormat') === 'ts' ? 'MPEG-TS' : 'HLS'; }, function () {
      openSheet(T('Live-Stream-Format'), 'live', choiceList(FORMATS, function () { return Settings.get('liveFormat') === 'ts' ? 'ts' : 'm3u8'; }, function (v) { Settings.set('liveFormat', v); }), { onClose: paint });
    });
    var tEng = !Platform.android ? null : tile('player', T('Player wählen'), function () { return opt(engines(), NativePlayer.engine()); }, function () {
      openSheet(T('Player wählen'), 'player', [h('p', { class: 'hint', text: T('Hängen Sender oder Filme, probiere einen anderen Player.') }),
        choiceList(engines(), function () { return NativePlayer.engine(); }, function (v) { Settings.set('engine', v); })], { onClose: paint });
    });
    var tExt = !(Platform.android && NativePlayer.plugin()) ? null : tile('ext', T('Externer Player'), function () { return opt(EXTS, Settings.get('extPlayer') || 'off'); }, function () {
      openSheet(T('Externer Player'), 'ext', [h('p', { class: 'hint', text: T('Sender, Filme und Serien in einer anderen App abspielen. Die App muss auf dem Gerät installiert sein.') }),
        choiceList(EXTS, function () { return Settings.get('extPlayer') || 'off'; }, function (v) { Settings.set('extPlayer', v); })], { onClose: paint });
    });
    var QUALS = [['auto', T('Automatisch'), T('Passt sich der Internetverbindung an.')], ['best', T('Immer beste Qualität'), T('Braucht schnelles Internet. Gut für PC und große Fernseher.')]];
    var tQual = tile('player', T('Bildqualität'), function () { return opt(QUALS, Settings.get('quality') || 'auto'); }, function () {
      openSheet(T('Bildqualität'), 'player', [h('p', { class: 'hint', text: T('Gilt für Streams, die der Anbieter in mehreren Qualitäten liefert. Welche Qualität gerade läuft, steht im Player oben rechts.') }),
        choiceList(QUALS, function () { return Settings.get('quality') || 'auto'; }, function (v) { Settings.set('quality', v); })], { onClose: paint });
    });
    var tSub = tile('cc', T('Untertitel'), function () { var s = SubStyle.get(); return opt(SIZES, s.size) + ', ' + opt(SCOLORS, s.color); }, function () {
      var demo = h('div', { class: 'sub-demo' }, h('span', { text: T('So sehen deine Untertitel aus.') }));
      function upd() {
        var s = SubStyle.get(), sp = demo.firstChild;
        sp.style.fontSize = (1.25 * (SUB_SIZES[s.size] || 1)) + 'rem';
        sp.style.color = s.color === 'yellow' ? '#ffe24a' : '#fff';
        sp.style.background = s.bg === 'black' ? '#000' : s.bg === 'half' ? 'rgba(0,0,0,.6)' : 'transparent';
        sp.style.textShadow = s.bg === 'none' ? '0 0 4px #000, 0 1px 2px #000' : 'none';
        SubStyle.apply();
      }
      function set(k) { return function (v) { Settings.set(k, v); upd(); }; }
      upd();
      openSheet(T('Untertitel'), 'cc', [demo,
        h('h3', { class: 'sh-sub', text: T('Größe') }), choiceList(SIZES, function () { return SubStyle.get().size; }, set('subSize')),
        h('h3', { class: 'sh-sub', text: T('Schriftfarbe') }), choiceList(SCOLORS, function () { return SubStyle.get().color; }, set('subColor')),
        h('h3', { class: 'sh-sub', text: T('Hintergrund') }), choiceList(SBGS, function () { return SubStyle.get().bg; }, set('subBg')),
        h('p', { class: 'hint', text: T('Untertitel schaltest du im Player über „Ton & Untertitel“ ein.') })], { onClose: paint });
    });
    var tLast = tile('tvplay', T('Letzten Sender beim Start'), function () { return Settings.get('autoLast') ? T('An') : T('Aus'); }, function () {
      openSheet(T('Letzten Sender beim Start'), 'tvplay', [toggleRow(T('Letzten abgespielten Sender beim Start abspielen'), T('Die App startet direkt mit dem Sender, den du zuletzt geschaut hast.'),
        function () { return !!Settings.get('autoLast'); }, function (v) { Settings.set('autoLast', v); })], { onClose: paint });
    });
    var tIdle = tile('moon', T('Schaust du noch?'), function () { return opt(IDLES, StillWatching.hours()); }, function () {
      openSheet(T('Schaust du noch?'), 'moon', [h('p', { class: 'hint', text: T('Wie bei Netflix: Wurde so lange keine Taste gedrückt, fragt die App nach. Ohne Antwort stoppt die Wiedergabe nach einer Minute – das hält deinen Zugang frei.') }),
        choiceList(IDLES, function () { return StillWatching.hours(); }, function (v) { Settings.set('idleHours', v); })], { onClose: paint });
    });

    // ---- Darstellung & Gerät ----
    var tLang = tile('globe', T('Sprache'), function () { return LANGS.filter(function (l) { return l[0] === Lang.cur; })[0][1]; }, function () {
      openSheet('Sprache / Language / Dil', 'globe', choiceList(LANGS.map(function (l) { return [l[0], l[1], null, flagFor(l[0])]; }),
        function () { return Lang.cur; }, function (v) { if (v !== Lang.cur) Lang.set(v); }), { wide: true });
    });
    var tTheme = tile('sun', T('Darstellung'), function () { return opt(THEMES, Settings.get('theme') || 'dark') + ' · ' + T('Cover {0}', opt(POSTERS, Settings.get('posterSize') || 'm')); }, function () {
      var s = Season.current();
      openSheet(T('Darstellung'), 'sun', [
        h('h3', { class: 'sh-sub', text: T('Farben') }), choiceList(THEMES, function () { return Settings.get('theme') || 'dark'; }, function (v) { Settings.set('theme', v); Theme.apply(); }),
        s ? h('p', { class: 'hint', text: T('Gerade läuft das {0}-Design. Danach gilt wieder das Telvo-Violett.', T(SEASONS[s].name)) }) : null,
        h('h3', { class: 'sh-sub', text: T('Größe der Cover bei Filmen und Serien') }), choiceList(POSTERS, function () { return Settings.get('posterSize') || 'm'; }, function (v) { Settings.set('posterSize', v); Theme.apply(); })], { onClose: paint });
    });
    var tClock = tile('clock', T('Zeitformat'), function () { return opt(CLOCKS, !!Settings.get('clock12')); }, function () {
      openSheet(T('Zeitformat'), 'clock', choiceList(CLOCKS, function () { return !!Settings.get('clock12'); }, function (v) { Settings.set('clock12', v); }), { onClose: paint });
    });
    var tDev = tile('device', T('Gerätetyp'), function () { return opt(DEVICES, Settings.get('deviceType') || 'auto'); }, function () {
      var cur = Settings.get('deviceType') || 'auto';
      openSheet(T('Gerätetyp'), 'device', [h('p', { class: 'hint', text: T('Normalerweise erkennt die App das Gerät selbst. Stimmt die Bedienung nicht, wähle hier den richtigen Typ. Die App startet dann neu.') }),
        choiceList(DEVICES, function () { return Settings.get('deviceType') || 'auto'; }, function (v) {
          if (v === cur) return;
          Settings.set('deviceType', v);
          toast(T('App startet neu …'));
          setTimeout(function () { try { location.reload(); } catch (e) {} }, 700);
        })]);
    });
    var tReport = tile('help', T('Problem melden'), T('Nachricht an den Support'), showReport);
    var tBackup = !CONFIG.cloudUrl ? null : tile('upload', T('Sichern & Wiederherstellen'), function () {
      var at = Store.get('backupAt', 0); return at ? T('Gesichert: {0}', fmtWhen(at)) : T('Noch nicht gesichert');
    }, showBackup);
    var tAbout = tile('info', T('Über & Updates'), function () { var v = Updates.cached(); return v ? T('Neue Version {0} verfügbar', v) : T('Version {0}', CONFIG.version); }, function () {
      var status = h('p', { class: 'up-status' });
      var actions = h('div', { class: 'row' });
      function show(v) {
        clear(actions);
        if (v) {
          status.textContent = T('Neue Version {0} verfügbar. Du hast {1}.', v, CONFIG.version);
          status.className = 'up-status is-new';
          if (Updates.possible()) actions.appendChild(sheetBtn('update', T('Jetzt herunterladen'), function () { Updates.download(); }, 'primary'));
          if (Platform.androidTV) actions.appendChild(h('p', { class: 'hint', text: T('Auf Fire TV und Android-Boxen: App „Downloader“ öffnen und den Code 5619512 eingeben.') }));
        } else {
          status.textContent = T('Du hast die neueste Version ({0}).', CONFIG.version);
          status.className = 'up-status is-ok';
        }
        paint();
      }
      function check() {
        status.textContent = T('Suche nach Updates …'); status.className = 'up-status';
        Updates.check().then(show, function () { status.textContent = T('Keine Verbindung zum Update-Dienst.'); status.className = 'up-status'; });
      }
      var cached = Updates.cached();
      if (cached) show(cached); else status.textContent = T('Version {0}', CONFIG.version);
      openSheet(T('Über & Updates'), 'info', [
        h('button', { class: 'about-version f', onclick: function () { Admin.tap(); } }, CONFIG.appName + ' ' + CONFIG.version),
        status, actions,
        Updates.possible() ? h('div', { class: 'row' }, sheetBtn('refresh', T('Nach Updates suchen'), check)) : null,
        h('div', { class: 'row' }, sheetBtn('info', T('Open-Source-Lizenzen'), showLicenses)),
        h('p', { class: 'hint', text: T('Dieser Player enthält keine Inhalte. Du bist selbst dafür verantwortlich, nur Streams zu nutzen, für die du eine Berechtigung hast. Datenschutz und Impressum: splix66.github.io/lumio-player') })], { onClose: paint });
      if (Updates.possible() && !cached) check();
    });

    function paint() { tiles.forEach(function (t) { t._val(); }); }
    paint();
    var el = h('div', { class: 'page settings st-page' },
      h('div', { class: 'page-head' }, h('h1', { text: T('Einstellungen') })),
      group(T('Playlist'), [tAdd, tPl, tUpd, tAuto, tShift]),
      group(T('Kindersicherung & Kategorien'), [tPar, tHideL, tHideM, tHideS, tHideCh, tHisL, tHisM, tHisS]),
      group(T('Wiedergabe'), [tSort, tFmt, tQual, tEng, tExt, tSub, tLast, tIdle]),
      group(T('Darstellung & Gerät'), [tLang, tTheme, tClock, tDev, tBackup, tAbout, tReport]),
      h('div', { class: 'st-foot' }, macTag(profileUser(p), true)));
    tAdd.setAttribute('data-autofocus', '');
    settingsPaint = paint;
    el._refresh = paint;
    el._dispose = function () { if (settingsPaint === paint) settingsPaint = null; };
    return el;
  }

  /* ==========================================================
     Detailseite: Film oder Serie
     ========================================================== */
  function openItem(item) {
    if (item.kind === 'movie' || item.kind === 'series') {
      return parentalGate(item, null, function () { if (item.kind === 'movie') showMovie(item); else showSeries(item); });
    }
    return playItem(item, { list: [item], index: 0 });
  }

  /* Kindersicherung an der zentralen Stelle prüfen – egal ob man über eine Kategorie, Favoriten, „Zuletzt gesehen“,
     „Weiterschauen“, die Suche oder „Letzten Sender beim Start“ kommt (vorher wurde nur beim Öffnen einer
     Kategorie gefragt). Ausgeblendete Kategorien sperren nicht – nur gesperrte. Ohne PIN: sofort weiter. */
  function lockedCats(kind) {
    return App.provider.categories(kind).then(function (cats) {
      var m = null;
      (cats || []).forEach(function (c) { if (Parental.isLocked(kind, c)) { m = m || {}; m[String(c.id)] = 1; } });
      return m;
    }, function () { return null; });
  }
  function itemCatId(item) {
    if (item.catId !== undefined && item.catId !== null && item.catId !== '') return Promise.resolve(item.catId);
    if (item.kind === 'episode' && item.seriesId !== undefined) {
      return App.provider.items('series', '__all').then(function (list) {
        var s = (list || []).filter(function (x) { return String(x.id) === String(item.seriesId); })[0];
        return s ? s.catId : null;
      }, function () { return null; });
    }
    return Promise.resolve(null);
  }
  function parentalGate(item, ctx, go) {
    if (!Parental.on() || Parental.unlocked || !App.provider) { go(ctx); return; }
    var kind = item.kind === 'episode' ? 'series' : item.kind === 'catchup' ? 'live' : item.kind;
    Promise.all([lockedCats(kind), itemCatId(item)]).then(function (r) {
      var m = r[0], cid = r[1];
      if (!m) { go(ctx); return; }
      // Liste zum Umschalten (auch im TV-Player) ohne gesperrte Einträge weitergeben
      if (ctx && ctx.list && ctx.list.length > 1) {
        var cur = ctx.list[ctx.index];
        var list = ctx.list.filter(function (x) { return x === cur || x.catId === undefined || x.catId === null || !m[String(x.catId)]; });
        var c2 = {};
        for (var k in ctx) if (ctx.hasOwnProperty(k)) c2[k] = ctx[k];
        c2.list = list; c2.index = Math.max(0, list.indexOf(cur));
        ctx = c2;
      }
      if (cid !== null && cid !== undefined && m[String(cid)]) Parental.ask(function () { go(ctx); });
      else go(ctx);
    }, function () { go(ctx); });
  }

  function detailFrame(item) {
    var bg = h('div', { class: 'd-bg' });
    if (item.logo) bg.style.backgroundImage = 'url("' + String(item.logo).replace(/"/g, '%22') + '")';
    var top = h('div', { class: 'd-hero' }, bg);
    var info = h('div', { class: 'detail-info' }, h('h1', { text: item.name }));
    var main = h('div', { class: 'detail-main' }, h('div', { class: 'poster' }, posterArt(item)), info);
    var close = h('button', { class: 'd-close f', title: T('Schließen'), onclick: goBack }, icon('close'), h('span', { text: T('Schließen') }));
    var panel = h('div', { class: 'detail modal-panel' }, top, main);
    // Mit der Fernbedienung nach oben bis „Schließen“: wieder ganz nach oben scrollen, damit man den Film sieht
    close.addEventListener('focus', function () { if (panel.scrollTop > 0) panel.scrollTop = 0; });
    var el = h('div', { class: 'modal' }, h('div', { class: 'modal-backdrop', onclick: goBack }), h('div', { class: 'modal-wrap' }, close, panel));
    return {
      el: el, panel: panel, info: info,
      setBackdrop: function (url) {
        if (!url) return;
        bg.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
        top.classList.add('has-backdrop');
      }
    };
  }
  function metaLine(d) {
    var m = h('div', { class: 'meta' });
    if (d.rating && Number(d.rating) > 0) m.appendChild(h('span', { class: 'rate', text: '★ ' + Number(d.rating).toFixed(1) }));
    if (d.year) m.appendChild(h('span', { text: d.year }));
    if (d.duration) m.appendChild(h('span', { text: String(d.duration).replace(/^00:/, '') }));
    if (d.genre) m.appendChild(h('span', { text: d.genre }));
    return m;
  }
  function favButton(item) {
    var b = h('button', { class: 'btn f ghost' });
    function paint() { clear(b); var on = Favs.has(item); b.appendChild(icon(on ? 'heartFill' : 'heart')); b.appendChild(h('span', { text: on ? T('Gemerkt') : T('Merken') })); }
    b.onclick = function () { Favs.toggle(item); paint(); };
    paint();
    return b;
  }

  /* „Ähnliche Titel“ unter Film- und Serienseiten: aus derselben Kategorie, die bestbewerteten zuerst */
  function similarRail(item, panel) {
    if (!item.catId) return;
    var kind = item.kind === 'series' ? 'series' : 'movie';
    App.provider.items(kind, item.catId).then(function (list) {
      var pick = list.filter(function (x) { return x.id !== item.id && x.logo; }).sort(byRating).slice(0, 14);
      if (pick.length < 3 || !panel.parentNode) return;
      var badges = kind === 'series' ? seriesBadges() : null;
      panel.appendChild(h('div', { class: 'd-similar' }, railEl(T('Ähnliche Titel'), pick.map(function (it) {
        return posterCard(it, function () { Screens.pop(); setTimeout(function () { openItem(it); }, 30); }, { badge: badges && badges[it.id] });
      }), kind)));
    }).catch(function () {});
  }

  /* ---------- Trailer ----------
     Die Trailer kommen nicht von uns: der Anbieter legt zu jedem Film und jeder Serie
     eine YouTube-Kennung mit in die Playlist (Feld „youtube_trailer“). Wir zeigen das
     Video im offiziellen YouTube-Fenster – anders darf und kann man es nicht abspielen.
     Auf Samsung- und LG-Fernsehern öffnet YouTube kein eingebettetes Fenster, dort
     erscheint der Knopf deshalb gar nicht erst. */
  function trailerId(v) {
    v = String(v || '').trim();
    if (!v) return '';
    var m = /(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/.exec(v);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(v) ? v : '';
  }
  function canTrailer() { return !Platform.tizen && !Platform.webos; }
  function showTrailer(name, id) {
    var frame = h('iframe', {
      class: 'tr-frame', src: 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1&playsinline=1',
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: 'true',
      frameborder: '0', title: T('Trailer: {0}', name)
    });
    var closeBtn = h('button', { class: 'icon-btn f tr-close', 'data-autofocus': true, title: T('Schließen'), 'aria-label': T('Schließen'), onclick: goBack }, icon('close'));
    var el = h('div', { class: 'tr-screen' },
      h('div', { class: 'tr-bar' }, h('span', { class: 'tr-name', text: name }), closeBtn),
      h('div', { class: 'tr-box' }, frame));
    Screens.push('trailer', el, { overlay: true });
    setTimeout(function () { Nav.focus(closeBtn); }, 60);
  }
  function trailerButton(name, raw) {
    var id = trailerId(raw);
    if (!id || !canTrailer()) return null;
    return h('button', { class: 'btn f', onclick: function () { showTrailer(name, id); } }, icon('play'), h('span', { text: T('Trailer') }));
  }

  function showMovie(item) {
    var f = detailFrame(item);
    var actions = h('div', { class: 'row' });
    function paintActions() {
      clear(actions);
      var r = Resume.get(item);
      if (r) {
        actions.appendChild(h('button', { class: 'btn f primary', 'data-autofocus': true, onclick: function () { playItem(item, { list: [item], index: 0 }); } }, icon('play'), h('span', { text: T('Weiter bei {0}', fmtTime(r.t)) })));
        actions.appendChild(h('button', { class: 'btn f', onclick: function () { playItem(item, { list: [item], index: 0, fromStart: true }); } }, icon('restart'), h('span', { text: T('Von vorne') })));
      } else {
        actions.appendChild(h('button', { class: 'btn f primary', 'data-autofocus': true, onclick: function () { playItem(item, { list: [item], index: 0 }); } }, icon('play'), h('span', { text: T('Abspielen') })));
      }
      var tb = trailerButton(item.name, item.trailer);
      if (tb) actions.appendChild(tb);
      actions.appendChild(favButton(item));
    }
    paintActions();
    var metaBox = h('div'), plotBox = h('p', { class: 'plot', text: item.plot || '' });
    f.info.appendChild(metaBox); f.info.appendChild(actions); f.info.appendChild(plotBox);
    App.provider.movieInfo(item).then(function (d) {
      if (!d) return;
      if (d.ext) item.ext = d.ext;
      metaBox.appendChild(metaLine(d));
      if (d.plot) plotBox.textContent = d.plot;
      if (d.trailer && trailerId(d.trailer) && canTrailer()) {
        item.trailer = d.trailer;
        var hadFocus = actions.contains(document.activeElement);
        paintActions();
        if (hadFocus) Nav.focusFirst(actions);
      }
      if (d.director || d.cast) f.info.appendChild(h('p', { class: 'credits', text: [d.director ? T('Regie: {0}', d.director) : '', d.cast ? T('Mit: {0}', d.cast) : ''].filter(Boolean).join('. ') }));
      if (d.backdrop) { item.backdrop = d.backdrop; f.setBackdrop(d.backdrop); }
    }).catch(function () {});
    similarRail(item, f.panel);
    Screens.push('movie', f.el, { overlay: true, onShow: function () { var had = document.activeElement; paintActions(); if (!document.body.contains(had)) Nav.focusFirst(actions); } });
  }

  function showSeries(item) {
    App.openSeries = item;
    var f = detailFrame(item);
    var seasonsBar = h('div', { class: 'seasons' });
    var epBox = h('div', { class: 'episodes' }, loader());
    var actions = h('div', { class: 'row' }, favButton(item));
    var metaBox = h('div'), plotBox = h('p', { class: 'plot', text: item.plot || '' });
    f.info.appendChild(metaBox); f.info.appendChild(actions); f.info.appendChild(plotBox);
    f.panel.appendChild(seasonsBar); f.panel.appendChild(epBox);
    var seasons = [], curSeason = null, continueBtn = null;

    function renderEpisodes(season) {
      curSeason = season;
      $all('.btn', seasonsBar).forEach(function (b) { b.classList.toggle('is-on', Number(b.getAttribute('data-s')) === season.num); });
      clear(epBox);
      var list = season.episodes;
      list.forEach(function (ep, i) {
        ep.seriesName = ep.seriesName || item.name;
        ep.logo = ep.logo || item.logo;
        var r = Resume.get(ep);
        epBox.appendChild(h('button', { class: 'ep f', onclick: function () { playItem(ep, { list: list, index: i }); } },
          h('span', { class: 'thumb' },
            ep.logo ? img(ep.logo, '') : null,
            h('span', { class: 'n', text: String(ep.num || i + 1) }),
            r ? h('span', { class: 'seen' }, h('i', { style: 'width:' + Math.round(r.t / r.d * 100) + '%' })) : null,
            !r && Seen.has(ep) ? h('span', { class: 'ep-done', title: T('Gesehen') }, icon('check')) : null),
          h('span', { class: 't' }, h('b', { text: ep.name }), ep.plot || ep.duration ? h('small', { text: [ep.duration ? String(ep.duration).replace(/^00:/, '') : '', ep.plot].filter(Boolean).join(' – ') }) : null),
          h('span', { class: 'play-i' }, icon('play'))));
      });
    }
    /* Wo geht es weiter? Angefangene Folge, sonst die erste noch nicht gesehene, sonst Folge 1 */
    function nextTarget() {
      var last = Resume.recent().filter(function (r) { return r.item.kind === 'episode' && r.item.seriesId === item.id; })[0];
      if (last) return { ep: last.item, resume: true };
      var any = false, first = null;
      for (var a = 0; a < seasons.length; a++) for (var b = 0; b < seasons[a].episodes.length; b++) {
        var e = seasons[a].episodes[b];
        if (Seen.has(e)) any = true; else if (!first) first = e;
      }
      if (any && first) return { ep: first, resume: true };
      return seasons[0] && seasons[0].episodes[0] ? { ep: seasons[0].episodes[0], resume: false } : null;
    }
    function paintContinue() {
      if (continueBtn && continueBtn.parentNode) continueBtn.parentNode.removeChild(continueBtn);
      var nt = nextTarget(), target = nt && nt.ep;
      if (!target) return;
      var label = nt.resume ? T('Weiter: S{0} E{1}', target.season, target.num) : T('Folge 1 abspielen');
      continueBtn = h('button', { class: 'btn f primary', 'data-autofocus': true, onclick: function () {
        var s = seasons.filter(function (x) { return x.num === target.season; })[0] || seasons[0];
        var idx = 0; s.episodes.forEach(function (e, i) { if (e.id === target.id) idx = i; });
        playItem(s.episodes[idx], { list: s.episodes, index: idx });
      } }, icon('play'), h('span', { text: label }));
      actions.insertBefore(continueBtn, actions.firstChild);
    }

    App.provider.seriesInfo(item).then(function (d) {
      metaBox.appendChild(metaLine(d || {}));
      if (d && d.plot) plotBox.textContent = d.plot;
      if (d && d.backdrop) { item.backdrop = d.backdrop; f.setBackdrop(d.backdrop); }
      var tb = d && trailerButton(item.name, d.trailer);
      if (tb) actions.insertBefore(tb, actions.lastChild);   // vor „Merken“
      seasons = (d && d.seasons) || [];
      if (!seasons.length) { clear(epBox).appendChild(stateBox(T('Keine Folgen gefunden'), null)); return; }
      seasons.forEach(function (s) {
        seasonsBar.appendChild(h('button', { class: 'btn f', 'data-s': s.num, onclick: function () { renderEpisodes(s); } }, T('Staffel {0}', s.num)));
      });
      var nt = nextTarget(), startSeason = seasons[0];
      if (nt) seasons.forEach(function (x) { if (x.num === nt.ep.season) startSeason = x; });
      renderEpisodes(startSeason);
      paintContinue();
      similarRail(item, f.panel);
      if (Screens.top() && Screens.top().el === f.el) Nav.focus(continueBtn || $('.f', f.el));
    }, function (e) {
      clear(epBox).appendChild(stateBox(T('Laden fehlgeschlagen'), e.message));
    });
    Screens.push('series', f.el, { overlay: true, onShow: function () { if (curSeason) { renderEpisodes(curSeason); paintContinue(); } } });
  }

  /* ==========================================================
     Player
     ========================================================== */
  var hlsLoading = null;
  /* Name einer Ton- oder Untertitelspur: eigener Name, sonst Sprache, sonst „Spur 2“ */
  var LANG_ISO = { de: 'de', ger: 'de', deu: 'de', en: 'en', eng: 'en', tr: 'tr', tur: 'tr', ar: 'ar', ara: 'ar', fr: 'fr', fre: 'fr', fra: 'fr',
    es: 'es', spa: 'es', it: 'it', ita: 'it', ru: 'ru', rus: 'ru', pl: 'pl', pol: 'pl', pt: 'pt', por: 'pt', nl: 'nl', dut: 'nl', nld: 'nl',
    ku: 'ku', kur: 'ku', sq: 'al', alb: 'al', sqi: 'al', bg: 'bg', bul: 'bg', ro: 'ro', rum: 'ro', ron: 'ro', el: 'gr', gre: 'gr', ell: 'gr',
    sv: 'se', swe: 'se', no: 'no', nor: 'no', da: 'dk', dan: 'dk', fi: 'fi', fin: 'fi', hu: 'hu', hun: 'hu', cs: 'cz', cze: 'cz', ces: 'cz',
    uk: 'ua', ukr: 'ua', fa: 'fa', per: 'fa', fas: 'fa', az: 'az', aze: 'az', hi: 'in', hin: 'in' };
  function trackLabel(name, lang, i) {
    var code = String(lang || '').toLowerCase().split(/[-_]/)[0], key = LANG_ISO[code];
    var langName = key && LANG_NAMES[key] ? T(LANG_NAMES[key]) : (lang ? String(lang).toUpperCase() : '');
    name = String(name || '').trim();
    if (name && langName && name.toLowerCase().indexOf(langName.toLowerCase()) < 0 && !/^(audio|track|und|default|subtitles?)\s*\d*$/i.test(name)) return langName + ' – ' + name;
    if (name && !/^(audio|track|und|default|subtitles?)\s*\d*$/i.test(name)) return name;
    return langName || T('Spur {0}', i + 1);
  }

  function ensureHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsLoading) hlsLoading = loadLib('lib/hls.min.js', CONFIG.hlsCdn, CONFIG.hlsSri, function () { return window.Hls; });
    return hlsLoading;
  }
  function isHlsUrl(u) { return /\.m3u8(\?|$)/i.test(u) || /\/hls\//i.test(u) || /\.ism\/\.m3u8/i.test(u); }
  /* Rohe TV-Signale (MPEG-TS, bei vielen Anbietern „RAW“): kein Browser kann die allein öffnen.
     mpegts.js packt den Datenstrom im Hintergrund so um, dass das Videofenster ihn versteht. */
  function isTsUrl(u) { return /\.ts(\?|$)/i.test(u) || /\/mpegts\//i.test(u); }
  var tsLoading = null;
  function ensureTs() {
    if (window.mpegts) return Promise.resolve(window.mpegts);
    if (!tsLoading) tsLoading = loadLib('lib/mpegts.js', CONFIG.tsCdn, CONFIG.tsSri, function () { return window.mpegts; });
    return tsLoading;
  }

  /* ==========================================================
     TV-Player (nur Android-App): eigener Android-Videoplayer (ExoPlayer)
     Spielt Streams direkt über Android ab – stabiler auf schwachen Android-Boxen als der Browser-Player.
     ========================================================== */
  var NativePlayer = {
    failed: false,
    plugin: function () {
      var C = window.Capacitor;
      if (!C || !Platform.capacitor || !Platform.android) return null;
      var heads = C.PluginHeaders;
      if (heads && !some(heads, function (x) { return x.name === 'NativePlayer'; })) return null;   // ältere App-Version ohne TV-Player
      try { return C.Plugins && C.Plugins.NativePlayer ? C.Plugins.NativePlayer : (C.registerPlugin ? C.registerPlugin('NativePlayer') : null); } catch (e) { return null; }
    },
    available: function () { return !this.failed && !!this.plugin(); },
    /* Gewählte Wiedergabe: 'native' (TV-Player), 'auto' (Android-Player im Browser), 'hlsjs' (Telvo-Player).
       Auf Android-Boxen ist der TV-Player voreingestellt. */
    engine: function () { var e = Settings.get('engine'); return e || (Platform.androidTV && this.available() ? 'native' : 'auto'); },
    use: function (item) { return item && item.kind !== 'series' && this.engine() === 'native' && this.available(); },
    play: function (item, ctx) {
      var self = this, live = item.kind === 'live';
      var list = ctx && ctx.list && ctx.list.length ? ctx.list : [item];
      var idx = ctx && ctx.index >= 0 && list[ctx.index] === item ? ctx.index : list.indexOf(item);
      if (idx < 0 || (!live && item.kind !== 'episode')) { list = [item]; idx = 0; }
      function toItem(it) {
        var s = App.provider.streamUrl(it);
        var title = it.kind === 'episode' ? (it.seriesName ? it.seriesName + ' · ' : '') + 'S' + it.season + ' E' + it.num + ' – ' + it.name
          : (live && it.num ? it.num + '   ' : '') + it.name;
        return { url: s.url, alt: s.alt || '', title: title };
      }
      /* Android übergibt Daten an den TV-Player in einem Paket von höchstens 1 MB – größer = Absturz
         (TransactionTooLargeException). Darum nur die Nachbarn zum Umschalten (± 150) und zusätzlich nach Größe
         begrenzen: lange Adressen mit Zugangs-Token → automatisch weniger Einträge. */
      var radius = 150, items, full = list, fullIdx = idx;
      for (;;) {
        var st = Math.max(0, fullIdx - radius), en = Math.min(full.length, fullIdx + radius + 1);
        list = full.slice(st, en); idx = fullIdx - st;
        items = list.map(toItem);
        if (radius <= 5 || JSON.stringify(items).length <= 200000) break;
        radius = Math.floor(radius / 2);
      }
      var r = !live ? Resume.get(item) : null;
      var startMs = r && !(ctx && ctx.fromStart) ? Math.round(r.t * 1000) : 0;
      if (ctx) ctx.fromStart = false;
      if (live) Recent.push(item);
      Last.set(item);
      var sub = SubStyle.native();
      return self.plugin().play({
        items: items, index: idx, startMs: startMs, live: live,
        subScale: sub.subScale, subColor: sub.subColor, subBg: sub.subBg,
        txtReconnect: T('Verbindung wird wiederhergestellt …'),
        txtFailed: T('Wiedergabe nicht möglich. Mit „Zurück“ schließen.')
      }).then(function (res) {
        res = res || {};
        var i = typeof res.index === 'number' ? res.index : idx, cur = list[i] || item;
        if (live) { Recent.push(cur); Last.set(cur); markPlaying(null); }
        else {
          for (var k = idx; k < i; k++) Seen.add(list[k]);            // automatisch weitergespielte Folgen
          var t = (res.positionMs || 0) / 1000, d = (res.durationMs || 0) / 1000;
          if (res.ended) { Resume.set(cur, 0, 0); Seen.add(cur); }
          else if (d > 0) Resume.set(cur, t, d);
          Last.set(cur);
        }
        // „Weiterschauen“, Häkchen und Knöpfe auffrischen
        var top = Screens.top();
        if (top && top.onShow) top.onShow();
        var v = Shell.view && Shell.view.firstChild;
        if (v && v._refresh && (!top || top.name === 'shell')) v._refresh();
      });
    }
  };

  function playItem(item, ctx) {
    parentalGate(item, ctx || { list: [item], index: 0 }, function (c) { playItemNow(item, c); });
  }
  function playItemNow(item, ctx) {
    ctx = ctx || { list: [item], index: 0 };
    if (extPlayerOn() && item.kind !== 'series') {
      if (Player.el) Player.close();
      playExternal(item);
      return;
    }
    if (NativePlayer.use(item)) {
      if (Player.el) Player.close();
      NativePlayer.play(item, ctx).catch(function (e) {
        // TV-Player fehlt oder startet nicht: für diese Sitzung den eingebauten Player nehmen
        ErrLog.add('TV-Player', 'Start fehlgeschlagen: ' + ((e && e.message) || e) + ' – eingebauter Player übernimmt');
        NativePlayer.failed = true;
        Player.open(item, ctx);
      });
      return;
    }
    if (Player.mini) {
      // Mini-Player läuft: anderer Sender = Vorschau wechseln, derselbe Sender = Vollbild
      if (item.kind === 'live' && Player.item && Player.item.kind === 'live') {
        if (Player.item.id === item.id) Player.maximize();
        else Player.switchTo(item, ctx);
        return;
      }
      Player.maximize();
    }
    Player.open(item, ctx);
  }

  var Player = {
    el: null, video: null, hls: null, item: null, ctx: null, osd: null, hideTimer: null, saveTimer: null, epgTimer: null,
    triedAlt: false, retried: false,

    open: function (item, ctx) {
      var self = this;
      if (self.el) { self.switchTo(item, ctx); return; }
      self.ctx = ctx;
      // poster = durchsichtiges Bild, damit Android nicht sein weißes Standard-Vorschaubild zeigt
      var video = h('video', { playsinline: true, 'webkit-playsinline': true, autoplay: true, preload: 'auto', poster: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });
      self.video = video;
      self.title = h('h2');
      self.liveTag = h('span', { class: 'live-tag', text: 'LIVE' });
      // Bildqualität des Streams (z. B. 1080p) – zeigt, was der Anbieter wirklich liefert
      self.qTag = h('span', { class: 'q-tag' });
      self.info = h('div', { class: 'epg' });
      self.bar = h('div', { class: 'bar' }, h('i', { style: 'width:0%' }), h('b', { class: 'buf' }));
      self.times = h('div', { class: 'times' }, h('span', { text: '0:00' }), h('span', { text: '0:00' }));
      // Beim Spulen erscheint die Zielzeit über dem Balken
      self.seekTime = h('div', { class: 'seek-time is-hidden' });
      self.barWrap = h('div', { class: 'bar-wrap' }, self.bar, self.seekTime);
      self.ctrlLeft = h('div', { class: 'ctrl-side left' });
      self.ctrls = h('div', { class: 'ctrls' });
      self.loadTxt = h('p', { class: 'load-txt' });
      self.spinner = h('div', { class: 'loading' }, h('div', { class: 'spinner' }), self.loadTxt);
      self.err = h('div', { class: 'state', style: 'display:none' });
      self.zap = h('div', { class: 'zap is-hidden' });
      // Ton & Untertitel: der Knopf erscheint nur, wenn der Stream wirklich mehrere Tonspuren oder Untertitel hat
      self.tracksBtn = h('button', { class: 'cbtn f is-gone', 'data-c': 'tracks', title: T('Ton & Untertitel'), 'aria-label': T('Ton & Untertitel'), onclick: function () { self.openTracks(); } }, icon('tracks'));
      // Bildformat (Original, Zoom, Strecken, 16:9, 4:3) und bei Live-Sendern das Stream-Format (HLS / MPEG-TS)
      self.fmtBtn = h('button', { class: 'cbtn f', 'data-c': 'format', title: T('Format'), 'aria-label': T('Format'), onclick: function () { self.openFormat(); } }, icon('aspect'));
      // Sender ausblenden (nur Live): erscheint dann nicht mehr in den Senderlisten
      self.hideBtn = h('button', { class: 'cbtn f is-gone', 'data-c': 'hide', title: T('Sender ausblenden'), 'aria-label': T('Sender ausblenden'), onclick: function () { self.askHide(); } }, icon('eyeOff'));
      var fsOk = !Platform.tv && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
      self.fsBtn = fsOk ? h('button', { class: 'cbtn f', 'data-c': 'fs', title: T('Vollbild (F)'), 'aria-label': T('Vollbild'), onclick: function () { self.toggleFullscreen(); } }, icon('fullscreen')) : null;
      self.osd = h('div', { class: 'osd' },
        h('div', { class: 'osd-top' }, h('button', { class: 'btn f', onclick: goBack }, icon('back'), h('span', { text: T('Zurück') })), self.liveTag, self.title, self.qTag),
        h('div', { class: 'osd-bottom' }, self.info, self.barWrap, self.times,
          h('div', { class: 'ctrl-row' }, self.ctrlLeft, self.ctrls, h('div', { class: 'ctrl-side right' }, self.hideBtn, self.fmtBtn, self.tracksBtn, self.fsBtn, self.volumeUi()))));
      self.miniTitle = h('span', { class: 'mini-title' });
      self.miniUi = h('div', { class: 'mini-ui' },
        h('button', { class: 'mini-open f', title: T('Vollbild'), onclick: function () { self.maximize(); } }, self.miniTitle),
        self.miniMute = h('button', { class: 'mini-mute f', title: T('Ton an/aus'), 'aria-label': T('Ton an/aus'), onclick: function () { self.setMuted(!self.video.muted); } }),
        h('button', { class: 'mini-close f', title: T('Schließen'), onclick: function () { self.close(); } }, icon('close')));
      self.el = h('div', { class: 'player' }, video, self.spinner, self.osd, self.zap, self.err, self.miniUi);
      self.paintVol();
      self.onResize = function () { self.applyAspect(); };
      window.addEventListener('resize', self.onResize);
      setTimeout(function () { self.applyAspect(); }, 0);

      // Spulen mit Maus oder Finger: Vorschau beim Bewegen, beim Loslassen wird gesprungen
      var barWrap = self.barWrap, dragging = false;
      function frac(x) { var r = self.bar.getBoundingClientRect(); return r.width ? Math.max(0, Math.min(1, (x - r.left) / r.width)) : 0; }
      function px(e) {
        if (e.touches && e.touches[0]) return e.touches[0].clientX;
        if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
        return e.clientX;
      }
      barWrap.addEventListener('mousemove', function (e) {
        if (dragging || !self.canSeek()) return;
        self.preview(frac(px(e)) * video.duration);
      });
      barWrap.addEventListener('mouseleave', function () { if (!dragging && self.scrubT == null) self.hidePreview(); });
      function down(e) {
        if (!self.canSeek()) return;
        if (e.type === 'mousedown' && e.button) return;
        e.preventDefault();
        dragging = true;
        var touch = e.type === 'touchstart';
        clearTimeout(self.scrubTimer);
        self.scrubT = frac(px(e)) * video.duration;
        self.preview(self.scrubT);
        self.showOsd(true);
        function move(ev) {
          ev.preventDefault();
          self.scrubT = frac(px(ev)) * video.duration;
          self.preview(self.scrubT);
        }
        function up(ev) {
          document.removeEventListener(touch ? 'touchmove' : 'mousemove', move);
          document.removeEventListener(touch ? 'touchend' : 'mouseup', up);
          document.removeEventListener('touchcancel', up);
          dragging = false;
          var t = self.scrubT;
          if (t == null) return;
          self.commitTo(t);
        }
        document.addEventListener(touch ? 'touchmove' : 'mousemove', move, { passive: false });
        document.addEventListener(touch ? 'touchend' : 'mouseup', up);
        if (touch) document.addEventListener('touchcancel', up);
      }
      barWrap.addEventListener('mousedown', down);
      barWrap.addEventListener('touchstart', down, { passive: false });
      // Einmal tippen/klicken: Bedienleiste zeigen oder verstecken.
      // Doppelt tippen/klicken (Handy, Tablet, PC): Player klein machen – im kleinen Player öffnet ein Klick wieder groß.
      var lastTap = 0;
      self.el.addEventListener('click', function (e) {
        if (self.mini || (e.target !== video && e.target !== self.osd)) return;
        var now = Date.now();
        if (!Platform.tv && now - lastTap < 400 && now - (self.maxAt || 0) > 800) {
          lastTap = 0;
          self.minimize();
          return;
        }
        lastTap = now;
        self.toggleOsd();
      });
      self.el.addEventListener('mousemove', function () { self.showOsd(); });
      // Mausrad = Lautstärke (PC)
      self.el.addEventListener('wheel', function (e) {
        if (self.mini) return;
        e.preventDefault();
        self.setVolume(self.video.volume + (e.deltaY < 0 ? 0.05 : -0.05));
        self.showOsd();
      }, { passive: false });

      video.addEventListener('waiting', function () { if (!self.reconnect) self.loadTxt.textContent = T('Wird geladen …'); self.spinner.style.display = ''; });
      video.addEventListener('playing', function () {
        self.spinner.style.display = 'none'; self.err.style.display = 'none'; self.reconnect = false;
        self.netRetries = 0; self.playedSince = Date.now();
        self.paintCtrls(); self.updateTracks();
      });
      video.addEventListener('progress', function () { self.paintBuffer(); });
      function paintQuality() {
        var hh = video.videoHeight || 0;
        self.qTag.textContent = !hh ? '' : hh >= 2000 ? '4K' : hh >= 1400 ? '1440p' : hh >= 1000 ? 'Full HD 1080p' : hh >= 700 ? 'HD 720p' : 'SD ' + hh + 'p';
        self.qTag.className = 'q-tag' + (hh >= 1000 ? ' is-hd' : hh && hh < 700 ? ' is-sd' : '');
      }
      video.addEventListener('loadedmetadata', paintQuality);
      video.addEventListener('resize', paintQuality);
      if (video.audioTracks && video.audioTracks.addEventListener) video.audioTracks.addEventListener('addtrack', function () { self.updateTracks(); });
      if (video.textTracks && video.textTracks.addEventListener) video.textTracks.addEventListener('addtrack', function () { self.updateTracks(); });
      video.addEventListener('pause', function () { self.paintCtrls(); self.showOsd(true); });
      video.addEventListener('loadedmetadata', function () {
        if (self.isVod() && self.resumeAt) { try { video.currentTime = self.resumeAt; } catch (e) {} toast(T('Fortgesetzt bei {0}', fmtTime(self.resumeAt))); self.resumeAt = 0; }
      });
      video.addEventListener('timeupdate', function () { self.paintProgress(); });
      video.addEventListener('ended', function () { self.onEnded(); });
      video.addEventListener('error', function () {
        if (self.hls) return;   // hls.js meldet seine Fehler selbst (und versucht es erst noch einmal)
        self.errInfo = 'Video-Fehler ' + (video.error ? video.error.code : '?') + (self.ts ? ' (mpegts.js)' : '');
        self.onError(T('Das Video konnte nicht abgespielt werden (Format oder Verbindung).'));
      });

      Screens.push('player', self.el, self.screenOpts());
      self.enterFullscreen();
      self.load(item);
    },

    isVod: function () { return this.item && this.item.kind !== 'live'; },

    screenOpts: function () {
      var self = this;
      return {
        onLeave: function () { self.teardown(); },
        // Zurück bei Live TV: Sender läuft klein weiter
        onBack: function () {
          if (self.closeTracks()) { self.showOsd(); return true; }
          if (self.nextBox) { self.nextCancel(); return false; }
          if (self.scrubT != null) { self.cancelScrub(); return true; }
          if (self.item && self.item.kind === 'live' && self.err.style.display === 'none') { self.minimize(); return true; }
          return false;
        }
      };
    },

    minimize: function () {
      var self = this;
      if (!self.el || self.mini) return;
      var idx = -1;
      Screens.stack.forEach(function (s, i) { if (s.el === self.el) idx = i; });
      if (idx < 0) return;
      Screens.stack.splice(idx, 1);
      Screens.mark();
      self.mini = true;
      clearTimeout(self.hideTimer);
      self.exitFullscreen();
      self.el.classList.add('is-mini');
      document.body.classList.add('has-mini');
      self.applyAspect();
      var prev = Screens.top();
      if (prev) {
        prev.el.classList.remove('is-off');
        if (prev.onShow) prev.onShow();
        var f = prev.lastFocus;
        setTimeout(function () { if (f && document.body.contains(f)) Nav.focus(f); else Nav.focusFirst(prev.el); self.place(); }, 20);
      }
      self.lastPlace = '';
      self.place();
      clearInterval(self.placeTimer);
      self.placeTimer = setInterval(function () { self.place(); }, 300);
    },

    maximize: function () {
      var self = this;
      if (!self.el || !self.mini) return;
      self.mini = false;
      self.maxAt = Date.now();
      clearInterval(self.placeTimer);
      self.el.classList.remove('is-mini', 'is-docked');
      document.body.classList.remove('has-mini');
      var st = self.el.style;
      st.left = st.top = st.width = st.height = '';
      self.lastPlace = '';
      Screens.push('player', self.el, self.screenOpts());
      self.enterFullscreen();
      self.showOsd();
      self.applyAspect();
    },

    close: function () {
      if (!this.el) return;
      if (this.mini) {
        var el = this.el;
        this.teardown();
        if (el.parentNode) el.parentNode.removeChild(el);
        return;
      }
      var top = Screens.top();
      if (top && top.el === this.el) Screens.pop();
    },

    /* Mini-Player im Live-Bereich rechts andocken, sonst unten rechts in der Ecke */
    place: function () {
      if (!this.mini || !this.el) return;
      var top = Screens.top(), slot = null;
      if (top) { var s = top.el.querySelector('.mini-slot-box'); if (s && s.offsetWidth > 0) slot = s; }
      var key = 'corner';
      if (slot) { var r = slot.getBoundingClientRect(); key = Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + ',' + Math.round(r.height); }
      if (key !== this.lastPlace) {
        this.lastPlace = key;
        var st = this.el.style;
        if (slot) {
          var p = key.split(',');
          st.left = p[0] + 'px'; st.top = p[1] + 'px'; st.width = p[2] + 'px'; st.height = p[3] + 'px';
          this.el.classList.add('is-docked');
        } else {
          st.left = st.top = st.width = st.height = '';
          this.el.classList.remove('is-docked');
        }
      }
      var info = top && top.el.querySelector('.mini-slot-info');
      if (!info) return;
      var k = (this.item ? this.item.name : '') + '|' + (this.epgNow || '') + '|' + (this.epgNext || '');
      if (info.getAttribute('data-k') === k) return;
      info.setAttribute('data-k', k);
      clear(info);
      info.appendChild(h('div', { class: 'title', text: this.item ? this.item.name : '' }));
      if (this.epgNow) info.appendChild(h('div', { class: 'now', text: this.epgNow }));
      if (this.epgNext) info.appendChild(h('div', { class: 'next', text: this.epgNext }));
      info.appendChild(h('p', { class: 'hint', text: T('Denselben Sender noch einmal wählen öffnet das Vollbild.') }));
    },

    switchTo: function (item, ctx) {
      this.saveResume();
      if (ctx) this.ctx = ctx;
      this.load(item);
    },

    load: function (item) {
      var self = this;
      self.item = item;
      markPlaying(item);
      self.triedAlt = false; self.retried = false; self.forceHlsJs = false; self.rawFail = false;
      self.netRetries = 0; self.stallRetries = 0; self.swappedCodec = false; self.mediaRecoverAt = 0; self.reconnect = false;
      self.closeTracks();
      if (self.nextCancel) self.nextCancel();
      if (self.tracksBtn) self.tracksBtn.classList.add('is-gone');
      self.err.style.display = 'none';
      self.spinner.style.display = '';
      self.loadTxt.textContent = item.kind === 'live' ? T('{0} wird geladen …', item.name) : T('Wird geladen …');
      self.epgNow = ''; self.epgNext = '';
      clearInterval(self.epgTimer);
      if (self.miniTitle) self.miniTitle.textContent = item.name;
      self.lastPlace = '';
      self.title.textContent = item.kind === 'episode' ? (item.seriesName ? item.seriesName + ' · ' : '') + 'S' + item.season + ' E' + item.num + ' – ' + item.name : item.name;
      self.liveTag.style.display = item.kind === 'live' ? '' : 'none';
      if (self.hideBtn) self.hideBtn.classList.toggle('is-gone', item.kind !== 'live');
      self.bar.classList.toggle('seek', self.isVod());
      self.bar.classList.toggle('f', self.isVod());
      if (self.isVod()) self.bar.setAttribute('tabindex', '0'); else self.bar.removeAttribute('tabindex');
      self.scrubT = null; self.scrubN = 0; clearTimeout(self.scrubTimer);
      self.hidePreview();
      self.times.style.display = self.isVod() ? '' : 'none';
      self.bar.firstChild.style.width = '0%';
      clear(self.info);
      self.paintCtrls();
      self.showOsd();

      var r = Resume.get(item);
      self.resumeAt = self.isVod() && r && !(self.ctx && self.ctx.fromStart) ? r.t : 0;
      if (self.ctx) self.ctx.fromStart = false;
      if (item.kind === 'live') { Recent.push(item); self.loadEpg(); }
      Last.set(item);

      var src = App.provider.streamUrl(item);
      self.alt = src.alt;
      self.attach(src.url);

      clearInterval(self.saveTimer);
      self.saveTimer = setInterval(function () { self.saveResume(); }, 10000);
      // Wächter: hängt das Bild zu lange fest, wird der Stream automatisch neu verbunden
      clearInterval(self.wdTimer); self.wdStill = 0; self.wdLastT = -1;
      self.wdTimer = setInterval(function () { self.watchdog(); }, 2000);
    },

    watchdog: function () {
      var v = this.video;
      if (!v || v.paused || v.ended || this.err.style.display !== 'none') { this.wdStill = 0; return; }
      if (v.currentTime === this.wdLastT) this.wdStill += 2; else { this.wdStill = 0; if (this.playedSince && Date.now() - this.playedSince > 30000) this.stallRetries = 0; }
      this.wdLastT = v.currentTime;
      if (this.wdStill < (this.item && this.item.kind === 'live' ? 10 : 18)) return;   // Live: nach 10 s Stillstand neu verbinden
      this.wdStill = 0;
      if (this.stallRetries >= 3) { this.errInfo = 'Stillstand (3 Versuche)'; this.onError(T('Der Stream hängt und lässt sich gerade nicht wiederherstellen.')); return; }
      this.stallRetries++;
      if (this.isVod() && v.currentTime > 1) this.resumeAt = v.currentTime;
      this.reconnecting();
      this.attach(this.curUrl);
    },
    reconnecting: function () {
      this.reconnect = true;
      this.loadTxt.textContent = T('Verbindung wird wiederhergestellt …');
      this.spinner.style.display = '';
    },

    attach: function (url) {
      var self = this, video = self.video;
      self.destroyHls();
      self.curUrl = url;
      self.usingNative = false;
      var nativeHls = !!video.canPlayType('application/vnd.apple.mpegurl');
      // Android-App: zuerst den eingebauten Android-Player nutzen (zuverlässiger für Live-Sender),
      // nur wenn das scheitert, hls.js versuchen
      var preferNative = Platform.safari || Platform.tizen || Platform.webos || (Platform.android && !self.forceHlsJs && Settings.get('engine') !== 'hlsjs');
      if (isHlsUrl(url) && !(nativeHls && preferNative)) {
        ensureHls().then(function (Hls) {
          // inzwischen umgeschaltet? Dann nicht noch einen zweiten hls.js-Player an dasselbe Video hängen
          if (self.video !== video || self.curUrl !== url) return;
          if (Hls && Hls.isSupported()) {
            // PC (Windows/Mac): gleich in hoher Qualität starten und nicht an die Fenstergröße koppeln –
            // sonst bleibt das Bild nach der kleinen Vorschau lange unscharf. „Beste Qualität“ hält die höchste Stufe fest.
            var desktop = !Platform.tv && !Platform.android && !Platform.ios && !Platform.lite;
            var best = Settings.get('quality') === 'best';
            var hls = new Hls({
              enableWorker: true, lowLatencyMode: false, backBufferLength: Platform.lite ? 10 : 30,
              // PC: größerer Puffer (genug Speicher) – überbrückt kurze Einbrüche beim Anbieter, statt zu hängen
              maxBufferLength: desktop ? 60 : 30, maxMaxBufferLength: Platform.lite ? 40 : desktop ? 120 : 60,
              capLevelToPlayerSize: !desktop && !best,              // im kleinen Player auf schwachen Geräten keine volle Auflösung laden
              // Startschätzung der Internetgeschwindigkeit. Vorher 8 Mbit/s am PC: startete bei langsameren Servern zu hoch
              // und lief leer („hängt“, auch bei den Demo-Videos). 4 Mbit/s ≈ gutes HD, steigt danach von selbst.
              abrEwmaDefaultEstimate: desktop ? 4000000 : 1500000,
              abrBandWidthUpFactor: 0.7,                            // erst hochschalten, wenn deutlich Luft ist
              fragLoadingMaxRetry: 4, levelLoadingMaxRetry: 3, manifestLoadingMaxRetry: 2,
              // Gegen Hänger bei Live-Sendern: kleine Lücken im Stream überspringen und nach einem Hänger
              // wieder an die aktuelle Stelle springen statt immer weiter hinterherzulaufen
              maxBufferHole: 0.5, nudgeMaxRetry: 6, highBufferWatchdogPeriod: 2,
              liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 8
            });
            self.hls = hls;
            hls.on(Hls.Events.ERROR, function (ev, data) {
              if (!data.fatal || self.hls !== hls) return;
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                var now = Date.now();
                if (!self.mediaRecoverAt || now - self.mediaRecoverAt > 10000) { self.mediaRecoverAt = now; hls.recoverMediaError(); return; }
                if (!self.swappedCodec) { self.swappedCodec = true; self.mediaRecoverAt = now; hls.swapAudioCodec(); hls.recoverMediaError(); return; }
              }
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && self.netRetries < 4) {
                var delay = 1000 * Math.pow(2, self.netRetries++);
                var manifest = /manifest/i.test(String(data.details || ''));
                self.reconnecting();
                setTimeout(function () { if (self.hls !== hls) return; if (manifest) self.attach(self.curUrl); else hls.startLoad(); }, delay);
                return;
              }
              self.errInfo = 'hls.js ' + data.type + ' ' + data.details + (data.response && data.response.code ? ' HTTP ' + data.response.code : '');
              self.onError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? T('Der Stream ist nicht erreichbar.') : T('Der Stream konnte nicht abgespielt werden.'));
            });
            hls.on(Hls.Events.MANIFEST_PARSED, function () {
              if (best && hls.levels && hls.levels.length > 1) { try { hls.currentLevel = hls.levels.length - 1; } catch (e) {} }
              self.playSafe();
            });
            if (Hls.Events.AUDIO_TRACKS_UPDATED) hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, function () { self.updateTracks(); });
            if (Hls.Events.SUBTITLE_TRACKS_UPDATED) hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, function () { self.updateTracks(); });
            hls.loadSource(url);
            hls.attachMedia(video);
          } else {
            video.src = url; self.playSafe();
          }
        });
      // Fernseher (Tizen/webOS) und Apple-Geräte können rohe TV-Signale meist selbst öffnen,
      // Windows, Mac und Android nicht – dort übernimmt mpegts.js.
      } else if (isTsUrl(url) && !(Platform.tizen || Platform.webos || Platform.safari || Platform.ios)) {
        // Rohes TV-Signal im Browser (Windows, Mac, Fernseher-Browser): erst umpacken lassen,
        // sonst bleibt das Bild schwarz, weil kein Browser MPEG-TS direkt öffnen kann.
        // Klappt das Umpacken nicht (kein Netz für die Hilfsdatei, oder der Anbieter
        // liefert doch etwas anderes), probieren wir es ganz normal weiter.
        var plain = function () {
          if (self.video !== video || self.curUrl !== url) return;
          self.destroyHls();
          self.rawFail = true;
          video.src = url;
          self.playSafe();
        };
        ensureTs().then(function (mpegts) {
          if (self.video !== video || self.curUrl !== url) return;
          var ok = mpegts && mpegts.getFeatureList && mpegts.getFeatureList().mseLivePlayback;
          if (!ok) { plain(); return; }
          var p = mpegts.createPlayer({ type: 'mpegts', isLive: self.item && self.item.kind === 'live', url: url },
            { enableWorker: true, liveBufferLatencyChasing: true, lazyLoad: false, stashInitialSize: 128 });
          self.ts = p;
          p.on(mpegts.Events.ERROR, function () { if (self.ts === p) plain(); });
          try {
            p.attachMediaElement(video);
            p.load();
            self.playSafe();
          } catch (e) { plain(); }
        });
      } else {
        self.usingNative = isHlsUrl(url) || isTsUrl(url);
        video.src = url;
        self.playSafe();
      }
    },

    playSafe: function () {
      var self = this;
      var p = self.video.play();
      if (p && p.catch) p.catch(function () { self.spinner.style.display = 'none'; self.paintCtrls(); self.showOsd(true); });
    },

    onError: function (msg) {
      var self = this;
      if (self.usingNative && Platform.android && !self.forceHlsJs) { self.forceHlsJs = true; self.retried = false; self.attach(self.curUrl); return; }
      if (self.alt && !self.triedAlt) { self.triedAlt = true; self.retried = false; self.attach(self.alt); return; }
      self.spinner.style.display = 'none';
      self.reconnect = false;
      clearInterval(self.wdTimer);
      var it = self.item || {};
      ErrLog.add('Wiedergabe', msg + ' | ' + (it.kind || '?') + (it.ext ? ' .' + it.ext : '') + (self.errInfo ? ' | ' + self.errInfo : ''));
      self.errInfo = '';
      clear(self.err);
      self.err.appendChild(h('h3', { text: T('Wiedergabe nicht möglich') }));
      self.err.appendChild(h('p', { text: msg }));
      var ext = String((self.item && self.item.ext) || '').toLowerCase();
      if (self.rawFail) self.err.appendChild(h('p', { class: 'hint', text: T('Solche Sender heißen beim Anbieter oft „RAW“. Sie werden unverändert durchgeleitet. Auf einer Android-TV-Box oder einem Fire TV Stick laufen sie meist – notfalls über einen externen Player wie VLC (Einstellungen → Wiedergabe).') }));
      else if (self.isVod() && /^(mkv|avi|wmv|flv)$/.test(ext)) self.err.appendChild(h('p', { class: 'hint', text: T('Dieser Film liegt im Format {0} vor. Nicht jedes Gerät kann dieses Format abspielen.', ext.toUpperCase()) }));
      else if (typeof navigator.onLine === 'boolean' && !navigator.onLine) self.err.appendChild(h('p', { class: 'hint', text: T('Dein Gerät ist gerade offline. Sobald das Internet wieder da ist, geht es automatisch weiter.') }));
      self.err.appendChild(h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'btn f primary', onclick: function () { self.load(self.item); } }, T('Erneut versuchen')),
        h('button', { class: 'btn f', onclick: goBack }, T('Schließen'))));
      self.err.style.display = '';
      setTimeout(function () { if (!self.mini) Nav.focus($('.btn', self.err)); }, 30);
    },

    onEnded: function () {
      var self = this;
      Resume.set(self.item, 0, 0);
      var c = self.ctx;
      if (self.isVod()) Seen.add(self.item);
      if (self.item.kind === 'live') { self.reconnecting(); self.attach(self.curUrl); return; }   // Live-Sender „enden“ nicht – neu verbinden
      if (self.item.kind === 'episode' && c && c.list && c.index < c.list.length - 1) { self.showNext(c.list[c.index + 1]); return; }
      if (self.isVod()) goBack();
    },
    /* Nächste Folge: kleine Karte mit Countdown, wie bei Netflix */
    showNext: function (next) {
      var self = this, left = 10;
      if (self.mini) { self.ctx.index++; self.load(next); return; }
      var count = h('span', { class: 'nx-count' });
      function paint() { count.textContent = T('Startet in {0} Sekunden', left); }
      function cleanup() { clearInterval(self.nextTimer); if (box.parentNode) box.parentNode.removeChild(box); self.nextBox = null; self.nextCancel = null; }
      function go() { cleanup(); self.ctx.index++; self.load(next); }
      var box = h('div', { class: 'next-ep' },
        next.logo ? h('span', { class: 'nx-thumb' }, img(next.logo)) : null,
        h('div', { class: 'nx-info' }, h('small', { text: T('Nächste Folge') }), h('b', { text: 'S' + next.season + ' E' + next.num + ' · ' + next.name }), count,
          h('div', { class: 'row' },
            h('button', { class: 'btn f primary', onclick: go }, icon('play'), h('span', { text: T('Jetzt abspielen') })),
            h('button', { class: 'btn f', onclick: function () { cleanup(); goBack(); } }, T('Schließen')))));
      paint();
      self.nextBox = box; self.nextCancel = cleanup;
      self.el.appendChild(box);
      self.hideOsd();
      setTimeout(function () { Nav.focus($('.btn', box)); }, 30);
      clearInterval(self.nextTimer);
      self.nextTimer = setInterval(function () { left--; if (left <= 0) go(); else paint(); }, 1000);
    },

    /* ---------- Ton & Untertitel ---------- */
    tracks: function () {
      var v = this.video, hls = this.hls, out = { audio: [], subs: [] };
      if (!v) return out;
      if (hls) {
        (hls.audioTracks || []).forEach(function (t, i) { out.audio.push({ label: trackLabel(t.name, t.lang, i), on: hls.audioTrack === i, pick: function () { hls.audioTrack = i; } }); });
        var st = hls.subtitleTracks || [];
        if (st.length) {
          out.subs.push({ label: T('Aus'), on: hls.subtitleTrack === -1, pick: function () { hls.subtitleTrack = -1; } });
          st.forEach(function (t, i) { out.subs.push({ label: trackLabel(t.name, t.lang, i), on: hls.subtitleTrack === i, pick: function () { hls.subtitleDisplay = true; hls.subtitleTrack = i; } }); });
        }
        return out;
      }
      var at = v.audioTracks;
      if (at && at.length) {
        for (var i = 0; i < at.length; i++) (function (t, i) {
          out.audio.push({ label: trackLabel(t.label, t.language, i), on: !!t.enabled, pick: function () { for (var j = 0; j < at.length; j++) at[j].enabled = j === i; } });
        })(at[i], i);
      }
      var subs = [], tt = v.textTracks;
      if (tt) for (var k = 0; k < tt.length; k++) if (tt[k].kind === 'subtitles' || tt[k].kind === 'captions') subs.push(tt[k]);
      if (subs.length) {
        out.subs.push({ label: T('Aus'), on: !some(subs, function (x) { return x.mode === 'showing'; }), pick: function () { subs.forEach(function (x) { x.mode = 'disabled'; }); } });
        subs.forEach(function (t, i) { out.subs.push({ label: trackLabel(t.label, t.language, i), on: t.mode === 'showing', pick: function () { subs.forEach(function (x) { x.mode = x === t ? 'showing' : 'disabled'; }); } }); });
      }
      return out;
    },
    updateTracks: function () {
      if (!this.tracksBtn) return;
      var t = this.tracks();
      this.tracksBtn.classList.toggle('is-gone', !(t.audio.length > 1 || t.subs.length > 1));
    },
    openTracks: function () {
      var t = this.tracks();
      this.openPanel([[T('Tonspur'), t.audio], [T('Untertitel'), t.subs]]);
    },
    /* Auswahlfenster im Player (Ton & Untertitel, Format). Abschnitte mit nur einer Möglichkeit werden weggelassen. */
    openPanel: function (sections) {
      var self = this;
      self.closeTracks();
      var box = h('div', { class: 'track-panel' });
      sections.forEach(function (s) {
        if (!s || s[1].length < 2) return;
        var title = s[0], sec = h('div', { class: 'tp-sec' }, h('h3', { text: title }));
        s[1].forEach(function (o) {
          sec.appendChild(h('button', { class: 'tp-opt f' + (o.on ? ' is-on' : ''), onclick: function () { o.pick(); self.closeTracks(); self.showOsd(); toast(title + ': ' + o.label); } },
            h('span', { text: o.label }), o.on ? icon('check') : null));
        });
        box.appendChild(sec);
      });
      if (!box.firstChild) return;
      self.trackPanel = box;
      self.el.appendChild(box);
      clearTimeout(self.hideTimer);
      setTimeout(function () { Nav.focus($('.tp-opt.is-on', box) || $('.tp-opt', box)); }, 30);
    },
    askHide: function () {
      var it = this.item;
      if (it && it.kind === 'live') askHideChannel(it);
    },
    /* Verpasste Sendungen des laufenden Senders als Liste im Player (nach Tagen) */
    openArchive: function () {
      var self = this, ch = self.item;
      if (!ch || !ch.archive || !App.provider || !App.provider.archive) return;
      self.closeTracks();
      var head = h('h3', { text: T('Verpasste Sendungen') });
      var box = h('div', { class: 'track-panel arch-panel' }, h('div', { class: 'tp-sec' }, head, h('p', { class: 'tp-note', text: T('Wird geladen …') })));
      self.trackPanel = box;
      self.el.appendChild(box);
      clearTimeout(self.hideTimer);
      App.provider.archive(ch).then(function (progs) {
        if (self.trackPanel !== box) return;
        clear(box);
        if (!progs || !progs.length) {
          box.appendChild(h('div', { class: 'tp-sec' }, head, h('p', { class: 'tp-note', text: T('Für diesen Sender gibt es gerade keine Aufzeichnungen.') })));
          return;
        }
        var day = null, sec = null;
        progs.forEach(function (e) {
          var d = new Date(e.start * 1000), k = d.toDateString();
          if (k !== day) { sec = h('div', { class: 'tp-sec' }, h('h3', { text: (day ? '' : T('Verpasste Sendungen') + ' · ') + archDayLabel(d) })); day = k; box.appendChild(sec); }
          sec.appendChild(h('button', { class: 'tp-opt f', onclick: function () {
            var it = App.provider.catchup(ch, e);
            self.closeTracks();
            playItem(it, { list: [it], index: 0 });
          } }, h('b', { class: 'tp-time', text: fmtClock(e.start) }), h('span', { text: e.title || T('Ohne Titel') })));
        });
        setTimeout(function () { var f = $('.tp-opt', box); if (f && self.trackPanel === box) Nav.focus(f); }, 30);
      }, function () {
        if (self.trackPanel !== box) return;
        clear(box).appendChild(h('div', { class: 'tp-sec' }, head, h('p', { class: 'tp-note', text: T('Aufzeichnungen konnten nicht geladen werden.') })));
      });
    },
    openFormat: function () {
      var self = this, cur = Settings.get('aspect') || 'fit';
      var aspects = [['fit', T('Original')], ['fill', T('Bild füllen (Zoom)')], ['stretch', T('Strecken')], ['16:9', '16:9'], ['4:3', '4:3']].map(function (a) {
        return { label: a[1], on: cur === a[0], pick: function () { Settings.set('aspect', a[0]); self.applyAspect(); } };
      });
      var sections = [[T('Bildformat'), aspects]];
      if (self.item && self.item.kind === 'live' && App.provider && App.provider.type === 'xtream') {
        var lf = Settings.get('liveFormat') === 'ts' ? 'ts' : 'm3u8';
        sections.push([T('Stream-Format'), [['m3u8', 'HLS (.m3u8)'], ['ts', 'MPEG-TS (.ts)']].map(function (f) {
          // Wechsel lädt den Sender sofort neu; gilt danach für alle Live-Sender
          return { label: f[1], on: lf === f[0], pick: function () { if (lf === f[0]) return; Settings.set('liveFormat', f[0]); self.load(self.item); } };
        })]);
      }
      // Android: eingebauter Android-Player oder der Telvo-eigene Player (hls.js) – je nach Gerät läuft einer stabiler
      if (Platform.android) {
        var en = NativePlayer.engine();
        var opts = [['auto', T('Android-Player')], ['hlsjs', T('Telvo-Player')]];
        if (NativePlayer.available()) opts.unshift(['native', T('TV-Player')]);
        sections.push([T('Wiedergabe'), opts.map(function (f) {
          return { label: f[1], on: en === f[0], pick: function () {
            if (en === f[0]) return;
            Settings.set('engine', f[0]); self.forceHlsJs = false;
            if (f[0] === 'native') { var it = self.item, c = self.ctx; self.close(); setTimeout(function () { playItem(it, c); }, 60); }
            else self.load(self.item);
          } };
        })]);
      }
      self.openPanel(sections);
    },
    /* Bildformat anwenden. Im kleinen Vorschaufenster immer „Original“. */
    applyAspect: function () {
      var v = this.video, el = this.el;
      if (!v || !el) return;
      var a = this.mini ? 'fit' : (Settings.get('aspect') || 'fit'), st = v.style;
      st.objectFit = a === 'fill' ? 'cover' : (a === 'stretch' || a === '16:9' || a === '4:3') ? 'fill' : '';
      if (a === '16:9' || a === '4:3') {
        var W = el.clientWidth, H = el.clientHeight, r = a === '16:9' ? 16 / 9 : 4 / 3;
        var w = Math.min(W, H * r), hh = w / r;
        st.width = Math.round(w) + 'px'; st.height = Math.round(hh) + 'px';
        st.left = Math.round((W - w) / 2) + 'px'; st.top = Math.round((H - hh) / 2) + 'px';
      } else st.width = st.height = st.left = st.top = '';
    },
    closeTracks: function () {
      var had = !!this.trackPanel;
      if (had && this.trackPanel.parentNode) this.trackPanel.parentNode.removeChild(this.trackPanel);
      this.trackPanel = null;
      return had;
    },
    toggleFullscreen: function () {
      var fe = document.fullscreenElement || document.webkitFullscreenElement;
      if (fe) this.exitFullscreen(); else this.enterFullscreen();
      this.showOsd();
    },
    paintBuffer: function () {
      if (!this.isVod() || !this.video || !this.bar) return;
      var v = this.video, d = v.duration, b = this.bar.querySelector('.buf');
      if (!b || !d || !isFinite(d)) return;
      var end = 0, t = v.currentTime;
      try { for (var i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= t + 1 && v.buffered.end(i) > end) end = v.buffered.end(i); } catch (e) {}
      b.style.width = Math.min(100, end / d * 100) + '%';
    },

    loadEpg: function () {
      var self = this, item = self.item;
      clearInterval(self.epgTimer);
      function paint() {
        App.provider.epg(item).then(function (list) {
          if (self.item !== item) return;
          clear(self.info);
          var now = Date.now() / 1000;
          var cur = list.filter(function (e) { return e.start <= now && e.end > now; })[0] || list[0];
          if (!cur) { self.epgNow = ''; self.epgNext = ''; self.info.appendChild(h('div', { class: 'now', text: item.name })); self.bar.style.display = 'none'; return; }
          var next = list.filter(function (e) { return e.start >= cur.end - 1; })[0];
          self.info.appendChild(h('div', { class: 'now', text: fmtClock(cur.start) + ' – ' + fmtClock(cur.end) + '  ' + cur.title }));
          if (next) self.info.appendChild(h('div', { class: 'next', text: T('Danach: {0}', fmtClock(next.start) + '  ' + next.title) }));
          self.epgNow = fmtClock(cur.start) + ' – ' + fmtClock(cur.end) + '  ' + cur.title;
          self.epgNext = next ? T('Danach: {0}', fmtClock(next.start) + '  ' + next.title) : '';
          self.lastPlace = '';
          self.bar.style.display = '';
          var pct = Math.max(0, Math.min(100, (now - cur.start) / (cur.end - cur.start) * 100));
          self.bar.firstChild.style.width = pct + '%';
        });
      }
      paint();
      self.epgTimer = setInterval(paint, 60000);
    },

    paintProgress: function () {
      if (!this.isVod()) return;
      var v = this.video, d = v.duration || 0;
      if (!d || !isFinite(d)) return;
      var cur = this.scrubT != null ? this.scrubT : v.currentTime;
      this.bar.style.display = '';
      this.bar.firstChild.style.width = (cur / d * 100) + '%';
      this.times.firstChild.textContent = fmtTime(cur);
      this.times.lastChild.textContent = '-' + fmtTime(d - cur) + '  ·  ' + T('Ende {0}', fmtClock(Date.now() / 1000 + (d - cur) / (this.video.playbackRate || 1)));
      this.paintBuffer();
    },

    paintCtrls: function () {
      var self = this, v = self.video;
      if (!self.ctrls) return;
      var had = (self.ctrls.contains(document.activeElement) || self.ctrlLeft.contains(document.activeElement)) ? document.activeElement.getAttribute('data-c') : null;
      clear(self.ctrls); clear(self.ctrlLeft);
      function cbtn(c, ic, label, fn, cls, num) {
        return h('button', { class: 'cbtn f' + (cls ? ' ' + cls : '') + (num ? ' has-num' : ''), 'data-c': c, title: label, 'aria-label': label, onclick: fn }, icon(ic), num ? h('small', { text: num }) : null);
      }
      var playBtn = cbtn('play', v.paused ? 'play' : 'pause', v.paused ? T('Abspielen') : T('Pause'), function () { self.togglePlay(); }, 'big');
      playBtn.setAttribute('data-autofocus', '');
      if (self.isVod()) {
        self.ctrls.appendChild(cbtn('rew', 'rew', T('15 Sekunden zurück'), function () { self.seek(-15); }, '', '15'));
        self.ctrls.appendChild(playBtn);
        self.ctrls.appendChild(cbtn('fwd', 'fwd', T('30 Sekunden vor'), function () { self.seek(30); }, '', '30'));
      } else {
        self.ctrls.appendChild(cbtn('prev', 'up', T('Vorheriger Sender'), function () { self.zapBy(-1); }));
        self.ctrls.appendChild(playBtn);
        self.ctrls.appendChild(cbtn('next', 'down', T('Nächster Sender'), function () { self.zapBy(1); }));
      }
      if (self.item && self.item.kind === 'live' && self.item.archive && App.provider && App.provider.archive) {
        self.ctrlLeft.appendChild(h('button', { class: 'btn f', 'data-c': 'arch', onclick: function () { self.openArchive(); } },
          icon('archive'), h('span', { text: T('Verpasste Sendungen') })));
      }
      if (self.item && self.item.kind !== 'episode' && self.item.kind !== 'catchup') {
        var on = Favs.has(self.item);
        self.ctrlLeft.appendChild(h('button', { class: 'btn f', 'data-c': 'fav', onclick: function () { Favs.toggle(self.item); self.paintCtrls(); } },
          icon(on ? 'heartFill' : 'heart'), h('span', { text: on ? T('Gemerkt') : T('Merken') })));
      }
      var target = had ? ($('[data-c="' + had + '"]', self.ctrls) || $('[data-c="' + had + '"]', self.ctrlLeft)) : null;
      if (target) Nav.focus(target);
    },

    togglePlay: function () { if (this.video.paused) this.playSafe(); else this.video.pause(); this.showOsd(); },
    seek: function (s) { this.scrubBy(s); },
    canSeek: function () { var v = this.video; return !!(this.isVod() && v && v.duration && isFinite(v.duration)); },

    /* ---------- Spulen mit Vorschau (wie bei YouTube) ----------
       Pfeiltasten/Buttons verschieben erst nur die Vorschau. Nach einer kurzen
       Pause springt das Video an die gewählte Stelle. Mehrmals drücken = schneller. */
    scrubBy: function (s, focusBar) {
      var self = this, v = self.video;
      if (!self.canSeek()) return;
      var going = self.scrubT != null;
      self.scrubN = going ? (self.scrubN || 0) + 1 : 0;
      var mult = self.scrubN >= 14 ? 6 : self.scrubN >= 6 ? 3 : 1;
      var base = going ? self.scrubT : v.currentTime;
      self.scrubT = Math.max(0, Math.min(v.duration - 1, base + s * mult));
      self.showOsd(true);
      if (focusBar && self.bar.classList.contains('f')) Nav.focus(self.bar);
      self.preview(self.scrubT);
      clearTimeout(self.scrubTimer);
      self.scrubTimer = setTimeout(function () { if (self.scrubT != null) self.commitTo(self.scrubT); }, 1000);
    },
    commitTo: function (t) {
      var v = this.video;
      clearTimeout(this.scrubTimer);
      this.scrubT = null; this.scrubN = 0;
      if (v && v.duration && isFinite(v.duration)) {
        try { v.currentTime = Math.max(0, Math.min(v.duration - 1, t)); } catch (e) {}
      }
      this.paintProgress();
      this.hidePreview();
      this.showOsd();
    },
    cancelScrub: function () {
      clearTimeout(this.scrubTimer);
      this.scrubT = null; this.scrubN = 0;
      this.hidePreview();
      this.paintProgress();
      this.showOsd();
    },
    preview: function (t) {
      var self = this, d = self.video && self.video.duration;
      if (!d || !isFinite(d) || !self.seekTime) return;
      self.seekTime.textContent = fmtTime(t);
      self.seekTime.classList.remove('is-hidden');
      var w = self.bar.offsetWidth, pw = self.seekTime.offsetWidth || 0;
      self.seekTime.style.left = Math.max(pw / 2, Math.min(w - pw / 2, t / d * w)) + 'px';
      self.bar.classList.toggle('is-scrub', self.scrubT != null);
      if (self.scrubT != null) self.paintProgress();
    },
    hidePreview: function () {
      if (this.seekTime) this.seekTime.classList.add('is-hidden');
      if (this.bar) this.bar.classList.remove('is-scrub');
    },
    zapBy: function (d) {
      var c = this.ctx;
      if (!c || !c.list || c.list.length < 2) return;
      c.index = (c.index + d + c.list.length) % c.list.length;
      var it = c.list[c.index];
      clear(this.zap);
      this.zap.appendChild(h('span', { class: 'num', text: String(it.num || c.index + 1) }));
      this.zap.appendChild(h('span', { text: it.name }));
      this.zap.classList.remove('is-hidden');
      var z = this.zap;
      clearTimeout(this.zapTimer);
      this.zapTimer = setTimeout(function () { z.classList.add('is-hidden'); }, 2500);
      this.load(it);
    },

    showOsd: function (stay) {
      var self = this;
      if (self.mini) return;
      var wasHidden = self.osd.classList.contains('is-hidden');
      self.osd.classList.remove('is-hidden');
      if (wasHidden || !self.osd.contains(document.activeElement)) {
        var pb = $('[data-c="play"]', self.ctrls);
        if (pb && self.err.style.display === 'none') Nav.focus(pb);
      }
      clearTimeout(self.hideTimer);
      if (!stay) self.hideTimer = setTimeout(function () { if (!self.video.paused) self.hideOsd(); }, 4500);
    },
    hideOsd: function () {
      if (this.err.style.display !== 'none' || this.trackPanel) return;
      this.osd.classList.add('is-hidden');
      if (this.osd.contains(document.activeElement)) document.activeElement.blur();
    },
    toggleOsd: function () { if (this.osd.classList.contains('is-hidden')) this.showOsd(); else this.hideOsd(); },

    /* Tasten im Player. true = Taste wurde verarbeitet */
    handleKey: function (k) {
      var self = this;
      if (Dialog.open || self.trackPanel || self.nextBox) return false;
      var hidden = self.osd.classList.contains('is-hidden');
      var errOpen = self.err.style.display !== 'none';
      var ae = document.activeElement, onButton = !hidden && ae && ae.tagName === 'BUTTON';
      if ((k === KEY.SPACE && !onButton) || k === KEY.K_K) { self.togglePlay(); return true; }
      if (k === KEY.K_M) { self.setMuted(!self.video.muted); return true; }
      if (k === KEY.K_F && self.fsBtn) { self.toggleFullscreen(); return true; }
      if (k === KEY.PLAYPAUSE || k === KEY.PLAY || k === KEY.PAUSE) { self.togglePlay(); return true; }
      if (k === KEY.STOP) { self.close(); return true; }
      if (k === KEY.FF) { self.seek(30); return true; }
      if (k === KEY.RW) { self.seek(-15); return true; }
      if (k === KEY.CH_UP) { self.zapBy(-1); return true; }
      if (k === KEY.CH_DOWN) { self.zapBy(1); return true; }
      if (errOpen) return false;
      if (hidden) {
        if (self.item.kind === 'live' && k === KEY.UP) { self.zapBy(-1); return true; }
        if (self.item.kind === 'live' && k === KEY.DOWN) { self.zapBy(1); return true; }
        if (self.isVod() && k === KEY.LEFT) { self.scrubBy(-10, true); return true; }
        if (self.isVod() && k === KEY.RIGHT) { self.scrubBy(10, true); return true; }
        if (k === KEY.ENTER || k === KEY.UP || k === KEY.DOWN || k === KEY.LEFT || k === KEY.RIGHT) { self.showOsd(); return true; }
        return false;
      }
      var onBar = document.activeElement === self.bar || (self.scrubT != null && !self.osd.contains(document.activeElement));
      if (onBar && self.isVod()) {
        if (k === KEY.LEFT) { self.scrubBy(-10, true); return true; }
        if (k === KEY.RIGHT) { self.scrubBy(10, true); return true; }
        if (k === KEY.ENTER) { if (self.scrubT != null) self.commitTo(self.scrubT); else self.togglePlay(); return true; }
      }
      self.showOsd(self.scrubT != null);
      return false;
    },

    saveResume: function () {
      var v = this.video;
      if (this.item && this.isVod() && v && v.duration && isFinite(v.duration)) Resume.set(this.item, v.currentTime, v.duration);
    },
    /* Lautstärke: Ton an/aus und Regler, Einstellung wird gespeichert */
    volumeUi: function () {
      var self = this, v = Settings.get('volume');
      if (typeof v !== 'number') v = 1;
      if (Platform.tv) v = 1;   // Fernseher / Android-Box: Lautstärke regelt die Fernbedienung – hier kein Regler
      self.video.volume = v;
      self.video.muted = !!Settings.get('muted');
      self.muteBtn = h('button', { class: 'cbtn f', 'data-c': 'mute', title: T('Ton an/aus'), 'aria-label': T('Ton an/aus'), onclick: function () { self.setMuted(!self.video.muted); } });
      if (Platform.tv) { self.range = null; self.paintVol(); return h('div', { class: 'vol is-tv-vol' }, self.muteBtn); }
      self.range = h('input', { class: 'f vol-range', type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(v * 100)), 'aria-label': T('Lautstärke') });
      self.range.addEventListener('input', function () { self.setVolume(Number(self.range.value) / 100); self.showOsd(); });
      self.paintVol();
      var wrap = h('div', { class: 'vol' }, self.muteBtn, self.range);
      // Großer Tippbereich: auch knapp neben dem Regler tippen/klicken stellt die Lautstärke ein
      function at(x) {
        var r = self.range.getBoundingClientRect();
        if (!r.width) return;
        self.setVolume((x - r.left) / r.width);
        self.showOsd();
      }
      function point(e) { return e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX; }
      function start(e) {
        if (self.muteBtn.contains(e.target)) return;
        e.preventDefault();
        at(point(e));
        var touch = e.type === 'touchstart';
        function move(ev) { ev.preventDefault(); at(point(ev)); }
        function end() {
          document.removeEventListener(touch ? 'touchmove' : 'mousemove', move);
          document.removeEventListener(touch ? 'touchend' : 'mouseup', end);
        }
        document.addEventListener(touch ? 'touchmove' : 'mousemove', move, { passive: false });
        document.addEventListener(touch ? 'touchend' : 'mouseup', end);
      }
      wrap.addEventListener('mousedown', start);
      wrap.addEventListener('touchstart', start, { passive: false });
      return wrap;
    },
    setVolume: function (v) {
      v = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
      this.video.volume = v;
      Settings.set('volume', v);
      if (v > 0 && this.video.muted) { this.video.muted = false; Settings.set('muted', false); }
      if (this.range) this.range.value = String(Math.round(v * 100));
      this.paintVol();
    },
    setMuted: function (m) {
      this.video.muted = m;
      Settings.set('muted', m);
      this.paintVol();
      if (!this.mini) this.showOsd();
    },
    paintVol: function () {
      var off = this.video && (this.video.muted || this.video.volume === 0);
      [this.muteBtn, this.miniMute].forEach(function (b) {
        if (!b) return;
        clear(b);
        b.appendChild(icon(off ? 'volOff' : 'vol'));
        b.classList.toggle('is-muted', !!off);
      });
    },
    destroyHls: function () {
      if (this.hls) { try { this.hls.destroy(); } catch (e) {} this.hls = null; }
      if (this.ts) { try { this.ts.destroy(); } catch (e) {} this.ts = null; }
    },

    enterFullscreen: function () {
      if (Platform.tv) return;
      var el = this.el;
      try {
        var req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (req) { var r = req.call(el); if (r && r.catch) r.catch(function () {}); }
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
      } catch (e) {}
    },
    exitFullscreen: function () {
      try {
        // In der Android-App bleibt es immer quer (fest im Manifest) – nur im Browser wieder freigeben
        if (!Platform.capacitor && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        var fe = document.fullscreenElement || document.webkitFullscreenElement;
        if (fe) { var ex = document.exitFullscreen || document.webkitExitFullscreen; var r = ex.call(document); if (r && r.catch) r.catch(function () {}); }
      } catch (e) {}
    },

    teardown: function () {
      this.saveResume();
      clearInterval(this.saveTimer); clearInterval(this.epgTimer); clearTimeout(this.hideTimer); clearTimeout(this.zapTimer);
      clearInterval(this.wdTimer); clearInterval(this.nextTimer); this.nextBox = null; this.nextCancel = null; this.trackPanel = null;
      this.destroyHls();
      clearTimeout(this.scrubTimer); this.scrubT = null;
      try { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } catch (e) {}
      this.exitFullscreen();
      clearInterval(this.placeTimer);
      this.mini = false;
      document.body.classList.remove('has-mini');
      window.removeEventListener('resize', this.onResize);
      this.el = null; this.video = null; this.item = null; this.ctx = null;
      markPlaying(null);
    }
  };

  /* ==========================================================
     Tasten der Fernbedienungen
     ========================================================== */
  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK_TIZEN: 10009, BACK_WEBOS: 461, ESC: 27, BACKSPACE: 8,
    PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412, SPACE: 32, K_F: 70, K_K: 75, K_M: 77,
    CH_UP: 427, CH_DOWN: 428
  };
  // LG nutzt Bild-auf/ab-Codes für die Programmtasten
  if (Platform.webos) { KEY.CH_UP = 33; KEY.CH_DOWN = 34; }
  // Media-Tasten auf Android (Fire-TV-Fernbedienung)
  var KEY_ALIASES = { 179: 10252, 178: 413, 228: 417, 227: 412, 126: 415, 127: 19 };

  function isBackKey(e) {
    var k = e.keyCode;
    if (k === KEY.BACK_TIZEN || k === KEY.BACK_WEBOS || k === KEY.ESC) return true;
    if (k === KEY.BACKSPACE) { var t = e.target; return !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')); }
    return e.key === 'GoBack' || e.key === 'BrowserBack';
  }

  function onKeyDown(e) {
    var k = KEY_ALIASES[e.keyCode] || e.keyCode;
    INPUT.mode = 'key';
    var dirs = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
    if (dirs[k] || k === 13) document.body.classList.add('kbd');

    if (isBackKey(e)) { e.preventDefault(); goBack(); return; }
    if (!Dialog.open && Player.el && Screens.top() && Screens.top().el === Player.el && Player.handleKey(k)) { e.preventDefault(); return; }

    var t = e.target;
    var inInput = t && t.tagName === 'INPUT';
    var isText = inInput || (t && t.tagName === 'TEXTAREA');
    if (dirs[k]) {
      if (inInput && t.type === 'range' && (k === 37 || k === 39)) return;
      if (isText && (k === 37 || k === 39)) {
        var len = t.value.length, pos = t.selectionStart;
        var atEdge = pos === null || (k === 37 && pos === 0) || (k === 39 && pos === len);
        if (!atEdge) return;
      }
      e.preventDefault();
      Nav.move(dirs[k]);
      return;
    }
    if (k === 13 && inInput) {
      // Enter im Eingabefeld: weiter zum nächsten Feld/Button
      if (t.type === 'search') return;
      e.preventDefault();
      Nav.move('down');
    }
  }

  function registerTvKeys() {
    if (Platform.tizen && window.tizen && tizen.tvinputdevice) {
      ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ChannelUp', 'ChannelDown'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
      });
    }
    if (Platform.capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      try { window.Capacitor.Plugins.App.addListener('backButton', function () { goBack(); }); } catch (e) {}
      // App wieder im Vordergrund (Android): Startbildschirm prüft, ob die Listen veraltet sind
      try { window.Capacitor.Plugins.App.addListener('resume', function () { var ln = $('.launcher'); if (ln && ln._wake) ln._wake(); }); } catch (e) {}
    }
  }

  /* ==========================================================
     Start
     ========================================================== */
  function addLogoDefs() {
    var d = document.createElement('div');
    d.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="lumio-play-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent-2)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient></defs></svg>';
    document.body.appendChild(d.firstChild);
  }

  function boot() {
    Lang.init();
    addLogoDefs();
    Theme.apply();
    Theme.watch();
    if (Platform.tv) document.body.classList.add('is-tv');
    // Schwache Geräte (z. B. Android-Boxen mit 2 GB): teure Effekte wie Unschärfe und Animationen weglassen
    if (Platform.lite) document.body.classList.add('lite');
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', function () { INPUT.mode = 'pointer'; if (!Platform.tv) document.body.classList.remove('kbd'); }, true);
    // Video weiterlaufen lassen, aber beim Verlassen der App den Fortschritt sichern
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (Player.el) Player.saveResume(); return; }
      // zurück in der App: Startbildschirm prüft, ob die Listen veraltet sind
      var ln = $('.launcher');
      if (ln && ln._wake) ln._wake();
    });
    registerTvKeys();

    SubStyle.apply();
    var active = Profiles.get(Store.get('active'));
    if (active) {
      activateProfile(active, false);
      // Einstellung „Letzten Sender beim Start abspielen“
      var lastLive = Settings.get('autoLast') && Recent.list()[0];
      if (lastLive) setTimeout(function () {
        var top = Screens.top();
        if (!Player.el && App.profile === active && top && top.name === 'shell' && !Dialog.open) playItem(lastLive, { list: [lastLive], index: 0 });
      }, 1200);
    }
    else showProfiles();
    Terms.check();
    setTimeout(function () { Updates.daily(); }, 8000);
    setTimeout(function () { Backup.daily(); }, 15000);
    Cloud.start();
    StillWatching.start();
    // Internet wieder da: hängengebliebene Wiedergabe automatisch neu starten
    window.addEventListener('online', function () { if (Player.el && Player.err && Player.err.style.display !== 'none' && Player.item) Player.load(Player.item); });
    var reloaded = false;
    try { reloaded = sessionStorage.getItem('lumio.reloaded'); sessionStorage.removeItem('lumio.reloaded'); } catch (e) {}
    if (reloaded) setTimeout(function () { toast(T('Daten neu geladen')); }, 600);
    var restored = null;
    try { restored = JSON.parse(sessionStorage.getItem('lumio.restored') || 'null'); sessionStorage.removeItem('lumio.restored'); } catch (e) {}
    if (restored) setTimeout(function () {
      toast(T('Wiederhergestellt') + (restored.waiting ? ' – ' + T('{0} Playlists fehlen noch auf diesem Gerät', restored.waiting) : ''), 5000);
    }, 900);
  }

  // Für automatische Tests von außen erreichbar
  window.LumioDebug = {
    parseM3U: parseM3U, catchupUrl: catchupUrl, parseXtreamLink: parseXtreamLink, normalizeServer: normalizeServer, Nav: Nav, Screens: Screens, StillWatching: StillWatching,
    Xmltv: Xmltv, chanKey: chanKey, EpgStore: EpgStore, makeProvider: makeProvider, Profiles: Profiles, PinGuard: PinGuard, Store: Store, Cloud: Cloud,
    decodeBytes: decodeBytes, readText: readText, fetchText: fetchText, sameConnection: sameConnection, NativePlayer: NativePlayer, App: App, ensureTs: ensureTs, migrateM3uIds: migrateM3uIds,
    ErrLog: ErrLog, techInfo: techInfo,
    CatPrefs: CatPrefs, visibleCats: visibleCats, Parental: Parental, ChanHide: ChanHide,
    Backup: Backup, profileFp: profileFp, Settings: Settings,
    config: CONFIG
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
