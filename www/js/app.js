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
    version: '1.14.0',
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
    bookmark: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16.2l-6.5-4.1-6.5 4.1V4.5a1 1 0 0 1 1-1z"/>',
    bookmarkFill: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16.2l-6.5-4.1-6.5 4.1V4.5a1 1 0 0 1 1-1z" fill="currentColor"/>',
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
    checkCircle: '<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/><path d="M7.6 12.4l3 3 5.8-5.8" stroke="#0b0b0f"/>',
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
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 1.6M9.5 2.5h5"/>',
    saver: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 20.5h8M12 17v3.5"/><path d="M14.6 7.6a3.3 3.3 0 1 0 1.4 4.8 2.7 2.7 0 0 1-1.4-4.8z"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><circle cx="17" cy="9.5" r="2.8"/><path d="M15.6 14.2a5 5 0 0 1 5.6 5.3"/>',
    pip: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><rect x="12" y="11.5" width="7" height="5.5" rx="1.2" fill="currentColor" stroke="none"/>',
    skipNext: '<path d="M6 5.5v13l9.5-6.5z" fill="currentColor" stroke="none"/><path d="M18 5.5v13"/>',
    speed: '<path d="M4.2 16.5a8.2 8.2 0 1 1 15.6 0"/><path d="M12 13l3.6-3.8"/><circle cx="12" cy="13.2" r="1.3" fill="currentColor" stroke="none"/>',
    hq: '<rect x="2.8" y="5.5" width="18.4" height="13" rx="2.6"/><path d="M7 9.5v5M10.4 9.5v5M7 12h3.4"/><path d="M13.6 9.5v5h1.5a2.5 2.5 0 0 0 0-5z"/>',
    sync: '<path d="M3.5 10v4M6.8 7.5v9M10.1 10.5v3"/><circle cx="16.8" cy="12" r="4.3"/><path d="M16.8 9.9v2.3l1.5 1"/>',
    swap: '<path d="M7.5 4 4 7.5 7.5 11"/><path d="M4 7.5h14"/><path d="M16.5 13l3.5 3.5-3.5 3.5"/><path d="M20 16.5H6"/>',
    bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.6 2.2H4.4z"/><path d="M10 20.6a2.1 2.1 0 0 0 4 0"/>',
    guide: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9.5h18M8.5 9.5v10M3 14.5h18M14 9.5v5"/>',
    archive: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5v4h4"/><path d="M12 7.5V12l3 2"/>',
    cc: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.6 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6"/>',
    device: '<rect x="2.5" y="4" width="13.5" height="10" rx="1.6"/><path d="M6 18.5h6.5M9.2 14v4.5"/><rect x="17.5" y="8" width="4" height="12" rx="1.1"/>',
    ext: '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
    update: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4 16.5v3h16v-3"/>',
    tvplay: '<rect x="3" y="4.5" width="18" height="13" rx="2"/><path d="M8 21h8"/><path d="M10.2 8.4v5.2l4.5-2.6z" fill="currentColor"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    sunrise: '<path d="M3.5 19h17M7 19a5 5 0 0 1 10 0"/><path d="M12 3.5v6M9.3 6.2L12 3.5l2.7 2.7"/><path d="M4.4 14.4l1.5.8M19.6 14.4l-1.5.8"/>',
    sunset: '<path d="M3.5 19h17M7 19a5 5 0 0 1 10 0"/><path d="M12 3.5v6M9.3 6.8L12 9.5l2.7-2.7"/><path d="M4.4 14.4l1.5.8M19.6 14.4l-1.5.8"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5z"/>',
    cloudSun: '<path d="M8 3.5V5M3.4 5.4l1 1M2 10h1.5M12.6 5.4l-1 1"/><path d="M5.2 12.6A3.6 3.6 0 1 1 11.5 9"/><path d="M9 20h8.5a3.5 3.5 0 0 0 .4-6.97A4.7 4.7 0 0 0 9.2 12.5a3.8 3.8 0 0 0-.2 7.5z"/>',
    cloudMoon: '<path d="M11.8 8.4A4.4 4.4 0 0 1 6.6 3.2a4.4 4.4 0 1 0 5.2 5.2z"/><path d="M9 20h8.5a3.5 3.5 0 0 0 .4-6.97A4.7 4.7 0 0 0 9.2 12.5a3.8 3.8 0 0 0-.2 7.5z"/>',
    rain: '<path d="M7 14.5h10a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 7.9 6.4 4 4 0 0 0 7 14.5z"/><path d="M8.6 17.4l-1 2.6M12.6 17.4l-1 2.6M16.6 17.4l-1 2.6"/>',
    storm: '<path d="M7 14.5h10a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 7.9 6.4 4 4 0 0 0 7 14.5z"/><path d="M12.8 15.2l-2.2 3.4h3l-2.2 3.4"/>',
    snow: '<path d="M7 14.5h10a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 7.9 6.4 4 4 0 0 0 7 14.5z"/><path d="M8.5 18v.1M12 19.2v.1M15.5 18v.1M10 21.5v.1M14 21.5v.1"/>',
    fog: '<path d="M4 8.5h16M6.5 12.5h11M4 16.5h16M8 20h8"/>',
    avSmile: '<circle cx="12" cy="12" r="9"/><path d="M8.3 14.2a4.6 4.6 0 0 0 7.4 0"/><path d="M9 9.6h.01M15 9.6h.01" stroke-width="2.8"/>',
    avCat: '<path d="M5 10V4.5L9 7.5h6l4-3V10a7 7 0 0 1-7 9.5A7 7 0 0 1 5 10z"/><path d="M9.6 12.3h.01M14.4 12.3h.01" stroke-width="2.8"/><path d="M11 15.2h2"/>',
    avDog: '<path d="M7.2 6.8 4 5.2v5.6c0 1 .5 1.9 1.4 2.4M16.8 6.8 20 5.2v5.6c0 1-.5 1.9-1.4 2.4"/><path d="M7 6.5h10v6.2a5 5 0 0 1-10 0z"/><path d="M10 10.4h.01M14 10.4h.01" stroke-width="2.8"/><path d="M11 13.6h2l-1 1.3z" fill="currentColor"/>',
    avGhost: '<path d="M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6z"/><path d="M9.5 11h.01M14.5 11h.01" stroke-width="2.8"/>',
    avRocket: '<path d="M12 3c3 2.1 4.5 5.6 4.5 9.6L14.2 16H9.8l-2.3-3.4C7.5 8.6 9 5.1 12 3z"/><circle cx="12" cy="9.6" r="1.6"/><path d="M10 16l-1.2 4M14 16l1.2 4M7.6 12.8 5 15.6l.4-3.6M16.4 12.8l2.6 2.8-.4-3.6"/>',
    avCrown: '<path d="M4 8.5l4 3.8 4-6.3 4 6.3 4-3.8-1.6 9.5H5.6z"/><path d="M5.8 21h12.4"/>',
    avGame: '<path d="M7.2 8h9.6a4.2 4.2 0 0 1 4.2 4.2v2.4a2.6 2.6 0 0 1-4.7 1.5L15 14.5H9l-1.3 1.6A2.6 2.6 0 0 1 3 14.6v-2.4A4.2 4.2 0 0 1 7.2 8z"/><path d="M8 10.4v3M6.5 11.9h3M15.6 11h.01M17.6 13h.01" stroke-width="2.2"/>',
    avMusic: '<path d="M9 18V5.5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16.5" r="2.5"/>',
    player: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>'
  };
  function icon(name) {
    var span = document.createElement('span');
    span.innerHTML = '<svg class="i i-' + name + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    return span.firstChild;
  }
  /* Logo: "L" und Play-Zeichen in Textfarbe, der Lichtpunkt in der gewählten Akzentfarbe */
  var LOGO_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M17 25H70a12 12 0 0 1 12 12M42 25v50" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path class="play" transform="translate(16.5 11.5) scale(.78)" d="M50 38.5c0-3.3 3.6-5.3 6.4-3.6l25.4 15.6c2.7 1.7 2.7 5.6 0 7.2L56.4 73.4C53.6 75.1 50 73.1 50 69.8z"/><path class="star" d="M92 0L94 7L101 9L94 11L92 18L90 11L83 9L90 7Z"/></svg>';
  function brandMark() { var m = h('span', { class: 'brand-mark' }); m.innerHTML = LOGO_SVG; return m; }
  /* Schriftzug: "Telvo" kräftig, "Player" leicht */
  function wordmark() { return h('span', { class: 'wordmark' }, h('b', { text: 'Telvo' }), h('span', { text: 'Player' })); }

  function hashCode(s) { var x = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return Math.abs(x); }
  function colorFor(s) { var hue = hashCode(s) % 360; return 'hsl(' + hue + ',55%,38%)'; }
  function gradientFor(s) { var hue = hashCode(s) % 360; return 'linear-gradient(160deg,hsl(' + hue + ',60%,42%),hsl(' + ((hue + 40) % 360) + ',55%,18%))'; }
  /* Jahr nicht im Titel: „Rocky III (1982)“ → „Rocky III“ (das Jahr steht ohnehin darunter).
     In Klammern immer; am Ende nur, wenn es das bekannte Erscheinungsjahr ist (sonst z. B. „Blade Runner 2049“ kaputt). */
  function cleanTitle(name, year) {
    var n = String(name || ''), y = String(year || '').slice(0, 4);
    var t = n.replace(/\s*[\(\[]\s*(19|20)\d{2}\s*[\)\]]/g, '');
    if (/^(19|20)\d{2}$/.test(y)) t = t.replace(new RegExp('\\s*[-–|:]?\\s*' + y + '\\s*$'), '');
    t = t.replace(/\s{2,}/g, ' ').replace(/\s*[-–|:]\s*$/, '').trim();
    return t || n;
  }
  // Jahr aus dem Namen merken, bevor es wegfällt (wenn der Anbieter keins mitliefert)
  function yearIn(name) { var m = /[\(\[]\s*((19|20)\d{2})\s*[\)\]]/.exec(String(name || '')); return m ? m[1] : ''; }
  function vodName(name, year) { return { name: cleanTitle(name, year), year: year || yearIn(name) }; }
  /* Folgenname ohne Serienname und „S01E02“ davor: „Murdoch Mysteries - S01E02 - Power“ → „Power“ */
  function cleanEpName(name, seriesName, num) {
    var n = String(name || ''), sn = String(seriesName || '').trim();
    if (sn && n.toLowerCase().indexOf(sn.toLowerCase()) === 0) n = n.slice(sn.length);
    n = n.replace(/^\s*[-–:|.]?\s*(\(\s*(19|20)\d{2}\s*\)\s*)?[-–:|.]?\s*S\d{1,2}\s*[\s.]?E\d{1,3}\s*[-–:|.]?\s*/i, '').replace(/^\s*[-–:|.]\s*/, '').trim();
    // Serienname in der Folge anders geschrieben als in der Liste („Testserie - S01E02 - Pilot“ bei „DE - Testserie (2020)“):
    // alles bis einschließlich S01E02 weglassen, wenn danach noch ein Titel kommt; nur „Serie S01E02“ → „Folge 2“
    var m = /^(.*?)[\s\-–:|.]*\bS\d{1,2}\s*[\s.]?E\d{1,3}\b\s*[-–:|.]?\s*(.*)$/i.exec(n);
    if (m) n = m[2].trim();
    return n || T('Folge {0}', num);
  }
  /* Dauer lesbar: „01:58:00“ oder Sekunden → „1 Std. 58 Min.“ / „45 Min.“ */
  function durSec(v) {
    var s = String(v == null ? '' : v).trim();
    if (/^\d+:\d{2}(:\d{2})?$/.test(s)) { var p = s.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
    return /^\d+$/.test(s) ? Number(s) : 0;
  }
  function fmtDur(v) {
    var sec = durSec(v);
    if (!(sec >= 60)) return '';
    var m = Math.round(sec / 60);
    if (m < 60) return T('{0} Min.', m);
    return m % 60 ? T('{0} Std. {1} Min.', Math.floor(m / 60), m % 60) : T('{0} Std.', m / 60);
  }
  // Alles außer Buchstaben/Ziffern – auch Arabisch, Kyrillisch, Griechisch (vorher wurde daraus „1“ oder „?“).
  // \p{L} kennen alte Fernseher nicht: darum über new RegExp in try, sonst die wichtigsten Schriften von Hand
  var NON_LETTER = (function () {
    try { return new RegExp('[^\\p{L}\\p{N} ]', 'gu'); } catch (e) { return /[^\w\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF ]/g; }
  })();
  // Sichtbar? „isIntersecting“ gibt es erst ab Chrome 58 – auf LG-Fernsehern bis 2019 (Chrome 53) und älteren
  // Android-Boxen war es immer leer: die laufende Sendung und das TV-Programm wurden dort nie geladen
  function isVisible(e) { return typeof e.isIntersecting === 'boolean' ? e.isIntersecting : e.intersectionRatio > 0; }
  function initials(s) {
    var parts = String(s || '?').replace(NON_LETTER, ' ').trim().split(/\s+/);
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
  // Xtream-Kontostatus in verständlichen Worten (der Server liefert Englisch: Expired, Banned, Disabled …)
  function statusError(status) {
    var st = String(status || '');
    if (!st || /^active$/i.test(st)) return null;
    if (/expired/i.test(st)) return new Error(T('Playlist abgelaufen'));
    if (/banned|disabled|blocked/i.test(st)) return new Error(T('Zugang gesperrt'));
    return new Error(T('Konto-Status: {0}', st));
  }
  function b64(s) {
    if (!s) return '';
    try { var bin = atob(s); try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; } } catch (e) { return s; }
  }
  // Programmtexte: manche Anbieter liefern Zeilenumbrüche als Text („\n“) – dann stand „Stacheldraht.\n\nManch …“ in der Beschreibung
  function epgText(s) {
    if (!s) return '';
    return String(s).replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\\t/g, ' ').replace(/^\s+|\s+$/g, '');
  }
  // Neue, zufällige Kennung (Playlists). Eigener Name: „uid()“ weiter unten ist die Daten-Kennung der schauenden Person –
  // gleichnamig überschrieb sie diese Funktion, und jede neue Playlist bekam die Kennung der gerade aktiven.
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
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
      restartApp(0);
    }
  };
  /* Neustart aus der App heraus (Sprache, Gerätetyp, Daten neu laden …): danach NICHT den letzten Sender
     automatisch starten – das gilt nur für einen echten App-Start. */
  function restartApp(ms) {
    try { sessionStorage.setItem('lumio.soft', '1'); } catch (e) {}
    setTimeout(function () { try { location.reload(); } catch (e) {} }, ms || 0);
  }
  function T(s) {
    var d = Lang.cur !== 'de' ? I18N[Lang.cur] : null;
    var out = d && d[s] != null ? d[s] : s;
    for (var i = 1; i < arguments.length; i++) out = out.split('{' + (i - 1) + '}').join(String(arguments[i]));
    return out;
  }
  // Reihenfolge in der Auswahl: die meistgenutzten zuerst (Englisch, Deutsch), danach die übrigen
  var LANG_TOP = ['en', 'de'];
  function langsSorted() {
    return LANG_TOP.map(function (k) { return LANGS.filter(function (l) { return l[0] === k; })[0]; })
      .concat(LANGS.filter(function (l) { return LANG_TOP.indexOf(l[0]) < 0; }));
  }
  /* Ein Knopf mit Flagge und aktueller Sprache (Flagge + „Deutsch“) – erst ein Druck darauf klappt die Auswahl auf */
  function langButton() {
    var name = (LANGS.filter(function (l) { return l[0] === Lang.cur; })[0] || LANGS[0])[1];
    // Hat man die Sprache einmal selbst gewählt, reicht die Flagge – der Name steht nur beim ersten Start daneben
    var chosen = !!Settings.get('lang') && !!flagFor(Lang.cur);
    return h('button', { class: 'btn f lang-btn' + (chosen ? ' is-flag' : ''), title: T('Sprache') + ': ' + name, 'aria-label': T('Sprache') + ': ' + name, onclick: pickLanguage },
      flagFor(Lang.cur) || icon('globe'), chosen ? null : h('span', { text: name }), icon('down'));
  }
  // Sprachliste mit Flaggen (Willkommensseite: klappt oben rechts unter dem Knopf auf; Einstellungen: normales Fenster)
  function langChoice() {
    var list = choiceList(langsSorted().map(function (l) { return [l[0], l[1], null, flagFor(l[0])]; }),
      function () { return Lang.cur; }, function (v) { if (v !== Lang.cur) Lang.set(v); else goBack(); });   // gleiche Sprache = Menü schließen
    list.classList.add('lang-choice');
    return list;
  }
  function pickLanguage() {
    openSheet(T('Sprache'), 'globe', langChoice(), { cls: 'is-drop' });
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
  function macTag(user, noCopy, label) {
    return h('div', { class: 'mac-tag' }, h('span', { text: 'MAC' }), h('b', { text: Device.mac() }), noCopy ? null : copyBtn(Device.mac(), 'MAC'),
      h('span', { text: 'KEY' }), h('b', { text: Device.key() }), noCopy ? null : copyBtn(Device.key(), 'KEY'),
      user ? h('span', { text: label || T('Benutzername') }) : null, user ? h('b', { text: user }) : null);
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
  // Beschriftung dazu: echter Benutzername (Xtream, M3U mit username=…) oder sonst der Name der Playlist
  function profileUserLabel(p) {
    if (!p) return '';
    return p.username || /[?&]username=/i.test(p.url || '') ? T('Benutzername') : T('Playlist');
  }
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
        var st = statusError(u.status);
        if (st) throw st;
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
        archive: String(s.tv_archive) === '1' ? Math.max(1, Math.min(30, Number(s.tv_archive_duration) || 1)) : 0,
        radio: s.stream_type === 'radio_streams' ? 1 : undefined };
      if (kind === 'movie') { var vm = vodName(s.name || T('Film'), s.year);
        return { kind: 'movie', id: String(s.stream_id), name: vm.name, year: vm.year || undefined, logo: s.stream_icon, ext: s.container_extension || 'mp4', rating: s.rating, catId: String(s.category_id), added: s.added }; }
      var vs = vodName(s.name || T('Serie'), String(s.releaseDate || s.release_date || '').slice(0, 4));
      return { kind: 'series', id: String(s.series_id), name: vs.name, logo: s.cover, rating: s.rating, catId: String(s.category_id), year: vs.year || s.releaseDate || s.release_date, plot: s.plot, added: s.last_modified };
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
          // Status des Servers in verständlichen Worten (vorher roh: „Konto-Status: Expired“)
          var st = statusError(d.user_info.status);
          if (st) throw st;
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
                  name: cleanEpName(e.title, item.name, Number(e.episode_num) || 0), ext: e.container_extension || 'mp4',
                  plot: ei.plot, duration: ei.duration_secs || ei.duration, seriesId: item.id, seriesName: item.name, logo: ei.movie_image || item.logo,
                  backdrop: Array.isArray(i.backdrop_path) ? i.backdrop_path[0] : i.backdrop_path
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
            return { title: b64(e.title), desc: epgText(b64(e.description)), start: Number(e.start_timestamp) + sh, end: Number(e.stop_timestamp) + sh };
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
            var x = { title: b64(e.title), desc: epgText(b64(e.description)), start: Number(e.start_timestamp), end: Number(e.stop_timestamp), startText: e.start, rec: e.has_archive };
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
          radio: /^(true|1)$/i.test(cur.attrs['radio'] || '') || /^radio$/i.test(cur.attrs['tvg-type'] || ''),
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
    del: function (key) { return this.run('readwrite', function (s) { return s.delete(key); }); },
    clear: function () { return this.run('readwrite', function (s) { return s.clear(); }); }
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
            s = d.seriesMap[key] = { kind: 'series', id: 's' + hashCode(key), name: cleanTitle(sName), year: yearIn(sName) || undefined, logo: e.logo, catId: e.group, _eps: [] };
            d.series.push(s); cat('series', e.group);
          }
          var eid = stableId('e', e, used); d.idAt[idx] = eid;
          var eNum = se ? Number(se[3]) : s._eps.length + 1;
          s._eps.push({ kind: 'episode', id: eid, url: e.url, name: cleanEpName(e.name, sName, eNum), season: se ? Number(se[2]) : 1, num: eNum, seriesId: s.id, seriesName: s.name, logo: e.logo });
        } else if (u.indexOf('/movie/') >= 0 || /\.(mp4|mkv|avi|mov|m4v)(\?|$)/.test(u)) {
          var mid = stableId('m', e, used); d.idAt[idx] = mid;
          d.movie.push({ kind: 'movie', id: mid, name: cleanTitle(e.name), year: yearIn(e.name) || undefined, logo: e.logo, url: e.url, catId: e.group });
          cat('movie', e.group);
        } else {
          n++;
          var lid = stableId('l', e, used); d.idAt[idx] = lid;
          var li = { kind: 'live', id: lid, name: e.name, logo: e.logo, url: e.url, catId: e.group, num: n };
          if (e.tvgId) li.epgId = e.tvgId;
          if (e.radio) li.radio = 1;
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
            .map(function (x) { return { title: x[2], desc: epgText(x[3]), start: x[0] + sh, end: x[1] + sh }; });
        }).catch(function () { return []; });
      },
      /* Catch-up (M3U): vergangene Sendungen aus dem Programmführer. Ohne Programmdaten: Stundenblöcke.
         Die Programmführer-Zeit (Verschiebung) korrigiert falsche EPG-Zeiten – darum gilt sie auch für die Adresse. */
      archive: function (item) {
        return load().then(function () {
          var it = epgItem(item), days = it.archive || item.archive || 0, sh = epgShiftOf(p);
          var now = Date.now() / 1000, from = now - days * 86400 - 3600;
          return loadEpg().then(function (E) { return Xmltv.find(E, it) || []; }, function () { return []; }).then(function (list) {
            var out = list.map(function (x) { return { title: x[2], desc: epgText(x[3]), start: x[0] + sh, end: x[1] + sh }; })
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
      reset: function () { data = null; loading = null; epgData = null; epgFail = null; epgFresh = true; },
      // „Zwischenspeicher leeren“: Programmführer beim nächsten Bedarf neu laden (nicht erst nach 12 Stunden)
      dropEpg: function () { epgData = null; epgFail = null; epgFresh = true; }
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
    add: function (p) { var l = this.list(); p.id = p.id || newId(); l.push(p); this.save(l); return p; },
    /* Reparatur für Geräte mit doppelten Kennungen (Fehler bis 1.13.0): jede weitere Playlist mit derselben Kennung
       bekommt eine eigene. Ihre bisher gemeinsam genutzten Daten (Favoriten, Verlauf) bleiben bei der ersten. */
    fixIds: function () {
      var l = this.list(), seen = {}, changed = false;
      l.forEach(function (p) { if (!p.id || seen[p.id]) { p.id = newId(); changed = true; } seen[p.id] = 1; });
      if (changed) this.save(l);
      return changed;
    },
    remove: function (id) {
      var gone = this.get(id);
      // Online-Kopie löschen. Klappt das gerade nicht (offline, Server weg), wird es gemerkt und beim nächsten
      // Abgleich wiederholt – sonst käme die gelöschte Playlist mit dem nächsten Abgleich zurück.
      if (gone && gone.remoteId) { Cloud.markDeleted(gone.remoteId); Cloud.flushDeletes(); }
      this.save(this.list().filter(function (p) { return p.id !== id; }));
      this.dropData(id);
    },
    /* Alles löschen, was zu einer Playlist auf dem Gerät gespeichert ist (Datenschutz: keine Reste) */
    DATA_KEYS: ['fav', 'resume', 'recent', 'seen', 'last', 'stats', 'seenNew', 'cats', 'expiry', 'idv', 'hidech', 'upnext', 'swatch', 'remind', 'later', 'chcount'],
    dropData: function (id) {
      this.DATA_KEYS.forEach(function (k) { Store.del(k + '.' + id); });
      Store.del('hero.' + id + '.movie'); Store.del('hero.' + id + '.series');   // Auswahl fürs Titelbild der Startseite
      Persons.list().forEach(function (pe) { PERSONAL_KEYS.forEach(function (k) { Store.del(k + '.' + id + '~' + pe.id); }); });
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
    /* Support-Nachricht: mit App-Token (geht auch, wenn jemand den KEY durch Fehlversuche gesperrt hat), sonst mit KEY.
       Fehlt app_send_support in der Datenbank noch (schutz-2026-11.sql nicht eingespielt), der bisherige Weg. */
    support: function (topic, message, contact) {
      var self = this, mac = Device.mac();
      function legacy() { return self.rpc('send_support', { p_mac: mac, p_key: Device.key(), p_topic: topic, p_message: message, p_contact: contact }); }
      if (self.mode !== 'token') return legacy();
      return self.rpc('app_send_support', { p_mac: mac, p_token: Device.token(), p_topic: topic, p_message: message, p_contact: contact })
        .then(function (r) { return r && typeof r.ok === 'boolean' ? r : legacy(); });
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
          data.id = newId(); list.push(data); added.push(data); changed = true; return;
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
  var BACKUP_DATA = ['fav', 'resume', 'recent', 'seen', 'seenNew', 'last', 'cats', 'hidech', 'upnext', 'swatch', 'later'];
  // Sicherheit / gerätespezifisch; Wetter-Ort bleibt auf dem Gerät (Datenschutzerklärung: geht nur an Open-Meteo)
  var BACKUP_SKIP = ['parentPin', 'adminPin', 'deviceType', 'engine', 'extPlayer', 'volume', 'muted', 'weatherLoc'];
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
        // weitere Personen: ihre eigenen Daten je Playlist
        Persons.list().forEach(function (pe) {
          if (pe.id === 'main') return;
          var d = {};
          PERSONAL_KEYS.forEach(function (k) { if (BACKUP_DATA.indexOf(k) < 0) return; var v = Store.get(k + '.' + p.id + '~' + pe.id, null); if (v !== null) d[k] = v; });
          if (Object.keys(d).length) { o.pd = o.pd || {}; o.pd[pe.id] = d; }
        });
        return o;
      });
      var out = { v: 1, at: Date.now(), app: CONFIG.version, settings: settings, lists: lists };
      if (Persons.multi()) out.persons = Persons.list();
      return out;
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
      Object.keys(l.pd || {}).forEach(function (pe) {
        if (!/^p[0-9a-z]+$/.test(pe)) return;
        PERSONAL_KEYS.forEach(function (k) { if (BACKUP_DATA.indexOf(k) >= 0 && l.pd[pe][k] !== undefined) Store.set(k + '.' + p.id + '~' + pe, l.pd[pe][k]); });
      });
      if (l.epgShift) p.epgShift = l.epgShift; else delete p.epgShift;
    },
    // Wiederherstellen: Playlists von der Webseite ergänzen, Einstellungen ersetzen (außer gerätespezifische), Daten zuordnen
    apply: function (r) {
      var self = this, b = r.backup || {}, list = Profiles.list(), added = 0;
      (r.playlists || []).forEach(function (it) {
        var data = it.type === 'xtream' ? { type: 'xtream', server: normalizeServer(it.server), username: it.username, password: it.password } : { type: 'm3u', url: it.url };
        data.name = it.name;
        if (list.some(function (q) { return sameConnection(q, data); })) return;
        data.id = newId(); list.push(data); added++;
      });
      if (b.settings) {
        var keep = {};
        BACKUP_SKIP.forEach(function (k) { if (Settings.data[k] !== undefined) keep[k] = Settings.data[k]; });
        var ns = {};
        Object.keys(b.settings).forEach(function (k) { if (BACKUP_SKIP.indexOf(k) < 0) ns[k] = b.settings[k]; });
        Object.keys(keep).forEach(function (k) { ns[k] = keep[k]; });
        Settings.data = ns; Store.set('settings', ns);
      }
      // Personen übernehmen (nur gültige Einträge)
      if (Array.isArray(b.persons) && b.persons.length) {
        var ok = b.persons.filter(function (pe) { return pe && (pe.id === 'main' || /^p[0-9a-z]+$/.test(pe.id)) && typeof pe.name === 'string'; }).slice(0, Persons.MAX)
          .map(function (pe) { var o = { id: pe.id, name: pe.name.slice(0, 20), color: PERSON_COLORS.indexOf(pe.color) >= 0 ? pe.color : PERSON_COLORS[0] }; if (pe.kids) o.kids = true; return o; });
        if (ok.length) Persons.save(ok);
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
      keys.forEach(function (k) { if (k.indexOf('lumio.') === 0 && k !== 'lumio.mac' && k !== 'lumio.devkey' && k !== 'lumio.devtoken' && k !== 'lumio.rating') localStorage.removeItem(k); });
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
  /* ---------- Nutzungsbedingungen: kleiner Hinweis beim ersten Start ----------
     Unten eingeblendet, verschwindet nach ein paar Sekunden von selbst (oder per Klick) und blockiert nichts.
     Erscheint erneut nur, wenn sich die Bedingungen ändern (dann „version“ erhöhen). */
  var Terms = {
    version: '2026-11',
    check: function () {
      if (Store.get('terms') === this.version) return;
      var self = this;
      setTimeout(function () { self.show(); }, 900);
    },
    show: function () {
      var self = this, url = CONFIG.portalUrl + 'nutzungsbedingungen.html';
      if (document.querySelector('.terms-note')) return;
      Store.set('terms', self.version);
      var timer = null, note;
      function close() {
        clearTimeout(timer);
        note.classList.add('is-out');
        setTimeout(function () { if (note.parentNode) note.parentNode.removeChild(note); }, 350);
      }
      // Bewusst knapp: eine Zeile, 5 Sekunden (vorher Überschrift, zwei Zeilen und 9 Sekunden – wirkte auf dem Fernseher zu groß)
      note = h('div', { class: 'terms-note', role: 'status' },
        icon('info'),
        h('span', { class: 'tn-txt' }, h('span', { text: T('Telvo ist nur ein Player – nutze nur Quellen, für die du berechtigt bist.') })),
        Platform.tv ? null : h('button', { class: 'tn-link', onclick: function (e) { e.stopPropagation(); openExternal(url); } }, T('Nutzungsbedingungen')),
        h('i', { class: 'tn-bar' }));
      note.addEventListener('click', close);
      document.body.appendChild(note);
      timer = setTimeout(close, 5000);
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
        // Erste Erinnerung 7 Tage vorher (wie „Läuft bald ab“ in der Statusanzeige) – vorher schon bei 30 Tagen:
        // bei Monatszugängen erschien „läuft bald ab“ gleich beim Einrichten
        var stage = left <= 0 ? 'over' : left <= day ? 'd1' : left <= 7 * day ? 'd7' : null;
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
        var text = stage === 'over' ? T('„{0}“ ist am {1} abgelaufen. Verlängere den Zugang, damit Sender, Filme und Serien wieder laufen.', p.name, when)
          : stage === 'd1' ? T('„{0}“ läuft in weniger als 24 Stunden ab ({1}). Verlängere den Zugang rechtzeitig, damit alles weiterläuft.', p.name, when)
          : T('„{0}“ läuft in {1} Tagen ab ({2}). Verlängere den Zugang rechtzeitig, damit alles weiterläuft.', p.name, days, when);
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
  // Daten der gerade schauenden Person (Favoriten, Verlauf …). Die erste Person nutzt die bisherigen Schlüssel.
  function uid() { return pid() + Persons.suffix(); }
  function slim(item) {
    var o = {};
    ['kind', 'id', 'name', 'logo', 'backdrop', 'num', 'ext', 'url', 'catId', 'season', 'seriesId', 'seriesName', 'year', 'rating', 'plot', 'genre', 'duration', 'archive', 'radio'].forEach(function (k) {
      if (item[k] !== undefined && item[k] !== null && item[k] !== '') o[k] = item[k];
    });
    return o;
  }

  /* ---------- Personen (Familienprofile) ----------
     Mehrere Personen teilen sich ein Gerät: jede hat eigene Favoriten, eigenen Verlauf, „Weiterschauen“, „Später ansehen“
     und Erinnerungen. Playlists, Kategorien, ausgeblendete Sender und die Kindersicherung gelten für alle.
     Kinderprofil: gesperrte Kategorien (Erwachsene und selbst gesperrte) sind ganz ausgeblendet, entsperren geht nicht;
     zum Wechseln in ein anderes Profil und für die Einstellungen braucht es die PIN der Kindersicherung. */
  var PERSON_COLORS = ['#a855f7', '#f97316', '#0ea5e9', '#22c55e', '#ec4899', '#eab308'];
  // Profilbilder: Symbol statt Anfangsbuchstabe (frei wählbar beim Anlegen/Bearbeiten)
  var AVATAR_ICONS = ['avSmile', 'avCat', 'avDog', 'avGhost', 'avRocket', 'avCrown', 'avGame', 'avMusic', 'star', 'heart', 'ball', 'moon'];
  var PERSONAL_KEYS = ['fav', 'resume', 'recent', 'seen', 'last', 'upnext', 'swatch', 'remind', 'later', 'chcount'];
  var Persons = {
    MAX: 6, pinOk: false,
    list: function () {
      var l = Store.get('persons', null);
      return l && l.length ? l : [{ id: 'main', name: T('Ich'), color: PERSON_COLORS[0] }];
    },
    save: function (l) { Store.set('persons', l); },
    get: function (id) { return this.list().filter(function (p) { return p.id === id; })[0] || null; },
    curId: function () { var id = Store.get('person', 'main'); return this.get(id) ? id : 'main'; },
    cur: function () { return this.get(this.curId()); },
    kids: function () { var c = this.cur(); return !!(c && c.kids); },
    multi: function () { return this.list().length > 1; },
    suffix: function () { var id = this.curId(); return id === 'main' ? '' : '~' + id; },
    add: function (name, kids, ic) {
      var l = this.list(), used = l.map(function (p) { return p.color; });
      var color = PERSON_COLORS.filter(function (c) { return used.indexOf(c) < 0; })[0] || PERSON_COLORS[l.length % PERSON_COLORS.length];
      var id;
      do { id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); } while (this.get(id));   // eindeutig, auch wenn schnell hintereinander angelegt
      var p = { id: id, name: name, color: color };
      if (kids) p.kids = true;
      if (ic) p.icon = ic;
      l.push(p); this.save(l);
      return p;
    },
    update: function (id, ch) {
      var l = this.list();
      l.forEach(function (p) { if (p.id === id) { for (var k in ch) if (ch.hasOwnProperty(k)) { if (ch[k] === false || ch[k] === null) delete p[k]; else p[k] = ch[k]; } } });
      this.save(l);
    },
    // Person löschen: auch ihre Daten in allen Playlists (Datenschutz, keine Reste)
    remove: function (id) {
      if (id === 'main') return;
      this.save(this.list().filter(function (p) { return p.id !== id; }));
      Profiles.list().forEach(function (pl) { PERSONAL_KEYS.forEach(function (k) { Store.del(k + '.' + pl.id + '~' + id); }); });
      if (Store.get('person') === id) Store.del('person');
    },
    // Wechseln. Aus dem Kinderprofil heraus nur mit der PIN der Kindersicherung (falls eine festgelegt ist).
    switchTo: function (id) {
      var self = this, from = self.cur(), to = self.get(id);
      if (!to) return;
      function go() {
        Store.set('person', id);
        searchCache = {}; Parental.unlocked = false; self.pinOk = false;
        if (Player.el) Player.close();
        if (App.profile) Shell.open();
        toast(T('Hallo {0}!', to.name));
      }
      if (id === from.id) { if (Screens.top() && Screens.top().name === 'who') goBack(); return; }
      if (from.kids && !to.kids && Settings.get('parentPin')) Parental.ask(go, { keep: true, text: T('Zum Wechseln aus dem Kinderprofil bitte die PIN der Kindersicherung eingeben.') });
      else go();
    },
    // Kinderprofil: Einstellungen und Playlists nur mit PIN
    guard: function (go) {
      if (!this.kids() || !Settings.get('parentPin') || this.pinOk) { go(); return; }
      var self = this;
      Parental.ask(function () { self.pinOk = true; go(); }, { keep: true, text: T('Im Kinderprofil braucht es dafür die PIN der Kindersicherung.') });
    }
  };
  // Knopf oben auf dem Startbildschirm: wer gerade schaut (bei einer Person nur der Kreis)
  function personButton() {
    var p = Persons.cur(), multi = Persons.multi();
    return h('button', { class: 'ln-person f' + (multi ? ' has-name' : ''), 'data-key': 'ln:person', title: multi ? T('Wer schaut? ({0})', p.name) : T('Benutzer'), 'aria-label': T('Wer schaut?') + ': ' + p.name,
      onclick: function () { if (multi) showWhoWatches(); else Persons.guard(function () { showPersons(); }); } },
      avatar(p), multi ? h('span', { text: p.name }) : null);
  }
  function avatar(p, cls) {
    var ic = p.icon && AVATAR_ICONS.indexOf(p.icon) >= 0 ? p.icon : null;
    return h('span', { class: 'avatar' + (cls ? ' ' + cls : '') + (p.kids ? ' is-kids' : '') + (ic ? ' has-icon' : ''), style: 'background:' + p.color, 'aria-hidden': 'true' },
      ic ? icon(ic) : h('span', { class: 'av-l', text: String(p.name || '?').trim().charAt(0).toUpperCase() || '?' }));
  }
  /* „Wer schaut?“ – beim Start, wenn mehrere Personen angelegt sind, und über den Personen-Knopf */
  function showWhoWatches() {
    var cur = Persons.curId(), grid = h('div', { class: 'who-grid' });
    Persons.list().forEach(function (p) {
      grid.appendChild(h('button', { class: 'who-p f' + (p.id === cur ? ' is-on' : ''), 'data-autofocus': p.id === cur ? true : null, onclick: function () { Persons.switchTo(p.id); } },
        avatar(p, 'av-big'), h('b', { text: p.name }), p.kids ? h('small', { text: T('Kinderprofil') }) : null));
    });
    var el = h('div', { class: 'who' }, h('div', { class: 'who-in' },
      h('div', { class: 'brand' }, brandMark(), wordmark()),
      h('h1', { text: T('Wer schaut?') }), grid,
      h('button', { class: 'btn f ghost who-manage', onclick: function () { Persons.guard(showPersons); } }, icon('users'), h('span', { text: T('Benutzer verwalten') }))));
    Screens.push('who', el);
  }
  /* Personen verwalten: hinzufügen, umbenennen, Kinderprofil an/aus, löschen */
  function showPersons(onDone) {
    var box = h('div', { class: 'pp-list' });
    function paint() {
      clear(box);
      var l = Persons.list(), cur = Persons.curId();
      l.forEach(function (p) {
        box.appendChild(h('button', { class: 'ch-opt f pp-row', onclick: function () { editPerson(p, paint); } },
          avatar(p), h('span', { class: 'ch-txt' }, h('b', { text: p.name }), h('small', { text: [p.id === cur ? T('Schaut gerade') : '', p.kids ? T('Kinderprofil') : ''].filter(Boolean).join(' · ') || ' ' })),
          icon('pencil')));
      });
      if (l.length < Persons.MAX) box.appendChild(h('button', { class: 'ch-opt f pp-add', onclick: function () { editPerson(null, paint); } }, h('span', { class: 'avatar av-add' }, icon('plus')), h('span', { class: 'ch-txt' }, h('b', { text: T('Benutzer hinzufügen') }))));
    }
    paint();
    openSheet(T('Benutzer'), 'users', [h('p', { class: 'hint', text: T('Jeder Benutzer hat eigene Favoriten, eigenen Verlauf, „Weiterschauen“ und „Später ansehen“. Playlists und Einstellungen gelten für alle.') }), box], { onClose: onDone });
  }
  function editPerson(p, done) {
    var isNew = !p, f = inputField(T('Name'), T('z. B. Lea'), 'text');
    f.input.value = p ? p.name : '';
    f.input.setAttribute('maxlength', '20');
    f.input.setAttribute('data-autofocus', '');
    var kids = !!(p && p.kids), err = h('div', { class: 'error' });
    var kidRow = toggleRow(T('Kinderprofil'), T('Zeigt keine gesperrten Kategorien (z. B. für Erwachsene). Wechseln und Einstellungen nur mit der PIN der Kindersicherung.'),
      function () { return kids; }, function (v) { kids = v; });
    var tip = h('p', { class: 'hint', text: Settings.get('parentPin') ? '' : T('Tipp: Lege unter Einstellungen → Kindersicherung eine PIN fest, damit Kinder nicht einfach wechseln können.') });
    // Profilbild: Anfangsbuchstabe oder eines der Symbole (in der Farbe des Benutzers)
    var pick = p ? (p.icon || '') : '', color = p ? p.color : PERSON_COLORS[Persons.list().length % PERSON_COLORS.length];
    var picker = h('div', { class: 'av-pick', role: 'radiogroup', 'aria-label': T('Profilbild') });
    function paintPick() {
      clear(picker);
      [''].concat(AVATAR_ICONS).forEach(function (ic) {
        var name = f.input.value.trim() || (p && p.name) || '?';
        picker.appendChild(h('button', { class: 'av-opt f' + (pick === ic ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': pick === ic ? 'true' : 'false',
          'aria-label': ic ? T('Profilbild') : T('Anfangsbuchstabe'), onclick: function () { pick = ic; paintPick(); Nav.focus($('.av-opt.is-on', picker)); } },
          avatar({ name: name, color: color, icon: ic })));
      });
    }
    paintPick();
    f.input.addEventListener('input', function () { if (!pick) { var b = $('.av-opt .av-l', picker); if (b) b.textContent = (f.input.value.trim().charAt(0) || '?').toUpperCase(); } });
    var pickWrap = h('div', { class: 'field' }, h('span', { text: T('Profilbild') }), picker);
    function save() {
      var name = f.input.value.trim();
      if (!name) { err.textContent = T('Bitte einen Namen eingeben.'); return; }
      if (isNew) Persons.add(name, kids, pick); else Persons.update(p.id, { name: name, kids: p.id === 'main' ? false : kids, icon: pick || null });
      goBack(); if (done) setTimeout(done, 40);
    }
    f.input.addEventListener('keydown', function (e) { if (e.keyCode === 13) save(); });
    var btns = h('div', { class: 'row' }, sheetBtn('check', T('Speichern'), save, 'primary'));
    if (p && p.id !== 'main') btns.appendChild(sheetBtn('trash', T('Löschen'), function () {
      confirmBox(T('„{0}“ löschen?', p.name), T('Favoriten, Verlauf und Listen dieses Benutzers werden auf diesem Gerät gelöscht.'), T('Löschen'), function () {
        Persons.remove(p.id); goBack(); if (done) setTimeout(done, 40);
        if (!Persons.get(Persons.curId()) || Persons.curId() === 'main') { if (App.profile) Shell.open(); }
      });
    }));
    openSheet(isNew ? T('Benutzer hinzufügen') : p.name, 'users', [f.wrap, pickWrap, p && p.id === 'main' ? null : kidRow, tip, err, btns]);
  }

  var Favs = {
    all: function () { return Store.get('fav.' + uid(), { live: [], movie: [], series: [] }); },
    list: function (kind) { return this.all()[kind] || []; },
    has: function (item) { return this.list(item.kind).some(function (x) { return x.id === item.id; }); },
    toggle: function (item) {
      var a = this.all(); var l = a[item.kind] || [];
      var on = l.some(function (x) { return x.id === item.id; });
      a[item.kind] = on ? l.filter(function (x) { return x.id !== item.id; }) : [slim(item)].concat(l);
      Store.set('fav.' + uid(), a);
      localChanged();
      toast(on ? T('Aus Favoriten entfernt') : T('Zu Favoriten hinzugefügt'));
      return !on;
    }
  };

  var Resume = {
    all: function () { return Store.get('resume.' + uid(), {}); },
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
      Store.set('resume.' + uid(), a);
    },
    recent: function () { var a = this.all(); return Object.keys(a).map(function (k) { return a[k]; }).sort(function (x, y) { return y.at - x.at; }); },
    drop: function (item) { var a = this.all(), k = this.key(item); if (a[k]) { delete a[k]; Store.set('resume.' + uid(), a); } },
    clear: function () { Store.del('resume.' + uid()); }
  };

  /* Fertig geschaute Filme und Folgen (für Häkchen und „nächste ungesehene Folge“) */
  /* „Später ansehen“: eigene Merkliste für Filme und Serien (zuletzt gemerkt zuerst), getrennt von den Favoriten */
  var Later = {
    key: function () { return 'later.' + uid(); },
    all: function () { return Store.get(this.key(), []); },
    list: function (kind) { return this.all().filter(function (x) { return x.kind === kind; }); },
    same: function (a, b) { return a.kind === b.kind && String(a.id) === String(b.id); },
    has: function (it) { var self = this; return this.all().some(function (x) { return self.same(x, it); }); },
    drop: function (it) {
      var self = this, a = this.all(), l = a.filter(function (x) { return !self.same(x, it); });
      if (l.length !== a.length) Store.set(this.key(), l);
    },
    toggle: function (it) {
      var self = this, on = !this.has(it), l = this.all().filter(function (x) { return !self.same(x, it); });
      if (on) l.unshift(slim(it));
      Store.set(this.key(), l.slice(0, 300));
      localChanged();
      toast(on ? T('Zu „Später ansehen“ hinzugefügt') : T('Aus „Später ansehen“ entfernt'));
      return on;
    }
  };
  var Seen = {
    all: function () { return Store.get('seen.' + uid(), {}); },
    has: function (item) { return !!this.all()[item.kind + ':' + item.id]; },
    add: function (item) {
      if (!item || (item.kind !== 'movie' && item.kind !== 'episode')) return;
      var a = this.all(), k = item.kind + ':' + item.id;
      if (a[k]) return;
      a[k] = Date.now();
      var keys = Object.keys(a);
      if (keys.length > 2500) keys.sort(function (x, y) { return a[x] - a[y]; }).slice(0, keys.length - 2000).forEach(function (x) { delete a[x]; });
      Store.set('seen.' + uid(), a);
      if (item.kind === 'episode') UpNext.finished(item);
      if (item.kind === 'movie') Later.drop(item);   // fertig geschaut: von „Später ansehen“ streichen
    },
    // Von Hand: mehrere Einträge als gesehen / nicht gesehen markieren (Folgen, Filme, ganze Serie „series:<id>“)
    setMany: function (items, on) {
      var a = this.all();
      items.forEach(function (it) { var k = it.kind + ':' + it.id; if (on) a[k] = a[k] || Date.now(); else delete a[k]; });
      Store.set('seen.' + uid(), a);
      if (on) items.forEach(function (it) { Resume.drop(it); });
    }
  };

  /* „Weiterschauen“ mit der nächsten Folge: Ist eine Folge zu Ende geschaut, steht die Serie mit der nächsten Folge
     in „Weiterschauen“ (statt zu verschwinden). Die nächste Folge kennt der Player (Folgenliste der Staffel). */
  var UpNext = {
    hints: {},
    key: function () { return 'upnext.' + uid(); },
    all: function () { return Store.get(this.key(), {}); },
    hint: function (list) { var self = this; (list || []).forEach(function (e, i) { if (e && e.kind === 'episode') self.hints[e.id] = list[i + 1] || null; }); },
    finished: function (ep) {
      if (!ep || !ep.seriesId) return;
      var a = this.all(), next = this.hints[ep.id];
      a[ep.seriesId] = { at: Date.now(), done: slim(ep), next: next ? slim(next) : null,
        series: { kind: 'series', id: ep.seriesId, name: ep.seriesName || '', logo: ep.logo } };
      Object.keys(a).sort(function (x, y) { return a[y].at - a[x].at; }).slice(20).forEach(function (k) { delete a[k]; });
      Store.set(this.key(), a);
    },
    drop: function (seriesId) { var a = this.all(); if (a[seriesId]) { delete a[seriesId]; Store.set(this.key(), a); } },
    // Einträge für „Weiterschauen“ – nur Serien ohne angefangene Folge
    entries: function () {
      var a = this.all(), busy = {};
      Resume.recent().forEach(function (r) { if (r.item && r.item.seriesId) busy[r.item.seriesId] = 1; });
      return Object.keys(a).filter(function (k) { return !busy[k]; }).map(function (k) { var e = a[k]; return { item: e.next || e.series, t: 0, d: 0, at: e.at, upNext: e }; });
    }
  };
  // Zuletzt geschaut pro Serie (für den Hinweis „Neue Folgen“): { serienId: Zeitpunkt }
  var SeriesWatch = {
    key: function () { return 'swatch.' + uid(); },
    all: function () { return Store.get(this.key(), {}); },
    touch: function (seriesId, onlyKnown) {
      if (!seriesId) return;
      var a = this.all();
      if (onlyKnown && !a[seriesId]) return;
      a[seriesId] = Date.now();
      var ks = Object.keys(a);
      if (ks.length > 300) ks.sort(function (x, y) { return a[x] - a[y]; }).slice(0, ks.length - 250).forEach(function (k) { delete a[k]; });
      Store.set(this.key(), a);
    },
    // Anbieter hat die Serie nach dem letzten Schauen geändert (Xtream: last_modified) → neue Folgen
    hasNew: function (series, map) {
      var w = (map || this.all())[series.id], added = Number(series.added) || 0;
      return !!(w && added && added * 1000 > w + 60000);
    }
  };

  /* Was zuletzt lief (Sender, Film oder Serie) – beim nächsten App-Start landet man genau dort */
  var Last = {
    get: function () { return Store.get('last.' + uid(), null); },
    set: function (item) {
      var it = item;
      if (item.kind === 'episode') {
        var s = App.openSeries && App.openSeries.id === item.seriesId ? App.openSeries : { kind: 'series', id: item.seriesId, name: item.seriesName, logo: item.logo };
        it = s;
      }
      if (!it || !it.id || it.kind === 'catchup') return;
      Store.set('last.' + uid(), { item: slim(it), at: Date.now() });
    }
  };

  var Recent = {
    list: function () { return Store.get('recent.' + uid(), []); },
    push: function (item) {
      var l = this.list().filter(function (x) { return x.id !== item.id; });
      l.unshift(slim(item)); Store.set('recent.' + uid(), l.slice(0, 15));
      ChanCount.add(item);
      localChanged();
    }
  };
  /* Favoriten / „Zuletzt gesehen“ geändert → Zähler in offenen Listen neu zeichnen (vorher blieben sie auf dem alten Stand) */
  var localWatchers = [];
  function onLocalChange(el, fn) { localWatchers.push({ el: el, fn: fn }); }
  function localChanged() {
    localWatchers = localWatchers.filter(function (w) { return document.body.contains(w.el); });
    localWatchers.forEach(function (w) { try { w.fn(); } catch (e) {} });
  }

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
        if (b.focus) btn._focus = true;
        row.appendChild(btn);
      });
      // Ausdrücklich gewünschter Startfokus (z. B. „Abbrechen“ bei „App beenden?“) geht vor dem Hauptknopf
      Array.prototype.forEach.call(row.children, function (x) { if (x._focus) first = x; });
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
          // Titel vor der Kopfzeile („Sortieren“ stand im Ablauf zuerst – Rechts landete dort statt auf dem ersten Cover).
          // Mit „Weiterschauen“ sitzt „Sortieren“ in dessen Überschrift (nicht in .mv-head) – deshalb .sort-wrap extra.
          var pool = vis.length ? vis : inMain, items = pool.filter(function (el) { return !(el.closest && el.closest('.mv-head, .sort-wrap')); });
          var first = (items.length ? items : pool)[0];
          this.focus(first);
          return true;
        }
      }
      // Startseite: Runter aus der Menüleiste führt ins Titelbild („Jetzt ansehen“) – sonst sprang der Fokus
      // über das Titelbild hinweg auf die erste Karte darunter (die liegt waagerecht näher am Herz/Live TV)
      if (dir === 'down' && cur.closest && cur.closest('.topnav')) {
        var heroBtn = $('.launcher.hm .hm-heroslot .f');
        if (heroBtn && list.indexOf(heroBtn) >= 0) { this.focus(heroBtn); return true; }
      }
      // Startseite: Hoch aus den Reihen führt erst ins Titelbild, nicht gleich in die Menüleiste
      if (dir === 'up' && cur.closest && cur.closest('.hm-rows')) {
        var below = this.pick(cur, list.filter(function (el) { return !(el.closest && el.closest('.topnav')); }), dir);
        if (below) { this.focus(below.el); return true; }
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
    // „Ähnliche Titel“ als Schublade: klappt selbst hoch – das Fenster darum herum nicht nach unten rollen
    var drawer = el.closest ? el.closest('.d-similar.is-drawer') : null;
    while (p) {
      var r = el.getBoundingClientRect(), pr = p.getBoundingClientRect(), pad = 24;
      // feststehende Leiste oben (z. B. Genre-Leiste) nicht über das gewählte Element legen
      var sticky = p._stickyTop && !(el.closest && el.closest('.chipbar-wrap')) ? p._stickyTop() : 0;
      var top = pad + sticky;
      if (drawer && !drawer.contains(p)) { /* senkrecht nichts tun */ }
      else if (r.top < pr.top + top) p.scrollTop -= (pr.top + top - r.top);
      else if (r.bottom > pr.bottom - pad) p.scrollTop += (r.bottom - pr.bottom + pad);
      var stickyL = p._stickyLeft && !(el.closest && el.closest('.gd-ch')) ? p._stickyLeft() : 0;
      if (r.left < pr.left + pad + stickyL) p.scrollLeft -= (pr.left + pad + stickyL - r.left);
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
      if (typeof StatusTip !== 'undefined') StatusTip.hide();
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
      if (typeof StatusTip !== 'undefined') StatusTip.hide();
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
      if (typeof StatusTip !== 'undefined') StatusTip.hide();
      if (Player.mini) Player.close();
      while (this.stack.length) {
        var s = this.stack.pop();
        if (s.onLeave) s.onLeave();
        if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
      }
      return this.push(name, el, opts);
    }
  };

  /* Zurück – Tastatur, Fernbedienung und Android-Zurück-Taste (backButton) kommen alle hier an */
  function goBack() {
    // offenes Aufklapp-Menü (z. B. Sortieren) zuerst schließen
    if (InlineMenu.cur) { var w = InlineMenu.wrap; InlineMenu.close(); var fb = w && $('.f', w); if (fb) Nav.focus(fb); return; }
    // angefangene Sendernummer abbrechen (sonst schaltete sie 1,8 s später trotzdem um)
    if (NumEntry.buf) { NumEntry.reset(); return; }
    if (Dialog.open) { Dialog.close(); return; }
    var top = Screens.top();
    // Einstellungen: aufgeklappte Auswahl zuerst schließen, statt die ganze Seite zu verlassen
    var openRow = top && $('.st-row.is-open', top.el);
    if (openRow && openRow._close) { openRow._close(); Nav.focus(openRow); return; }
    if (top && top.onBack && top.onBack() === true) return;
    if (Screens.stack.length > 1) { Screens.pop(); return; }
    askExit();
  }
  function askExit() {
    // Im normalen Browser lässt sich ein Tab nicht per Skript schließen – „Beenden“ täte nichts, also gar nicht anbieten
    if (!Platform.tizen && !Platform.webos && !Platform.capacitor && !/Electron/.test(UA)) return;
    Dialog.show(T('App beenden?'), null, [{ label: T('Abbrechen'), focus: true }, { label: T('Beenden'), primary: true, action: exitApp }]);   // Fokus auf „Abbrechen“: ein versehentliches OK beendet nicht
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
    i.onerror = function () { if (onFail) onFail(i); else i.style.display = 'none'; };
    // nur Bildadressen laden – „javascript:“, „file:“ o. Ä. aus fremden Playlists gar nicht erst anfassen,
    // sondern wie ein kaputtes Bild behandeln (Aufrufer bekommen trotzdem ein Element)
    if (/^\s*(javascript:|vbscript:|file:|data:(?!image\/))/i.test(String(src))) { setTimeout(function () { i.onerror(); }, 0); return i; }
    i.src = src;
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

  /* Laufende Sendung eines Senders: aus dem Programmführer der Playlist (M3U) oder aus dem Zwischenspeicher (Xtream) */
  function epgNowOf(item) {
    return EpgCache.now(item) || (App.provider && App.provider.epgNow ? App.provider.epgNow(item) : null);
  }
  /* Sender als Zeile (Senderliste): Nummer, Logo, Name, laufende Sendung mit kleinem Fortschrittsbalken */
  function channelRow(item, onClick, onFocus) {
    var playing = Player.item && Player.item.kind === 'live' && String(Player.item.id) === String(item.id);
    var row = h('button', { class: 'chan f' + (playing ? ' is-playing' : ''), 'data-cid': item.id, onclick: onClick },
      h('span', { class: 'num', text: item.num ? String(item.num) : '' }),
      logoBox(item),
      h('span', { class: 'ch-txt' }, h('span', { class: 'name', text: item.name }),
        h('span', { class: 'now' }, h('span', { class: 'now-t' }), h('span', { class: 'now-bar' }, h('i')))),
      item.archive ? h('span', { class: 'arch', title: T('Verpasste Sendungen verfügbar') }, icon('archive')) : null,
      Favs.has(item) ? h('span', { class: 'fav', title: T('Favorit') }, icon('heartFill')) : null);
    if (onFocus) {
      row.addEventListener('focus', function () { onFocus(item); });
      row.addEventListener('mouseenter', function () { onFocus(item); });
    }
    row._item = item;
    paintNow(row);
    return row;
  }
  function paintNow(row) {
    var n = row._item && $('.now', row);
    if (!n) return;
    var cur = epgNowOf(row._item), t = Date.now() / 1000;
    n.classList.toggle('is-on', !!cur);
    if (!cur) return;
    $('.now-t', n).textContent = cur.title;
    $('.now-bar i', n).style.width = Math.max(2, Math.min(100, (t - cur.start) / (cur.end - cur.start) * 100)) + '%';
  }
  /* Programmführer (M3U) ist fertig geladen: bereits sichtbare Senderzeilen mit „läuft gerade“ füllen */
  function epgReady() {
    if (!App.provider || !App.provider.epgNow) return;
    $all('.chan[data-cid]').forEach(paintNow);
  }
  /* Xtream und Demo haben keinen ganzen Programmführer: die laufende Sendung wird nur für Sender geholt,
     die gerade zu sehen sind – höchstens 3 Anfragen gleichzeitig, beim schnellen Scrollen verfallen alte Wünsche */
  function NowLoader(scroller) {
    var queue = [], busy = 0, obs = null, timer = null;
    var needFetch = !(App.provider && App.provider.epgNow);
    function pump() {
      while (busy < 3 && queue.length) {
        var r = queue.shift();
        if (!r._vis || r._nowDone || !document.body.contains(r)) continue;
        r._nowDone = true; busy++;
        (function (row) {
          EpgCache.get(row._item).then(function () { busy--; paintNow(row); pump(); });
        })(r);
      }
    }
    if (needFetch && window.IntersectionObserver) {
      obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var vis = isVisible(e);
          e.target._vis = vis;
          if (vis && !e.target._nowDone) queue.push(e.target);
        });
        pump();
      }, { root: scroller, rootMargin: '200px 0px' });
    }
    // Fortschrittsbalken jede Minute weiterrücken (und abgelaufene Sendungen neu holen)
    timer = setInterval(function () {
      $all('.chan[data-cid]', scroller).forEach(function (r) {
        if (needFetch && r._vis && r._nowDone && !epgNowOf(r._item)) { r._nowDone = false; queue.push(r); }
        paintNow(r);
      });
      pump();
    }, 60000);
    return {
      watch: function (row, idx) {
        if (!needFetch) return;
        if (obs) obs.observe(row);
        else if (idx < 14) { row._vis = true; queue.push(row); pump(); }   // ältere Geräte ohne IntersectionObserver: nur die ersten Zeilen
      },
      dispose: function () { clearInterval(timer); if (obs) obs.disconnect(); queue = []; }
    };
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
  // „Weiterschauen“-Eintrag öffnen: angefangene Folge/Film abspielen, nächste Folge abspielen oder die Serie öffnen
  function openContinue(r) {
    var u = r.upNext, it = r.item;
    if (u && !u.next) { openItem(u.series); return; }
    playItem(it, { list: [it], index: 0, fromStart: !!u });
  }
  function upNextText(u) {
    return u.next ? T('Nächste Folge: S{0} E{1}', u.next.season, u.next.num) : T('Weiter nach S{0} E{1}', u.done.season, u.done.num);
  }
  function continueCard(r) {
    var it = r.item, ep = it.kind === 'episode', u = r.upNext;
    var title = ep ? (it.seriesName || it.name) : u ? u.series.name : it.name;
    var sub = u ? upNextText(u) : ep ? 'S' + it.season + ' E' + it.num : T('Noch {0}', fmtLeft(r.d - r.t));
    var src = it.backdrop || it.logo;
    var pic = src ? h('span', { class: 'cw-img' }, img(src, '', function (i) { var b = i.parentNode; if (b && b.parentNode) b.parentNode.removeChild(b); })) : null;
    return h('button', { class: 'cw f k-' + (ep || it.kind === 'series' ? 'series' : it.kind === 'live' ? 'live' : 'movie') + (it.backdrop ? '' : ' is-poster') + (u ? ' is-next' : ''), 'data-key': (ep ? 'series:' + it.seriesId : it.kind + ':' + it.id), title: title, onclick: function () { openContinue(r); } },
      pic,
      h('span', { class: 'cw-txt' },
        h('span', { class: 'cw-title', text: title }),
        h('span', { class: 'cw-sub', text: sub }),
        u ? null : h('span', { class: 'cw-bar' }, h('i', { style: 'width:' + Math.max(2, Math.round(r.t / r.d * 100)) + '%' }))));
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
    out._watch = SeriesWatch.all();
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
    // Neue Folgen bei einer angefangenen Serie (Anbieter hat sie nach dem letzten Schauen geändert) gehen vor „S1 E3“
    var fresh = it.kind === 'series' && badges && SeriesWatch.hasNew(it, badges._watch);
    var card = posterCard(it, function () { openItem(it); }, {
      progress: r ? r.t / r.d : 0,
      badge: fresh ? T('Neue Folgen') : badges && badges[it.id] ? badges[it.id] : null,
      seen: !r && !fresh && Seen.has(it)
    });
    if (fresh) card.classList.add('has-new');
    return card;
  }

  /* Großes Titelbild oben (wie bei Streaming-Diensten): Hintergrundbild, Titel, Infos und Knöpfe */
  function featureHero(item, opts) {
    opts = opts || {};
    var isSeries = item.kind === 'series';
    var bg = h('div', { class: 'fh-bg' });
    var meta = h('div', { class: 'fh-meta' });
    var plot = h('p', { class: 'fh-plot', text: item.plot || '' });
    var actions = h('div', { class: 'row fh-actions' });
    // Startseite: kleine Zeile über dem Titel – Bewertung · Genre · Jahr (Genre kommt erst mit den Details)
    var kick = opts.home ? h('span', { class: 'fh-kicker hm-kick' }) : null;
    function paintKick(d) {
      if (!kick) return;
      var r = Number(d.rating || item.rating), y = String(d.year || item.year || '').slice(0, 4);
      var g = String(d.genre || item.genre || '').split(/\s*[,\/|]\s*/).filter(Boolean).slice(0, 2).join(' • ');
      kick.textContent = [r > 0 && r < 9.8 ? '★ ' + r.toFixed(1) : '', g, y].filter(Boolean).join('  •  ');
    }
    paintKick({});
    var el = h('section', { class: 'fhero k-' + (isSeries ? 'series' : 'movie') + (opts.home ? ' is-home' : '') }, bg, h('div', { class: 'fh-shade' }),
      h('div', { class: 'fh-in' },
        opts.top || null,
        kick || (opts.kicker ? h('span', { class: 'fh-kicker' }, icon(isSeries ? 'series' : 'movie'), h('span', { text: opts.kicker })) : null),
        h('h1', { class: 'fh-title', text: item.name }), opts.home ? null : meta, plot, actions, opts.bottom || null));
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
      if (opts.home) {
        // Startseite wie im Entwurf: „Jetzt ansehen“ und „Details“
        var rr = isSeries ? null : Resume.get(item);
        actions.appendChild(h('button', { class: 'btn f primary', 'data-key': 'hero:play', onclick: function () { if (isSeries) showSeries(item); else playItem(item, { list: [item], index: 0 }); } },
          icon('play'), h('span', { text: rr ? T('Weiter bei {0}', fmtTime(rr.t)) : T('Jetzt ansehen') })));
        actions.appendChild(h('button', { class: 'btn f ghost', 'data-key': 'hero:info', onclick: function () { if (isSeries) showSeries(item); else showMovie(item); } },
          icon('info'), h('span', { text: T('Details') })));
        return;
      }
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
      paintKick(d);
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
  /* Filme/Serien sortieren und Gesehene ausblenden (Einstellung pro Art: vodSort = { movie: 'new', … }, vodHide = { … }) */
  var VOD_SORTS = function () { return [['default', T('Wie in der Playlist')], ['new', T('Neueste zuerst')], ['az', T('Name A–Z')], ['rating', T('Beste Bewertung')], ['year', T('Jahr (neueste zuerst)')]]; };
  function vodPref(name, kind, def) { var o = Settings.get(name) || {}; return o[kind] !== undefined ? o[kind] : def; }
  function setVodPref(name, kind, v) { var o = Settings.get(name) || {}; o[kind] = v; Settings.set(name, o); }
  function yearOf(it) {
    var y = Number(String(it.year || '').slice(0, 4));
    if (y > 1900) return y;
    var m = /(?:\(|\b)((?:19|20)\d{2})(?:\)|\b)/.exec(String(it.name || ''));
    return m ? Number(m[1]) : 0;
  }
  function sortVod(kind, list, isAll) {
    var m = vodPref('vodSort', kind, 'default'), a = list;
    if (vodPref('vodHide', kind, false)) a = a.filter(function (x) { return !Seen.has(x); });
    if (m === 'default') return isAll && some(a, function (x) { return Number(x.added) > 0; }) ? a.slice().sort(byAdded) : a;
    a = a.slice();
    if (m === 'new') a.sort(byAdded);
    else if (m === 'az') a.sort(function (x, y) { return String(x.name || '').localeCompare(String(y.name || ''), undefined, { numeric: true, sensitivity: 'base' }); });
    else if (m === 'rating') a.sort(function (x, y) { return (Number(y.rating) || 0) - (Number(x.rating) || 0); });
    else if (m === 'year') a.sort(function (x, y) { return yearOf(y) - yearOf(x); });
    return a;
  }
  function MediaView(kind) {
    var key = pid() + kind, isSeries = kind === 'series';
    var allCat = { id: '__all', name: isSeries ? T('Alle Serien') : T('Alle Filme') };
    var laterCat = { id: '__later', name: T('Später ansehen'), ic: 'bookmark' };
    // Oben: Top 10 über die ganze Breite. Darunter links die Kategorien, rechts die Cover.
    var topSlot = h('div', { class: 'mv-top' });
    var side = h('div', { class: 'mv-cats' });
    var title = h('h2', { class: 'mv-title' }), count = h('span', { class: 'count' });
    var sortBtn = h('button', { class: 'btn f mv-sort', 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: function () { toggleSort(); } }, icon('sort'), h('span'));
    var sortMenu = h('div', { class: 'sort-menu', hidden: true });
    var sortWrap = h('span', { class: 'sort-wrap' }, sortBtn, sortMenu);
    function paintSort() {
      var m = vodPref('vodSort', kind, 'default'), hide = vodPref('vodHide', kind, false), label = '';
      VOD_SORTS().forEach(function (o) { if (o[0] === m) label = o[1]; });
      sortBtn.lastChild.textContent = m === 'default' ? T('Sortieren') : label;
      sortBtn.classList.toggle('is-on', m !== 'default' || hide);
      if (hide) sortBtn.lastChild.textContent += ' · ' + T('ohne Gesehene');
    }
    /* Sortieren: der Knopf klappt direkt nach unten auf (kein eigenes Fenster). Eine Sortierung wählen schließt ihn,
       „Gesehene ausblenden“ lässt ihn offen. Zu mit Klick daneben, Zurück oder erneutem Druck auf den Knopf. */
    function applySort() { paintSort(); if (lastCatObj) selectCat(lastCatObj, false); }
    function closeSort(focusBtn) {
      if (sortMenu.hidden) return;
      sortMenu.hidden = true; sortWrap.classList.remove('is-open'); sortBtn.setAttribute('aria-expanded', 'false');
      if (InlineMenu.cur === closeSort) InlineMenu.cur = null;
      if (focusBtn) Nav.focus(sortBtn);
    }
    function paintSortMenu() {
      clear(sortMenu);
      var m = vodPref('vodSort', kind, 'default'), hide = vodPref('vodHide', kind, false);
      VOD_SORTS().forEach(function (o) {
        sortMenu.appendChild(h('button', { class: 'sm-opt f' + (o[0] === m ? ' is-on' : ''), onclick: function () { setVodPref('vodSort', kind, o[0]); closeSort(true); applySort(); } },
          h('span', { text: o[1] }), o[0] === m ? icon('check') : null));
      });
      sortMenu.appendChild(h('button', { class: 'sm-opt sm-toggle f' + (hide ? ' is-on' : ''), onclick: function () { setVodPref('vodHide', kind, !hide); applySort(); paintSortMenu(); Nav.focus($('.sm-toggle', sortMenu)); } },
        h('span', { text: isSeries ? T('Gesehene Serien ausblenden') : T('Gesehene Filme ausblenden') }), h('span', { class: 'switch' }, h('i'))));
    }
    function toggleSort() {
      if (!sortMenu.hidden) { closeSort(true); return; }
      InlineMenu.close();
      paintSortMenu();
      sortMenu.hidden = false; sortWrap.classList.add('is-open'); sortBtn.setAttribute('aria-expanded', 'true');
      InlineMenu.cur = closeSort; InlineMenu.wrap = sortWrap;
      setTimeout(function () { Nav.focus($('.sm-opt.is-on', sortMenu) || $('.sm-opt', sortMenu)); }, 20);
    }
    paintSort();
    var resumeSlot = h('div', { class: 'mv-resume' });
    var head = h('div', { class: 'mv-head' }, title, count, sortWrap);
    var grid = h('div', { class: 'poster-grid mv-grid' });
    var el = h('div', { class: 'page media mv2 media-' + kind + ' k-' + kind },
      topSlot,
      h('div', { class: 'mv-body' }, h('aside', { class: 'mv-side' }, side), h('div', { class: 'mv-main' }, resumeSlot, head, grid)));
    var flat = [], groups = null, curGroup = null, activeId = null, counts = null, req = 0, chunker = null, lastCatObj = null;

    function grpCat(g) { return { id: '__grp:' + g.key, name: T('Alle'), group: g }; }
    function inGroup(g, id) { if (id === '__grp:' + g.key) return grpCat(g); for (var i = 0; i < g.cats.length; i++) if (g.cats[i].id === id) return g.cats[i]; return null; }
    function row(c, label) {
      var real = String(c.id || '').charAt(0) !== '_';
      var b = h('button', { class: 'cat f has-n' + (c.ic ? ' cat-special' : ''), title: c.full || label, onclick: function () { selectCat(c, true); } },
        c.ic ? icon(c.ic) : real && Parental.isLocked(kind, c) ? h('span', { class: 'cat-ic cat-ic-lock' }, icon('lock')) : real ? catIcon(c.full || c.name) : null,
        h('span', { class: 'cat-name', text: label }), h('span', { class: 'lc-n' }));
      b._cat = c;
      return b;
    }
    function paintSide() {
      clear(side);
      if (groups && !curGroup) {
        side.appendChild(row(allCat, allCat.name));
        side.appendChild(row(laterCat, laterCat.name));
        groups.forEach(function (g) {
          var b = h('button', { class: 'cat lang-cat f', title: g.name, onclick: function () { openGroup(g); } },
            langBadge(g), h('span', { class: 'lc-name', text: g.name }), h('span', { class: 'lc-n' }), icon('next'));
          b._group = g;
          side.appendChild(b);
        });
      } else if (groups && curGroup) {
        // Gewählte Sprache oben wie ein Auswahlfeld: OK führt zurück zur Liste der Sprachen
        side.appendChild(h('button', { class: 'cat cat-back f', title: T('Zurück zu den Sprachen'), onclick: function () { showLanguages(curGroup); } },
          langBadge(curGroup), h('span', { class: 'lc-name', text: curGroup.name }), icon('down')));
        side.appendChild(row(grpCat(curGroup), T('Alle')));
        curGroup.cats.forEach(function (c) { side.appendChild(row(c, c.name)); });
      } else {
        side.appendChild(row(allCat, allCat.name));
        side.appendChild(row(laterCat, laterCat.name));
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
        else if (b._cat) n = b._cat.id === '__all' ? visTotal(flat, counts) : b._cat.id === '__later' ? Later.list(kind).length : (counts.by[b._cat.id] || 0);
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
      if (cat.id === '__later') return Promise.resolve(Later.list(kind));
      if (cat.group) {
        return visibleItems(kind, App.provider.items(kind, '__all')).then(function (all) {
          var ids = {};
          cat.group.cats.forEach(function (c) { ids[c.id] = 1; });
          var out = all.filter(function (x) { return ids[x.catId]; });
          return sortVod(kind, out, true);
        });
      }
      return (cat.id === '__all' ? visibleItems(kind, App.provider.items(kind, cat.id)) : App.provider.items(kind, cat.id)).then(function (list) {
        return sortVod(kind, list, cat.id === '__all');
      });
    }
    function paintResume() {
      clear(resumeSlot);
      if (activeId !== '__all' && activeId.indexOf('__grp:') !== 0) { head.appendChild(sortWrap); head.classList.remove('no-sort'); return; }
      var mine = Resume.recent().filter(function (r) { return isSeries ? r.item.kind === 'episode' : r.item.kind === 'movie'; });
      if (isSeries) mine = mine.concat(UpNext.entries()).sort(function (a, b) { return b.at - a.at; });
      mine = mine.slice(0, 12);
      if (mine.length) {
        var rail = railEl(T('Weiterschauen'), mine.map(continueCard), kind);
        $('h2', rail).appendChild(sortWrap);
        resumeSlot.appendChild(rail);
      } else head.appendChild(sortWrap);
      head.classList.toggle('no-sort', !!mine.length);
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
      lastCat[key] = cat.id; activeId = cat.id; lastCatObj = cat;
      markActive();
      // Top 10 nur bei „Alle“ – in einer Kategorie passen so mehr Cover auf den Bildschirm
      topSlot.hidden = cat.id !== '__all';
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
        if (!list.length) {
          grid.appendChild(cat.id === '__later' ? stateBox(T('Noch nichts vorgemerkt'), isSeries ? T('Bei einer Serie „Später ansehen“ wählen – dann erscheint sie hier.') : T('Bei einem Film „Später ansehen“ wählen – dann erscheint er hier.'))
            : stateBox(T('Keine Einträge'), T('In dieser Kategorie ist gerade nichts enthalten.')));
          return;
        }
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
    // „Später ansehen“ auf einer Detailseite geändert: Zahl links und – falls offen – die Liste auffrischen
    el._later = function () {
      paintCounts();
      if (activeId !== '__later' || !lastCatObj) return;
      selectCat(lastCatObj, false);
      Screens.stack.forEach(function (st) { if (st.el.contains(el) && st.lastFocus && !document.body.contains(st.lastFocus)) st.lastFocus = $('.cat.is-on', side); });
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
      ensureHls().then(function (Hls) { self.player = Hls && Hls.isSupported() ? 'ok' : 'off'; self.paint(); StatusLine.paint(); }, function () { self.player = 'off'; self.paint(); StatusLine.paint(); });
    },
    // [Zustand, Symbol, Text, Schlüssel] für Internet, Player und Playlist. active: eine Playlist ist gerade geöffnet
    items: function (active) {
      this.checkPlayer();
      var n = this.net(), pl = Profiles.list().length;
      // Internet: zuletzt gemessene Geschwindigkeit (letzte 24 Std.) unter 5 Mbit/s = langsam
      var nt = Store.get('nettest', null);
      if (n[0] === 'ok' && nt && nt.mbps != null && nt.mbps < 5 && Date.now() - nt.at < 86400000) n = ['warn', T('Internet langsam')];
      var pState = this.player, pText = pState === 'ok' ? T('Player bereit') : pState === 'wait' ? T('Player wird geprüft …') : T('Player eingeschränkt');
      if (pState === 'ok' && playErrors() >= 2) { pState = 'warn'; pText = T('Wiedergabe gestört'); }
      var plItem = [pl ? 'ok' : 'none', 'playlist', pl ? T('Playlist hinterlegt') : T('Keine Playlist'), 'playlist'];
      if (active) {
        var a = StatusLine.account(), days = a && a.expires ? Math.ceil((Number(a.expires) * 1000 - Date.now()) / 86400000) : null;
        // Ablauf zuerst: Xtream meldet abgelaufene Zugänge mit Status „Expired“ – das ist „abgelaufen“, nicht „gesperrt“
        if ((days !== null && days <= 0) || (a && /^expired$/i.test(String(a.status || '')))) plItem = ['off', 'playlist', T('Playlist abgelaufen'), 'playlist'];
        else if (a && a.status && !/^active$/i.test(String(a.status))) plItem = ['off', 'playlist', T('Zugang gesperrt'), 'playlist'];
        else if (days !== null && days <= 7) plItem = ['warn', 'playlist', T('Läuft bald ab'), 'playlist'];
        else plItem = ['ok', 'playlist', T('Playlist aktiv'), 'playlist'];
      }
      return [[n[0], 'wifi', n[1], 'net'], [pState, 'player', pText, 'player'], plItem];
    },
    paint: function () {
      if (!this.box) return;
      var items = this.items();
      clear(this.box);
      var box = this.box;
      items.forEach(function (it) {
        var c = h('span', { class: 'wl-chip is-' + it[0] }, h('i', { 'aria-hidden': 'true' }), icon(it[1]), h('span', { text: it[2] }));
        StatusTip.wire(c, it);
        box.appendChild(c);
      });
    },
    start: function (screenEl) {
      var self = this;
      clearInterval(self.timer);
      function tick() { if (!document.body.contains(screenEl)) { clearInterval(self.timer); window.removeEventListener('online', tick); window.removeEventListener('offline', tick); return; } self.paint(); }
      self.timer = setInterval(tick, 3000);
      window.addEventListener('online', tick); window.addEventListener('offline', tick);
    }
  };
  /* Statusanzeige, sobald eine Playlist geöffnet ist – immer sichtbar:
     auf dem Startbildschirm oben als Chips (cls 'ln-status'), sonst klein in der Fußleiste neben MAC und KEY ('sb-status') */
  var StatusLine = {
    boxes: [], timer: null, wired: false,
    el: function (cls) {
      var self = this, box = h('div', { class: cls || 'sb-status', role: 'status', 'aria-live': 'polite' });
      box._chips = cls === 'ln-status';
      self.boxes.push(box); self.paintBox(box);
      if (!self.timer) self.timer = setInterval(function () { self.paint(); }, 5000);
      if (!self.wired) {
        self.wired = true;
        window.addEventListener('online', function () { self.paint(); });
        window.addEventListener('offline', function () { self.paint(); });
      }
      return box;
    },
    paint: function () {
      var self = this;
      // nicht mehr angezeigte Felder vergessen (Startbildschirm wird bei jedem Besuch neu gebaut)
      self.boxes = self.boxes.filter(function (b) { var on = document.body.contains(b); if (on) b._seen = true; return on || !b._seen; });
      self.boxes.forEach(function (b) { self.paintBox(b); });
    },
    paintBox: function (box) {
      var items = WelcomeStatus.items(true), sig = items.map(function (it) { return it[0] + it[2]; }).join('|');
      if (sig === box._sig) return;
      var hadFocus = box.contains(document.activeElement);
      box._sig = sig; clear(box);
      items.forEach(function (it) {
        var bad = it[0] === 'warn' || it[0] === 'off', c;
        if (box._chips) {
          // Problem: als Knopf – OK/Tippen zeigt Grund und Zahlen (auch auf dem Fernseher ohne Maus)
          c = h(bad ? 'button' : 'span', { class: 'ln-chip is-' + it[0] + (bad ? ' f' : ''), onclick: bad ? function () { showStatusInfo(it); } : null },
            h('i', { 'aria-hidden': 'true' }), icon(it[1]), h('span', { text: it[2] }));
        } else c = h('span', { class: 'sb-st is-' + it[0] }, h('i', { 'aria-hidden': 'true' }), h('span', { text: it[2] }));
        StatusTip.wire(c, it);
        box.appendChild(c);
      });
      if (hadFocus) Nav.focusFirst(box);
    },
    // Zugangsdaten der Playlist (Laufzeit, Verbindungen) – höchstens alle 10 Minuten neu fragen
    acct: null, acctAt: 0, acctPid: null,
    account: function () {
      var self = this, id = pid();
      if (self.acctPid !== id) { self.acct = null; self.acctAt = 0; self.acctPid = id; }
      if (App.provider && App.provider.account && Date.now() - self.acctAt > 600000) {
        self.acctAt = Date.now();
        App.provider.account().then(function (a) { if (self.acctPid === id) { self.acct = a || null; self.paint(); } }, function () {});
      }
      return self.acct;
    }
  };
  /* Wiedergabefehler der letzten 30 Minuten */
  function playErrors() {
    var n = 0, since = Date.now() - 1800000;
    ErrLog.list().forEach(function (e) { if (e.t > since && (e.w === 'Wiedergabe' || e.w === 'TV-Player')) n += e.n || 1; });
    return n;
  }
  /* Grund und Zahlen zu einem Status-Punkt: [Bezeichnung, Wert] */
  function statusRows(it) {
    var rows = [], key = it[3];
    function num(x) { return String(x).replace('.', Lang.cur === 'en' ? '.' : ','); }
    if (key === 'net') {
      var on = !(typeof navigator.onLine === 'boolean' && !navigator.onLine);
      rows.push([T('Gerät'), on ? T('online') : T('offline')]);
      if (CONFIG.cloudUrl) rows.push([T('Online-Dienst'), Cloud.lastOk && (!Cloud.lastFail || Cloud.lastOk > Cloud.lastFail) ? T('erreichbar') + ' · ' + ago(Cloud.lastOk)
        : Cloud.lastFail ? T('nicht erreichbar') + ' · ' + ago(Cloud.lastFail) : T('wird geprüft …')]);
      var nt = Store.get('nettest', null);
      rows.push([T('Geschwindigkeit'), nt && nt.mbps != null ? num(nt.mbps) + ' Mbit/s' + (nt.ping != null ? ' · ' + T('Ping {0} ms', nt.ping) : '') + ' · ' + ago(nt.at) : T('noch nicht gemessen')]);
      var c = navigator.connection;
      if (c && c.downlink) rows.push([T('Laut Gerät'), '≈ ' + num(c.downlink) + ' Mbit/s' + (c.rtt ? ' · ' + T('Ping {0} ms', c.rtt) : '')]);
      if (it[0] !== 'ok') rows.push([T('Tipp'), it[0] === 'off' ? T('WLAN oder Kabel prüfen.') : T('Unter Einstellungen → Verbindung testen neu messen.')]);
    } else if (key === 'player') {
      var en = NativePlayer.available() && NativePlayer.engine() === 'native' ? T('TV-Player') : Platform.android && Settings.get('engine') !== 'hlsjs' ? T('Android-Player') : T('Telvo-Player');
      rows.push([T('Wiedergabe über'), en]);
      rows.push([T('Fehler (30 Min.)'), String(playErrors())]);
      var v = Player.video, pi = Player.item;
      if (v && pi) {
        var ahead = 0;
        try { for (var i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + .5 && v.buffered.end(i) > v.currentTime) ahead = v.buffered.end(i) - v.currentTime; } catch (e) {}
        rows.push([T('Läuft gerade'), pi.name]);
        if (v.videoHeight) rows.push([T('Bild'), v.videoHeight + 'p']);
        rows.push([T('Puffer'), T('{0} s', Math.round(ahead))]);
        var q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
        if (q && q.totalVideoFrames) rows.push([T('Verlorene Bilder'), q.droppedVideoFrames + ' / ' + q.totalVideoFrames]);
      }
      var last = ErrLog.list().filter(function (e) { return e.w === 'Wiedergabe' || e.w === 'TV-Player'; }).pop();
      if (it[0] !== 'ok' && last) rows.push([T('Letzter Fehler'), last.m.split(' | ')[0] + ' · ' + ago(last.t)]);
    } else {
      var a = StatusLine.account(), st = Stats.get();
      if (App.profile) rows.push([T('Playlist'), App.profile.name || '']);
      else rows.push([T('Gespeichert'), String(Profiles.list().length)]);
      var parts = [];
      if (st.live) parts.push(T('{0} Sender', fmtCount(st.live.n)));
      if (st.movie) parts.push(T('{0} Filme', fmtCount(st.movie.n)));
      if (st.series) parts.push(T('{0} Serien', fmtCount(st.series.n)));
      if (App.profile && parts.length) rows.push([T('Inhalt'), parts.join(' · ')]);
      if (a && a.expires !== undefined) {
        var d = a.expires ? Math.ceil((Number(a.expires) * 1000 - Date.now()) / 86400000) : null;
        rows.push([T('Laufzeit'), d === null ? T('unbegrenzt') : d <= 0 ? T('abgelaufen') : d === 1 ? T('1 Tag') : T('{0} Tage', d)]);
      }
      if (a && a.maxCons) rows.push([T('Verbindungen'), (a.activeCons != null ? a.activeCons : '?') + ' / ' + a.maxCons]);
      if (a && a.status && !/^active$/i.test(String(a.status))) rows.push([T('Zugang'), String(a.status)]);
      var oldest = 0;
      ['live', 'movie', 'series'].forEach(function (k) { if (st[k] && (!oldest || st[k].at < oldest)) oldest = st[k].at; });
      if (App.profile && oldest) rows.push([T('Zuletzt geladen'), ago(oldest)]);
    }
    return rows;
  }
  /* Beim Drüberfahren (PC) oder Fokus: kleine Karte mit Grund und Zahlen */
  var StatusTip = {
    pop: null,
    show: function (anchor, it) {
      this.hide();
      if (!document.body.contains(anchor)) return;
      var pop = h('div', { class: 'st-pop is-' + it[0], role: 'tooltip' }, h('b', null, h('i', { 'aria-hidden': 'true' }), h('span', { text: it[2] })));
      statusRows(it).forEach(function (r) { pop.appendChild(h('div', { class: 'st-pop-row' }, h('span', { text: r[0] }), h('em', { text: r[1] }))); });
      document.body.appendChild(pop);
      var a = anchor.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
      var top = a.bottom + 8 + ph > H - 8 ? a.top - ph - 8 : a.bottom + 8;
      pop.style.left = Math.round(Math.max(8, Math.min(W - pw - 8, a.left + a.width / 2 - pw / 2))) + 'px';
      pop.style.top = Math.round(Math.max(8, top)) + 'px';
      this.pop = pop; this.anchor = anchor;
      // Die Status-Knöpfe werden alle 3 s neu gebaut – „mouseleave“/„blur“ des alten Knopfs kommt dann nie.
      // Darum: bei jeder Bewegung, jedem Tippen und Fokuswechsel prüfen, ob der Hinweis noch zu etwas gehört.
      if (!this.armed) {
        this.armed = true;
        var self = this, check = function (e) {
          var a = self.anchor;
          if (!self.pop) return;
          if (!a || !document.body.contains(a) || (e.target && e.target.nodeType === 1 && !a.contains(e.target))) self.hide();
        };
        ['mousemove', 'pointerdown', 'focusin', 'touchstart'].forEach(function (t) { document.addEventListener(t, check, true); });
      }
    },
    hide: function () { if (this.pop && this.pop.parentNode) this.pop.parentNode.removeChild(this.pop); this.pop = null; this.anchor = null; },
    wire: function (el, it) {
      var self = this;
      el.addEventListener('mouseenter', function () { self.show(el, it); });
      el.addEventListener('mouseleave', function () { self.hide(); });
      el.addEventListener('focus', function () { self.show(el, it); });
      el.addEventListener('blur', function () { self.hide(); });
    }
  };
  function showStatusInfo(it) {
    StatusTip.hide();
    var body = h('div', { class: 'st-info' });
    statusRows(it).forEach(function (r) { body.appendChild(h('div', { class: 'st-pop-row' }, h('span', { text: r[0] }), h('em', { text: r[1] }))); });
    if (it[3] === 'net') body.appendChild(h('div', { class: 'row' }, sheetBtn('wifi', T('Verbindung testen'), function () { goBack(); setTimeout(function () { showSpeedTest(); }, 80); })));
    openSheet(it[2], it[1], body);
  }
  /* Kurze Hilfe auf der Willkommensseite */
  function showWelcomeHelp() {
    var qa = [
      [T('Wo finde ich MAC und KEY?'), T('Hier auf dieser Seite. Später auch unter „Profil“ und unten am Bildschirmrand.')],
      [T('Woher bekomme ich eine Playlist?'), T('Du bekommst sie zusammen mit deinem Zugang – als M3U-Link oder Xtream-Daten. Telvo enthält selbst keine Sender.')],
      [T('Die Playlist erscheint nicht?'), T('Die App prüft alle 30 Sekunden. Stimmen MAC und KEY auf der Webseite genau? Ist das Gerät online?')],
      [T('Kein Handy zur Hand?'), T('„Playlist hinzufügen“ wählen und die Daten direkt hier eingeben.')]
    ];
    var body = h('div', { class: 'wl-faq' });
    qa.forEach(function (x) { body.appendChild(h('div', { class: 'wl-faq-item' }, h('b', { text: x[0] }), h('p', { text: x[1] }))); });
    body.appendChild(h('p', { class: 'hint wl-faq-more' }, h('span', { text: T('Mehr Hilfe:') + ' ' }), portalLinkBtn()));
    openSheet(T('Hilfe'), 'help', body, { focusClose: true });
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
          h('p', { class: 'wl-legal', text: T('Diese App enthält keine Sender oder Inhalte. Du brauchst eine eigene Playlist (M3U-Link oder Xtream-Zugang).') })));
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
    // Voreinstellung: an – die Playlist lässt sich dann auch im Browser bearbeiten. Ausschalten = Zugangsdaten bleiben nur auf dem Gerät.
    var toWeb = true;
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
        // Zurück oben: wer sich doch für das Einrichten per Handy entscheidet, kommt sofort zurück
        h('button', { class: 'btn f ghost small form-back', onclick: goBack }, icon('back'), h('span', { text: T('Zurück') })),
        h('h1', { text: T('Playlist hinzufügen') }),
        h('div', null, macTag()),
        h('div', { class: 'tabs' }, tX, tM),
        fName.wrap, xBox, mBox, webRow, err,
        h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn f ghost', onclick: goBack }, T('Abbrechen'))),
        h('p', { class: 'hint', text: T('Diese App enthält keine Sender oder Inhalte. Du brauchst eine eigene Playlist (M3U-Link oder Xtream-Zugang).') })));
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
  /* Einstellung „App beim Start“: home, last (letzter Sender), live, movie, series.
     Früher nur der Schalter „Letzten Sender beim Start“ (autoLast) – der gilt weiter, solange nichts gewählt ist. */
  function startView() {
    var v = Settings.get('startView');
    if (v === 'home' || v === 'last' || v === 'live' || v === 'movie' || v === 'series') return v;
    return Settings.get('autoLast') !== false ? 'last' : 'home';
  }

  var Shell = {
    el: null, view: null, current: null, buttons: {}, pendingFocus: null,
    open: function () {
      var self = this;
      self.buttons = {}; self.current = null;
      self.view = h('div', { class: 'view' });
      var tabs = h('nav', { class: 'main-tabs', 'aria-label': T('Hauptmenü') });
      // Mitte: Favoriten (Herz) · Live TV · Filme · Serien · Start (Haus) – der gewählte Reiter leuchtet in seiner Farbe
      [['favs', T('Favoriten'), 'heart'], ['live', T('Live TV'), 'live'], ['movie', T('Filme'), 'movie'], ['series', T('Serien'), 'series'], ['home', T('Start'), 'home']].forEach(function (it) {
        var round = it[0] === 'home' || it[0] === 'favs';
        var b = h('button', { class: 'tab f k-' + it[0] + (round ? ' tab-round' : '') + (it[0] === 'home' ? ' tab-home' : ''), 'data-tab': it[0], title: it[1], 'aria-label': it[1], onclick: function () { self.show(it[0], true); } },
          icon(it[2]), h('span', { class: 'tab-label', text: it[1] }));
        self.buttons[it[0]] = b;
        tabs.appendChild(b);
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
        h('div', { class: 'nav-left' }, h('div', { class: 'brand brand-sm' }, brandMark(), h('span', { class: 'wordmark' }, h('b', { text: 'Telvo' })))),
        tabs,
        h('div', { class: 'top-tools' }, searchBtn, reloadTop, tool('settings', T('Einstellungen')), tool('profile', T('Profil'))));
      var runTime = h('div', { class: 'mac-tag sb-days' });
      App.provider.account().then(function (a) {
        if (!a || a.expires === undefined) return;
        var d = a.expires ? Math.ceil((Number(a.expires) * 1000 - Date.now()) / 86400000) : null;
        var txt = d === null ? T('unbegrenzt') : d <= 0 ? T('abgelaufen') : d === 1 ? T('1 Tag') : T('{0} Tage', d);
        runTime.appendChild(h('span', { text: T('Laufzeit') }));
        runTime.appendChild(h('b', { text: txt }));
        if (d !== null && d <= 30) runTime.classList.add(d <= 0 ? 'is-expired' : 'is-warn');
      }).catch(function () {});
      self.el = h('div', { class: 'shell' }, head, h('main', { class: 'content' }, self.view), h('footer', { class: 'statusbar' }, macTag(profileUser(App.profile), true, profileUserLabel(App.profile)), StatusLine.el(), runTime, h('span', { class: 'sb-clock' })));
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
      // Start: Startseite – oder Live TV / Filme / Serien, wenn so eingestellt („App beim Start“)
      var sv = startView();
      self.show(sv === 'live' || sv === 'movie' || sv === 'series' ? sv : 'home');
    },
    show: function (name, focusContent, keepFocus) {
      var self = this, prev = self.current;
      if ((name === 'settings' || name === 'profile') && Persons.kids() && Settings.get('parentPin') && !Persons.pinOk) {
        Persons.guard(function () { self.show(name, focusContent, keepFocus); });
        return;
      }
      self.current = name;
      // Mini-Player beenden, wenn man zu Filmen, Serien oder zum Startbildschirm wechselt
      // (außer bei Bild-in-Bild: das läuft absichtlich überall weiter)
      if ((name === 'movie' || name === 'series' || name === 'home') && Player.mini && !Player.pip) Player.close();
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

  /* Aufklappmenüs direkt an einem Knopf (z. B. Sortieren): nur eines ist offen; Zurück, Klick oder Fokus daneben schließt es */
  var InlineMenu = {
    cur: null, wrap: null,
    close: function () { var c = this.cur; if (!c) return false; this.cur = null; c(false); return true; },
    init: function () {
      var self = this;
      document.addEventListener('pointerdown', function (e) { if (self.cur && self.wrap && !self.wrap.contains(e.target)) self.close(); }, true);
      document.addEventListener('focusin', function (e) { if (self.cur && self.wrap && !self.wrap.contains(e.target)) self.close(); });
    }
  };
  InlineMenu.init();

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
     Oben Logo, Status (Internet, Player, Playlist) und Knöpfe (Suche, Aktualisieren, Einstellungen, Hilfe, Sprache).
     Darunter Live TV / Filme / Serien als große Glas-Kacheln, rechts Radio und Favoriten,
     unten „Zuletzt angesehen“ als breite Bildkarten. */
  var launcherRadio = false;   // zuletzt über „Radio“ zu Live TV gegangen → beim Zurückkommen dort den Fokus
  function fmtHMS(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var p2 = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p2(Math.floor(sec / 3600)) + ':' + p2(Math.floor((sec % 3600) / 60)) + ':' + p2(sec % 60);
  }
  // Leuchtende Welle unten in den Kacheln (Farbe kommt aus CSS über currentColor)
  function waveArt() {
    var w = h('span', { class: 'lt-wave', 'aria-hidden': 'true' });
    w.innerHTML = '<svg viewBox="0 0 400 100" preserveAspectRatio="none">' +
      '<path d="M0 62C70 40 150 86 240 62S360 34 400 44V100H0Z" fill="currentColor" opacity=".16"/>' +
      '<path d="M0 78C90 58 170 96 260 74S370 56 400 64V100H0Z" fill="currentColor" opacity=".22"/>' +
      '<path d="M0 62C70 40 150 86 240 62S360 34 400 44" fill="none" stroke="currentColor" stroke-width="2.2" opacity=".85" vector-effect="non-scaling-stroke"/></svg>';
    return w;
  }
  // „Zuletzt angesehen“: breite Bildkarte (Hintergrundbild, Titel, Restzeit oder Folge, Fortschritt)
  function recentCard(r, onOpen) {
    var it = r.item, u = r.upNext, ep = it.kind === 'episode' || !!u;
    var name = ep ? (it.seriesName || (u && u.series.name) || it.name) : it.name;
    var src = it.backdrop || it.logo || (u && u.series.logo);
    var art = h('span', { class: 'lr-art' }, h('span', { class: 'ph', style: 'background:' + gradientFor(name) }));
    if (src) art.appendChild(img(src, it.backdrop ? 'is-wide' : 'is-poster', function (i) { if (i.parentNode) i.parentNode.removeChild(i); }));
    var right = ep && it.season ? T('S{0}: F{1}', it.season, it.num) : r.d ? fmtHMS(r.d - r.t) : '';
    var pct = r.d ? Math.max(3, Math.min(100, Math.round(r.t / r.d * 100))) : 0;
    var label = name + (right ? ' – ' + (ep ? right : T('Noch {0}', fmtLeft(r.d - r.t))) : '');
    var sid = it.seriesId || (u && u.series.id);
    return h('button', { class: 'lr-card f k-' + (ep ? 'series' : 'movie'), 'data-key': 'lr:' + (ep ? 'series:' + sid : 'movie:' + it.id), title: label, 'aria-label': label,
      onclick: function () { (onOpen || openContinue)(r); } },
      art, h('span', { class: 'lr-shade' }),
      h('span', { class: 'lr-info' }, h('b', { text: name }), right ? h('small', { text: right }) : null),
      h('span', { class: 'lr-bar' }, h('i', { style: 'width:' + pct + '%' })));
  }
  function recentEntries() {
    return Resume.recent().filter(function (r) { return r.item && (r.item.kind === 'movie' || r.item.kind === 'episode'); })
      .concat(UpNext.entries()).sort(function (a, b) { return b.at - a.at; });
  }
  function showAllRecent() {
    var grid = h('div', { class: 'lr-grid' });
    recentEntries().slice(0, 20).forEach(function (r) {
      grid.appendChild(recentCard(r, function (x) { goBack(); setTimeout(function () { openContinue(x); }, 60); }));
    });
    openSheet(T('Zuletzt angesehen'), 'history', grid, { wide: true });
  }
  function openRadio() {
    var st = Stats.get();
    if (st.radio && !st.radio.n) { toast(T('In deiner Playlist sind keine Radiosender.')); return; }
    launcherRadio = true;
    lastCat[pid() + 'live'] = '__radio'; lastGroup[pid() + 'live'] = null;
    Shell.show('live', true);
  }

  /* ==========================================================
     Startseite (Entwurf vom 10.11.2026): oben die Menüleiste, darunter ein großes Titelbild mit den
     bestbewerteten Filmen und Serien (wechselt von selbst), „Weiterschauen“, „Zuletzt gesehene Sender“ und „Top Sender“.
     ========================================================== */
  /* Auswahl fürs Titelbild: wird beim Aktualisieren der Listen berechnet (catCounts) und klein gespeichert –
     die Startseite muss die großen Film- und Serienlisten dafür nicht selbst laden. */
  var HeroPicks = {
    key: function (kind, owner) { return 'hero.' + (owner || pid()) + '.' + kind; },
    get: function (kind) { return Store.get(this.key(kind), []); },
    // schon einmal berechnet (auch leer, z. B. M3U ohne Bewertungen) – dann nicht bei jedem Öffnen neu rechnen
    computed: function (kind) { return Store.get(this.key(kind), null) !== null; },
    /* Streng: ausgeblendete und gesperrte Kategorien fallen IMMER heraus – auch wenn die PIN gerade eingegeben wurde.
       Lässt sich die Kategorienliste nicht laden, obwohl etwas zu filtern wäre: Fehler (lieber kein Titelbild als ein falsches). */
    blocked: function (kind) {
      var hid = CatPrefs.map(kind, 'hide'), lockOn = Parental.on();
      if (!Object.keys(hid).length && !lockOn) return Promise.resolve({});
      return App.provider.categories(kind).then(function (cats) {
        var m = {};
        (cats || []).forEach(function (c) { if (hid[String(c.id)] || (lockOn && Parental.isLocked(kind, c))) m[String(c.id)] = 1; });
        return m;
      });
    },
    save: function (kind, list, owner) {
      var self = this;
      return this.blocked(kind).then(function (bad) {
        var vis = list.filter(function (x) { return !bad[String(x.catId)]; });
        var top = topTen(vis, some(vis, function (x) { return Number(x.added) > 0; })).slice(0, 4);
        Store.set(self.key(kind, owner), top.map(slim));
      }).catch(function () {});
    },
    // abwechselnd Film und Serie
    load: function () {
      var self = this;
      function one(kind) { return self.blocked(kind).then(function (bad) { return self.get(kind).filter(function (x) { return !bad[String(x.catId)]; }); }); }
      return Promise.all([one('movie'), one('series')]).then(function (r) {
        var m = r[0] || [], s = r[1] || [], out = [];
        for (var i = 0; i < 4; i++) { if (m[i]) out.push(m[i]); if (s[i] && i < 2) out.push(s[i]); }
        return out.slice(0, 5);
      }, function () { return []; });
    }
  };
  /* Wie oft ein Sender geschaut wurde (pro Person) – für „Top Sender“ auf der Startseite */
  var ChanCount = {
    key: function () { return 'chcount.' + uid(); },
    all: function () { return Store.get(this.key(), {}); },
    add: function (item) {
      if (!item || item.kind !== 'live' || !item.id) return;
      var a = this.all(), k = String(item.id), e = a[k] || { n: 0 }, now = Date.now();
      // derselbe Sender wird beim Start und beim Schließen gemeldet – innerhalb von 10 Minuten nur einmal zählen
      if (!(e.last && now - e.last < 600000)) { e.n++; e.last = now; }
      e.at = now; e.item = slim(item); a[k] = e;
      var ks = Object.keys(a);
      if (ks.length > 80) ks.sort(function (x, y) { return a[y].n - a[x].n || a[y].at - a[x].at; }).slice(60).forEach(function (x) { delete a[x]; });
      Store.set(this.key(), a);
    },
    top: function (n) {
      var a = this.all();
      return Object.keys(a).sort(function (x, y) { return a[y].n - a[x].n || a[y].at - a[x].at; }).slice(0, n).map(function (k) { return a[k].item; });
    }
  };

  // Großes Titelbild der Startseite: wechselt alle 9 Sekunden – aber nie, während die Knöpfe darin gewählt sind
  function homeHero(items) {
    var box = h('div', { class: 'hm-hero' }), dots = h('div', { class: 'hm-dots', 'aria-hidden': 'true' }), idx = 0, timer = null;
    function show(i) {
      idx = (i + items.length) % items.length;
      clear(dots);
      items.forEach(function (x, j) { dots.appendChild(h('i', { class: j === idx ? 'is-on' : '' })); });
      var fh = featureHero(items[idx], { home: true, bottom: items.length > 1 ? dots : null });
      clear(box).appendChild(fh);
    }
    show(0);
    if (items.length > 1) timer = setInterval(function () {
      if (!document.body.contains(box)) { clearInterval(timer); return; }
      // nicht wechseln, solange man dort steht, etwas darüber offen ist (Details, Player, Dialog) oder die App im Hintergrund ist –
      // sonst verschwindet der gemerkte Knopf und der Fokus springt beim Zurückkommen in die Menüleiste
      var top = Screens.top();
      if (box.contains(document.activeElement) || Player.el || Dialog.open || document.hidden || !top || !top.el.contains(box)) return;
      show(idx + 1);
    }, 9000);
    box._dispose = function () { clearInterval(timer); };
    return box;
  }

  function LauncherView() {
    var busy = false, disposers = [];
    // Kindersicherung: entsperrte Kategorien sind wieder zu, sobald man zum Startbildschirm zurückkommt
    if (Parental.unlocked) { Parental.unlocked = false; searchCache = {}; }
    launcherRadio = false;

    var heroSlot = h('div', { class: 'hm-heroslot' });
    var rows = h('div', { class: 'hm-rows' });
    var el = h('div', { class: 'launcher hm' }, heroSlot, rows);

    function row(title, ic, kids, more) {
      return h('section', { class: 'hm-row' },
        h('div', { class: 'hm-rhead' }, h('h2', { class: 'hm-rtitle' }, ic ? icon(ic) : null, h('span', { text: title })), more || null),
        h('div', { class: 'hm-track' }, kids));
    }
    function chanTile(ch, list) {
      return h('button', { class: 'hm-ch f', 'data-key': 'ch:' + ch.id, title: ch.name, onclick: function () { playChannel(ch); } },
        logoBox(ch), h('span', { class: 'hm-chname', text: ch.name }));
    }
    function topTile(ch, n) {
      return h('button', { class: 'hm-top f', 'data-key': 'top:' + ch.id, title: ch.name, 'aria-label': n + '. ' + ch.name, onclick: function () { playChannel(ch); } },
        h('span', { class: 'hm-num', text: String(n) }), logoBox(ch), h('span', { class: 'hm-chname', text: ch.name }));
    }
    // Schnellzugriff, solange es noch nichts zu zeigen gibt (neue Playlist, erster Start)
    function quickRow() {
      var st = Stats.get();
      function q(kind, label, unit) {
        var x = st[kind];
        return h('button', { class: 'hm-quick f k-' + kind, 'data-key': 'q:' + kind, onclick: function () { Shell.show(kind, true); } },
          h('span', { class: 'hm-qic' }, icon(kind)), h('b', { text: label }), h('small', { text: x ? T(unit, fmtCount(x.n)) : '…' }));
      }
      return h('div', { class: 'hm-quickrow' }, q('live', T('Live TV'), '{0} Sender'), q('movie', T('Filme'), '{0} Titel'), q('series', T('Serien'), '{0} Serien'));
    }

    var firstHero = true, disposed = false;
    function paintHero() {
      HeroPicks.load().then(function (items) {
        if (disposed) return;      // Startseite schon verlassen: kein Titelbild mehr bauen (Timer, Bilder, Anfragen)
        var had = heroSlot.firstChild, inside = had && had.contains(document.activeElement);
        // im Titelbild unterwegs: nicht austauschen
        if (inside && had.classList.contains('hm-hero')) return;
        // weiterhin kein Titelbild und die Ersatzkacheln stehen schon: so lassen (sonst springt der Fokus auf „Live TV“ zurück)
        if (!items.length && had && had.classList.contains('hm-quickrow')) return;
        var fkey = inside && document.activeElement.getAttribute('data-key');
        if (had && had._dispose) had._dispose();
        clear(heroSlot);
        if (items.length) heroSlot.appendChild(homeHero(items));
        el.classList.toggle('no-hero', !items.length);
        if (!items.length) heroSlot.appendChild(quickRow());
        if (inside) { var fq = (fkey && $('[data-key="' + fkey + '"]', heroSlot)) || $('.f', heroSlot); if (fq) Nav.focus(fq); }
        // Beim Öffnen steht der Fokus auf „Jetzt ansehen“ (das Titelbild kommt erst kurz nach dem Aufbau dazu)
        // (erst nach den 20/30 ms, nach denen Screens/Shell selbst den ersten Knopf wählen)
        if (firstHero) setTimeout(function () {
          var a = document.activeElement, top0 = Screens.top();
          if (top0 && top0.el.contains(el) && (!a || a === document.body || (a.closest && a.closest('.topnav') && a.classList.contains('tab-home')))) {
            var f0 = $('.f', heroSlot); if (f0) Nav.focus(f0);
          }
        }, 70);
        firstHero = false;
      });
    }
    var wantKey = null, rowsReq = 0;
    // Reihen komplett aufbauen und dann auf einmal austauschen (kein Flackern, Fokus bleibt auf derselben Karte)
    function paintRows() {
      var my = ++rowsReq, foc = document.activeElement, fkey = rows.contains(foc) && foc.getAttribute('data-key');
      var res = recentEntries().slice(0, 10), out = [];
      if (res.length) {
        out.push(row(T('Weiterschauen'), null, res.map(function (r) {
          var c = recentCard(r);
          c.appendChild(h('span', { class: 'hm-play', 'aria-hidden': 'true' }, icon('play')));
          return c;
        }), h('button', { class: 'lr-all f', 'data-key': 'lr:all', onclick: showAllRecent }, h('span', { text: T('Alle anzeigen') }), icon('next'))));
      }
      var recent = Recent.list(), top = ChanCount.top(5);
      // „Top Sender“ mit Favoriten und zuletzt gesehenen auffüllen, bis es fünf sind
      var seen = {}, topList = [];
      top.concat(Favs.list('live'), recent).forEach(function (c) { if (c && !seen[c.id] && topList.length < 5) { seen[c.id] = 1; topList.push(c); } });
      function done(rc, tp) {
        if (my !== rowsReq) return;
        if (rc.length) out.push(row(T('Zuletzt gesehene Sender'), null, rc.map(function (c) { return chanTile(c); })));
        if (tp.length) out.push(row(T('Top Sender'), 'bolt', tp.map(function (c, i) { return topTile(c, i + 1); })));
        clear(rows); out.forEach(function (x) { rows.appendChild(x); });
        el.classList.toggle('is-empty', !out.length);
        var k = fkey || wantKey, top0 = Screens.top();
        wantKey = null;
        if (k && top0 && top0.el.contains(el)) {
          var t = $('[data-key="' + k + '"]', rows);
          if (t) {
            Nav.focus(t);
            // Screens.pop() setzt den Fokus 20 ms nach dem Zurückkommen selbst – danach noch einmal hierher
            setTimeout(function () { if (document.body.contains(t) && document.activeElement !== t && !rows.contains(document.activeElement)) Nav.focus(t); }, 80);
          }
        }
      }
      Promise.all([visibleItems('live', Promise.resolve(recent.slice(0, 12))), visibleItems('live', Promise.resolve(topList))])
        .then(function (r) { done(r[0] || [], r[1] || []); }, function () { done([], []); });
    }

    // byUser: Knopf gedrückt (mit Bestätigung). quiet: automatisch im Hintergrund (ohne Fehlermeldung)
    function doRefresh(byUser, quiet) {
      if (busy) return;
      busy = true;
      refreshPlaylist().then(function (r) {
        busy = false;
        // alles frisch: die 30-Minuten-Pause gilt nur nach einem Fehlschlag
        if (!Stats.stale()) autoTried = 0;
        if (r.error) { if (!quiet) toast(T('Hinweis: {0}', r.error.message || T('Verbindung fehlgeschlagen.')), 4000); }
        else if (byUser) toast(T('Playlist aktualisiert'));
        if (document.body.contains(el)) paintHero();
      });
    }
    // Listen veraltet? Dann still im Hintergrund neu laden
    function autoCheck() {
      if (busy || !el.parentNode || !autoRefreshDue()) return;
      var first = !Stats.get().live && !Stats.get().movie && !Stats.get().series;
      autoTried = Date.now();
      doRefresh(false, !first);
    }

    paintHero(); paintRows();
    // Nach einem Update ist noch keine Auswahl fürs Titelbild gespeichert: einmal im Hintergrund berechnen
    if (!HeroPicks.computed('movie') && !HeroPicks.computed('series') && (Stats.get().movie || Stats.get().series)) {
      var pickT = setTimeout(function () {
        if (!document.body.contains(el) || busy) return;
        Promise.all([catCounts('movie'), catCounts('series')].map(function (p) { return p.then(null, function () {}); })).then(function () { if (document.body.contains(el)) setTimeout(paintHero, 300); });
      }, 2500);
      disposers.push(function () { clearTimeout(pickT); });
    }

    // Uhr und Datum unten rechts (in der Fußleiste)
    function tick() {
      var c = $('.sb-clock'), d = new Date();
      if (!c) return;
      clear(c);
      c.appendChild(h('span', { class: 'sky-slot' }, Sky.el()));
      c.appendChild(h('b', { text: clockStr(d) }));
      c.appendChild(h('span', { class: 'sb-date' },
        h('i', { text: d.toLocaleDateString(locale(), { weekday: 'long' }) }),
        h('small', { text: d.toLocaleDateString(locale(), { day: '2-digit', month: 'short' }) })));
    }
    setTimeout(tick, 0);
    // alle 20 Sekunden: Uhr aktualisieren, veraltete Listen nachladen (Box bleibt oft tagelang an)
    var timer = setInterval(function () { tick(); autoCheck(); }, 20000);
    // Erste Nutzung oder Listen älter als 12 Stunden: kurz nach dem Öffnen im Hintergrund neu laden
    setTimeout(autoCheck, 1500);

    // nach dem Schauen nur die Inhalte auffrischen, Fokus bleibt auf derselben Karte
    el._refresh = function () {
      var sc = Screens.top(), lf = sc && sc.lastFocus, key = lf && lf.getAttribute && lf.getAttribute('data-key');
      if (key && rows.contains(lf)) wantKey = key;     // Karte wird neu gezeichnet – danach wieder dorthin
      paintRows();
      // noch kein Titelbild (z. B. gerade erst die Listen aktualisiert): jetzt nachholen
      if (!$('.hm-hero', heroSlot)) paintHero();
      setTimeout(autoCheck, 1500);
    };
    // App kommt aus dem Hintergrund zurück (z. B. Box-Fernbedienung, Handy entsperrt)
    el._wake = function () { setTimeout(autoCheck, 800); };
    el._dispose = function () {
      disposed = true;
      clearInterval(timer);
      var hb = heroSlot.firstChild; if (hb && hb._dispose) hb._dispose();
      disposers.forEach(function (f) { f(); });
    };
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
    '<g class="rl-l"><path d="M17 25H70a12 12 0 0 1 12 12M42 25v50" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>' +
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
    var sub = h('p', { class: 'rl-sub', text: T('Neue Sender, Filme und Serien werden geladen.') });
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
      var catsP = kind === 'live' ? App.provider.categories('live').then(null, function () { return []; }) : Promise.resolve(null);
      countCache[k] = Promise.all([App.provider.items(kind, '__all'), catsP]).then(function (r) {
        var list = r[0], by = {};
        var newest = 0;
        list.forEach(function (x) { var c = String(x.catId); by[c] = (by[c] || 0) + 1; var a = Number(x.added) || 0; if (a > newest) newest = a; });
        // Ergebnis gehört zur Playlist, die beim Start aktiv war (Wechsel während des Ladens → keine falschen Zahlen)
        Stats.set(kind, list.length, newest, owner);
        var heroSaved = kind !== 'live' ? HeroPicks.save(kind, list, owner) : null;   // Auswahl fürs Titelbild der Startseite
        var out = { by: by, total: list.length, kind: kind };
        if (r[1]) {
          var ids = radioIds(r[1]), n = 0;
          list.forEach(function (x) { if (isRadio(x, ids)) n++; });
          Stats.set('radio', n, 0, owner);
          out.radio = n;
        }
        // erst fertig, wenn auch die Auswahl fürs Titelbild gespeichert ist (Startseite zeichnet danach neu)
        return heroSaved ? heroSaved.then(function () { return out; }) : out;
      });
      countCache[k].catch(function () { delete countCache[k]; });
    }
    return countCache[k];
  }
  /* Radio: Sender in Kategorien, deren Name nach Radio aussieht („Radio“, „Radyo“ …) – ausgeblendete Kategorien zählen nicht */
  function radioIds(cats) {
    var ids = {};
    visibleCats('live', cats || []).forEach(function (c) { if (RADIO_RE.test(c.orig || c.full || c.name)) ids[String(c.id)] = 1; });
    return ids;
  }
  /* Ein Sender ist Radio, wenn der Anbieter ihn so kennzeichnet – oder wenn er in einer Radio-Kategorie steht
     und nicht nach Fernsehen aussieht (gemischte Kategorien wie „Radyo & Müzik“ enthalten oft TV-Sender wie „Kral Pop TV HD“) */
  var TV_RE = /(^|[^0-9A-Za-zÀ-ɏ])(TV|HD|FHD|UHD|4K|SD|HEVC|H\.?265|1080[pi]?|720p|TELEVISION|FERNSEHEN|TELEVIZYON)($|[^0-9A-Za-zÀ-ɏ])/i;
  function isRadio(x, ids) {
    if (x.radio) return true;
    if (!ids[String(x.catId)]) return false;
    var n = String(x.name || '');
    // „Radyo Fenomen HD“ / „Power FM HD“ bleiben Radio, „Radio Bremen TV“ nicht
    return !TV_RE.test(n) || (RADIO_RE.test(n) || /(^|[^0-9A-Za-z])FM($|[^0-9A-Za-z])/i.test(n)) && !/(^|[^A-Za-z])TV($|[^A-Za-z])/i.test(n);
  }
  function radioItems() {
    return App.provider.categories('live').then(function (cs) {
      var ids = radioIds(cs);
      return App.provider.items('live', '__all').then(function (list) { return list.filter(function (x) { return isRadio(x, ids); }); });
    });
  }
  /* Zahl hinter „Alle …“: nur sichtbare Kategorien (ausgeblendete, im Kinderprofil gesperrte zählen nicht mit) */
  function visTotal(cats, counts) {
    if (!cats || !cats.length) return counts.total;
    var n = 0;
    // gesperrte Kategorien (Kindersicherung) zählen nicht mit – sie stehen auch nicht in „Alle Sender“
    var kind = counts.kind || 'live';
    cats.forEach(function (c) { if (!Parental.blocked(kind, c)) n += counts.by[String(c.id)] || 0; });
    return n || counts.total;
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
    var shown = null;   // gerade angezeigte Senderliste (für das TV-Programm)
    var extraCats = kind !== 'live' ? [] : [
      { id: '__guide', name: T('TV-Programm'), ic: 'guide', action: function () { showGuide(shown ? shown.name : allNames.live, shown ? shown.list : null); } },
      { id: '__fav', name: T('Favoriten'), ic: 'heart', local: function () { return Favs.list('live'); } },
      { id: '__recent', name: T('Zuletzt gesehen'), ic: 'history', local: function () { return Recent.list(); } }
    ];
    var groups = null, curGroup = null, activeId = null, req = 0, counts = null, chunker = null, nowLoader = null, visCats = null, autoDone = false;
    /* Live TV öffnen: im Vorschaufenster rechts läuft sofort etwas – der zuletzt gesehene Sender, sonst der erste der Liste.
       Nur wenn noch nichts läuft, das Fenster sichtbar ist (nicht auf dem Handy) und der eingebaute Player spielt. */
    function autoPreview(list) {
      if (Player.el || Settings.get('livePreview') === false || Dialog.open || !list.length) return;
      var top = Screens.top(), slot = panel && $('.mini-slot-box', panel.el);
      if (!top || !top.el.contains(el) || !slot || !slot.offsetWidth) return;
      var r = Recent.list()[0], at = -1;
      for (var k = 0; r && k < list.length; k++) if (String(list[k].id) === String(r.id)) { at = k; break; }
      var item = at >= 0 ? list[at] : (r || list[0]);
      if (at < 0 && !r) at = 0;
      // Vorschau immer im eingebauten Player – auch wenn sonst der TV-Player (Android) abspielt;
      // beim Auswählen öffnet sich dann wie gewohnt der TV-Player im Vollbild. Externer Player (VLC): keine Vorschau.
      if (extPlayerOn()) return;
      quietGate(item, function () {
        (at >= 0 ? Promise.resolve(list) : liveChannels()).then(function (l) {
          var top2 = Screens.top();
          if (Player.el || Dialog.open || !top2 || !top2.el.contains(el)) return;
          var i = at;
          if (i < 0) { i = 0; l = l || []; for (var q = 0; q < l.length; q++) if (String(l[q].id) === String(item.id)) { i = q; item = l[q]; break; } if (!l.length || String(l[i].id) !== String(item.id)) return; }   // ausgeblendet oder nicht mehr in der Playlist: keine Vorschau
          panel.show(item);
          Player.open(item, { list: l, index: i }, { mini: true, auto: true });
        }).catch(function () {});
      });
    }
    // Zahlen hinter Sprachen und Kategorien: bei einer Sprache alle Einträge dieser Sprache, sonst je Kategorie
    onLocalChange(el, function () { paintCounts(); });
    function paintCounts() {
      if (!counts) return;
      for (var i = 0; i < cats.children.length; i++) {
        var b = cats.children[i], n = null, slot = b.querySelector('.lc-n');
        if (!slot || (b._cat && b._cat.action)) continue;
        if (b._group) { n = 0; b._group.cats.forEach(function (c) { n += counts.by[c.id] || 0; }); }
        else if (b._cat && b._cat.local) n = b._cat.local().length;
        else if (b._cat && b._cat.id === '__radio') n = counts.radio != null ? counts.radio : null;
        else if (b._cat) n = b._cat.id === '__all' ? visTotal(visCats, counts) : (counts.by[b._cat.id] || 0);
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
      var b = h('button', { class: 'cat f has-n' + (c.ic ? ' cat-special' : '') + (c.action ? ' cat-action' : ''), title: c.full || c.name },
        c.ic ? icon(c.ic) : locked ? h('span', { class: 'cat-ic cat-ic-lock' }, icon('lock')) : catIcon(c.full || c.name),
        h('span', { class: 'cat-name', text: c.name }), h('span', { class: 'lc-n', text: c.local ? String(c.local().length) : '' }));
      b._cat = c;
      b.addEventListener('click', function () { if (c.action) c.action(); else selectCat(c, true); });
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
        langBadge(g), h('span', { class: 'lc-name', text: g.name }), icon('down'));
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
    el._dispose = function () { req++; if (chunker) { chunker.dispose(); chunker = null; } if (nowLoader) { nowLoader.dispose(); nowLoader = null; } clear(items); };
    Shell.viewBack = function () {
      if (curGroup && document.body.contains(el)) { showLanguages(curGroup); return true; }
      return false;
    };

    function selectCat(cat, focusList) {
      // Gesperrte Kategorie (Kindersicherung): nur nach PIN – beim automatischen Öffnen stattdessen „Alle“
      if (!cat.local && !cat.load && cat.id !== '__all' && Parental.blocked(kind, cat)) {
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
      (cat.local ? Promise.resolve(cat.local()) : cat.load ? cat.load() : cat.id === '__all' ? visibleItems(kind, App.provider.items(kind, cat.id)) : App.provider.items(kind, cat.id)).then(function (list) {
        if (my !== req) return;
        if (kind === 'live' && !cat.local) list = ChanHide.filter(list);
        if (kind === 'live' && cat.id !== '__recent') list = sortChannels(list);
        if (kind === 'live') shown = { list: list, name: cat.name };
        // „Alle Filme/Serien“: die neuesten zuerst
        if (cat.id === '__all' && kind !== 'live' && some(list, function (x) { return Number(x.added) > 0; })) list = list.slice().sort(byAdded);
        clear(items);
        items.scrollTop = 0;
        Shell.setCount(kind, fmtCount(list.length));
        if (!list.length) {
          items.appendChild(cat.id === '__fav' ? stateBox(T('Noch keine Lieblingssender'), T('Wähle im Player bei einem Sender „Merken“ – dann erscheint er hier.'))
            : cat.id === '__recent' ? stateBox(T('Noch nichts geschaut'), T('Die zuletzt gesehenen Sender erscheinen hier.'))
            : cat.id === '__radio' ? stateBox(T('Keine Radiosender'), T('In deiner Playlist sind keine Radiosender.'))
            : stateBox(T('Keine Einträge'), T('In dieser Kategorie ist gerade nichts enthalten.')));
          return;
        }
        var box = h('div', { class: kind === 'live' ? 'chan-list' : 'poster-grid' });
        items.appendChild(box);
        if (nowLoader) nowLoader.dispose();
        nowLoader = kind === 'live' ? NowLoader(items) : null;
        if (kind === 'live' && panel && !autoDone && !cat.local && cat.id !== '__radio') { autoDone = true; setTimeout(function () { if (my === req) autoPreview(list); }, 500); }
        var rc = chunker = renderChunked(box, items, list, function (it, i) {
          if (kind !== 'live') return posterCard(it, function () { openItem(it); });
          var row = channelRow(it, function () { playItem(it, { list: list, index: i }); }, panel ? panel.show : null);
          nowLoader.watch(row, i);
          return row;
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
      visCats = list;
      var want = lastCat[key], target = null, radioCat = null;
      // Radio (vom Startbildschirm): alle Radiosender als eigene Liste unter „Zuletzt gesehen“
      if (kind === 'live' && Object.keys(radioIds(list)).length) {
        radioCat = { id: '__radio', name: T('Radio'), ic: 'radio', load: radioItems };
        extraCats.push(radioCat);
      }
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
      if (want === '__radio' && radioCat) target = radioCat;
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
      // Mit dem TV-Player (Fire TV, Android-Boxen) öffnet OK den Sender sofort im Vollbild – dann passt der alte Hinweis nicht
      h('p', { class: 'lp-hint', text: NativePlayer.use({ kind: 'live' }) ? T('OK öffnet den Sender im Vollbild.') : T('Denselben Sender noch einmal wählen öffnet das Vollbild.') }), name, arch, epg);
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
        $all('.chan[data-cid]').forEach(function (r) { if (r.getAttribute('data-cid') === String(item.id)) paintNow(r); });
      }
      if (next.length) {
        var ul = h('ul', { class: 'lp-next' });
        next.forEach(function (e) {
          var on = Reminders.has(item, e);
          var b = h('button', { class: 'lp-rem f' + (on ? ' is-on' : ''), title: on ? T('Erinnerung löschen') : T('Erinnern'), 'aria-label': (on ? T('Erinnerung löschen') : T('Erinnern')) + ': ' + e.title },
            h('span', { class: 't', text: fmtClock(e.start) }), h('span', { class: 'n', text: e.title }), icon('bell'));
          b.onclick = function () { var now = Reminders.toggle(item, e); b.classList.toggle('is-on', now); b.title = now ? T('Erinnerung löschen') : T('Erinnern'); };
          ul.appendChild(h('li', null, b));
        });
        epg.appendChild(ul);
      }
    }
    return { el: el, show: show, current: function () { return cur; } };
  }

  /* Sender abspielen und zum Umschalten alle Sender mitgeben (Erinnerung, TV-Programm) */
  function playChannel(ch, list) {
    function go(l) {
      var i = -1;
      for (var k = 0; l && k < l.length; k++) if (String(l[k].id) === String(ch.id)) { i = k; break; }
      if (i < 0) { l = [ch]; i = 0; }
      var ctx = { list: l, index: i };
      if (Player.el && Player.item && Player.item.kind === 'live') {
        parentalGate(l[i], ctx, function (c) { Player.switchTo(c.list[c.index], c); if (Player.mini) Player.maximize(); });
      } else playItem(l[i], ctx);
    }
    if (list) go(list); else liveChannels().then(go, function () { go(null); });
  }

  /* ---------- Erinnerungen an kommende Sendungen ----------
     Je Playlist gespeichert. Eine Minute vor Beginn erscheint ein Hinweis, „Umschalten“ startet den Sender. */
  var Reminders = {
    key: function () { return 'remind.' + uid(); },
    all: function () { return Store.get(this.key(), {}); },
    id: function (ch, e) { return String(ch.id) + '@' + e.start; },
    has: function (ch, e) { return !!this.all()[this.id(ch, e)]; },
    toggle: function (ch, e) {
      var a = this.all(), k = this.id(ch, e), on = !a[k];
      if (on) a[k] = { ch: slim(ch), title: e.title, start: e.start, end: e.end };
      else delete a[k];
      Store.set(this.key(), a);
      toast(on ? T('Erinnerung: „{0}“ um {1}', e.title, fmtClock(e.start)) : T('Erinnerung gelöscht'));
      return on;
    },
    check: function () {
      if (!App.profile || Dialog.open) return;
      var a = this.all(), t = Date.now() / 1000, changed = false, due = null;
      Object.keys(a).forEach(function (k) {
        var r = a[k];
        // vorbei oder schon über 10 Minuten verpasst (z. B. Gerät war aus)
        if (!r || r.end < t || r.start < t - 600) { delete a[k]; changed = true; return; }
        if (!due && r.start - t <= 60) { due = r; delete a[k]; changed = true; }
      });
      if (changed) Store.set(this.key(), a);
      if (due) this.show(due);
    },
    show: function (r) {
      if (Player.item && Player.item.kind === 'live' && String(Player.item.id) === String(r.ch.id)) { toast(T('Jetzt: {0}', r.title), 4000); return; }
      Dialog.show(T('Gleich beginnt: {0}', r.title), T('{0} um {1}', r.ch.name, fmtClock(r.start)), [
        { label: T('Später') },
        { label: T('Umschalten'), primary: true, action: function () { playChannel(r.ch); } }
      ]);
    },
    start: function () { var self = this; setInterval(function () { try { self.check(); } catch (e) {} }, 20000); }
  };

  /* ---------- TV-Programm (Raster) ----------
     Sender untereinander, Uhrzeit nebeneinander (ab der laufenden halben Stunde, 12 Stunden).
     Programmdaten werden nur für sichtbare Zeilen geholt. OK auf laufender Sendung oder Sender = abspielen,
     auf kommender Sendung = Erinnern. */
  var GUIDE_HOURS = 12;
  function showGuide(catName, list) {
    var t0 = Math.floor(Date.now() / 1000 / 1800) * 1800, t1 = t0 + GUIDE_HOURS * 3600;
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var PPM = 0.32 * rem;   // Pixel pro Minute: eine halbe Stunde ≈ 9.6rem
    function xOf(ts) { return Math.max(0, (ts - t0) / 60 * PPM); }
    var width = GUIDE_HOURS * 60 * PPM;
    var ruler = h('div', { class: 'gd-ruler' }, h('div', { class: 'gd-corner' }, h('span', { text: new Date(t0 * 1000).toLocaleDateString(locale(), { weekday: 'long', day: '2-digit', month: 'short' }) })));
    var marks = h('div', { class: 'gd-marks', style: 'width:' + width + 'px' });
    for (var m = 0; m < GUIDE_HOURS * 2; m++) marks.appendChild(h('span', { class: 'gd-mark', style: 'left:' + (m * 30 * PPM) + 'px', text: fmtClock(t0 + m * 1800) }));
    ruler.appendChild(marks);
    var nowLine = h('div', { class: 'gd-now' });
    var rows = h('div', { class: 'gd-rows' }, nowLine);
    var body = h('div', { class: 'gd-body' }, ruler, rows);
    body._stickyTop = function () { return ruler.offsetHeight; };
    body._stickyLeft = function () { var c = $('.gd-ch', rows); return c ? c.offsetWidth : 0; };
    var el = h('div', { class: 'guide' },
      h('header', { class: 'gd-head' },
        h('button', { class: 'btn f gd-back', onclick: goBack }, icon('back'), h('span', { text: T('Zurück') })),
        h('h1', null, icon('guide'), h('span', { text: T('TV-Programm') })),
        h('span', { class: 'gd-cat', text: catName || '' }),
        h('span', { class: 'gd-hint', text: T('OK auf einer kommenden Sendung: Erinnern') })),
      body);
    var channels = null, chunker = null, queue = [], busy = 0, obs = null, timer = null;

    function paintNow() {
      var t = Date.now() / 1000;
      nowLine.style.left = (body._stickyLeft() + (t - t0) / 60 * PPM) + 'px';
      nowLine.style.display = t < t1 ? '' : 'none';
      $all('.gd-prog', rows).forEach(function (b) {
        var e = b._e, on = e.start <= t && e.end > t;
        b.classList.toggle('is-now', on);
        b.classList.toggle('is-past', e.end <= t);
        if (on) { var bar = $('.gd-bar i', b); if (bar) bar.style.width = Math.min(100, (t - e.start) / (e.end - e.start) * 100) + '%'; }
      });
    }
    function progBtn(ch, i, e) {
      var x = xOf(e.start), w = Math.max(xOf(e.end) - x - 4, 2 * PPM);
      var on = Reminders.has(ch, e);
      var b = h('button', { class: 'gd-prog f' + (on ? ' is-rem' : ''), 'data-idx': i, style: 'left:' + x + 'px;width:' + w + 'px', title: e.title + ' · ' + fmtClock(e.start) + ' – ' + fmtClock(e.end) },
        h('b', { text: e.title }), h('small', { text: fmtClock(e.start) + ' – ' + fmtClock(e.end) }), h('span', { class: 'gd-bar' }, h('i')), icon('bell'));
      b._e = e;
      b.onclick = function () {
        var t = Date.now() / 1000;
        if (e.start <= t) { playChannel(ch, channels); return; }
        var has = Reminders.has(ch, e);
        Dialog.show(e.title, fmtClock(e.start) + ' – ' + fmtClock(e.end) + ' · ' + ch.name + (e.desc ? '\n\n' + e.desc : ''), [
          { label: has ? T('Erinnerung löschen') : T('Erinnern'), primary: true, action: function () { var now = Reminders.toggle(ch, e); b.classList.toggle('is-rem', now); } },
          { label: T('Sender jetzt schauen'), action: function () { playChannel(ch, channels); } }
        ], 'dlg-prog');
      };
      return b;
    }
    function row(ch, i) {
      var cell = h('button', { class: 'gd-ch f', 'data-idx': i, title: ch.name, onclick: function () { playChannel(ch, channels); } },
        h('span', { class: 'gd-num', text: ch.num ? String(ch.num) : '' }), logoBox(ch), h('span', { class: 'gd-name', text: ch.name }));
      var progs = h('div', { class: 'gd-progs', style: 'width:' + width + 'px' }, h('span', { class: 'gd-wait', text: '…' }));
      var r = h('div', { class: 'gd-row' }, cell, progs);
      r._ch = ch; r._i = i; r._progs = progs;
      if (obs) obs.observe(r); else if (i < 12) { r._vis = true; queue.push(r); pump(); }
      return r;
    }
    function fill(r, list) {
      clear(r._progs);
      var shown = (list || []).filter(function (e) { return e.end > t0 && e.start < t1; });
      if (!shown.length) { r._progs.appendChild(h('span', { class: 'gd-empty', text: T('Keine Programmdaten') })); return; }
      shown.forEach(function (e) { r._progs.appendChild(progBtn(r._ch, r._i, e)); });
      paintNow();
    }
    function pump() {
      while (busy < 3 && queue.length) {
        var r = queue.shift();
        if (!r._vis || r._loaded || !document.body.contains(r)) continue;
        r._loaded = true; busy++;
        (function (rr) {
          App.provider.epg(rr._ch, 40).then(function (l) { busy--; fill(rr, l); pump(); }, function () { busy--; fill(rr, []); pump(); });
        })(r);
      }
    }
    if (window.IntersectionObserver) {
      obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { var vis = isVisible(e); e.target._vis = vis; if (vis && !e.target._loaded) queue.push(e.target); });
        pump();
      }, { root: body, rootMargin: '300px 0px' });
    }
    Screens.push('guide', el, {
      onLeave: function () { clearInterval(timer); if (obs) obs.disconnect(); if (chunker) chunker.dispose(); queue = []; }
    });
    function start(l) {
      channels = l || [];
      if (!channels.length) { body.appendChild(stateBox(T('Keine Sender'), T('In dieser Liste sind keine Sender.'))); return; }
      chunker = renderChunked(rows, body, channels, row);
      paintNow();
      timer = setInterval(paintNow, 60000);
      setTimeout(function () { Nav.focus($('.gd-ch', rows)); }, 40);
    }
    if (list) start(list); else liveChannels().then(start, function () { start([]); });
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
    isOpen: false, el: null, input: null, pop: null, btn: null, timer: null, wired: false, scope: 'all', scopeEl: null,
    build: function (root, btn) {
      var self = this;
      self.btn = self.navBtn = btn;
      self.input = h('input', { class: 'f', type: 'search', placeholder: T('Sender, Filme oder Serien suchen …'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': T('Suche') });
      self.input.addEventListener('input', function () { clearTimeout(self.timer); self.timer = setTimeout(function () { self.run(); }, 350); });
      self.input.addEventListener('keydown', function (e) {
        if (e.keyCode === 13) { var f = self.pop.querySelector('.f'); if (f) { e.preventDefault(); e.stopPropagation(); Nav.focus(f); } }
      });
      // Rechts im Feld: wo gesucht wird (Alle, Live TV, Filme, Serien)
      self.scopeEl = h('span', { class: 'qs-scope', role: 'radiogroup', 'aria-label': T('Suchen in') });
      self.paintScope();
      self.el = h('div', { class: 'qs is-hidden' }, icon('search'), self.input, self.scopeEl);
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
      // Seitenleiste erkennt man an der Form (höher als breit) – nicht an der Lage der Lupe: im Hochformat steht die
      // Lupe der Menüleiste oben links (< 30 % der Breite), das Suchfeld landete dann außerhalb des Bildschirms
      if (nav.height > nav.width) {
        // Seitenleiste (Handy quer): Leiste oben im Inhaltsbereich
        var left = nav.right + 12;
        st.left = left + 'px'; st.top = '8px'; st.width = Math.min(30 * rem, W - left - 12) + 'px';
        ps.left = left + 'px'; ps.top = (8 + hh + 8) + 'px'; ps.width = Math.min(40 * rem, W - left - 12) + 'px';
      } else {
        // Menüleiste oben: Suchfeld klappt unter der Leiste auf (rechtsbündig unter der Lupe) und verdeckt keine Reiter
        var rr = Math.max(12, W - r.right), sw = Math.min(34 * rem, W - rr - 12), top2 = nav.bottom + 8;
        st.right = ps.right = rr + 'px'; st.width = ps.width = sw + 'px';
        st.top = top2 + 'px'; ps.top = (top2 + hh + 8) + 'px';
        if (W <= 960) { st.left = ps.left = '12px'; st.right = ps.right = '12px'; st.width = ps.width = 'auto'; }
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
    paintScope: function () {
      var self = this;
      clear(self.scopeEl);
      [['all', T('Alle'), 'grid'], ['live', T('Live TV'), 'live'], ['movie', T('Filme'), 'movie'], ['series', T('Serien'), 'series']].forEach(function (o) {
        self.scopeEl.appendChild(h('button', { class: 'qs-sc f k-' + o[0] + (self.scope === o[0] ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': self.scope === o[0] ? 'true' : 'false', title: o[1],
          onclick: function () { self.scope = o[0]; self.paintScope(); self.run(); Nav.focus(self.input); } }, icon(o[2]), h('span', { text: o[1] })));
      });
    },
    run: function () {
      var self = this, pop = self.pop, q = norm(self.input.value.trim());
      if (q.length < 2) { clear(pop).appendChild(h('p', { class: 'hint qs-hint', text: T('Gib mindestens zwei Buchstaben ein. Rechts wählst du, wo gesucht wird.') })); return; }
      clear(pop).appendChild(loader());
      var kinds = ['live', 'movie', 'series'], labels = [T('Sender'), T('Filme'), T('Serien')];
      if (self.scope !== 'all') { labels = [labels[kinds.indexOf(self.scope)]]; kinds = [self.scope]; }
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
  /* ---------- Bildschirmschoner ----------
     Nach einigen Minuten ohne Bedienung (und ohne laufendes Video): Uhr, Datum und langsam wechselnde Poster.
     Die Uhr wandert jede Minute ein Stück weiter (schont OLED-Fernseher). Die erste Taste beendet ihn nur – sie löst nichts aus. */
  /* ---------- Tageszeit & Wetter neben der Uhr ----------
     Ohne Einstellung: nur die Tageszeit (Sonnenaufgang, Sonne, Sonnenuntergang, Mond) – nichts geht ins Internet.
     Mit gewähltem Ort (Einstellungen → Darstellung → Wetter): echtes Wetter von Open-Meteo (kostenlos, ohne Konto).
     Gesendet werden nur die Koordinaten des gewählten Ortes, höchstens alle 30 Minuten. */
  var Sky = {
    w: null, at: 0, okAt: 0, busy: false, seq: 0,   // at = letzter Versuch, okAt = letzte gültige Antwort
    loc: function () { var l = Settings.get('weatherLoc'); return l && typeof l.lat === 'number' && typeof l.lon === 'number' ? l : null; },
    // Sonnenauf-/-untergang: vom Wetterdienst, sonst grob 7:00 / 18:00 Uhr
    sunTimes: function (d) {
      var w = this.w, day = d.toDateString();
      if (w && w.rise && w.set && new Date(w.rise).toDateString() === day) return [new Date(w.rise).getTime(), new Date(w.set).getTime()];
      var a = new Date(d), b = new Date(d); a.setHours(7, 0, 0, 0); b.setHours(18, 0, 0, 0);
      return [a.getTime(), b.getTime()];
    },
    phase: function (d) {
      var t = d.getTime(), st = this.sunTimes(d), M = 60000;
      if (t >= st[0] - 45 * M && t < st[0] + 60 * M) return 'sunrise';
      if (t >= st[1] - 60 * M && t < st[1] + 45 * M) return 'sunset';
      return t >= st[0] && t < st[1] ? 'sun' : 'moon';
    },
    // [Symbol, Beschreibung, Temperatur oder '']
    now: function (d) {
      d = d || new Date();
      var ph = this.phase(d), night = ph === 'moon';
      var names = { sunrise: T('Sonnenaufgang'), sunset: T('Sonnenuntergang'), sun: T('Tag'), moon: T('Nacht') };
      // nur Wetter zeigen, das wirklich höchstens 3 Std. alt ist – auch wenn die Abfragen seitdem scheitern
      var w = this.loc() && this.w && Date.now() - this.okAt < 3 * 3600000 ? this.w : null;
      this.refresh();
      if (!w) return [ph, names[ph], ''];
      var c = w.code, ic = ph, txt = names[ph];
      if (c >= 95) { ic = 'storm'; txt = T('Gewitter'); }
      else if ((c >= 71 && c <= 77) || c === 85 || c === 86) { ic = 'snow'; txt = T('Schnee'); }
      else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) { ic = 'rain'; txt = T('Regen'); }
      else if (c === 45 || c === 48) { ic = 'fog'; txt = T('Nebel'); }
      else if (c === 3) { ic = 'cloud'; txt = T('Bewölkt'); }
      else if (c === 1 || c === 2) { ic = night ? 'cloudMoon' : 'cloudSun'; txt = T('Leicht bewölkt'); }
      else if (c === 0) txt = ph === 'sun' ? T('Sonnig') : ph === 'moon' ? T('Klare Nacht') : names[ph];
      return [ic, txt + ' · ' + (this.loc().name || ''), typeof w.temp === 'number' ? Math.round(w.temp) + '°' : ''];
    },
    refresh: function (force) {
      var self = this, l = self.loc();
      if (!l || (self.busy && !force) || (!force && Date.now() - self.at < 1800000) || navigator.onLine === false) return;
      // neue Abfrage (z. B. anderer Ort) macht eine noch laufende ungültig – sonst stünde kurz das Wetter des alten Orts da
      var seq = ++self.seq;
      self.busy = true;
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + l.lat.toFixed(2) + '&longitude=' + l.lon.toFixed(2) +
        '&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=1';
      fetchWithTimeout(url, 10000).then(function (r) { return r.json(); }).then(function (j) {
        var cur = j && j.current, dl = j && j.daily;
        if (seq !== self.seq) return;
        if (!cur) throw new Error('leer');
        self.w = { code: Number(cur.weather_code), temp: Number(cur.temperature_2m), rise: dl && dl.sunrise && dl.sunrise[0], set: dl && dl.sunset && dl.sunset[0] };
        self.at = self.okAt = Date.now();
        Sky.paintAll();
      }).catch(function () { if (seq === self.seq) self.at = Date.now() - 1500000; }).then(function () { if (seq === self.seq) self.busy = false; });
    },
    // Symbol (und Temperatur) als Element
    el: function () {
      var n = this.now();
      return h('span', { class: 'sky sky-' + n[0], title: n[1] }, icon(n[0]), n[2] ? h('em', { text: n[2] }) : null);
    },
    paintAll: function () { $all('.sky-slot').forEach(function (s) { clear(s).appendChild(Sky.el()); }); },
    // Ort suchen (Open-Meteo Geocoding) und auswählen
    pick: function (done) {
      var input = h('input', { class: 'f', type: 'text', placeholder: T('z. B. Berlin'), autocomplete: 'off' });
      var list = h('div', { class: 'choice sky-res' }), msg = h('p', { class: 'hint' });
      function search() {
        var q = input.value.trim();
        if (q.length < 2) { msg.textContent = T('Gib mindestens zwei Buchstaben ein.'); return; }
        msg.textContent = T('Wird gesucht …'); clear(list);
        fetchWithTimeout('https://geocoding-api.open-meteo.com/v1/search?count=6&format=json&language=' + encodeURIComponent(Lang.cur) + '&name=' + encodeURIComponent(q), 10000)
          .then(function (r) { return r.json(); }).then(function (j) {
            var res = (j && j.results) || [];
            msg.textContent = res.length ? '' : T('Kein Ort gefunden.');
            res.forEach(function (x) {
              list.appendChild(h('button', { class: 'ch-opt f', onclick: function () {
                Settings.set('weatherLoc', { name: x.name, lat: Number(x.latitude), lon: Number(x.longitude) });
                Sky.w = null; Sky.at = 0; Sky.okAt = 0; Sky.refresh(true);
                goBack(); if (done) done();
              } }, h('span', { class: 'ch-txt' }, h('b', { text: x.name }), h('small', { text: [x.admin1, x.country].filter(Boolean).join(', ') }))));
            });
            var f = $('.f', list); if (f) Nav.focus(f);
          }, function () { msg.textContent = navigator.onLine === false ? T('Kein Internet') : T('Der Wetterdienst ist gerade nicht erreichbar.'); });
      }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } });
      var body = [
        h('p', { class: 'hint', text: T('Für das Wetter neben der Uhr. Gesendet wird nur der gewählte Ort an den Wetterdienst Open-Meteo – höchstens alle 30 Minuten.') }),
        h('label', { class: 'field' }, h('span', { text: T('Ort') }), input),
        h('div', { class: 'row' }, sheetBtn('search', T('Suchen'), search, 'primary'),
          Sky.loc() ? sheetBtn('close', T('Wetter ausschalten'), function () { Settings.set('weatherLoc', null); Sky.w = null; goBack(); if (done) done(); }) : null),
        msg, list];
      openSheet(T('Wetter'), 'cloudSun', body);
      setTimeout(function () { Nav.focus(input); }, 60);
    }
  };
  /* „Wusstest du schon?“ – kurze Tipps im Bildschirmschoner (nur Dinge, die es in der App wirklich gibt) */
  function saverTips() {
    var l = [
      [T('Tippe eine Sendernummer ein, um direkt umzuschalten.'), 'tvplay'],
      [T('Im TV-Programm lässt du dich an kommende Sendungen erinnern.'), 'bell'],
      [T('Der Schlaf-Timer im Player beendet die Wiedergabe von selbst.'), 'timer'],
      [T('Mit „Später ansehen“ merkst du dir Filme und Serien für später.'), 'bookmark'],
      [T('Verpasste Sendungen der letzten Tage findest du direkt beim Sender.'), 'archive'],
      [T('Jeder Benutzer hat eigene Favoriten und einen eigenen Verlauf.'), 'users'],
      [T('Mit der Kindersicherung sperrst du Kategorien mit einer PIN.'), 'lock'],
      [T('Bild-in-Bild: Der Sender läuft klein weiter, während du stöberst.'), 'pip'],
      [T('Deine Playlists kannst du auch auf der Webseite bearbeiten – mit MAC und KEY.'), 'globe'],
      [T('In der Suche wählst du, ob in Filmen, Serien oder Live TV gesucht wird.'), 'search'],
      [T('Unter Einstellungen → Verbindung testen siehst du, wie schnell Sender bei dir ankommen.'), 'wifi'],
      [T('Bei Serien bringt dich „Weiter“ direkt zur nächsten Folge.'), 'series']
    ];
    return l;
  }
  var Saver = {
    el: null, timer: null, pics: [], idx: 0, n: 0, tipAt: 0,
    mins: function () { var v = Settings.get('saverMin'); return typeof v === 'number' ? v : 10; },
    start: function () {
      var self = this, mx = -1, my = -1;
      function wake(e) { if (!self.el) return; e.preventDefault(); e.stopPropagation(); self.hide(); }
      // am Fenster, damit die Taste vor der normalen Steuerung abgefangen wird
      ['keydown', 'pointerdown', 'touchstart', 'wheel'].forEach(function (ev) { window.addEventListener(ev, wake, true); });
      window.addEventListener('mousemove', function (e) {
        if (!self.el) { mx = e.clientX; my = e.clientY; return; }
        if (Math.abs(e.clientX - mx) + Math.abs(e.clientY - my) > 30) self.hide();
      }, true);
      setInterval(function () { self.check(); }, 15000);
    },
    check: function () {
      if (this.el) { this.tick(); return; }
      var m = this.mins();
      if (!m || document.hidden || Dialog.open || StillWatching.playing()) return;
      var t = document.activeElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (Date.now() - StillWatching.last >= m * 60000) this.show();
    },
    show: function () {
      var self = this;
      self.clock = h('b'); self.date = h('span');
      self.layers = [h('div', { class: 'sv-pic' }), h('div', { class: 'sv-pic' })];
      self.tip = h('div', { class: 'sv-tip' });
      self.tips = saverTips();
      self.tipAt = Math.floor(Math.random() * self.tips.length);
      self.card = h('div', { class: 'sv-clock' }, self.clock, self.date, self.tip);
      self.nextTip();
      self.el = h('div', { class: 'saver', 'aria-hidden': 'true' }, self.layers[0], self.layers[1], h('div', { class: 'sv-shade' }), self.card,
        h('div', { class: 'sv-brand' }, brandMark(), wordmark()));
      document.body.appendChild(self.el);
      self.n = 0; self.tick();
      // Poster der Playlist (Filme und Serien mit Bild), zufällig gemischt
      self.pics = [];
      if (App.profile && App.provider) {
        Promise.all([allItems('movie').catch(function () { return []; }), allItems('series').catch(function () { return []; })]).then(function (r) {
          var all = r[0].concat(r[1]).filter(function (x) { return x.logo; });
          for (var i = 0; i < 40 && all.length; i++) self.pics.push(all.splice(Math.floor(Math.random() * all.length), 1)[0]);
          self.next();
        });
      }
      clearInterval(self.timer);
      self.timer = setInterval(function () { self.next(); if (self.n % 2 === 0) self.nextTip(); }, 12000);
    },
    nextTip: function () {
      if (!this.tip || !this.tips.length) return;
      var t = this.tips[this.tipAt++ % this.tips.length], box = this.tip;
      box.classList.remove('is-on');
      setTimeout(function () {
        clear(box);
        box.appendChild(h('span', { class: 'sv-tip-ic' }, icon(t[1])));
        box.appendChild(h('div', null, h('small', { text: T('Wusstest du schon?') }), h('p', { text: t[0] })));
        box.classList.add('is-on');
      }, box.firstChild ? 500 : 0);
    },
    // nächstes Poster überblenden
    next: function () {
      if (!this.el || !this.pics.length) return;
      var it = this.pics[this.idx++ % this.pics.length], back = this.layers[this.n % 2], front = this.layers[(this.n + 1) % 2];
      this.n++;
      clear(front);
      if (!Platform.lite) front.appendChild(img(it.logo, 'sv-blur', function () {}));
      front.appendChild(h('div', { class: 'sv-poster' }, img(it.logo, '', function (i) { if (i.parentNode) i.parentNode.removeChild(i); }), h('span', { text: it.name })));
      front.classList.add('is-on'); back.classList.remove('is-on');
    },
    tick: function () {
      if (!this.el) return;
      var d = new Date();
      this.clock.textContent = clockStr(d);
      clear(this.date);
      this.date.appendChild(h('span', { class: 'sky-slot' }, Sky.el()));
      this.date.appendChild(document.createTextNode(d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })));
      // jede Minute eine andere Stelle (Einbrennen vermeiden)
      var m = d.getMinutes(), x = 6 + (m * 37 % 40), y = 8 + (m * 23 % 42);
      this.card.style.left = x + '%'; this.card.style.top = y + '%';
    },
    hide: function () {
      clearInterval(this.timer);
      if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null; this.pics = [];
      StillWatching.touch();
    }
  };
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
    restartApp(1200);
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
    if (p.type === 'xtream') { row(acc, T('Server'), p.server); row(acc, T('Benutzername'), p.username); }
    if (p.type === 'm3u') { row(acc, T('Benutzername'), user !== p.name ? user : ''); row(acc, T('Playlist'), p.url); }
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
    var epgPanel = p.type === 'm3u' && App.provider.epgStatus ? epgSettingsPanel(p) : null;
    // Personen: wer gerade schaut, mit einem Druck wechseln
    function personsBody() {
      var box = h('div', { class: 'pf-persons' }), curId = Persons.curId();
      Persons.list().forEach(function (pe) {
        box.appendChild(h('button', { class: 'pf-person f' + (pe.id === curId ? ' is-on' : ''), onclick: function () { if (pe.id !== curId) Persons.switchTo(pe.id); } },
          avatar(pe, 'av-mid'), h('b', { text: pe.name }), h('small', { text: pe.id === curId ? T('Schaut gerade') : pe.kids ? T('Kinderprofil') : T('Wechseln') })));
      });
      return h('div', null, box, h('div', { class: 'row pf-act' },
        h('button', { class: 'btn f', onclick: function () { Persons.guard(function () { showPersons(function () { el._show('persons'); }); }); } }, icon('users'), h('span', { text: T('Benutzer verwalten') }))));
    }
    var el = sidePage('profile-page', T('Profil'), 'profile', [
      { id: 'access', ic: 'playlist', c: 'violet', name: T('Mein Zugang'), hint: T('Deine aktive Playlist und wie lange sie noch läuft.'), body: function () {
        return h('div', null,
          h('div', { class: 'pf-card pf-hero' },
            h('span', { class: 'st-ic' }, icon('playlist')),
            h('div', { class: 'pc-txt' }, h('h3', { text: p.name }), user && user !== p.name ? h('p', { text: user }) : null, status),
            h('div', { class: 'row' },
              h('button', { class: 'btn f primary', onclick: showProfiles }, icon('profile'), h('span', { text: T('Playlist wechseln') })),
              h('button', { class: 'btn f', onclick: reloadApp }, icon('restart'), h('span', { text: T('Daten neu laden') })))),
          h('div', { class: 'pf-card' }, acc));
      } },
      { id: 'persons', ic: 'users', c: 'pink', name: T('Benutzer'), hint: T('Wer auf diesem Gerät schaut – jeder Benutzer hat eigene Favoriten und Listen.'), body: personsBody },
      { id: 'device', ic: 'phone', c: 'blue', name: T('Dieses Gerät'), hint: T('Mit MAC-Adresse und KEY kannst du Playlists per Handy oder über die Webseite auf dieses Gerät schicken.'), body: function () {
        return h('div', { class: 'pf-dev' },
          h('div', { class: 'pf-card' }, dev,
            Cloud.mode === 'token' ? h('div', { class: 'row pf-act' }, h('button', { class: 'btn f', onclick: rotateKey }, icon('restart'), h('span', { text: T('Neuen KEY erzeugen') }))) : null),
          h('div', { class: 'pf-card pf-qr' }, qrBox(Device.portalLink(), 'pf-qrcode'), h('small', { text: T('Mit dem Handy scannen') })));
      } },
      epgPanel ? { id: 'epg', ic: 'guide', c: 'amber', name: T('Programmführer'), hint: T('Woher die Programmdaten kommen und wann sie geladen wurden.'), body: function () { return h('div', { class: 'pf-card' }, epgPanel); } } : null
    ].filter(Boolean), 'profile');
    el._dispose = function () { el._stop(); };
    return el;
  }

  /* Neuen KEY erzeugen: Wer den alten kennt (z. B. von einem Foto des Bildschirms), kommt nicht mehr an die Playlists */
  function rotateKey() {
    confirmBox(T('Neuen KEY erzeugen?'), T('Der alte KEY funktioniert danach nicht mehr – auch nicht auf der Webseite. Deine Playlists bleiben erhalten.'), T('Neuen KEY erzeugen'), function () {
      var nk = Device.newKey();
      Cloud.rpc('app_rotate_key', { p_mac: Device.mac(), p_token: Device.token(), p_new_key: nk }).then(function (r) {
        if (!r || !r.ok) { toast(T('KEY konnte nicht erneuert werden.'), 3000); return; }
        Store.set('devkey', nk);
        toast(T('Neuer KEY: {0}', nk), 3000);
        restartApp(1600);   // KEY steht an mehreren Stellen (Fußleiste, QR-Code)
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
        : s.state === 'none' ? T('Deine Playlist bringt keinen Programmführer mit. Trage eine EPG-Adresse ein, falls du eine hast.')
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
        h('p', { class: 'hint', text: T('Adresse einer XMLTV-Datei (.xml oder .xml.gz). Leer lassen, um die Adresse aus der Playlist zu verwenden.') }),
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
        h('button', { class: 'sh-close f', title: T('Schließen'), 'aria-label': T('Schließen'), 'data-autofocus': opts.focusClose ? true : null, onclick: goBack }, icon('close'))),
      h('div', { class: 'sh-body' }, body));
    // Fokus auf den ersten Knopf im Inhalt (nicht auf „Schließen“) – außer bei reinen Lese-Fenstern wie der Hilfe (opts.focusClose)
    var body = panel.lastChild;
    if (!opts.focusClose && !$('[data-autofocus]', body)) { var first = $('.f', body); if (first) first.setAttribute('data-autofocus', ''); }
    Screens.push('sheet', h('div', { class: 'modal set-modal' + (opts.cls ? ' ' + opts.cls : '') }, h('div', { class: 'modal-backdrop', onclick: goBack }), panel), { overlay: true, onLeave: opts.onClose });
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
    var hid = CatPrefs.map(kind, 'hide'), names = CatPrefs.names(kind), pins = CatPrefs.pins(kind), kids = Persons.kids();
    // Kinderprofil: gesperrte Kategorien gar nicht erst zeigen
    var out = (list || []).filter(function (c) { return !hid[String(c.id)] && !(kids && Parental.isLocked(kind, c)); }).map(function (c) {
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
    var hid = CatPrefs.map(kind, 'hide'), lockOn = Parental.on() && (Persons.kids() || !Parental.unlocked);
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
    on: function () { return !!Settings.get('parentPin') || Persons.kids(); },
    hash: function (p) { return pinHash('parent:' + p); },
    adult: function () { return Persons.kids() || Settings.get('lockAdult') !== false; },
    isAdult: function (c) { return ADULT_RE.test(String(c.orig || c.full || c.name || '')); },
    isLocked: function (kind, c) { return this.on() && (CatPrefs.is(kind, 'lock', c.id) || (this.adult() && this.isAdult(c))); },
    blocked: function (kind, c) { return (Persons.kids() || !this.unlocked) && this.isLocked(kind, c); },
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
    if (kind === 'live') { Store.del('recent.' + uid()); Store.del('chcount.' + uid()); }   // auch „Top Sender“ der Startseite
    else {
      var want = kind === 'movie' ? 'movie' : 'episode';
      var r = Resume.all();
      Object.keys(r).forEach(function (k) { if (r[k].item && r[k].item.kind === want) delete r[k]; });
      Store.set('resume.' + uid(), r);
      var s = Seen.all();
      Object.keys(s).forEach(function (k) { if (k.indexOf(want + ':') === 0 || (want === 'episode' && k.indexOf('series:') === 0)) delete s[k]; });
      Store.set('seen.' + uid(), s);
      if (want === 'episode') { Store.del('upnext.' + pid()); Store.del('swatch.' + pid()); }
    }
    var l = Last.get();
    if (l && l.item && (l.item.kind === kind || (kind === 'series' && l.item.kind === 'series'))) Store.del('last.' + uid());
  }
  function askClearHistory(kind) {
    var txt = kind === 'live' ? T('„Zuletzt gesehen“ bei Live TV wird geleert.')
      : kind === 'movie' ? T('„Weiterschauen“ und „Zuletzt geschaut“ für Filme werden geleert.')
      : T('„Weiterschauen“, gesehene Folgen und „Zuletzt geschaut“ für Serien werden geleert.');
    confirmBox(T('{0}: Verlauf löschen?', KIND_LABEL(kind)), txt, T('Löschen'), function () { clearHistory(kind); toast(T('Verlauf gelöscht')); });
  }
  /* Ein Knopf für alles: Sender, Filme und Serien sind vorausgewählt – abwählen, was bleiben soll */
  function showClearHistory() {
    var pick = { live: true, movie: true, series: true };
    var rows = ['live', 'movie', 'series'].map(function (k) {
      var txt = k === 'live' ? T('„Zuletzt gesehen“ bei Live TV wird geleert.')
        : k === 'movie' ? T('„Weiterschauen“ und „Zuletzt geschaut“ für Filme werden geleert.')
        : T('„Weiterschauen“, gesehene Folgen und „Zuletzt geschaut“ für Serien werden geleert.');
      return toggleRow(KIND_LABEL(k), txt, function () { return pick[k]; }, function (v) { pick[k] = v; paintBtn(); });
    });
    var btn = sheetBtn('trash', T('Löschen'), function () {
      var kinds = Object.keys(pick).filter(function (k) { return pick[k]; });
      if (!kinds.length) return;
      kinds.forEach(clearHistory);
      goBack(); toast(T('Verlauf gelöscht'));
    }, 'danger');
    function paintBtn() { btn.disabled = !(pick.live || pick.movie || pick.series); }
    openSheet(T('Verlauf löschen'), 'trash', [h('p', { class: 'hint', text: T('Alles ist ausgewählt – nimm weg, was bleiben soll.') })].concat(rows, [h('div', { class: 'row' }, btn)]));
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
  var EXT_PLAYERS = { vlc: ['org.videolan.vlc'], mx: ['com.mxtech.videoplayer.ad', 'com.mxtech.videoplayer.pro'], just: ['com.brouken.player'],
    kodi: ['org.xbmc.kodi'], nova: ['org.courville.nova'], mpv: ['is.xyz.mpv'] };
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
      if (!this.possible() || Settings.get('updateCheck') === false) return;
      var u = Store.get('update', null);
      if (u && Date.now() - u.at < 86400000) return;
      this.check().then(function (v) { if (v) toast(T('Neue Version {0} verfügbar – Einstellungen → Über & Updates', v), 6000); }).catch(function () {});
    },
    url: function () {
      var base = 'https://github.com/Splix66/lumio-player/releases/download/';
      if (/Electron/.test(UA)) return base + 'pc/' + (/Mac/.test(UA) ? 'telvo-player-mac.dmg' : 'telvo-player-setup.exe');
      return base + 'neueste/telvo-player.apk';
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

  /* Seitenaufbau wie Filme, Serien und Live TV: links die Bereiche (je eine Farbe), rechts deren Inhalt.
     Auf einem Bereich stehen bleiben genügt – rechts wechselt der Inhalt sofort mit. Der zuletzt offene Bereich bleibt gemerkt.
     sections: [{ id, ic, c, name, hint, body: function () → Element }] */
  var sideMemo = {};
  function sidePage(cls, title, titleIc, sections, memo) {
    var side = h('div', { class: 'st-secs' }), main = h('div', { class: 'st-main' }), cur = null, swTimer = null;
    var head = h('div', { class: 'st-head' }), content = h('div', { class: 'st-content' });
    main.appendChild(head); main.appendChild(content);
    function show(sec) {
      if (cur === sec) return;
      cur = sec; sideMemo[memo] = sec.id;
      $all('.st-sec', side).forEach(function (b) { b.classList.toggle('is-on', b._sec === sec); });
      main.className = 'st-main c-' + sec.c;
      clear(head).appendChild(h('span', { class: 'st-hic' }, icon(sec.ic)));
      head.appendChild(h('div', { class: 'st-htxt' }, h('h2', { text: sec.name }), sec.hint ? h('p', { text: sec.hint }) : null));
      // aufgeklappte Auswahl schließen – die Zeilen werden beim Zurückkommen wiederverwendet und brauchten sonst zwei Mal OK
      $all('.st-row.is-open', content).forEach(function (x) { if (x._close) x._close(); });
      clear(content).appendChild(sec.body());
    }
    sections.forEach(function (sec) {
      var b = h('button', { class: 'cat f st-sec c-' + sec.c, 'data-sec': sec.id, onclick: function () { clearTimeout(swTimer); show(sec); var f = $('.f', content); if (f) Nav.focus(f); } },
        h('span', { class: 'st-sic' }, icon(sec.ic)), h('span', { class: 'cat-name', text: sec.name }));
      b._sec = sec;
      // Fernbedienung/Tastatur: kurz verzögert, damit schnelles Durchblättern nicht flackert
      b.addEventListener('focus', function () { clearTimeout(swTimer); swTimer = setTimeout(function () { show(sec); }, 120); });
      side.appendChild(b);
    });
    var start = sections.filter(function (x) { return x.id === sideMemo[memo]; })[0] || sections[0];
    show(start);
    $all('.st-sec', side).forEach(function (b) { if (b._sec === start) b.setAttribute('data-autofocus', ''); });
    var el = h('div', { class: 'page st2 ' + cls },
      h('div', { class: 'st-body' }, h('aside', { class: 'st-side' }, h('h1', { class: 'st-title' }, icon(titleIc), h('span', { text: title })), side), main));
    el._stop = function () { clearTimeout(swTimer); };
    el._show = function (id) { var s = sections.filter(function (x) { return x.id === id; })[0]; if (s) { cur = null; show(s); } };
    return el;
  }

  /* Die Kachel-Seite. paintSettings() frischt die kleinen Werte unter den Kacheln auf. */
  var settingsPaint = null;
  function paintSettings() { if (settingsPaint) settingsPaint(); }

  /* ---------- Verbindungstest ----------
     1) Wie schnell antwortet der Anbieter (nur Xtream), 2) wie schnell kommen Daten an: Es werden die letzten Stücke
     (HLS-Segmente) eines Senders geladen – jedes Stück hat eine feste Größe, es wird also nie ein endloser Stream geladen.
     Das Ergebnis landet auch in „Problem melden“ (ohne Adressen). */
  function absUrl(rel, base) {
    if (/^https?:\/\//i.test(rel)) return rel;
    var m = /^(https?:\/\/[^\/]+)(\/[^?#]*)?/i.exec(base || '');
    if (!m) return rel;
    if (rel.charAt(0) === '/') return m[1] + rel;
    return m[1] + String(m[2] || '/').replace(/[^\/]*$/, '') + rel;
  }
  // Android-App: res.url ist hinter CapacitorHttp die localhost-Umleitung – Segmente landeten dann bei http://localhost (HTTP 404)
  function fetchPlaylist(url) {
    return capResolveUrl(url).then(function (u) {
      return fetchWithTimeout(u, 12000).then(function (res) { return readText(res, 12000).then(function (t) { return { text: t, url: capRealUrl(res.url || u, u) }; }); });
    });
  }
  function speedTest(onStep) {
    var p = App.profile || {}, out = { ping: null, mbps: null, at: Date.now() };
    var ping = p.type === 'xtream' && p.server ? (function () {
      var t0 = Date.now();
      return fetchWithTimeout(normalizeServer(p.server) + '/player_api.php?username=' + encodeURIComponent(p.username || '') + '&password=' + encodeURIComponent(p.password || ''), 10000)
        .then(function (r) { return r.text(); }).then(function () { out.ping = Date.now() - t0; onStep('ping', out); }, function () { out.pingErr = true; onStep('ping', out); });
    })() : Promise.resolve(onStep('ping', out));
    return ping.then(function () { return liveChannels(); }).then(function (list) {
      var r = Recent.list(), pick = (r[0] && list.filter(function (x) { return String(x.id) === String(r[0].id); })[0]) || list[0];
      if (!pick) throw new Error(T('Keine Sender für die Messung.'));
      var su = App.provider.streamUrl(pick), hls = [su.url, su.alt].filter(function (u) { return u && /\.m3u8(\?|$)/i.test(u); })[0];
      if (!hls) throw new Error(T('Für die Messung wird ein HLS-Sender (.m3u8) gebraucht.'));
      return fetchPlaylist(hls);
    }).then(function (pl) {
      // Übersichtsliste mit mehreren Qualitäten: die beste nehmen
      if (/#EXT-X-STREAM-INF/.test(pl.text)) {
        var lines = pl.text.split(/\r?\n/), best = null, bw = -1;
        lines.forEach(function (l, i) {
          var m = /BANDWIDTH=(\d+)/.exec(l);
          if (m && lines[i + 1] && Number(m[1]) > bw) { bw = Number(m[1]); best = lines[i + 1].trim(); }
        });
        if (best) return fetchPlaylist(absUrl(best, pl.url));
      }
      return pl;
    }).then(function (pl) {
      var segs = pl.text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== '#'; }).slice(-3);
      if (!segs.length) throw new Error(T('Der Sender liefert gerade keine Daten.'));
      var bytes = 0, time = 0, started = Date.now();
      function next(i) {
        if (i >= segs.length || Date.now() - started > 9000) return null;
        var t0 = Date.now();
        return fetchWithTimeout(absUrl(segs[i], pl.url), 15000).then(function (res) { return res.arrayBuffer(); }).then(function (buf) {
          bytes += buf.byteLength; time += Date.now() - t0;
          out.mbps = time > 0 ? bytes * 8 / 1000 / time : null;   // kbit pro ms = Mbit/s
          onStep('speed', out);
          return next(i + 1);
        });
      }
      return next(0);
    }).then(function () {
      if (out.mbps == null) throw new Error(T('Messung nicht möglich.'));
      Store.set('nettest', { ping: out.ping, mbps: Math.round(out.mbps * 10) / 10, at: out.at });
      return out;
    }, function (e) { out.err = (e && e.message) || T('Messung nicht möglich.'); return out; });
  }
  function speedVerdict(mbps) {
    return mbps >= 25 ? T('Reicht auch für 4K.') : mbps >= 10 ? T('Reicht für Full HD.') : mbps >= 5 ? T('Reicht für HD – Full HD kann ruckeln.')
      : mbps >= 2.5 ? T('Reicht nur für SD-Qualität.') : T('Zu langsam – Sender werden wahrscheinlich ruckeln.');
  }
  function showSpeedTest(onDone) {
    var pingEl = h('b', { text: '…' }), speedEl = h('b', { class: 'nt-big', text: '…' }), verdict = h('p', { class: 'nt-verdict' });
    var again = sheetBtn('refresh', T('Erneut testen'), run);
    var body = [
      h('p', { class: 'hint', text: T('Misst, wie schnell der Server deiner Playlist antwortet und wie schnell Sender bei dir ankommen. Dauert etwa 10 Sekunden.') }),
      h('div', { class: 'nt-box' },
        h('div', { class: 'nt-row' }, h('span', { text: T('Internet') }), h('b', { text: navigator.onLine === false ? T('Kein Internet') : T('verbunden') })),
        h('div', { class: 'nt-row' }, h('span', { text: T('Antwortzeit des Servers') }), pingEl),
        h('div', { class: 'nt-row nt-speed' }, h('span', { text: T('Geschwindigkeit') }), speedEl)),
      verdict, h('div', { class: 'row nt-act' }, again)];
    openSheet(T('Verbindung testen'), 'wifi', body, { onClose: onDone });
    function run() {
      again.disabled = true;
      pingEl.textContent = '…'; speedEl.textContent = T('Wird gemessen …'); verdict.textContent = ''; verdict.className = 'nt-verdict';
      speedTest(function (step, o) {
        if (step === 'ping') pingEl.textContent = o.ping != null ? T('{0} ms', o.ping) : o.pingErr ? T('keine Antwort') : '–';
        if (step === 'speed' && o.mbps != null) speedEl.textContent = T('{0} Mbit/s', (Math.round(o.mbps * 10) / 10).toLocaleString(locale()));
      }).then(function (o) {
        again.disabled = false;
        if (o.err) { speedEl.textContent = '–'; verdict.textContent = o.err; verdict.classList.add('is-bad'); return; }
        verdict.textContent = speedVerdict(o.mbps);
        verdict.classList.add(o.mbps >= 10 ? 'is-good' : o.mbps >= 5 ? 'is-ok' : 'is-bad');
      });
    }
    run();
  }

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
    var nt = Store.get('nettest', null);
    if (nt && nt.mbps != null) lines.push('Verbindungstest: ' + nt.mbps + ' Mbit/s' + (nt.ping != null ? ' · ' + nt.ping + ' ms' : '') + ' (' + new Date(nt.at).toLocaleString('de-DE') + ')');
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
        return Cloud.support(topic, body, mail.input.value.trim() || null);
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

  /* ---------- Feedback geben ----------
     Sterne (1–5) und/oder Text. Geht wie „Problem melden“ über send_support (Thema „Feedback“) und erscheint im
     Verwaltungsbereich. Mitgeschickt werden nur App-Version, Gerätetyp und Sprache – steht so im Fenster. */
  /* Eigene Bewertung dieses Geräts: eine pro MAC, jederzeit änderbar */
  var MyRating = {
    get: function () { var r = Store.get('rating', null); return r && r.mac === Device.mac() && r.stars ? r : null; },
    set: function (stars) { Store.set('rating', { mac: Device.mac(), stars: stars, at: Date.now() }); }
  };
  function showFeedback() {
    var mine = MyRating.get();
    // Nach dem Senden ist das Feedback 30 Tage gesperrt (nicht ständig umbewerten); danach nur mit Begründung änderbar
    var FB_LOCK = 30 * 86400000, lastFb = Store.get('feedbackAt', 0);
    if (lastFb && Date.now() - lastFb < FB_LOCK) {
      var until = new Date(lastFb + FB_LOCK).toLocaleDateString(locale());
      var shown = h('div', { class: 'fb-stars is-locked', 'aria-label': mine ? T('{0} von 5 Sternen', mine.stars) : '' });
      if (mine) for (var s = 1; s <= 5; s++) shown.appendChild(h('span', { class: 'fb-star' + (s <= mine.stars ? ' is-on' : '') }, icon(s <= mine.stars ? 'starFill' : 'star')));
      var close = sheetBtn('check', T('Schließen'), goBack, 'primary');
      close.setAttribute('data-autofocus', '');
      openSheet(T('Feedback geben'), 'star', [
        h('p', { class: 'fb-q', text: T('Danke – dein Feedback ist angekommen.') }), mine ? shown : null,
        h('p', { class: 'hint', text: T('Ändern oder neues Feedback geben kannst du ab dem {0}.', until) }),
        h('div', { class: 'row' }, close)], { wide: true });
      return;
    }
    var stars = mine ? mine.stars : 0, starBtns = [], label = h('p', { class: 'fb-label' });
    var LABELS = ['', T('Gefällt mir nicht'), T('Geht so'), T('Ganz okay'), T('Gefällt mir'), T('Gefällt mir sehr')];
    var row = h('div', { class: 'fb-stars', role: 'radiogroup', 'aria-label': T('Wie gefällt dir Telvo?') });
    function paint() {
      starBtns.forEach(function (b, i) { var on = i < stars; b.classList.toggle('is-on', on); clear(b).appendChild(icon(on ? 'starFill' : 'star')); b.setAttribute('aria-checked', i + 1 === stars ? 'true' : 'false'); });
      label.textContent = stars ? LABELS[stars] : T('Tippe auf die Sterne');
      send.lastChild.textContent = mine && stars && stars !== mine.stars && !msg.value.trim() ? T('Bewertung ändern') : T('Senden');
    }
    for (var i = 1; i <= 5; i++) (function (n) {
      var b = h('button', { class: 'fb-star f', role: 'radio', title: T('{0} von 5 Sternen', n), 'aria-label': T('{0} von 5 Sternen', n), onclick: function () { stars = n; paint(); } });
      starBtns.push(b); row.appendChild(b);
    })(i);
    starBtns[0].setAttribute('data-autofocus', '');
    var msg = h('textarea', { class: 'f', rows: 3, maxlength: 1500, placeholder: T('Was gefällt dir – und was können wir besser machen?') });
    msg.addEventListener('input', function () { paint(); });
    var mail = inputField(T('E-Mail für eine Antwort (freiwillig)'), '', 'email');
    mail.wrap.className += ' rep-mail';
    var err = h('div', { class: 'error' });
    var send = sheetBtn('send', T('Senden'), go, 'primary');
    function go() {
      var text = msg.value.trim(), changed = !!stars && (!mine || mine.stars !== stars);
      if (!stars && text.length < 5) { err.textContent = T('Bitte wähle Sterne oder schreib ein paar Worte.'); return; }
      if (!changed && text.length < 5) { err.textContent = T('Deine Bewertung ist schon gespeichert. Wähle andere Sterne, um sie zu ändern.'); return; }
      if (mine && changed && text.length < 10) { err.textContent = T('Bitte schreib kurz, warum du deine Bewertung änderst.'); msg.focus(); return; }
      if (!CONFIG.cloudUrl) { err.textContent = T('Online-Dienst nicht erreichbar'); return; }
      var kind = Platform.tizen ? 'Samsung' : Platform.webos ? 'LG' : /Electron/.test(UA) ? 'PC-App' : Platform.capacitor ? (Platform.androidTV ? 'Android-TV' : 'Android') : 'Browser';
      function starLine() {
        var bar = new Array(stars + 1).join('★') + new Array(6 - stars).join('☆');
        return mine && changed ? 'Bewertung geändert: ' + mine.stars + ' → ' + stars + ' von 5 ' + bar : 'Bewertung: ' + stars + ' von 5 ' + bar;
      }
      err.textContent = ''; send.disabled = true; send.lastChild.textContent = T('Wird gesendet …');
      (Cloud.registered ? Promise.resolve({ ok: true }) : Cloud.register()).then(function (r) {
        if (!r || !r.ok) throw new Error(rpcErr(r));
        Cloud.registered = true;
        // Sterne: eine Bewertung pro Gerät auf dem Server (ersetzt die alte). Fehlt die Funktion dort noch, gehen sie wie bisher als Nachricht mit.
        // Nur wenn die Funktion fehlt (PGRST202 / keine Antwort im App-Format) oder das Token nicht passt, als Nachricht senden –
        // eine echte Ablehnung (z. B. zu viele Änderungen) wird angezeigt statt „geändert“ zu melden.
        return changed ? Cloud.call('set_rating', { p_mac: Device.mac(), p_stars: stars }).then(function (x) {
          if (x && x.ok) return true;
          // Sperre durch den Server zeigen; alles andere (Funktion fehlt, Anmeldung) wie bisher als Nachricht
          if (x && x.ok === false && /Änderungen pro Tag/.test(rpcErr(x))) throw new Error('Du hast deine Bewertung heute schon oft geändert. Versuch es morgen wieder.');
          return false;
        }, function () { return false; }) : true;
      }).then(function (rated) {
        var withStars = changed && !rated;
        if (!text && !withStars) return { ok: true };
        var body = (changed ? starLine() + '\n' : '') + (text || '') + '\n\n— Telvo ' + CONFIG.version + ' · ' + kind + ' · ' + Lang.cur;
        return Cloud.support('Feedback', body.slice(0, 2000), mail.input.value.trim() || null);
      }).then(function (r) {
        if (!r || !r.ok) throw new Error(rpcErr(r));
        Store.set('feedbackAt', Date.now());
        if (changed) MyRating.set(stars);
        goBack();
        toast(mine && changed ? T('Deine Bewertung wurde geändert.') : T('Danke für dein Feedback!'), 3500);
      }).catch(function (e) {
        send.disabled = false; send.lastChild.textContent = T('Senden');
        err.textContent = (e && e.message && e.message !== 'timeout' && e.message !== 'offline') ? T(e.message)
          : (navigator.onLine === false ? T('Kein Internet') : T('Online-Dienst nicht erreichbar'));
      });
    }
    paint();
    openSheet(T('Feedback geben'), 'star', [
      h('p', { class: 'fb-q', text: mine ? T('Deine Bewertung – beim Ändern bitte kurz begründen.') : T('Wie gefällt dir Telvo?') }), row, label,
      h('label', { class: 'field rep-msg' }, h('span', { text: mine ? T('Warum änderst du deine Bewertung?') : T('Lob, Kritik oder Ideen (freiwillig)') }), msg),
      mail.wrap,
      h('p', { class: 'hint fb-note', text: T('Mitgeschickt werden nur App-Version, Gerätetyp und Sprache.') }),
      err, h('div', { class: 'row' }, send)], { wide: true });
  }

  function SettingsView() {
    var p = App.profile, tiles = [];
    function opt(list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return ''; }
    /* Einstellungen als Liste: links Symbol und Name (Erklärung klein daneben), rechts der aktuelle Wert.
       Fester Text statt Wert (z. B. „Per Handy oder von Hand“) gilt als Erklärung. */
    function tile(ic, label, value, onClick, cls, desc) {
      if (typeof value === 'string') { desc = desc || value; value = null; }
      var val = h('span', { class: 'st-val' });
      var b = h('button', { class: 'st-row f' + (cls ? ' ' + cls : ''), onclick: onClick },
        h('span', { class: 'st-ic' }, icon(ic)),
        h('span', { class: 'st-txt' }, h('b', { text: label }), desc ? h('small', { class: 'st-desc', text: desc }) : null),
        val, h('span', { class: 'st-go', 'aria-hidden': 'true' }, icon('next')));
      b._val = function () { var v = typeof value === 'function' ? value() : value; val.textContent = v || ''; val.hidden = !v; };
      tiles.push(b);
      return b;
    }
    /* Auswahl: ein Klick klappt die Möglichkeiten direkt unter der Zeile auf (kein eigenes Fenster).
       opts: [Wert, Name, Erklärung?, Bild?] – Erklärung des Punkts (hint) steht klein darüber. */
    function choiceTile(ic, label, opts, get, set, hint, extra, desc) {
      var exp = null, b;
      function list() { return typeof opts === 'function' ? opts() : opts; }
      function close() { if (exp && exp.parentNode) exp.parentNode.removeChild(exp); exp = null; b.classList.remove('is-open'); b.setAttribute('aria-expanded', 'false'); }
      function open() {
        var host = b.parentNode;
        if (host) Array.prototype.forEach.call(host.querySelectorAll('.st-row.is-open'), function (x) { if (x !== b && x._close) x._close(); });
        var cur = get(), box = h('div', { class: 'st-opts', role: 'radiogroup', 'aria-label': label });
        list().forEach(function (o) {
          box.appendChild(h('button', { class: 'st-opt f' + (o[0] === cur ? ' is-on' : ''), role: 'radio', 'aria-checked': o[0] === cur ? 'true' : 'false',
            onclick: function () { set(o[0]); close(); paint(); Nav.focus(b); } },
            o[3] || null, h('span', { class: 'so-txt' }, h('span', { class: 'so-l', text: o[1] }), o[2] ? h('small', { text: o[2] }) : null), o[0] === cur ? icon('check') : null));
        });
        exp = h('div', { class: 'st-exp' }, hint ? h('p', { class: 'hint', text: hint }) : null, box, extra ? extra() : null);
        host.insertBefore(exp, b.nextSibling);
        b.classList.add('is-open'); b.setAttribute('aria-expanded', 'true');
        setTimeout(function () { Nav.focus($('.st-opt.is-on', exp) || $('.st-opt', exp)); }, 20);
      }
      b = tile(ic, label, function () { var v = get(), l = list(); for (var i = 0; i < l.length; i++) if (l[i][0] === v) return l[i][1]; return ''; },
        function () { if (exp) close(); else open(); }, 'st-choice', desc);
      b._close = close;
      b.setAttribute('aria-expanded', 'false');
      clear($('.st-go', b)).appendChild(icon('down'));
      return b;
    }
    // Nur ein Schalter: direkt in der Kachel umschalten (kein eigenes Fenster)
    function switchTile(ic, label, hint, get, set) {
      var sw = h('span', { class: 'switch', 'aria-hidden': 'true' }, h('i'));
      var b = tile(ic, label, hint, function () { set(!get()); paint(); }, 'st-switch');
      b.replaceChild(sw, $('.st-go', b));
      var base = b._val;
      b._val = function () { base(); var on = !!get(); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
      return b;
    }
    // Genau zwei Möglichkeiten: ein Druck wechselt, beide stehen klein in der Kachel
    function segTile(ic, label, opts, get, set, desc) {
      var seg = h('span', { class: 'st-seg', 'aria-hidden': 'true' });
      var b = tile(ic, label, null, function () {
        var v = get(), i = 0;
        opts.forEach(function (o, j) { if (o[0] === v) i = j; });
        set(opts[(i + 1) % opts.length][0]); paint();
      }, 'st-segtile', desc);
      b.replaceChild(seg, $('.st-go', b));
      var base = b._val;
      b._val = function () {
        base(); clear(seg);
        var v = get();
        opts.forEach(function (o) { seg.appendChild(h('span', { class: o[0] === v ? 'is-on' : '', text: o[1] })); });
        b.setAttribute('aria-label', label + ': ' + opts.filter(function (o) { return o[0] === v; }).map(function (o) { return o[1]; })[0]);
      };
      return b;
    }

    // Auswahl-Listen
    var THEMES = [['dark', T('Dunkel')], ['light', T('Hell')], ['auto', T('Automatisch'), T('Richtet sich nach dem Gerät. Fernseher bleiben dunkel.')]];
    var POSTERS = [['s', T('Klein'), T('Mehr Cover auf einmal')], ['m', T('Normal')], ['l', T('Groß'), T('Besser lesbar aus der Entfernung')]];
    var SORTS = [['default', T('Wie in der Playlist')], ['num', T('Nach Sendernummer')], ['az', T('Name A–Z')], ['za', T('Name Z–A')]];
    var FORMATS = [['m3u8', 'HLS (.m3u8)', T('Funktioniert auf den meisten Geräten am besten.')], ['ts', 'MPEG-TS (.ts)', T('Probiere das, wenn Sender nicht starten oder ruckeln.')]];
    var EXTS = [['off', T('Aus – Telvo-Player verwenden')], ['ask', T('Jedes Mal fragen'), T('Android zeigt eine Auswahl deiner Player-Apps.')], ['vlc', 'VLC', T('Fire TV, Android TV, Handy – spielt fast alles ab.')], ['mx', 'MX Player', T('Beliebt auf Handys und Tablets.')],
      ['just', 'Just Player', T('Schlank, gut für Fire TV und Android-Boxen.')], ['kodi', 'Kodi', T('Für Android-Boxen und Nvidia Shield.')],
      ['nova', 'Nova Video Player', T('Für Android TV und Google TV.')], ['mpv', 'mpv', T('Für Technik-Fans mit vielen Einstellungen.')]];
    var AUTOS = [[6, T('Alle 6 Stunden')], [12, T('Alle 12 Stunden'), T('Empfohlen')], [24, T('Einmal am Tag')], [0, T('Aus – nur von Hand')]];
    var IDLES = [[0, T('Aus')], [2, T('Nach {0} Stunden', 2)], [3, T('Nach {0} Stunden', 3)], [4, T('Nach {0} Stunden', 4)]];
    var CLOCKS = [[false, T('24 Stunden'), '20:15'], [true, T('12 Stunden'), '8:15 PM']];
    var DEVICES = [['auto', T('Automatisch erkennen')], ['tv', T('Fernseher / TV-Box'), T('Große Schrift, Bedienung mit der Fernbedienung')], ['touch', T('Handy / Tablet / PC'), T('Bedienung mit Finger oder Maus')]];
    var SIZES = [['s', T('Klein')], ['m', T('Normal')], ['l', T('Groß')], ['xl', T('Sehr groß')]];
    var SCOLORS = [['white', T('Weiß')], ['yellow', T('Gelb')]];
    var SBGS = [['none', T('Ohne (mit Schatten)')], ['half', T('Halb durchsichtig')], ['black', T('Schwarz')]];
    function autoH() { var v = Settings.get('autoRefresh'); return typeof v === 'number' ? v : 12; }
    function engines() {
      // Bei jeder Option die Geräte nennen, für die sie gedacht ist (vorher nur technische Namen)
      var o = [['auto', T('Android-Player'), T('Für Android-Handys und Tablets (Samsung, Xiaomi, Pixel) – oder wenn der TV-Player hakt.')],
        ['hlsjs', T('Telvo-Player'), T('Für ältere oder schwache Boxen und für Sender, die mit den anderen Playern hängen.')]];
      if (NativePlayer.available()) o.unshift(['native', T('TV-Player'), T('Empfohlen für Fire TV Stick und Cube, Chromecast mit Google TV, Nvidia Shield, Xiaomi Mi Box und andere Android-TV-Boxen.')]);
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
    var tShift = !p || p.type === 'demo' ? null : choiceTile('clock', T('Programmführer-Zeit'), SHIFTS.map(function (m) { return [m, fmtShift(m)]; }),
      function () { return Number(p.epgShift) || 0; }, function (m) {
        var list = Profiles.list(), x = list.filter(function (q) { return q.id === p.id; })[0];
        if (m) p.epgShift = m; else delete p.epgShift;
        if (x) { if (m) x.epgShift = m; else delete x.epgShift; Profiles.save(list); }
        EpgCache.data = {};
        var v = Shell.view && Shell.view.firstChild; if (v && v._refresh) v._refresh();
      }, T('Zeigt der Programmführer die Sendungen zu früh oder zu spät an? Dann hier die Zeit verschieben. Gilt nur für diese Playlist.'));
    var tAuto = choiceTile('bolt', T('Automatisch aktualisieren'), AUTOS, autoH, function (v) { Settings.set('autoRefresh', v); },
      T('In Playlists kommen regelmäßig neue Filme und Serien dazu. Die App lädt die Listen dann von selbst neu – im Hintergrund, nie während etwas läuft.'));

    // ---- Kindersicherung & Kategorien ----
    function parentalSheet() {
      var body = h('div', { class: 'sh-stack' });
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
    var tHis = tile('trash', T('Verlauf löschen'), T('Sender, Filme und Serien'), showClearHistory);

    // ---- Wiedergabe ----
    var tSort = choiceTile('sort', T('Sender sortieren'), SORTS, function () { return Settings.get('chanSort') || 'default'; }, function (v) { Settings.set('chanSort', v); });
    var tFmt = p.type !== 'xtream' ? null : segTile('live', T('Live-Stream-Format'), [['m3u8', 'HLS'], ['ts', 'MPEG-TS']],
      function () { return Settings.get('liveFormat') === 'ts' ? 'ts' : 'm3u8'; }, function (v) { Settings.set('liveFormat', v); });
    var tEng = !Platform.android ? null : choiceTile('player', T('Player wählen'), engines, function () { return NativePlayer.engine(); }, function (v) { Settings.set('engine', v); },
      T('Hängen Sender oder Filme, probiere einen anderen Player.'), null, T('Für Live TV, Filme und Serien'));
    var tExt = !(Platform.android && NativePlayer.plugin()) ? null : choiceTile('ext', T('Externer Player'), EXTS, function () { return Settings.get('extPlayer') || 'off'; }, function (v) { Settings.set('extPlayer', v); },
      T('Sender, Filme und Serien in einer anderen App abspielen. Die App muss auf dem Gerät installiert sein.'));
    // Klang im TV-Player (Android-Klangbearbeitung, siehe PlayerActivity.applySound)
    var SOUNDS = [['off', T('Original')],
      ['balance', T('Lautstärke angleichen'), T('Leise Sender lauter, laute Werbung leiser – weniger Nachregeln.')],
      ['voice', T('Klare Sprache'), T('Stimmen werden hervorgehoben – gut bei leisen Dialogen.')],
      ['night', T('Nachtmodus'), T('Laute Stellen gedämpft, leise angehoben – für abends.')]];
    var tSound = !(Platform.android && NativePlayer.available()) ? null : choiceTile('vol', T('Klang'), SOUNDS,
      function () { return Settings.get('sound') || 'off'; }, function (v) { Settings.set('sound', v); },
      T('Gilt ab dem nächsten Sender oder Film. Dolby-Ton, der direkt an eine Soundbar oder einen Receiver geht, bleibt unverändert.'),
      null, T('Ton im TV-Player verbessern'));
    var QUALS = [['auto', T('Automatisch'), T('Passt sich der Internetverbindung an.')], ['best', T('Immer beste Qualität'), T('Braucht schnelles Internet. Gut für PC und große Fernseher.')]];
    var tQual = choiceTile('player', T('Bildqualität'), QUALS, function () { return Settings.get('quality') || 'auto'; }, function (v) { Settings.set('quality', v); },
      T('Gilt für Streams, die es in mehreren Qualitäten gibt. Welche Qualität gerade läuft, steht im Player oben rechts.'), null, T('Qualität beim Start der Wiedergabe'));
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
    var STARTS = [['home', T('Startseite')], ['last', T('Letzter Sender'), T('Startet mit dem zuletzt gesehenen Sender')], ['live', T('Live TV')], ['movie', T('Filme')], ['series', T('Serien')]];
    var tStart = choiceTile('tvplay', T('App beim Start'), STARTS, startView, function (v) { Settings.set('startView', v); Settings.set('autoLast', v === 'last'); },
      null, null, T('Welche Ansicht beim Öffnen der App erscheint.'));
    var tUpdChk = !Updates.possible() ? null : switchTile('update', T('Automatisch nach Updates suchen'), T('Einmal am Tag – eine neue Version wird gemeldet'),
      function () { return Settings.get('updateCheck') !== false; }, function (v) { Settings.set('updateCheck', v); });
    var tCache = tile('trash', T('Zwischenspeicher leeren'), T('Programmführer und Suche – wird bei Bedarf neu geladen'), function () {
      confirmBox(T('Zwischenspeicher leeren?'), T('Gespeicherte Programmdaten und Suchergebnisse werden gelöscht und bei Bedarf neu geladen. Playlists, Favoriten und Einstellungen bleiben erhalten.'), T('Leeren'), function () {
        EpgCache.data = {}; searchCache = {};
        if (App.provider && App.provider.dropEpg) App.provider.dropEpg();
        EpgStore.clear().then(function () { toast(T('Zwischenspeicher geleert')); });
      });
    });
    var tHelp = tile('help', T('Hilfe'), T('Antworten auf häufige Fragen'), showWelcomeHelp);
    var tPersons = tile('users', T('Benutzer'), function () { var l = Persons.list(); return l.length > 1 ? T('{0} Benutzer', l.length) + ' · ' + Persons.cur().name : T('Nur ein Benutzer'); }, function () { showPersons(paint); });
    var tPrev = switchTile('pip', T('Vorschau bei Live TV'), T('Beim Öffnen läuft der letzte Sender klein rechts'),
      function () { return Settings.get('livePreview') !== false; }, function (v) { Settings.set('livePreview', v); });
    var tHero = switchTile('movie', T('Vorschau auf Film- und Serienseiten'), T('Spielt nach kurzer Zeit stumm einen Ausschnitt im Hintergrund'),
      function () { return Settings.get('heroPreview') !== false; }, function (v) { Settings.set('heroPreview', v); });
    var tNext = switchTile('skipNext', T('Nächste Folge automatisch'), T('Nach einer Folge die nächste starten'),
      function () { return Settings.get('autoNext') !== false; }, function (v) { Settings.set('autoNext', v); });
    var tSleep = choiceTile('timer', T('Schlaf-Timer'), function () { return Sleep.options(); }, function () { return Sleep.at ? Sleep.min : 0; }, function (v) { Sleep.set(v); });
    var tIdle = choiceTile('moon', T('Schaust du noch?'), IDLES, function () { return StillWatching.hours(); }, function (v) { Settings.set('idleHours', v); },
      T('Wie bei Netflix: Wurde so lange keine Taste gedrückt, fragt die App nach. Ohne Antwort stoppt die Wiedergabe nach einer Minute – das hält deinen Zugang frei.'));

    // ---- Darstellung & Gerät ----
    var tLang = choiceTile('globe', T('Sprache'), function () { return langsSorted().map(function (l) { return [l[0], l[1], null, flagFor(l[0])]; }); },
      function () { return Lang.cur; }, function (v) { if (v !== Lang.cur) Lang.set(v); }, null, null, T('Sprache der App'));
    tLang.classList.add('st-lang');
    var season = Season.current();
    var tTheme = choiceTile('sun', T('Farben'), THEMES, function () { return Settings.get('theme') || 'dark'; }, function (v) { Settings.set('theme', v); Theme.apply(); },
      season ? T('Gerade läuft das {0}-Design. Danach gilt wieder das Telvo-Violett.', T(SEASONS[season].name)) : null);
    var tSky = tile('cloudSun', T('Wetter neben der Uhr'), function () { var l = Sky.loc(); return l ? l.name : T('Aus – nur Tageszeit'); }, function () { Sky.pick(paint); });
    var tPoster = choiceTile('grid', T('Größe der Cover bei Filmen und Serien'), POSTERS, function () { return Settings.get('posterSize') || 'm'; }, function (v) { Settings.set('posterSize', v); Theme.apply(); });
    var SAVERS = [[0, T('Aus')], [5, T('{0} Min.', 5)], [10, T('{0} Min.', 10)], [15, T('{0} Min.', 15)], [30, T('{0} Min.', 30)]];
    var tSaver = choiceTile('saver', T('Bildschirmschoner'), SAVERS, function () { return Saver.mins(); }, function (v) { Settings.set('saverMin', v); },
      T('Wird die App so lange nicht bedient (und läuft kein Video), erscheinen Uhr und Poster. Schont OLED-Fernseher. Eine beliebige Taste beendet ihn.'),
      function () { return h('div', { class: 'row nt-act' }, sheetBtn('play', T('Jetzt ansehen'), function () { setTimeout(function () { Saver.show(); }, 200); })); });
    var tClock = segTile('clock', T('Zeitformat'), [[false, '24 h'], [true, '12 h']],
      function () { return !!Settings.get('clock12'); }, function (v) { Settings.set('clock12', v); }, T('Für Uhr und Programmführer'));
    var tDev = choiceTile('device', T('Gerätetyp'), DEVICES, function () { return Settings.get('deviceType') || 'auto'; }, function (v) {
      if (v === (Settings.get('deviceType') || 'auto')) return;
      Settings.set('deviceType', v);
      toast(T('App startet neu …'));
      restartApp(700);
    }, T('Normalerweise erkennt die App das Gerät selbst. Stimmt die Bedienung nicht, wähle hier den richtigen Typ. Die App startet dann neu.'));
    var tReport = tile('help', T('Problem melden'), T('Nachricht an den Support'), showReport);
    var tSpeed = tile('wifi', T('Verbindung testen'), function () { var nt = Store.get('nettest', null); return nt && nt.mbps != null ? T('Zuletzt: {0} Mbit/s', String(nt.mbps).replace('.', Lang.cur === 'en' ? '.' : ',')) : T('Geschwindigkeit messen'); }, function () { showSpeedTest(paint); });
    var tFeedback = !CONFIG.cloudUrl ? null : tile('star', T('Feedback geben'), T('Lob, Kritik oder Ideen'), showFeedback);
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
      if (cached) show(cached);   // sonst nichts: die Version steht direkt darüber (vorher doppelt)
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
    function grid(list) { return function () { var g = h('div', { class: 'st-list' }); list.filter(Boolean).forEach(function (t) { g.appendChild(t); }); return g; }; }
    // Acht Bereiche wie im Entwurf vom 10.11.2026 – nur Einstellungen, die es wirklich gibt
    var el = sidePage('settings st-page', T('Einstellungen'), 'settings', [
      { id: 'general', ic: 'home', c: 'violet', name: T('Allgemein'), hint: T('Grundlegende Einstellungen für dein Telvo-Erlebnis.'), body: grid([tLang, tClock, tStart, tUpdChk]) },
      { id: 'play', ic: 'play', c: 'blue', name: T('Wiedergabe'), hint: T('Player, Bildqualität, Untertitel und Vorschau.'), body: grid([tEng, tQual, tSound, tSub, tNext, tPrev, tHero]) },
      { id: 'look', ic: 'sun', c: 'amber', name: T('Darstellung'), hint: T('Farben, Cover, Wetter und Bildschirmschoner.'), body: grid([tTheme, tPoster, tSky, tSaver]) },
      { id: 'content', ic: 'series', c: 'teal', name: T('Inhalte & Listen'), hint: T('Playlists, Kategorien und Sender.'), body: grid([tAdd, tPl, tUpd, tAuto, tSort, tHideL, tHideM, tHideS, tHideCh]) },
      { id: 'users', ic: 'lock', c: 'pink', name: T('Benutzer & Sicherheit'), hint: T('Wer schaut, Kindersicherung und Verlauf.'), body: grid([tPersons, tPar, tHis]) },
      { id: 'devices', ic: 'device', c: 'slate', name: T('Geräte & Verbindungen'), hint: T('Gerätetyp, Verbindung, Sicherung und externe Player.'), body: grid([tDev, tSpeed, tBackup, tExt]) },
      { id: 'advanced', ic: 'settings', c: 'slate', name: T('Erweitert'), hint: T('Zeitschaltungen, Programmführer und Zwischenspeicher.'), body: grid([tFmt, tShift, tSleep, tIdle, tCache]) },
      { id: 'help', ic: 'help', c: 'green', name: T('Hilfe & Support'), hint: T('Hilfe, Kontakt, Feedback und Updates.'), body: grid([tHelp, tReport, tFeedback, tAbout]) }
    ], 'settings');
    settingsPaint = paint;
    el._refresh = paint;
    el._dispose = function () { el._stop(); if (settingsPaint === paint) settingsPaint = null; };
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
  function quietGate(item, go) {
    if (!Parental.on() || Parental.unlocked || !App.provider) { go(); return; }
    Promise.all([lockedCats('live'), itemCatId(item)]).then(function (r) {
      var m = r[0], cid = r[1];
      if (!m || cid === null || cid === undefined || !m[String(cid)]) go();
    }, function () {});
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
    var close = h('button', { class: 'd-close f', title: T('Schließen'), 'aria-label': T('Schließen'), onclick: goBack }, icon('close'));
    var panel = h('div', { class: 'detail modal-panel' }, top, main);
    // Mit der Fernbedienung nach oben bis „Schließen“: wieder ganz nach oben scrollen, damit man den Film sieht
    close.addEventListener('focus', function () { if (panel.scrollTop > 0) panel.scrollTop = 0; });
    var el = h('div', { class: 'modal' }, h('div', { class: 'modal-backdrop', onclick: goBack }), h('div', { class: 'modal-wrap' }, close, panel));
    /* Vorschau wie bei Streaming-Diensten: nach kurzer Zeit läuft der Film (bzw. die nächste Folge) stumm im Kopfbild.
       Nur MP4/WebM (MKV kann der Browser nicht), höchstens eine Minute, und sofort Schluss beim Abspielen oder Schließen. */
    var prevV = null, prevTimer = null, prevWatch = null;
    function stopPreview() {
      clearTimeout(prevTimer); clearInterval(prevWatch); prevTimer = prevWatch = null;
      if (HeroPreview.stop === stopPreview) HeroPreview.stop = null;
      if (!prevV) return false;
      var v = prevV; prevV = null;
      top.classList.remove('is-playing');
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
      setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 900);
      return true;   // es lief wirklich eine Vorschau (Verbindung zum Server war offen)
    }
    function startPreview(it) {
      stopPreview();
      if (!it || !HeroPreview.ok()) return;
      HeroPreview.stop = stopPreview;
      prevTimer = setTimeout(function () {
        var t = Screens.top(), su = null;
        if (!t || t.el !== el || Player.el || document.hidden) return;
        try { su = App.provider.streamUrl(it); } catch (e) {}
        var url = su && su.url;
        if (!url || !/\.(mp4|m4v|webm|mov)(\?|$)/i.test(url)) return;
        var v = prevV = h('video', { class: 'd-prev', muted: true, playsinline: true, 'webkit-playsinline': true, preload: 'metadata', 'aria-hidden': 'true' });
        v.muted = true; v.defaultMuted = true;
        var jumped = false, started = Date.now();
        // nicht beim Vorspann anfangen
        v.addEventListener('loadedmetadata', function () { if (!jumped && v.duration > 600) { jumped = true; try { v.currentTime = Math.round(v.duration * 0.18); } catch (e) {} } });
        v.addEventListener('playing', function () { if (prevV === v) top.classList.add('is-playing'); });
        v.addEventListener('error', function () { if (prevV === v) stopPreview(); });
        v.addEventListener('ended', function () { if (prevV === v) stopPreview(); });
        top.insertBefore(v, bg.nextSibling);
        v.src = url;
        try { var pr = v.play(); if (pr && pr.catch) pr.catch(function () { if (prevV === v) stopPreview(); }); } catch (e) { stopPreview(); return; }
        prevWatch = setInterval(function () {
          var t2 = Screens.top();
          if (!document.body.contains(el) || !t2 || t2.el !== el || Player.el || document.hidden || Date.now() - started > 60000) stopPreview();
        }, 400);
      }, 2500);
    }
    return {
      el: el, panel: panel, info: info, startPreview: startPreview, stopPreview: stopPreview,
      setBackdrop: function (url) {
        if (!url) return;
        bg.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")';
        top.classList.add('has-backdrop');
      }
    };
  }
  var HeroPreview = {
    stop: null,
    ok: function () {
      return Settings.get('heroPreview') !== false && !Platform.tizen && !Platform.webos && !Platform.lite &&
        !(navigator.connection && navigator.connection.saveData) && !!App.provider && !!App.provider.streamUrl;
    },
    halt: function () { return this.stop ? !!this.stop() : false; }
  };
  function metaLine(d) {
    var m = h('div', { class: 'meta' });
    if (d.rating && Number(d.rating) > 0) m.appendChild(h('span', { class: 'rate', text: '★ ' + Number(d.rating).toFixed(1) }));
    if (d.year) m.appendChild(h('span', { text: d.year }));
    var du = fmtDur(d.duration);
    if (du) m.appendChild(h('span', { text: du }));
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

  function laterButton(item) {
    var b = h('button', { class: 'btn f ghost', 'data-c': 'later' });
    function paint() { clear(b); var on = Later.has(item); b.appendChild(icon(on ? 'bookmarkFill' : 'bookmark')); b.appendChild(h('span', { text: on ? T('Auf der Liste') : T('Später ansehen') })); b.classList.toggle('is-on', on); }
    b.onclick = function () { Later.toggle(item); paint(); var mv = $('.mv2'); if (mv && mv._later) mv._later(); };
    paint();
    return b;
  }

  /* „Ähnliche Titel“ unter Film- und Serienseiten: aus derselben Kategorie, die bestbewerteten zuerst */
  function similarRail(item, panel, drawer) {
    if (!item.catId) return;
    var kind = item.kind === 'series' ? 'series' : 'movie';
    Promise.all([App.provider.items(kind, item.catId), App.provider.categories(kind).then(null, function () { return []; })]).then(function (r) {
      // Schlüssel ohne 4K/HD-Zusätze; arabische, kyrillische oder griechische Titel haben keinen a-z-Schlüssel –
      // dann der ganze Name (sonst galten alle als „derselbe Titel“ und die Leiste blieb leer)
      var key = function (n) { return titleKey(n) || norm(n).replace(/[\s.,:;|_\-()[\]]+/g, ''); };
      var list = r[0] || [], seen = {}, own = key(item.name), cat = null;
      (r[1] || []).forEach(function (c) { if (String(c.id) === String(item.catId)) cat = c; });
      seen[own] = 1;
      // derselbe Titel in 4K/HD/… nur einmal – und nicht der Titel selbst
      var pick = list.filter(function (x) { if (x.id === item.id || !x.logo) return false; var k = key(x.name); if (!k) return true; if (seen[k]) return false; seen[k] = 1; return true; })
        .sort(byRating).slice(0, 16);
      if (pick.length < 3 || !panel.parentNode) return;
      var badges = kind === 'series' ? seriesBadges() : null;
      var rail = railEl(T('Ähnliche Titel'), pick.map(function (it) {
        return posterCard(it, function () { Screens.pop(); setTimeout(function () { openItem(it); }, 30); }, { badge: badges && badges[it.id] });
      }), kind);
      var cn = cat && (cat.name || cat.full);
      if (cn) rail.firstChild.appendChild(h('small', { class: 'sim-sub', text: T('Mehr aus „{0}“', cn) }));
      var box;
      if (drawer && Platform.tv) {
        // Fernseher, Filmseite: als Schublade unten angedockt – mit dem Fokus klappt sie hoch, nach oben wieder zu.
        // Die Seite selbst rollt dabei nicht (vorher scrollte das ganze Fenster wie im Browser).
        box = h('div', { class: 'd-similar is-drawer' }, h('div', { class: 'sim-in' }, rail));
        box.addEventListener('focusin', function () { box.classList.add('is-open'); });
        box.addEventListener('focusout', function (e) { if (!e.relatedTarget || !box.contains(e.relatedTarget)) box.classList.remove('is-open'); });
      } else box = h('div', { class: 'd-similar' }, rail);
      panel.appendChild(box);
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
    HeroPreview.halt();
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

  /* Kein Trailer vom Anbieter: YouTube-Suche „Titel Jahr Trailer“ öffnen – auf Android in der YouTube-App,
     am PC im Browser. Auf Fernsehern ohne Browser (Samsung, LG) gibt es den Knopf nicht. */
  function canSearchTrailer() {
    if (Platform.capacitor) { var pl = NativePlayer.plugin(); return !!(pl && pl.openExternal); }
    return !Platform.tv;
  }
  // Anbieter-Zusätze aus dem Titel entfernen: „DE - “, „|EN| “, „[4K]“, „(Multi-Sub)“, „HD“/„FHD“/„4K“ am Ende
  function trailerQuery(name, year) {
    var n = String(name || '')
      .replace(/^\s*(\|[^|]{1,6}\||\[[^\]]{1,6}\]|[A-Z]{2,4}\s*[-:|])\s*/, '')
      .replace(/\[[^\]]*\]|\((?:multi|sub|dub|ger|eng|tr)[^)]*\)/gi, ' ')
      .replace(/\b(4K|UHD|FHD|HD|SD|HEVC)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (year && n.indexOf(String(year)) < 0) n += ' ' + year;
    return n + ' ' + T('Trailer');
  }
  function searchTrailer(name, year) {
    var url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(trailerQuery(name, year));
    var pl = NativePlayer.plugin();
    if (Platform.capacitor && pl && pl.openExternal) {
      pl.openExternal({ url: url }).catch(function () { toast(T('YouTube lässt sich auf diesem Gerät nicht öffnen.'), 4000); });
      return;
    }
    openExternal(url);
  }
  function trailerSearchButton(item) {
    if (!canSearchTrailer()) return null;
    return h('button', { class: 'btn f', title: T('Trailer auf YouTube suchen'), onclick: function () { searchTrailer(item.name, item.year); } }, icon('search'), h('span', { text: T('Trailer suchen') }));
  }

  // Knopf „Gesehen“ (Film): von Hand als gesehen / nicht gesehen markieren
  function seenButton(item, done) {
    var on = Seen.has(item);
    return h('button', { class: 'btn f' + (on ? ' is-on' : ''), 'data-c': 'seen', title: on ? T('Als nicht gesehen markieren') : T('Als gesehen markieren'),
      onclick: function () { Seen.setMany([item], !on); toast(!on ? T('Als gesehen markiert') : T('Als nicht gesehen markiert')); if (done) done(); } },
      icon(on ? 'checkCircle' : 'check'), h('span', { text: on ? T('Gesehen') : T('Als gesehen markieren') }));
  }
  function showMovie(item) {
    var f = detailFrame(item);
    var actions = h('div', { class: 'row' }), infoDone = false;
    function paintActions() {
      clear(actions);
      var r = Resume.get(item);
      if (r) {
        actions.appendChild(h('button', { class: 'btn f primary', 'data-autofocus': true, onclick: function () { playItem(item, { list: [item], index: 0 }); } }, icon('play'), h('span', { text: T('Weiter bei {0}', fmtTime(r.t)) })));
        actions.appendChild(h('button', { class: 'btn f', onclick: function () { playItem(item, { list: [item], index: 0, fromStart: true }); } }, icon('restart'), h('span', { text: T('Von vorne') })));
      } else {
        actions.appendChild(h('button', { class: 'btn f primary', 'data-autofocus': true, onclick: function () { playItem(item, { list: [item], index: 0 }); } }, icon('play'), h('span', { text: T('Abspielen') })));
      }
      var tb = trailerButton(item.name, item.trailer) || (infoDone ? trailerSearchButton(item) : null);
      if (tb) actions.appendChild(tb);
      actions.appendChild(favButton(item));
      actions.appendChild(laterButton(item));
      actions.appendChild(seenButton(item, function () { var had = document.activeElement && document.activeElement.getAttribute('data-c'); paintActions(); if (had) Nav.focus($('[data-c="' + had + '"]', actions)); }));
    }
    paintActions();
    var metaBox = h('div'), plotBox = h('p', { class: 'plot', text: item.plot || '' });
    f.info.appendChild(metaBox); f.info.appendChild(actions); f.info.appendChild(plotBox);
    function infoReady() {
      infoDone = true;
      var hadFocus = actions.contains(document.activeElement);
      paintActions();
      if (hadFocus) Nav.focusFirst(actions);
    }
    App.provider.movieInfo(item).then(function (d) {
      if (!d) { infoReady(); return; }
      if (d.ext) item.ext = d.ext;
      if (d.year && !item.year) item.year = d.year;
      metaBox.appendChild(metaLine(d));
      if (d.plot) plotBox.textContent = d.plot;
      if (d.trailer && trailerId(d.trailer) && canTrailer()) item.trailer = d.trailer;
      infoReady();
      if (d.director || d.cast) f.info.appendChild(h('p', { class: 'credits', text: [d.director ? T('Regie: {0}', d.director) : '', d.cast ? T('Mit: {0}', d.cast) : ''].filter(Boolean).join('. ') }));
      if (d.backdrop) { item.backdrop = d.backdrop; f.setBackdrop(d.backdrop); }
      f.startPreview(item);
    }).catch(function () { if (!infoDone) infoReady(); f.startPreview(item); });
    similarRail(item, f.panel, true);
    Screens.push('movie', f.el, { overlay: true, onLeave: f.stopPreview, onShow: function () { var had = document.activeElement; paintActions(); if (!document.body.contains(had)) Nav.focusFirst(actions); f.startPreview(item); } });
  }

  function showSeries(item) {
    App.openSeries = item;
    var f = detailFrame(item);
    var seasonsBar = h('div', { class: 'seasons' });
    var epBox = h('div', { class: 'episodes' }, loader());
    var favB = favButton(item), actions = h('div', { class: 'row' }, favB, laterButton(item));
    var metaBox = h('div'), plotBox = h('p', { class: 'plot', text: item.plot || '' });
    f.info.appendChild(metaBox); f.info.appendChild(actions); f.info.appendChild(plotBox);
    f.panel.appendChild(seasonsBar); f.panel.appendChild(epBox);
    var seasons = [], curSeason = null, continueBtn = null, seasonMark = null, epCount = null;
    SeriesWatch.touch(item.id, true);   // Serie geöffnet: Hinweis „Neue Folgen“ ist gesehen

    function seenCount(s) { var n = 0; s.episodes.forEach(function (e) { if (Seen.has(e)) n++; }); return n; }
    // Staffel-Knöpfe mit Fortschritt („5/8“, ganz gesehen = Häkchen) und Knopf „Staffel als gesehen markieren“
    function paintSeasons() {
      $all('.btn[data-s]', seasonsBar).forEach(function (b) {
        var s = seasons.filter(function (x) { return x.num === Number(b.getAttribute('data-s')); })[0];
        if (!s) return;
        var n = seenCount(s), all = n === s.episodes.length && n > 0;
        b.classList.toggle('is-on', !!curSeason && s.num === curSeason.num);
        b.classList.toggle('is-done', all);
        clear(b);
        if (all) b.appendChild(icon('check'));
        b.appendChild(h('span', { text: T('Staffel {0}', s.num) }));
        if (n && !all) b.appendChild(h('small', { class: 'sn-prog', text: n + '/' + s.episodes.length }));
      });
      if (seasonMark && curSeason) {
        var allSeen = seenCount(curSeason) === curSeason.episodes.length;
        var lab = allSeen ? T('Staffel als nicht gesehen markieren') : T('Staffel als gesehen markieren');
        seasonMark.title = lab; seasonMark.setAttribute('aria-label', lab);
        seasonMark.classList.toggle('is-on', allSeen);
        clear(seasonMark).appendChild(icon(allSeen ? 'checkCircle' : 'check'));
        seasonMark._all = allSeen;
      }
      // ganze Serie gesehen? (für „Gesehene ausblenden“ und das Häkchen auf dem Poster)
      var done = seasons.length > 0 && seasons.every(function (s) { return seenCount(s) === s.episodes.length; });
      if (done !== Seen.has(item)) Seen.setMany([{ kind: 'series', id: item.id }], done);
    }
    function refreshAll(keepKey) {
      renderEpisodes(curSeason); paintSeasons(); paintContinue();
      if (keepKey) { var t = $('[data-k="' + keepKey + '"]', f.el); if (t) Nav.focus(t); }
    }
    /* Dieselbe runde Dauer bei allen Folgen (z. B. überall „01:00:00“) ist ein Platzhalter des Anbieters – dann keine Dauer zeigen */
    function fakeDur(list) {
      if (list.length < 3) return false;
      var d0 = durSec(list[0].duration);
      return d0 > 0 && d0 % 1800 === 0 && list.every(function (e) { return durSec(e.duration) === d0; });
    }
    function renderEpisodes(season) {
      curSeason = season;
      $all('.btn[data-s]', seasonsBar).forEach(function (b) { b.classList.toggle('is-on', Number(b.getAttribute('data-s')) === season.num); });
      clear(epBox);
      var list = season.episodes, noDur = fakeDur(list), nt = nextTarget();
      if (epCount) epCount.textContent = list.length === 1 ? T('1 Folge') : T('{0} Folgen', list.length);
      list.forEach(function (ep, i) {
        ep.seriesName = ep.seriesName || item.name;
        ep.logo = ep.logo || item.logo;
        var r = Resume.get(ep), seen = Seen.has(ep), isNext = !!(nt && nt.resume && nt.ep && String(nt.ep.id) === String(ep.id));
        var dur = noDur ? '' : fmtDur(ep.duration);
        var mark = h('button', { class: 'ep-mark f' + (seen ? ' is-on' : ''), 'data-k': 'm' + ep.id, title: seen ? T('Als nicht gesehen markieren') : T('Als gesehen markieren'),
          'aria-label': seen ? T('Als nicht gesehen markieren') : T('Als gesehen markieren'),
          onclick: function () { Seen.setMany([ep], !seen); refreshAll('m' + ep.id); } }, icon(seen ? 'checkCircle' : 'check'));
        var tag = r ? h('span', { class: 'ep-tag', text: T('Noch {0}', fmtLeft(Math.max(60, r.d - r.t))) })
          : isNext ? h('span', { class: 'ep-tag', text: T('Als Nächstes') }) : null;
        epBox.appendChild(h('div', { class: 'ep-line' + (isNext || r ? ' is-next' : '') + (seen ? ' is-seen' : '') },
          h('button', { class: 'ep f', 'data-k': 'e' + ep.id, 'aria-label': T('Folge {0}', ep.num || i + 1) + ': ' + ep.name, onclick: function () { playItem(ep, { list: list, index: i }); } },
            h('span', { class: 'ep-n', text: String(ep.num || i + 1) }),
            h('span', { class: 'thumb' },
              ep.logo ? img(ep.logo, '') : null,
              h('span', { class: 'ep-play' }, icon('play')),
              r ? h('span', { class: 'seen' }, h('i', { style: 'width:' + Math.round(r.t / r.d * 100) + '%' })) : null,
              !r && seen ? h('span', { class: 'ep-done', title: T('Gesehen') }, icon('check')) : null),
            h('span', { class: 't' },
              h('span', { class: 'ep-head' }, h('b', { text: ep.name }), dur ? h('span', { class: 'ep-dur', text: dur }) : null),
              tag,
              ep.plot ? h('small', { text: ep.plot }) : null)),
          mark));
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
      var tb = (d && trailerButton(item.name, d.trailer)) || trailerSearchButton({ name: item.name, year: (d && d.year) || item.year });
      if (tb) actions.insertBefore(tb, favB);   // vor „Merken“
      seasons = (d && d.seasons) || [];
      if (!seasons.length) { clear(epBox).appendChild(stateBox(T('Keine Folgen gefunden'), null)); return; }
      var track = h('div', { class: 'sn-track' });
      seasons.forEach(function (s) {
        track.appendChild(h('button', { class: 'btn f', 'data-s': s.num, onclick: function () { renderEpisodes(s); paintSeasons(); } }, T('Staffel {0}', s.num)));
      });
      seasonMark = h('button', { class: 'season-mark f', 'data-k': 'smark', onclick: function () {
        Seen.setMany(curSeason.episodes, !seasonMark._all);
        toast(!seasonMark._all ? T('Staffel {0} als gesehen markiert', curSeason.num) : T('Staffel {0} als nicht gesehen markiert', curSeason.num));
        refreshAll('smark');
      } }, icon('check'));
      epCount = h('span', { class: 'sn-count' });
      seasonsBar.appendChild(track);
      seasonsBar.appendChild(h('div', { class: 'sn-side' }, epCount, seasonMark));
      var nt = nextTarget(), startSeason = seasons[0];
      if (nt) seasons.forEach(function (x) { if (x.num === nt.ep.season) startSeason = x; });
      renderEpisodes(startSeason);
      paintSeasons();
      paintContinue();
      similarRail(item, f.panel);
      if (nt && nt.ep) f.startPreview(nt.ep);
      if (Screens.top() && Screens.top().el === f.el) Nav.focus(continueBtn || $('.f', f.el));
    }, function (e) {
      clear(epBox).appendChild(stateBox(T('Laden fehlgeschlagen'), e.message));
    });
    Screens.push('series', f.el, { overlay: true, onLeave: f.stopPreview, onShow: function () {
      if (curSeason) { renderEpisodes(curSeason); paintSeasons(); paintContinue(); var n2 = nextTarget(); if (n2 && n2.ep) f.startPreview(n2.ep); }
    } });
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
  // Sprachnamen, wie Anbieter sie oft als Spurnamen schreiben (in der Sprache selbst oder auf Englisch)
  var LANG_SELF = { de: 'deutsch german ger deu', en: 'english englisch eng', tr: 'türkçe turkce turkish tur', fr: 'français francais french fra fre',
    it: 'italiano italian ita', es: 'español espanol spanish castellano spa', nl: 'nederlands dutch nld', pl: 'polski polish pol',
    pt: 'português portugues portuguese por', ar: 'العربية عربي arabic ara', ru: 'русский russian rus', ua: 'українська ukrainian ukr',
    ku: 'kurdî kurdi kurdish kur', al: 'shqip albanian alb', bg: 'български bulgarian bul', ro: 'română romana romanian ron rum',
    gr: 'ελληνικά greek ell gre', se: 'svenska swedish swe', no: 'norsk norwegian nor', dk: 'dansk danish dan', fi: 'suomi finnish fin',
    hu: 'magyar hungarian hun', cz: 'čeština cestina czech ces', fa: 'فارسی persian farsi fas', az: 'azərbaycan azerbaijani aze', in: 'हिन्दी hindi hin' };
  function trackLabel(name, lang, i) {
    var code = String(lang || '').toLowerCase().split(/[-_]/)[0], key = LANG_ISO[code];
    var langName = key && LANG_NAMES[key] ? T(LANG_NAMES[key]) : (lang ? String(lang).toUpperCase() : '');
    name = String(name || '').trim();
    // Steht im Namen nur die Sprache (z. B. „English“), reicht „Englisch“ – Zusätze wie „Kommentar“ oder „5.1“ bleiben
    if (name && key && LANG_SELF[key] && (' ' + LANG_SELF[key] + ' ').indexOf(' ' + name.toLowerCase() + ' ') >= 0) name = '';
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

  // Android-App: CapacitorHttp leitet XMLHttpRequest über http://localhost/_capacitor_http_interceptor_?u=… um. Danach meldet responseURL diese
  // localhost-Adresse, und hls.js löste relative Pfade der Playlist gegen http://localhost auf – Live-Vorschau und eingebauter Player luden nichts.
  // Abhilfe: Antworten über den Umweg bekommen die angefragte Adresse zurück, und Weiterleitungen (Xtream: Domain → Server-IP) werden vorab aufgelöst.
  var CAP_ICPT = /\/_capacitor_https?_interceptor_\?/;
  function capHttpOn() { return !!(Platform.capacitor && window.CapacitorWebXMLHttpRequest); }
  function capRealUrl(u, ctxUrl) { if (!u || !CAP_ICPT.test(u)) return u; var m = /[?&]u=([^&]*)/.exec(u); return ctxUrl || (m ? decodeURIComponent(m[1]) : u); }
  function CapLoader(config) { this.inner = new CapLoader.Base(config); }
  Object.defineProperty(CapLoader.prototype, 'stats', { get: function () { return this.inner.stats; } });
  Object.defineProperty(CapLoader.prototype, 'context', { get: function () { return this.inner.context; } });
  CapLoader.prototype.load = function (context, config, callbacks) { var cb = {}; for (var k in callbacks) cb[k] = callbacks[k]; cb.onSuccess = function (r, s, ctx, d) { if (r) r.url = capRealUrl(r.url, ctx && ctx.url); callbacks.onSuccess(r, s, ctx, d); }; this.inner.load(context, config, cb); };
  CapLoader.prototype.abort = function () { this.inner.abort(); };
  CapLoader.prototype.destroy = function () { this.inner.destroy(); };
  CapLoader.prototype.getCacheAge = function () { return this.inner.getCacheAge ? this.inner.getCacheAge() : null; };
  CapLoader.prototype.getResponseHeader = function (n) { return this.inner.getResponseHeader ? this.inner.getResponseHeader(n) : null; };
  function capFixLoader(Base) { CapLoader.Base = Base; return CapLoader; }
  function capResolveUrl(url) { var pl = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp; if (!capHttpOn() || !pl || !pl.request || !/^https?:/i.test(url)) return Promise.resolve(url); var done = pl.request({ url: url, method: 'GET', responseType: 'text', connectTimeout: 8000, readTimeout: 8000 }).then(function (r) { return r && r.url && /^https?:/i.test(r.url) ? String(r.url) : url; }, function () { return url; }); return Promise.race([done, new Promise(function (res) { setTimeout(function () { res(url); }, 9000); })]); }
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
        return { url: s.url, alt: s.alt || '', title: title, num: live && it.num != null && it.num !== '' ? String(Number(it.num)) : '' };
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
      if (item.kind === 'episode') { UpNext.hint(full); SeriesWatch.touch(item.seriesId); }
      Last.set(item);
      var sub = SubStyle.native();
      return self.plugin().play({
        items: items, index: idx, startMs: startMs, live: live,
        subScale: sub.subScale, subColor: sub.subColor, subBg: sub.subBg,
        txtReconnect: T('Verbindung wird wiederhergestellt …'),
        txtFailed: T('Wiedergabe nicht möglich. Mit „Zurück“ schließen.'),
        txtNoChannel: T('Sender {0} nicht gefunden'),
        sleepAt: Sleep.at || 0,
        autoNext: Settings.get('autoNext') !== false,
        sound: Settings.get('sound') || 'off'
      }).then(function (res) {
        res = res || {};
        if (res.sleep) Sleep.fire(true);
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
        // Live: im TV-Player umgeschaltet → in der Senderliste auf dem zuletzt geschauten Sender landen (nicht auf dem anfangs gewählten)
        if (live && cur && cur.id != null) setTimeout(function () {
          var row = $('.chan[data-cid="' + String(cur.id).replace(/"/g, '') + '"]');
          if (row && (!Screens.top() || Screens.top().name === 'shell')) Nav.focus(row);
        }, 120);
      });
    }
  };

  function playItem(item, ctx) {
    parentalGate(item, ctx || { list: [item], index: 0 }, function (c) { playItemNow(item, c); });
  }
  function playItemNow(item, ctx) {
    ctx = ctx || { list: [item], index: 0 };
    // Lief stumm die Vorschau im Kopfbild, kurz warten, bis der Server die Verbindung freigegeben hat –
    // Zugänge mit nur einer erlaubten Verbindung lehnten den Film sonst beim Start ab
    if (HeroPreview.halt()) { setTimeout(function () { playItemNow(item, ctx); }, 400); return; }
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
    cushion: {},   // Live-Sender, die mehr Puffer brauchen (Kennung → 1)
    rate: 1, audioDelay: 0, pip: false, actx: null, adelay: null,
    triedAlt: false, retried: false,

    open: function (item, ctx, o) {
      var self = this;
      if (self.el) { self.switchTo(item, ctx); return; }
      self.ctx = ctx;
      // auto = von selbst gestartete Vorschau (Live TV): zählt erst als „gesehen“, wenn man den Sender wählt
      self.auto = !!(o && o.auto);
      // poster = durchsichtiges Bild, damit Android nicht sein weißes Standard-Vorschaubild zeigt
      var video = h('video', { playsinline: true, 'webkit-playsinline': true, autoplay: true, preload: 'auto', poster: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });
      self.video = video;
      self.title = h('h2');
      self.sub = h('div', { class: 'pt-sub' });
      self.logoBox = h('span', { class: 'pt-logo' });
      self.clock = h('span', { class: 'p-clock' });
      self.liveTag = h('span', { class: 'live-tag' }, h('i'), h('b', { text: 'LIVE' }));
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
      self.fmtBtn = h('button', { class: 'cbtn f', 'data-c': 'format', title: T('Bild & Wiedergabe'), 'aria-label': T('Bild & Wiedergabe'), onclick: function () { self.openFormat(); } }, icon('settings'));
      // Bild-in-Bild: Film oder Sender läuft klein in der Ecke weiter, während man durch Telvo geht
      self.pipBtn = h('button', { class: 'cbtn f', 'data-c': 'pip', title: T('Bild-in-Bild'), 'aria-label': T('Bild-in-Bild'), onclick: function () { self.toPip(); } }, icon('pip'));
      // Schlaf-Timer: Knopf zeigt die restlichen Minuten
      self.sleepBtn = h('button', { class: 'cbtn f', 'data-c': 'sleep', title: T('Schlaf-Timer'), 'aria-label': T('Schlaf-Timer'), onclick: function () { self.openSleep(); } }, icon('timer'), h('small', { class: 'sleep-n' }));
      // Sender ausblenden (nur Live): erscheint dann nicht mehr in den Senderlisten
      self.hideBtn = h('button', { class: 'cbtn f is-gone', 'data-c': 'hide', title: T('Sender ausblenden'), 'aria-label': T('Sender ausblenden'), onclick: function () { self.askHide(); } }, icon('eyeOff'));
      var fsOk = !Platform.tv && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
      self.fsBtn = fsOk ? h('button', { class: 'cbtn f', 'data-c': 'fs', title: T('Vollbild (F)'), 'aria-label': T('Vollbild'), onclick: function () { self.toggleFullscreen(); } }, icon('fullscreen')) : null;
      self.osd = h('div', { class: 'osd' },
        h('div', { class: 'osd-top' },
          h('button', { class: 'cbtn f p-back', title: T('Zurück'), 'aria-label': T('Zurück'), onclick: goBack }, icon('back')),
          self.logoBox,
          h('div', { class: 'pt-txt' }, h('div', { class: 'pt-row' }, self.numTag = h('span', { class: 'ch-num' }), self.title, self.liveTag, self.qTag), self.sub, self.zapNow = h('div', { class: 'pt-now' })),
          self.clock),
        h('div', { class: 'osd-bottom' }, self.info, self.barWrap, self.times,
          h('div', { class: 'ctrl-row' }, self.ctrlLeft, self.ctrls, h('div', { class: 'ctrl-side right' }, self.hideBtn, self.pipBtn, self.sleepBtn, self.fmtBtn, self.tracksBtn, self.fsBtn, self.volumeUi()))));
      self.miniTitle = h('span', { class: 'mini-title' });
      self.miniUi = h('div', { class: 'mini-ui' },
        h('button', { class: 'mini-open f', title: T('Vollbild'), onclick: function () { self.maximize(); } }, self.miniTitle),
        self.miniMute = h('button', { class: 'mini-mute f', title: T('Ton an/aus'), 'aria-label': T('Ton an/aus'), onclick: function () { self.setMuted(!self.video.muted); } }),
        h('button', { class: 'mini-close f', title: T('Schließen'), onclick: function () { self.close(); } }, icon('close')));
      self.el = h('div', { class: 'player' }, video, self.spinner, self.osd, self.zap, self.err, self.miniUi);
      self.paintVol();
      self.paintSleep();
      self.onResize = function () { self.applyAspect(); self.fitCtrls(); };
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
        self.preview(frac(px(e)) * self.video.duration);
      });
      barWrap.addEventListener('mouseleave', function () { if (!dragging && self.scrubT == null) self.hidePreview(); });
      function down(e) {
        if (!self.canSeek()) return;
        if (e.type === 'mousedown' && e.button) return;
        e.preventDefault();
        dragging = true;
        var touch = e.type === 'touchstart';
        clearTimeout(self.scrubTimer);
        self.scrubT = frac(px(e)) * self.video.duration;
        self.preview(self.scrubT);
        self.showOsd(true);
        function move(ev) {
          ev.preventDefault();
          self.scrubT = frac(px(ev)) * self.video.duration;
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
        if (self.mini || (e.target !== self.video && e.target !== self.osd && !(e.target.parentNode === self.osd))) return;
        if (self.closeTracks()) { self.showOsd(); return; }
        // Tippen auf den Pause-Bildschirm: das Handy meldet vorher eine Mausbewegung, die ihn schon geschlossen hat
        if (Date.now() - (self.pauseHiddenAt || 0) < 700) { self.showOsd(true); return; }
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

      self.bindVideo(video);

      if (o && o.mini) {
        // gleich klein im Vorschaufenster starten (Live TV), ohne vorher kurz groß aufzugehen
        self.mini = true;
        self.el.classList.add('screen', 'is-mini');
        $('#screens').appendChild(self.el);
        document.body.classList.add('has-mini');
        self.applyAspect();
        self.lastPlace = '';
        self.place();
        clearInterval(self.placeTimer);
        self.placeTimer = setInterval(function () { self.place(); }, 300);
      } else {
        Screens.push('player', self.el, self.screenOpts());
        self.enterFullscreen();
      }
      self.load(item);
    },

    isVod: function () { return this.item && this.item.kind !== 'live'; },

    screenOpts: function () {
      var self = this;
      return {
        onLeave: function () { self.teardown(); },
        // Zurück bei Live TV: Sender läuft klein weiter
        onBack: function () {
          if (self.pauseEl) { self.showOsd(true); return true; }
          if (self.closeTracks()) { self.showOsd(); return true; }
          if (self.nextBox) { self.nextCancel(); return false; }
          if (self.scrubT != null) { self.cancelScrub(); return true; }
          if (self.item && self.item.kind === 'live' && self.err.style.display === 'none') { self.minimize(); return true; }
          return false;
        }
      };
    },

    /* Ereignisse des <video>-Elements (eigene Funktion: bei der Ton-Verzögerung wird das Element ausgetauscht) */
    bindVideo: function (video) {
      var self = this;
      video.addEventListener('waiting', function () {
        if (!self.reconnect) self.loadTxt.textContent = T('Wird geladen …');
        self.spinner.style.display = '';
        self.noteStall();
      });
      video.addEventListener('playing', function () {
        self.spinner.style.display = 'none'; self.err.style.display = 'none'; self.reconnect = false;
        self.netRetries = 0; self.playedSince = Date.now();
        self.paintCtrls(); self.updateTracks();
      });
      video.addEventListener('progress', function () { self.paintBuffer(); });
      function paintQuality() {
        var hh = video.videoHeight || 0;
        self.qTag.textContent = !hh ? '' : hh >= 2000 ? '4K' : hh >= 1400 ? '1440p' : hh >= 1000 ? '1080p' : hh >= 700 ? '720p' : hh + 'p';
        self.qTag.className = 'q-tag' + (hh >= 1000 ? ' is-hd' : hh && hh < 700 ? ' is-sd' : '');
      }
      video.addEventListener('loadedmetadata', paintQuality);
      video.addEventListener('resize', paintQuality);
      if (video.audioTracks && video.audioTracks.addEventListener) video.audioTracks.addEventListener('addtrack', function () { self.updateTracks(); });
      if (video.textTracks && video.textTracks.addEventListener) video.textTracks.addEventListener('addtrack', function () { self.updateTracks(); });
      // nach dem Schließen kommt „pause“ noch einmal – dann gibt es kein Video/Player-Fenster mehr
      video.addEventListener('pause', function () { if (self.video !== video || !self.el) return; self.paintCtrls(); self.showOsd(true); });
      video.addEventListener('play', function () { self.hidePause(); });
      video.addEventListener('loadedmetadata', function () {
        if (self.isVod() && self.resumeAt) { try { video.currentTime = self.resumeAt; } catch (e) {} toast(T('Fortgesetzt bei {0}', fmtTime(self.resumeAt))); self.resumeAt = 0; }
      });
      video.addEventListener('timeupdate', function () { self.paintProgress(); self.paintClock(); });
      video.addEventListener('ended', function () { self.onEnded(); });
      video.addEventListener('error', function () {
        if (self.hls) return;   // hls.js meldet seine Fehler selbst (und versucht es erst noch einmal)
        self.errInfo = 'Video-Fehler ' + (video.error ? video.error.code : '?') + (self.ts ? ' (mpegts.js)' : '');
        self.onError(T('Das Video konnte nicht abgespielt werden (Format oder Verbindung).'));
      });
      // Ton-Verzögerung nach dem Umschalten wieder anwenden (nur wenn der neue Stream sie erlaubt)
      video.addEventListener('playing', function () { if (self.audioDelay && !self.actx && self.delayOk()) self.setDelay(self.audioDelay, true); });
      video.addEventListener('loadedmetadata', function () { self.applyRate(); });
    },
    minimize: function () {
      var self = this;
      if (!self.el || self.mini) return;
      self.hidePause();
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
      if (self.auto && self.item) {   // Vorschau groß gemacht = Sender gewählt
        self.auto = false;
        if (self.item.kind === 'live') Recent.push(self.item);
        Last.set(self.item);
      }
      self.mini = false; self.pip = false;
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
      self.fitCtrls();
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
      this.auto = false;   // selbst gewählt
      this.saveResume();
      if (ctx) this.ctx = ctx;
      this.load(item);
    },

    load: function (item) {
      var self = this, before = self.item;
      if (self.actx) self.dropAudio(false);   // frisches Video-Element; Verzögerung wird nach dem Start wieder angewendet, wenn möglich
      if (item.kind === 'live' && before && before.kind === 'live' && String(before.id) !== String(item.id)) self.prevLive = before;
      self.item = item;
      markPlaying(item);
      self.triedAlt = false; self.retried = false; self.forceHlsJs = false; self.rawFail = false;
      self.netRetries = 0; self.stallRetries = 0; self.swappedCodec = false; self.mediaRecoverAt = 0; self.reconnect = false;
      self.closeTracks();
      if (self.nextCancel) self.nextCancel();
      if (self.tracksBtn) self.tracksBtn.classList.add('is-gone');
      self.err.style.display = 'none';
      self.spinner.style.display = '';
      self.loadTxt.textContent = item.kind === 'live' ? item.name : '';
      self.epgNow = ''; self.epgNext = ''; self.epgCur = null;
      self.hidePause();
      clearInterval(self.epgTimer);
      if (self.miniTitle) self.miniTitle.textContent = item.name;
      self.lastPlace = '';
      var isEp = item.kind === 'episode';
      self.title.textContent = isEp ? (item.seriesName || item.name) : item.name;
      var cn = item.kind === 'live' ? (item.num || (self.ctx && self.ctx.list && self.ctx.list[self.ctx.index] === item ? self.ctx.index + 1 : '')) : '';
      self.numTag.textContent = cn ? String(cn) : '';
      self.numTag.style.display = cn ? '' : 'none';
      self.sub.textContent = isEp ? 'S' + item.season + ' E' + item.num + (item.seriesName && item.name ? ' · ' + item.name : '') : '';
      clear(self.logoBox);
      var lg = item.kind === 'live' && item.logo ? img(item.logo, '', function () { self.logoBox.style.display = 'none'; }) : null;
      if (lg) self.logoBox.appendChild(lg);
      self.logoBox.style.display = lg ? '' : 'none';
      self.paintClock();
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
      if (item.kind === 'live') { if (!self.auto) Recent.push(item); self.loadEpg(); }
      if (item.kind === 'episode') { UpNext.hint(self.ctx && self.ctx.list); SeriesWatch.touch(item.seriesId); }
      if (!self.auto) Last.set(item);

      var src = App.provider.streamUrl(item);
      self.alt = src.alt;
      self.attach(src.url);

      clearInterval(self.saveTimer);
      self.saveTimer = setInterval(function () { self.saveResume(); }, 10000);
      // Wächter: hängt das Bild zu lange fest, wird der Stream automatisch neu verbunden
      clearInterval(self.wdTimer); self.wdStill = 0; self.wdLastT = -1;
      self.wdTimer = setInterval(function () { self.watchdog(); }, 2000);
    },

    /* Hakt ein Live-Sender (hls.js) dreimal innerhalb von 40 Sekunden, mit mehr Abstand zum Live-Rand neu verbinden */
    noteStall: function () {
      var it = this.item, now = Date.now();
      if (!it || it.kind !== 'live' || !this.hls || Player.cushion[it.id] || !this.playedSince || now - this.playedSince < 1500) return;
      this.stalls = (this.stalls || []).filter(function (t) { return now - t < 40000; });
      this.stalls.push(now);
      if (this.stalls.length < 3) return;
      this.stalls = [];
      Player.cushion[it.id] = 1;
      toast(T('Der Sender stockt – mehr Puffer wird genutzt.'), 3500);
      this.attach(this.curUrl);
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
      // Jeder Start zählt neu: das „waiting“ beim Anlaufen ist kein Stocken (sonst meldete schnelles Umschalten
      // fälschlich „Der Sender stockt“). Laufende Nummer statt Adresse: A→B→A vor dem ersten Laden der
      // Bibliothek hängte sonst zwei Player an dasselbe Video.
      self.playedSince = 0; self.stalls = [];
      var seq = self.attachSeq = (self.attachSeq || 0) + 1;
      self.usingNative = false;
      var nativeHls = !!video.canPlayType('application/vnd.apple.mpegurl');
      // Android-App: zuerst den eingebauten Android-Player nutzen (zuverlässiger für Live-Sender),
      // nur wenn das scheitert, hls.js versuchen
      var preferNative = Platform.safari || Platform.tizen || Platform.webos || (Platform.android && !self.forceHlsJs && Settings.get('engine') !== 'hlsjs');
      if (isHlsUrl(url) && !(nativeHls && preferNative)) {
        ensureHls().then(function (Hls) {
          // inzwischen umgeschaltet? Dann nicht noch einen zweiten hls.js-Player an dasselbe Video hängen
          if (self.video !== video || self.attachSeq !== seq) return;
          if (Hls && Hls.isSupported()) {
            // PC (Windows/Mac): gleich in hoher Qualität starten und nicht an die Fenstergröße koppeln –
            // sonst bleibt das Bild nach der kleinen Vorschau lange unscharf. „Beste Qualität“ hält die höchste Stufe fest.
            var desktop = !Platform.tv && !Platform.android && !Platform.ios && !Platform.lite;
            var best = Settings.get('quality') === 'best';
            var cushion = !!(self.item && self.item.kind === 'live' && Player.cushion[self.item.id]);
            var hlsCfg = {
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
              // Live: nie schneller abspielen, um aufzuholen. Hakt ein Sender öfter, mehr Abstand zum Live-Rand (= mehr Vorrat)
              maxLiveSyncPlaybackRate: 1,
              liveSyncDurationCount: cushion ? 6 : 3, liveMaxLatencyDurationCount: cushion ? 14 : 8
            };
            if (capHttpOn() && Hls.DefaultConfig && Hls.DefaultConfig.loader) hlsCfg.loader = capFixLoader(Hls.DefaultConfig.loader);
            var hls = new Hls(hlsCfg);
            self.hls = hls;
            hls.on(Hls.Events.ERROR, function (ev, data) {
              if (!data.fatal || self.hls !== hls) return;
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                var now = Date.now();
                if (!self.mediaRecoverAt || now - self.mediaRecoverAt > 10000) { self.mediaRecoverAt = now; hls.recoverMediaError(); return; }
                if (!self.swappedCodec) { self.swappedCodec = true; self.mediaRecoverAt = now; hls.swapAudioCodec(); hls.recoverMediaError(); return; }
              }
              // 4xx (nicht gefunden, kein Zugriff) wird durch Warten nicht besser: nur einmal neu versuchen, dann gleich
              // das andere Format bzw. die Meldung (vorher 4 Versuche = rund 18 s „Verbindung wird wiederhergestellt“)
              var hcode = data.response && data.response.code, maxRetries = hcode >= 400 && hcode < 500 ? 1 : 4;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && self.netRetries < maxRetries) {
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
            hls.attachMedia(video);
            capResolveUrl(url).then(function (u) { if (self.hls === hls) hls.loadSource(u); });
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
          if (self.video !== video || self.attachSeq !== seq) return;
          self.destroyHls();
          self.rawFail = true;
          video.src = url;
          self.playSafe();
        };
        ensureTs().then(function (mpegts) {
          if (self.video !== video || self.attachSeq !== seq) return;
          var ok = mpegts && mpegts.getFeatureList && mpegts.getFeatureList().mseLivePlayback;
          if (!ok) { plain(); return; }
          /* Kein „Aufholen“ zum Live-Rand: das sprang immer wieder nach vorn, der Vorrat war danach leer –
             Bild lief kurz zu schnell, stockte und hakte dauernd (z. B. RAW-Sender). Lieber ein paar Sekunden
             hinter dem Live-Bild, dafür flüssig. Größerer Startpuffer gleicht ungleichmäßig liefernde Server aus. */
          var p = mpegts.createPlayer({ type: 'mpegts', isLive: self.item && self.item.kind === 'live', url: url },
            { enableWorker: true, liveBufferLatencyChasing: false, liveSync: false, lazyLoad: false,
              enableStashBuffer: true, stashInitialSize: 384 * 1024, autoCleanupSourceBuffer: true });
          self.ts = p;
          p.on(mpegts.Events.ERROR, function (type, detail, info) {
            if (self.ts !== p) return;
            // Server sagt „gibt es nicht / kein Zugriff“: direkt abspielen hilft dann auch nicht – klare Meldung statt
            // des Hinweises auf „RAW“-Sender (bzw. erst das andere Format probieren, das macht onError)
            var code = info && info.code;
            if (code >= 400 && code < 500) { self.destroyHls(); self.errInfo = 'mpegts HTTP ' + code; self.onError(T('Der Stream ist nicht erreichbar.')); return; }
            plain();
          });
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
      if (self.rawFail) self.err.appendChild(h('p', { class: 'hint', text: T('Solche Sender heißen in der Liste oft „RAW“. Sie werden unverändert durchgeleitet. Auf einer Android-TV-Box oder einem Fire TV Stick laufen sie meist – notfalls über einen externen Player wie VLC (Einstellungen → Wiedergabe).') }));
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
      if (self.item.kind === 'episode' && c && c.list && c.index < c.list.length - 1) { self.showNext(c.list[c.index + 1], Settings.get('autoNext') !== false); return; }
      if (self.isVod()) { if (self.mini) self.close(); else goBack(); }
    },
    /* Nächste Folge: kleine Karte mit Countdown, wie bei Netflix */
    showNext: function (next, auto) {
      var self = this, left = 10;
      if (self.mini) { if (auto) { self.ctx.index++; self.load(next); } else self.close(); return; }
      self.closeTracks();
      var count = h('span', { class: 'nx-count' });
      function paint() { count.textContent = auto ? T('Startet in {0} Sekunden', left) : T('Weiter mit der nächsten Folge?'); }
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
      if (auto) self.nextTimer = setInterval(function () { left--; if (left <= 0) go(); else paint(); }, 1000);
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
      if (this.togglePanel('tracks')) return;
      var t = this.tracks();
      this.openPanel([[T('Tonspur'), t.audio, 'vol'], [T('Untertitel'), t.subs, 'cc']], 'is-tracks', 'tracks');
    },
    // Ist die Karte dieses Knopfs schon offen, schließt ein zweiter Druck sie wieder
    togglePanel: function (key) {
      if (!this.trackPanel || this.trackPanel._key !== key) return false;
      this.closeTracks();
      this.showOsd();
      var b = $('.cbtn[data-c="' + key + '"]', this.el);
      if (b) Nav.focus(b);
      return true;
    },
    /* Auswahlfenster im Player (Ton & Untertitel, Format). Abschnitte mit nur einer Möglichkeit werden weggelassen. */
    /* Auswahl im Player: Glas-Karte mit Abschnitten (Symbol + kurzer Titel) und Chips.
       sections: [Titel, Möglichkeiten, Symbol, schließen?] – Abschnitte mit nur einer Möglichkeit fehlen.
       Eine Wahl wirkt sofort und die Karte bleibt offen; nur was den Stream neu lädt, schließt sie. */
    openPanel: function (sections, cls, key) {
      var self = this;
      self.closeTracks();
      var box = h('div', { class: 'track-panel is-chips' + (cls ? ' ' + cls : '') });
      box._key = key || '';
      sections.forEach(function (s) {
        if (!s || s[1].length < 2) return;
        var row = h('div', { class: 'tp-chips' });
        box.appendChild(h('div', { class: 'tp-sec' }, h('h3', null, s[2] ? icon(s[2]) : null, h('span', { text: s[0] })), row));
        s[1].forEach(function (o) {
          var b = h('button', { class: 'tp-opt f' + (o.on ? ' is-on' : ''), title: o.title || null, onclick: function () {
            if (b.classList.contains('is-on') && !o.again) return;
            o.pick();
            if (s[3]) { self.closeTracks(); self.showOsd(); return; }
            for (var i = 0; i < row.children.length; i++) row.children[i].classList.toggle('is-on', row.children[i] === b);
            idle(5000);
          } }, h('span', { text: o.label }));
          row.appendChild(b);
        });
      });
      if (!box.firstChild) return;
      // Ohne Bedienung blendet sich die Karte (und danach die Leiste) wieder aus – außer bei Pause
      function idle(ms) {
        clearTimeout(self.panelTimer);
        self.panelTimer = setTimeout(function () {
          if (self.trackPanel !== box || (self.video && self.video.paused)) return;
          self.closeTracks(); self.hideOsd();
        }, ms);
      }
      box.addEventListener('focusin', function () { idle(9000); });
      box.addEventListener('pointermove', function () { idle(9000); });
      box._dispose = function () { clearTimeout(self.panelTimer); };
      self.trackPanel = box;
      self.el.appendChild(box);
      var kb = key && $('.cbtn[data-c="' + key + '"]', self.el);
      if (kb) kb.classList.add('is-open');
      clearTimeout(self.hideTimer);
      idle(12000);
      setTimeout(function () { Nav.focus($('.tp-opt.is-on', box) || $('.tp-opt', box)); }, 30);
    },
    askHide: function () {
      var it = this.item;
      if (it && it.kind === 'live') askHideChannel(it);
    },
    /* Bild-in-Bild: klein in der Ecke weiterlaufen lassen – auch beim Wechsel zu Filmen, Serien oder Start */
    toPip: function () {
      if (!this.el || this.mini) return;
      this.closeTracks();
      this.pip = true;
      this.minimize();
    },
    applyRate: function () {
      var v = this.video;
      if (!v) return;
      var r = this.isVod() ? (this.rate || 1) : 1;
      try { v.defaultPlaybackRate = r; v.playbackRate = r; } catch (e) {}
    },
    // Qualitätsstufen des Streams (nur hls.js liefert sie). Gleiche Höhe nur einmal, die beste oben.
    levels: function () {
      var hls = this.hls, out = [], seen = {};
      if (!hls || !hls.levels || hls.levels.length < 2) return out;
      out.push({ label: T('Auto'), title: T('Automatisch'), on: !!hls.autoLevelEnabled, pick: function () { hls.currentLevel = -1; } });
      hls.levels.map(function (l, i) { return { l: l, i: i }; })
        .sort(function (a, b) { return (b.l.height || 0) - (a.l.height || 0) || (b.l.bitrate || 0) - (a.l.bitrate || 0); })
        .forEach(function (x) {
          var hh = x.l.height || 0, k = hh || x.l.bitrate;
          if (!k || seen[k]) return;
          seen[k] = 1;
          out.push({ label: hh ? hh + 'p' : T('{0} kbit/s', Math.round(x.l.bitrate / 1000)), on: !hls.autoLevelEnabled && hls.currentLevel === x.i, pick: function () { hls.currentLevel = x.i; } });
        });
      return out.length > 2 ? out : [];
    },
    /* ---------- Ton-Verzögerung ----------
       Der Ton läuft über Web Audio mit einer Verzögerung. Das geht nur, wenn der Stream über MSE läuft (hls.js, mpegts.js) –
       bei direkt geladenen fremden Adressen wäre der Ton sonst stumm. Darum nur dort anbieten. Ein umgeleitetes <video>
       lässt sich nicht zurückstellen: Beim Ausschalten und beim nächsten Sender wird es durch ein frisches ersetzt. */
    delayOk: function () {
      var v = this.video, src = v ? String(v.currentSrc || v.src || '') : '';
      return !!(v && (window.AudioContext || window.webkitAudioContext) && !Platform.lite && !Platform.tizen && !Platform.webos && src.indexOf('blob:') === 0);
    },
    setDelay: function (ms, quiet) {
      var self = this;
      self.audioDelay = ms;
      if (!ms) { self.dropAudio(true); return; }
      if (!self.delayOk() && !self.actx) return;
      try {
        if (!self.actx) {
          var AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
          var src = ctx.createMediaElementSource(self.video), d = ctx.createDelay(2);
          src.connect(d); d.connect(ctx.destination);
          self.actx = ctx; self.adelay = d;
        }
        if (self.actx.state !== 'running' && self.actx.resume) self.actx.resume();
        self.adelay.delayTime.value = ms / 1000;
        // läuft der Ton nicht an (Gerät erlaubt es nicht), sofort zurück zum normalen Ton
        setTimeout(function () {
          if (self.actx && self.actx.state !== 'running') { self.audioDelay = 0; self.dropAudio(true); if (!quiet) toast(T('Ton-Verzögerung ist auf diesem Gerät gerade nicht möglich.'), 3500); }
        }, 700);
      } catch (e) { self.audioDelay = 0; self.dropAudio(true); if (!quiet) toast(T('Ton-Verzögerung ist auf diesem Gerät gerade nicht möglich.'), 3500); }
    },
    // Ton wieder direkt ausgeben. reload: den laufenden Stream im frischen Element neu starten.
    dropAudio: function (reload) {
      if (!this.actx) return;
      try { this.actx.close(); } catch (e) {}
      this.actx = null; this.adelay = null;
      this.swapVideo();
      if (reload && this.item) { this.saveResume(); this.load(this.item); }
    },
    swapVideo: function () {
      var old = this.video;
      if (!old || !old.parentNode) return;
      this.destroyHls();
      var v = h('video', { playsinline: true, 'webkit-playsinline': true, autoplay: true, preload: 'auto', poster: old.getAttribute('poster') });
      v.volume = old.volume; v.muted = old.muted;
      try { old.pause(); old.removeAttribute('src'); old.load(); } catch (e) {}
      old.parentNode.replaceChild(v, old);
      this.video = v;
      this.bindVideo(v);
      this.applyAspect();
    },
    /* Nächste Folge sofort (Knopf im Player) */
    nextEpisode: function () {
      var c = this.ctx;
      if (!c || !c.list || c.index >= c.list.length - 1) return;
      this.saveResume();
      if (this.nextCancel) this.nextCancel();
      c.index++;
      this.load(c.list[c.index]);
    },
    openSleep: function () {
      var self = this;
      if (self.togglePanel('sleep')) return;
      self.openPanel([[T('Schlaf-Timer'), Sleep.options().map(function (o) {
        return { label: o[1], on: Sleep.min === o[0], again: true, pick: function () { Sleep.set(o[0]); } };
      }), 'timer', true]], '', 'sleep');
    },
    paintSleep: function () {
      if (!this.sleepBtn) return;
      this.sleepBtn.classList.toggle('is-on', !!Sleep.at);
      $('.sleep-n', this.sleepBtn).textContent = Sleep.at ? String(Sleep.mins()) : '';
      this.sleepBtn.title = T('Schlaf-Timer') + (Sleep.at ? ': ' + Sleep.label() : '');
    },
    /* Senderliste im Player (Live): links einblenden, umschalten ohne den Player zu verlassen */
    openChannels: function () {
      var self = this, c = self.ctx;
      if (!self.item || self.item.kind !== 'live' || !c || !c.list || c.list.length < 2) return;
      // zweiter Druck schließt (wie Zahnrad, Ton und Schlaf-Timer)
      if (self.trackPanel && self.trackPanel.classList.contains('chan-panel')) { self.closeTracks(); self.showOsd(); return; }
      self.closeTracks();
      var list = c.list, scroller = h('div', { class: 'cp-scroll' }), box = h('div', { class: 'cp-rows' });
      scroller.appendChild(box);
      var panel = h('div', { class: 'track-panel chan-panel' },
        h('div', { class: 'cp-head' }, icon('playlist'), h('b', { text: T('Senderliste') }), h('small', { text: fmtCount(list.length) })), scroller);
      self.trackPanel = panel;
      self.el.appendChild(panel);
      clearTimeout(self.hideTimer);
      self.hideOsd();
      var loader = NowLoader(scroller);
      panel._dispose = function () { loader.dispose(); if (rc) rc.dispose(); };
      var rc = renderChunked(box, scroller, list, function (it, i) {
        var row = channelRow(it, function () {
          self.closeTracks();
          if (String(it.id) === String(self.item.id)) return;
          parentalGate(it, { list: list, index: i }, function (cc) { if (!self.el) return; self.showZap(cc.list[cc.index], cc.index); self.switchTo(cc.list[cc.index], cc); });
        });
        loader.watch(row, i);
        return row;
      });
      var at = Math.max(0, c.index || 0);
      rc.upTo(at);
      setTimeout(function () {
        var cur = box.querySelector('[data-idx="' + at + '"]');
        if (cur && self.trackPanel === panel) { Nav.focus(cur); scroller.scrollTop = Math.max(0, cur.offsetTop - scroller.clientHeight / 2 + cur.offsetHeight / 2); }
      }, 30);
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
      if (this.togglePanel('format')) return;
      var self = this, cur = Settings.get('aspect') || 'fit';
      var aspects = [['fit', T('Original')], ['16:9', '16:9'], ['4:3', '4:3'], ['stretch', T('Strecken'), T('Vollbild (strecken)')], ['fill', T('Zoom'), T('Zoom (Bild füllen)')]].map(function (a) {
        return { label: a[1], title: a[2], on: cur === a[0], pick: function () { Settings.set('aspect', a[0]); self.applyAspect(); } };
      });
      var sections = [[T('Bildformat'), aspects, 'aspect']];
      // Geschwindigkeit: nur bei Filmen und Folgen (Live läuft immer in Echtzeit)
      if (self.isVod()) sections.push([T('Geschwindigkeit'), [0.5, 0.75, 1, 1.25, 1.5, 2].map(function (r) {
        return { label: String(r).replace('.', Lang.cur === 'en' ? '.' : ',') + '×', on: self.rate === r, pick: function () { self.rate = r; self.applyRate(); } };
      }), 'speed']);
      // Qualität: nur wenn der Stream mehrere Stufen anbietet (HLS mit hls.js)
      var lv = self.levels();
      if (lv.length) sections.push([T('Qualität'), lv, 'hq']);
      // Ton-Verzögerung: nur wo es technisch geht (Stream über MSE, Web Audio vorhanden)
      if (self.delayOk() || self.actx) sections.push([T('Ton-Verzögerung') + ' · ms', [0, 100, 200, 300, 500, 800].map(function (ms) {
        return { label: ms ? '+' + ms : T('Aus'), title: ms ? T('{0} ms später', ms) : null, on: (self.audioDelay || 0) === ms, pick: function () { self.setDelay(ms); } };
      }), 'sync']);
      // Nächste Folge automatisch (nur bei Serien)
      if (self.item && self.item.kind === 'episode') {
        var an = Settings.get('autoNext') !== false;
        sections.push([T('Nächste Folge automatisch'), [[true, T('An')], [false, T('Aus')]].map(function (o) {
          return { label: o[1], on: an === o[0], pick: function () { Settings.set('autoNext', o[0]); } };
        }), 'skipNext']);
      }
      if (self.item && self.item.kind === 'live' && App.provider && App.provider.type === 'xtream') {
        var lf = Settings.get('liveFormat') === 'ts' ? 'ts' : 'm3u8';
        sections.push([T('Stream-Format'), [['m3u8', 'HLS', 'HLS (.m3u8)'], ['ts', 'MPEG-TS', 'MPEG-TS (.ts)']].map(function (f) {
          // Wechsel lädt den Sender sofort neu; gilt danach für alle Live-Sender
          return { label: f[1], title: f[2], on: lf === f[0], pick: function () { if (lf === f[0]) return; Settings.set('liveFormat', f[0]); self.load(self.item); } };
        }), 'tvplay', true]);
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
        }), 'player', true]);
      }
      self.openPanel(sections, '', 'format');
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
      if (this.el) $all('.cbtn.is-open', this.el).forEach(function (b) { b.classList.remove('is-open'); });
      if (had && this.trackPanel._dispose) this.trackPanel._dispose();
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
          self.epgCur = cur || null;
          if (!cur) { self.epgNow = ''; self.epgNext = ''; self.bar.style.display = 'none'; return; }
          var next = list.filter(function (e) { return e.start >= cur.end - 1; })[0];
          self.info.appendChild(h('div', { class: 'now' }, h('span', { class: 'ep-t', text: fmtClock(cur.start) + ' – ' + fmtClock(cur.end) }), h('b', { text: cur.title })));
          if (next) self.info.appendChild(h('div', { class: 'next' }, icon('arrowR'), h('span', { text: fmtClock(next.start) + '  ' + next.title })));
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
      if (!self.ctrls || !v) return;
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
      var cx = self.ctx;
      if (self.item && self.item.kind === 'episode' && cx && cx.list && cx.index < cx.list.length - 1) {
        var nx = cx.list[cx.index + 1];
        self.ctrlLeft.appendChild(h('button', { class: 'cbtn f', 'data-c': 'nextep', title: T('Nächste Folge') + ': S' + nx.season + ' E' + nx.num, 'aria-label': T('Nächste Folge'), onclick: function () { self.nextEpisode(); } }, icon('skipNext')));
      }
      if (self.item && self.item.kind === 'live' && self.ctx && self.ctx.list && self.ctx.list.length > 1) {
        self.ctrlLeft.appendChild(h('button', { class: 'cbtn f', 'data-c': 'list', title: T('Senderliste (Pfeil links)'), 'aria-label': T('Senderliste'), onclick: function () { self.openChannels(); } }, icon('playlist')));
      }
      if (self.item && self.item.kind === 'live' && (self.prevLive || prevRecent(self.item))) {
        self.ctrlLeft.appendChild(h('button', { class: 'cbtn f', 'data-c': 'last', title: T('Zurück zum letzten Sender'), 'aria-label': T('Letzter Sender'), onclick: function () { self.lastChannel(); } }, icon('swap')));
      }
      if (self.item && self.item.kind === 'live' && self.item.archive && App.provider && App.provider.archive) {
        self.ctrlLeft.appendChild(h('button', { class: 'cbtn f', 'data-c': 'arch', title: T('Verpasste Sendungen'), 'aria-label': T('Verpasste Sendungen'), onclick: function () { self.openArchive(); } }, icon('archive')));
      }
      if (self.item && self.item.kind !== 'episode' && self.item.kind !== 'catchup') {
        var on = Favs.has(self.item);
        self.ctrlLeft.appendChild(h('button', { class: 'cbtn f' + (on ? ' is-fav' : ''), 'data-c': 'fav', title: on ? T('Gemerkt') : T('Merken'), 'aria-label': on ? T('Gemerkt') : T('Merken'), onclick: function () { Favs.toggle(self.item); self.paintCtrls(); } }, icon(on ? 'heartFill' : 'heart')));
      }
      self.fitCtrls();
      var target = had ? ($('[data-c="' + had + '"]', self.ctrls) || $('[data-c="' + had + '"]', self.ctrlLeft)) : null;
      if (target) Nav.focus(target);
    },
    /* ---------- Pause-Bildschirm ----------
       Steht das Bild ein paar Sekunden auf Pause, erscheinen Titel, Infos und Beschreibung groß über dem
       abgedunkelten Bild. Jede Taste, Maus oder Tippen blendet ihn aus; Abspielen spielt gleich weiter. */
    armPause: function () {
      var self = this;
      clearTimeout(self.pauseTimer);
      self.pauseTimer = setTimeout(function () { self.showPause(); }, 6000);
    },
    showPause: function () {
      var self = this, it = self.item, v = self.video;
      if (!self.el || self.mini || self.pauseEl || !it || !v || !v.paused || v.ended) return;
      if (self.trackPanel || self.nextBox || Dialog.open || self.scrubT != null || self.err.style.display !== 'none' || self.spinner.style.display !== 'none') return;
      if (!Screens.top() || Screens.top().el !== self.el) return;
      var title = it.name, sub = '', plot = it.plot || '', meta = [];
      if (it.kind === 'episode') {
        title = it.seriesName || it.name;
        sub = 'S' + it.season + ' E' + it.num + (it.seriesName && it.name ? ' · ' + it.name : '');
      } else if (it.kind === 'live') {
        var e = self.epgCur;
        title = e ? e.title : it.name;
        sub = e ? it.name + ' · ' + fmtClock(e.start) + ' – ' + fmtClock(e.end) : '';   // ohne Programm stand der Name sonst doppelt
        plot = (e && e.desc) || '';
      }
      var metaRow = h('div', { class: 'ps-meta' }), plotEl = h('p', { class: 'ps-plot', text: plot });
      function paintMeta(d) {
        clear(metaRow);
        var y = String(d.year || '').slice(0, 4), r = parseFloat(d.rating);
        if (y && /^\d{4}$/.test(y)) metaRow.appendChild(h('span', { text: y }));
        if (r > 0) metaRow.appendChild(h('span', { class: 'ps-star' }, icon('starFill'), h('span', { text: String(Math.round(r * 10) / 10).replace('.', Lang.cur === 'en' ? '.' : ',') })));
        if (d.genre) metaRow.appendChild(h('span', { text: String(d.genre).split(/[,/]/).slice(0, 2).join(', ') }));
        if (self.isVod() && v.duration && isFinite(v.duration)) metaRow.appendChild(h('span', { text: T('Noch {0}', fmtLeft(v.duration - v.currentTime)) }));
      }
      paintMeta(it);
      var box = h('div', { class: 'pause-scr' },
        h('div', { class: 'ps-in' },
          h('span', { class: 'ps-tag' }, icon('pause'), h('span', { text: T('Pausiert') })),
          h('h1', { text: title }),
          sub ? h('p', { class: 'ps-sub', text: sub }) : null,
          metaRow, plotEl));
      box.addEventListener('click', function () { self.showOsd(true); });
      // Filme: Beschreibung, Jahr und Bewertung nachladen, wenn sie in der Liste fehlen
      if (it.kind === 'movie' && (!plot || !it.year) && App.provider && App.provider.movieInfo) {
        App.provider.movieInfo(it).then(function (d) {
          if (!d || self.pauseEl !== box) return;
          if (d.plot && !plotEl.textContent) plotEl.textContent = d.plot;
          paintMeta({ year: it.year || d.year, rating: it.rating || d.rating, genre: it.genre || d.genre });
        }, function () {});
      }
      self.pauseEl = box;
      self.el.appendChild(box);
      self.osd.classList.add('is-hidden');
      if (self.osd.contains(document.activeElement)) document.activeElement.blur();
    },
    hidePause: function () {
      clearTimeout(this.pauseTimer);
      var b = this.pauseEl;
      this.pauseEl = null;
      if (b) this.pauseHiddenAt = Date.now();
      if (b && b.parentNode) b.parentNode.removeChild(b);
    },
    paintClock: function () {
      if (!this.clock) return;
      var t = fmtClock(Date.now() / 1000);
      if (this.clock.textContent !== t) this.clock.textContent = t;
    },
    // Die Knopfleiste passt sich dem Platz an: erst ohne Lautstärke-Regler,
    // reicht es dann immer noch nicht, kommen die Werkzeuge in eine eigene Zeile unter Abspielen
    fitCtrls: function () {
      var l = this.ctrlLeft, row = l && l.parentNode, r = row && row.lastChild;
      if (!l || this.mini || !row.clientWidth) return;
      function need(el) {
        var w = 0, c = el.children;
        for (var i = 0; i < c.length; i++) {
          if (c[i].offsetParent === null) continue;
          var cs = window.getComputedStyle(c[i]);
          w += c[i].getBoundingClientRect().width + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
        }
        return w;
      }
      function over(el) { return el.offsetParent !== null && need(el) > el.clientWidth + 1; }
      row.classList.remove('is-stacked'); r.classList.remove('is-compact');
      if (this.el) this.el.classList.remove('ctrl-stacked');
      if (over(r)) r.classList.add('is-compact');
      if (over(l) || over(r)) {
        row.classList.add('is-stacked');
        if (this.el) this.el.classList.add('ctrl-stacked');
        r.classList.remove('is-compact');
        if (over(r)) r.classList.add('is-compact');
      }
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
      this.showZap(it, c.index);
      this.load(it);
    },
    // Kurz einblenden, welcher Sender gerade kommt (Nummer und Name)
    /* Senderwechsel: Logo groß in der Mitte, darunter Nummer, Name und laufende Sendung */
    showZap: function (it, index) {
      var self = this;
      if (self.mini) return;
      self.showOsd();
      // nur die Kopfzeile zeigen (Logo, Nummer, Name, laufende Sendung) – die Knöpfe unten erst bei Bedienung
      var now = epgNowOf(it);
      self.zapNow.textContent = now && now.title ? now.title : '';
      self.zapAt = Date.now();
      self.el.classList.add('is-zapping');
      clearTimeout(self.zapTimer);
      self.zapTimer = setTimeout(function () { if (self.el) self.el.classList.remove('is-zapping'); }, 3500);
    },
    /* Direkt zu einem Sender (Nummer eingetippt, letzter Sender): in der aktuellen Liste, sonst in allen Sendern */
    zapTo: function (it) {
      var self = this, c = self.ctx;
      function go(list) {
        var idx = -1;
        for (var i = 0; list && i < list.length; i++) if (String(list[i].id) === String(it.id)) { idx = i; break; }
        if (idx < 0) { list = [it]; idx = 0; }
        parentalGate(list[idx], { list: list, index: idx }, function (cc) {
          if (!self.el) return;
          self.showZap(cc.list[cc.index], cc.index);
          self.switchTo(cc.list[cc.index], cc);
        });
      }
      if (c && c.list && some(c.list, function (x) { return String(x.id) === String(it.id); })) go(c.list);
      else liveChannels().then(go, function () { go(null); });
    },
    lastChannel: function () {
      var prev = this.prevLive || prevRecent(this.item);
      if (!prev) { toast(T('Noch kein vorheriger Sender')); return; }
      this.zapTo(prev);
    },

    showOsd: function (stay) {
      var self = this;
      if (self.mini || !self.el) return;
      if (self.el && Date.now() - (self.zapAt || 0) > 700) self.el.classList.remove('is-zapping');
      self.hidePause();
      if (self.video && self.video.paused && !self.video.ended) self.armPause(); else clearTimeout(self.pauseTimer);
      var wasHidden = self.osd.classList.contains('is-hidden');
      self.osd.classList.remove('is-hidden');
      if (wasHidden) { self.fitCtrls(); self.paintClock(); }
      if (wasHidden || !self.osd.contains(document.activeElement)) {
        var pb = $('[data-c="play"]', self.ctrls);
        if (pb && self.err.style.display === 'none') Nav.focus(pb);
      }
      clearTimeout(self.hideTimer);
      if (!stay) self.hideTimer = setTimeout(function () { if (self.video && !self.video.paused) self.hideOsd(); }, 4500);
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
      if (self.pauseEl) {
        if (k === KEY.PLAYPAUSE || k === KEY.PLAY || k === KEY.SPACE || k === KEY.K_K) { self.hidePause(); self.playSafe(); return true; }
        if (k === KEY.STOP) { self.close(); return true; }
        self.showOsd(true);
        return true;
      }
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
      // Direkt nach dem Umschalten sind die Knöpfe unsichtbar (nur oben links Sender) – Hoch/Runter schaltet weiter
      if (self.item.kind === 'live' && self.el && self.el.classList.contains('is-zapping') && (k === KEY.UP || k === KEY.DOWN)) {
        self.zapBy(k === KEY.UP ? -1 : 1); return true;
      }
      if (hidden) {
        if (self.item.kind === 'live' && k === KEY.UP) { self.zapBy(-1); return true; }
        if (self.item.kind === 'live' && k === KEY.DOWN) { self.zapBy(1); return true; }
        if (self.item.kind === 'live' && k === KEY.LEFT && self.ctx && self.ctx.list && self.ctx.list.length > 1) { self.openChannels(); return true; }
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
      // Ton wieder an, aber die gespeicherte Lautstärke ist 0 → auf eine hörbare Stärke springen
      if (!m && this.video.volume === 0) { this.video.volume = 0.5; Settings.set('volume', 0.5); }
      this.video.muted = m;
      Settings.set('muted', m);
      this.paintVol();
      if (!this.mini) this.showOsd();
    },
    paintVol: function () {
      var off = this.video && (this.video.muted || this.video.volume === 0);
      if (this.range && this.video) { this.range.value = off ? '0' : String(Math.round(this.video.volume * 100)); this.range.classList.toggle('is-muted', !!off); }
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
      this.closeTracks();   // offene Senderliste: Zeitgeber und Beobachter mit beenden
      this.hidePause();
      this.saveResume();
      clearInterval(this.saveTimer); clearInterval(this.epgTimer); clearTimeout(this.hideTimer); clearTimeout(this.zapTimer);
      clearInterval(this.wdTimer); clearInterval(this.nextTimer); this.nextBox = null; this.nextCancel = null; this.trackPanel = null;
      if (this.actx) { try { this.actx.close(); } catch (e) {} this.actx = null; this.adelay = null; }
      this.pip = false;
      this.destroyHls();
      clearTimeout(this.scrubTimer); this.scrubT = null;
      try { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } catch (e) {}
      this.exitFullscreen();
      clearInterval(this.placeTimer);
      this.mini = false;
      document.body.classList.remove('has-mini');
      window.removeEventListener('resize', this.onResize);
      this.el = null; this.video = null; this.item = null; this.ctx = null; this.auto = false;
      markPlaying(null);
    }
  };

  /* ==========================================================
     Tasten der Fernbedienungen
     ========================================================== */
  /* Alle sichtbaren Sender, sortiert wie in der Liste (für Nummern-Eingabe und „Letzter Sender“) */
  function liveChannels() {
    return allItems('live').then(function (list) { return sortChannels(ChanHide.filter(list)); });
  }
  // Zuletzt gesehener Sender, der nicht der aktuelle ist
  function prevRecent(cur) {
    var r = Recent.list();
    for (var i = 0; i < r.length; i++) if (!cur || String(r[i].id) !== String(cur.id)) return r[i];
    return null;
  }
  /* ---------- Schlaf-Timer ----------
     Beendet die Wiedergabe nach der gewählten Zeit (im Player oder in den Einstellungen einstellbar).
     Der Android-TV-Player bekommt die Endzeit mit und schließt sich dann selbst. */
  var Sleep = {
    at: 0, min: 0, timer: null, warned: false,
    left: function () { return this.at ? Math.max(0, this.at - Date.now()) : 0; },
    mins: function () { return Math.ceil(this.left() / 60000); },
    label: function () { return this.at ? T('noch {0} Min.', this.mins()) : T('Aus'); },
    options: function () { return [[0, T('Aus')], [15, T('{0} Min.', 15)], [30, T('{0} Min.', 30)], [60, T('1 Std.')], [90, T('{0} Std.', '1,5')], [120, T('{0} Std.', 2)]]; },
    set: function (min) {
      var self = this;
      clearInterval(self.timer); self.warned = false;
      self.min = min || 0;
      self.at = min ? Date.now() + min * 60000 : 0;
      if (self.at) self.timer = setInterval(function () { self.tick(); }, 10000);
      if (Player.el) Player.paintSleep();
    },
    tick: function () {
      if (!this.at) return;
      var left = this.left();
      if (left <= 0) { this.fire(); return; }
      if (left <= 60000 && !this.warned) { this.warned = true; if (Player.el) toast(T('Schlaf-Timer: Wiedergabe endet in einer Minute'), 6000); }
      if (Player.el) Player.paintSleep();
    },
    // Zeit ist um: Wiedergabe beenden und kurz Bescheid geben (shown: der TV-Player hat schon selbst beendet)
    fire: function (shown) {
      clearInterval(this.timer); this.at = 0; this.min = 0;
      var playing = !!Player.el || shown;
      if (Player.el) Player.close();
      if (playing) Dialog.show(T('Schlaf-Timer'), T('Die Wiedergabe wurde beendet. Gute Nacht!'), [{ label: T('OK'), primary: true }]);
    },
    pick: function (onDone) {
      var self = this;
      openSheet(T('Schlaf-Timer'), 'timer', [h('p', { class: 'hint', text: T('Die Wiedergabe stoppt nach der gewählten Zeit – auch im TV-Player.') }),
        choiceList(self.options(), function () { return self.min; }, function (v) { self.set(v); goBack(); })], { onClose: onDone });
    }
  };

  /* ---------- Sendernummer eintippen ----------
     In Live TV und im Player (Fernbedienung 0–9): Ziffern sammeln, passenden Sender gleich anzeigen,
     nach kurzer Pause oder mit OK umschalten. Taste „Vorheriger Sender“ (bzw. L) springt zum letzten Sender. */
  var NumEntry = {
    buf: '', timer: null, el: null, map: null, src: null,
    active: function () {
      var top = Screens.top();
      if (!top || Dialog.open) return false;
      if (Player.el && top.el === Player.el) return !!(Player.item && Player.item.kind === 'live' && !Player.mini);
      return top.name === 'shell' && Shell.current === 'live' && !QuickSearch.isOpen;
    },
    key: function (e, k) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return false;
      if (this.buf && k === KEY.ENTER) { this.commit(); return true; }
      if (this.buf && isBackKey(e)) { this.reset(); return true; }
      if ((k === KEY.PREV_CH || k === KEY.K_L) && this.active()) { lastChannel(); return true; }
      var d = k >= 48 && k <= 57 ? k - 48 : k >= 96 && k <= 105 ? k - 96 : -1;
      if (d < 0 || !this.active()) return false;
      if (this.buf.length >= 4) this.buf = '';
      this.buf += d;
      this.load();
      this.paint();
      var self = this;
      clearTimeout(self.timer);
      self.timer = setTimeout(function () { self.commit(); }, 1800);
      return true;
    },
    // Nummer → Sender (einmal je Playlist-Stand aufbauen)
    load: function () {
      var self = this, pr = liveChannels();
      if (pr === self.src) return;
      self.src = pr; self.map = null;
      pr.then(function (list) {
        if (self.src !== pr) return;
        var m = {};
        list.forEach(function (x) { var n = Number(x.num); if (x.num !== undefined && x.num !== '' && !isNaN(n) && !m[n]) m[n] = x; });
        self.map = m; self.list = list;
        if (self.buf) self.paint();
      }, function () { self.map = {}; });
    },
    match: function () { return this.map ? this.map[Number(this.buf)] || null : undefined; },
    paint: function (msg) {
      var host = Player.el && Screens.top() && Screens.top().el === Player.el ? Player.el : document.body;
      if (!this.el) this.el = h('div', { class: 'num-entry', role: 'status', 'aria-live': 'polite' });
      if (this.el.parentNode !== host) host.appendChild(this.el);
      clear(this.el);
      var m = this.match();
      this.el.appendChild(h('b', { text: this.buf || '' }));
      this.el.appendChild(h('span', { text: msg || (m ? m.name : m === null ? T('Kein Sender mit dieser Nummer') : '…') }));
      this.el.classList.toggle('is-miss', !!msg || m === null);
      this.el.classList.remove('is-hidden');
    },
    hide: function () { if (this.el) this.el.classList.add('is-hidden'); },
    reset: function () { clearTimeout(this.timer); this.buf = ''; this.hide(); },
    commit: function () {
      var self = this, num = self.buf;
      clearTimeout(self.timer);
      if (!num) return;
      if (!self.map) { self.timer = setTimeout(function () { self.commit(); }, 400); return; }   // Liste lädt noch
      var it = self.match();
      self.buf = '';
      if (!it) {
        self.buf = num; self.paint(T('Sender {0} nicht gefunden', num)); self.buf = '';
        self.timer = setTimeout(function () { self.hide(); }, 1600);
        return;
      }
      self.hide();
      if (Player.el && !Player.mini && Screens.top() && Screens.top().el === Player.el) { Player.zapTo(it); return; }
      var list = self.list || [it], idx = list.indexOf(it);
      playItem(it, { list: list, index: Math.max(0, idx) });
      // in der Senderliste markieren, wenn der Sender dort steht
      var row = $('.chan[data-cid="' + String(it.id).replace(/"/g, '') + '"]');
      if (row) Nav.focus(row);
    }
  };
  function lastChannel() {
    if (Player.el && Player.item && Player.item.kind === 'live') { Player.lastChannel(); return; }
    var r = Recent.list()[0];
    if (r) playItem(r, { list: [r], index: 0 }); else toast(T('Noch kein vorheriger Sender'));
  }

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK_TIZEN: 10009, BACK_WEBOS: 461, ESC: 27, BACKSPACE: 8,
    PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412, SPACE: 32, K_F: 70, K_K: 75, K_M: 77,
    CH_UP: 427, CH_DOWN: 428, PREV_CH: 10190, K_L: 76
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
    // Live TV: Sendernummer eintippen, letzter Sender
    if (NumEntry.key(e, k)) { e.preventDefault(); return; }

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
      ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ChannelUp', 'ChannelDown', 'PreviousChannel',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) {
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
    d.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="lumio-play-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent-2)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient><linearGradient id="telvo-logo-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b06cff"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs></svg>';
    document.body.appendChild(d.firstChild);
  }

  /* Ältere Browser-Kerne erkennen (Fernseher bis 2019/2020, Android-Boxen mit altem WebView) – style.css ordnet dann
     ohne CSS-Grid bzw. ohne „gap“ in Flex-Zeilen an (Abschnitt „Ältere Geräte“) */
  function detectOldEngine() {
    var d = document.documentElement;
    function ok(p, v) { try { return !!(window.CSS && CSS.supports && CSS.supports(p, v)); } catch (e) { return false; } }
    if (!ok('display', 'grid')) d.className += ' no-grid';
    try {
      var f = document.createElement('div');
      f.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
      f.appendChild(document.createElement('div')); f.appendChild(document.createElement('div'));
      document.body.appendChild(f);
      var noGap = f.scrollHeight !== 1;
      f.parentNode.removeChild(f);
      if (noGap) d.className += ' no-flexgap';
    } catch (e) {}
  }
  function boot() {
    detectOldEngine();
    Profiles.fixIds();
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
      if (Persons.multi()) setTimeout(function () { if (App.profile === active) showWhoWatches(); }, 300);
      // Einstellung „Letzten Sender beim Start abspielen“
      // nicht nach einem Neustart aus der App heraus (z. B. Sprache gewechselt)
      var soft = false;
      try { soft = sessionStorage.getItem('lumio.soft') === '1'; sessionStorage.removeItem('lumio.soft'); } catch (e) {}
      var lastLive = !soft && startView() === 'last' && Recent.list()[0];
      if (lastLive) setTimeout(function () {
        function ok() { var top = Screens.top(); return !Player.el && App.profile === active && top && top.name === 'shell' && !Dialog.open; }
        if (!ok()) return;
        // Mit der Senderliste der Kategorie starten – sonst kannte der Player nur diesen einen Sender und hoch/runter schaltete nicht um
        var cat = lastLive.catId !== undefined && lastLive.catId !== null && lastLive.catId !== '' ? lastLive.catId : '__all';
        var load = App.provider && App.provider.items ? App.provider.items('live', cat).then(null, function () { return null; }) : Promise.resolve(null);
        Promise.race([load, new Promise(function (res) { setTimeout(function () { res(null); }, 3000); })]).then(function (list) {
          if (!ok()) return;
          var idx = -1;
          for (var i = 0; list && i < list.length; i++) if (String(list[i].id) === String(lastLive.id)) { idx = i; break; }
          if (idx < 0) playItem(lastLive, { list: [lastLive], index: 0 });
          else playItem(list[idx], { list: list, index: idx });
        });
      }, 1200);
    }
    else showProfiles();
    Terms.check();
    setTimeout(function () { Updates.daily(); }, 8000);
    setTimeout(function () { Backup.daily(); }, 15000);
    Cloud.start();
    StillWatching.start();
    Reminders.start();
    Saver.start();
    // Startbild mit Namen (index.html) ausblenden – die erste Seite steht jetzt
    var bootEl = document.getElementById('boot');
    if (bootEl) setTimeout(function () { bootEl.classList.add('is-out'); setTimeout(function () { if (bootEl.parentNode) bootEl.parentNode.removeChild(bootEl); }, 500); }, 350);
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
    Xmltv: Xmltv, chanKey: chanKey, trackLabel: trackLabel, cleanTitle: cleanTitle, cleanEpName: cleanEpName, fmtDur: fmtDur, isRadio: isRadio, Sky: Sky, icon: icon, Terms: Terms, editPerson: editPerson, EpgStore: EpgStore, makeProvider: makeProvider, Profiles: Profiles, PinGuard: PinGuard, Store: Store, Cloud: Cloud,
    decodeBytes: decodeBytes, readText: readText, fetchText: fetchText, sameConnection: sameConnection, NativePlayer: NativePlayer, App: App, ensureTs: ensureTs, migrateM3uIds: migrateM3uIds,
    ErrLog: ErrLog, techInfo: techInfo, epgText: epgText, ChanCount: ChanCount, clearHistory: clearHistory, startView: startView,
    CatPrefs: CatPrefs, visibleCats: visibleCats, Parental: Parental, ChanHide: ChanHide, initials: initials, statusError: statusError, isVisible: isVisible,
    Backup: Backup, profileFp: profileFp, Settings: Settings,
    Seen: Seen, Resume: Resume, UpNext: UpNext, SeriesWatch: SeriesWatch, sortVod: sortVod,
    Reminders: Reminders, NumEntry: NumEntry, Sleep: Sleep, Later: Later, Saver: Saver, trailerQuery: trailerQuery, Persons: Persons, Favs: Favs, Recent: Recent, showGuide: showGuide, Player: Player, Dialog: Dialog,
    config: CONFIG
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
