/* ==========================================================
   Lumio Player – App-Logik
   Läuft auf: Android, Fire TV, Android TV, iPhone, iPad (über Capacitor),
   Samsung (Tizen), LG (webOS) und im Browser.
   Bewusst ohne Build-Werkzeuge geschrieben, damit auch ältere
   Fernseher (ca. ab 2019) den Code direkt ausführen können.
   ========================================================== */
(function () {
  'use strict';

  /* ---------------- Einstellungen ---------------- */
  var CONFIG = {
    appName: 'Lumio Player',          // Name der App (auch in config-Dateien ändern)
    version: '1.3.0',
    pageSize: 60,                     // So viele Einträge werden auf einmal gezeichnet
    hlsCdn: 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js',
    requestTimeout: 30000,
    // Online-Dienst für "Playlist per Handy hinzufügen" (Supabase + Webseite auf GitHub Pages)
    cloudUrl: 'https://oofzhklrbrpxjoicwbsf.supabase.co/rest/v1/rpc/',
    cloudKey: 'sb_publishable_cx6n8buREFat_yE7kKW6FA_SnMsOQX7',
    portalUrl: 'https://splix66.github.io/lumio-player/',
    qrCdn: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
    syncInterval: 30000
  };

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
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M11 18h2"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" stroke="none"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    starFill: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    rew: '<path d="M11 19l-7-7 7-7M20 19l-7-7 7-7"/>',
    fwd: '<path d="M13 5l7 7-7 7M4 5l7 7-7 7"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    vol: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    volOff: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>'
  };
  function icon(name) {
    var span = document.createElement('span');
    span.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    return span.firstChild;
  }
  /* Logo: "L" und Play-Zeichen in Textfarbe, der Lichtpunkt in der gewählten Akzentfarbe */
  var LOGO_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 20v44a20 20 0 0 0 20 20h44" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/><path class="play" d="M38 23.6c0-3.6 3.9-5.8 7-4l35.4 22.2c3 1.8 3 6.2 0 8L45 72c-3.1 1.8-7-.4-7-4z"/><circle class="dot" cx="84" cy="22" r="6"/><path class="star" d="M84 12L86.5 19.5L94 22L86.5 24.5L84 32L81.5 24.5L74 22L81.5 19.5Z"/></svg>';
  function brandMark() { var m = h('span', { class: 'brand-mark' }); m.innerHTML = LOGO_SVG; return m; }
  /* Schriftzug: "Lumio" kräftig, "Player" leicht */
  function wordmark() { return h('span', { class: 'wordmark' }, h('b', { text: 'Lumio' }), h('span', { text: 'Player' })); }

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
  function fmtClock(ts) { var d = new Date(ts * 1000); var p = function (n) { return n < 10 ? '0' + n : '' + n; }; return p(d.getHours()) + ':' + p(d.getMinutes()); }
  function fmtDate(ts) { if (!ts) return T('unbegrenzt'); var d = new Date(Number(ts) * 1000); return d.toLocaleDateString({ de: 'de-DE', en: 'en-GB', tr: 'tr-TR' }[Lang.cur] || 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function b64(s) {
    if (!s) return '';
    try { var bin = atob(s); try { return decodeURIComponent(escape(bin)); } catch (e) { return bin; } } catch (e) { return s; }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
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

  var Settings = {
    data: Store.get('settings', { liveFormat: 'm3u8' }),
    get: function (k) { return this.data[k]; },
    set: function (k, v) { this.data[k] = v; Store.set('settings', this.data); }
  };

  /* ---------------- Sprachen ----------------
     Texte stehen auf Deutsch im Code. Übersetzungen (Englisch, Türkisch) liegen in js/i18n.js.
     T('Text') liefert den Text in der gewählten Sprache, {0} {1} … werden ersetzt. */
  var LANGS = [['de', 'Deutsch'], ['en', 'English'], ['tr', 'Türkçe']];
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
    var name = LANGS.filter(function (l) { return l[0] === Lang.cur; })[0][1];
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
      if (!k || !/^[A-Z2-9]{6}$/.test(k)) {
        var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var rnd = window.crypto && window.crypto.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(6)) : null;
        k = '';
        for (var i = 0; i < 6; i++) k += abc.charAt((rnd ? rnd[i] : Math.floor(Math.random() * 256)) % abc.length);
        Store.set('devkey', k);
      }
      return k;
    },
    portalLink: function () { return CONFIG.portalUrl + '?mac=' + encodeURIComponent(this.mac()) + '&key=' + this.key() + '&lang=' + Lang.cur; }
  };
  function macTag(user) {
    return h('div', { class: 'mac-tag' }, h('span', { text: 'MAC' }), h('b', { text: Device.mac() }), copyBtn(Device.mac(), 'MAC'),
      h('span', { text: 'KEY' }), h('b', { text: Device.key() }), copyBtn(Device.key(), 'KEY'),
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

  /* ---------------- Darstellung: Hell/Dunkel mit fester Lumio-Farbe (Violett) ----------------
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
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || CONFIG.requestTimeout);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error(T('Server-Fehler (HTTP {0})', res.status));
      return res;
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') throw new Error(T('Zeitüberschreitung – der Server antwortet nicht.'));
      throw new Error(T('Keine Verbindung zum Server. Prüfe Adresse und Internet.'));
    });
  }
  function fetchText(url) { return fetchWithTimeout(url).then(function (r) { return r.text(); }); }
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
    var cache = {};
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
    function mapItem(kind, s) {
      if (kind === 'live') return { kind: 'live', id: String(s.stream_id), name: s.name || T('Kanal'), logo: s.stream_icon, num: s.num, catId: String(s.category_id) };
      if (kind === 'movie') return { kind: 'movie', id: String(s.stream_id), name: s.name || T('Film'), logo: s.stream_icon, ext: s.container_extension || 'mp4', rating: s.rating, catId: String(s.category_id), added: s.added };
      return { kind: 'series', id: String(s.series_id), name: s.name || T('Serie'), logo: s.cover, rating: s.rating, catId: String(s.category_id), year: s.releaseDate || s.release_date, plot: s.plot, added: s.last_modified };
    }
    return {
      type: 'xtream',
      login: function () {
        return api('', '', true).then(function (d) {
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
          return (Array.isArray(list) ? list : []).map(function (c) { return { id: String(c.category_id), name: c.category_name || T('Ohne Name') }; });
        });
      },
      items: function (kind, catId) {
        var extra = catId && catId !== '__all' ? '&category_id=' + encodeURIComponent(catId) : '';
        return api(ACTIONS[kind][1], extra).then(function (list) {
          return (Array.isArray(list) ? list : []).map(function (s) { return mapItem(kind, s); });
        });
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
            seasons: seasons
          };
        });
      },
      epg: function (item, limit) {
        return api('get_short_epg', '&stream_id=' + item.id + '&limit=' + (limit || 3), true).then(function (d) {
          var list = (d && d.epg_listings) || [];
          return list.map(function (e) {
            return { title: b64(e.title), desc: b64(e.description), start: Number(e.start_timestamp), end: Number(e.stop_timestamp) };
          });
        }).catch(function () { return []; });
      },
      streamUrl: function (item) {
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
      reset: function () { cache = {}; }
    };
  }

  /* ----- M3U ----- */
  function parseM3U(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
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
          url: line
        });
        cur = null;
      }
    }
    return out;
  }

  function M3UProvider(p) {
    var data = null, loading = null;
    function build(entries) {
      var d = { live: [], movie: [], series: [], cats: { live: [], movie: [], series: [] }, seriesMap: {} };
      var seenCat = { live: {}, movie: {}, series: {} };
      var n = 0;
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
          s._eps.push({ kind: 'episode', id: 'e' + idx, url: e.url, name: e.name, season: se ? Number(se[2]) : 1, num: se ? Number(se[3]) : s._eps.length + 1, seriesId: s.id, seriesName: sName, logo: e.logo });
        } else if (u.indexOf('/movie/') >= 0 || /\.(mp4|mkv|avi|mov|m4v)(\?|$)/.test(u)) {
          d.movie.push({ kind: 'movie', id: 'm' + idx, name: e.name, logo: e.logo, url: e.url, catId: e.group });
          cat('movie', e.group);
        } else {
          n++;
          d.live.push({ kind: 'live', id: 'l' + idx, name: e.name, logo: e.logo, url: e.url, catId: e.group, num: n });
          cat('live', e.group);
        }
      });
      return d;
    }
    function load() {
      if (data) return Promise.resolve(data);
      if (!loading) {
        loading = fetchText(p.url).then(function (t) {
          if (t.indexOf('#EXT') < 0) throw new Error(T('Das ist keine gültige M3U-Playlist.'));
          data = build(parseM3U(t));
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
      epg: function () { return Promise.resolve([]); },
      streamUrl: function (item) { return { url: item.url }; },
      reset: function () { data = null; loading = null; }
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
    ].map(function (x, i) { return { kind: 'live', id: 'd' + i, name: x[0], catId: x[1], url: x[2], num: i + 1 }; });
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
      if (gone && gone.remoteId) Cloud.rpc('delete_playlist', { p_mac: Device.mac(), p_key: Device.key(), p_id: gone.remoteId }).catch(function () {});
      this.save(this.list().filter(function (p) { return p.id !== id; }));
      Store.del('fav.' + id); Store.del('resume.' + id); Store.del('recent.' + id);
      if (Store.get('active') === id) Store.del('active');
    },
    get: function (id) { return this.list().filter(function (p) { return p.id === id; })[0]; }
  };

  /* ==========================================================
     Playlist per Handy: Abgleich mit dem Online-Dienst (MAC + Key)
     ========================================================== */
  var Cloud = {
    registered: false, timer: null, busy: false, uploading: {},
    rpc: function (fn, body) {
      return fetch(CONFIG.cloudUrl + fn, {
        method: 'POST',
        headers: { apikey: CONFIG.cloudKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json(); });
    },
    sync: function () {
      var self = this;
      if (self.busy || !CONFIG.cloudUrl) return Promise.resolve(null);
      self.busy = true;
      var mac = Device.mac(), key = Device.key();
      var first = self.registered ? Promise.resolve({ ok: true }) : self.rpc('register_device', { p_mac: mac, p_key: key });
      return first.then(function (r) {
        if (!r || !r.ok) return null;
        self.registered = true;
        return self.rpc('list_playlists', { p_mac: mac, p_key: key });
      }).then(function (r) {
        self.busy = false;
        if (!r || !r.ok) return null;
        var res = self.apply(r.items || []);
        self.upload();
        return res;
      }, function () { self.busy = false; return null; });
    },
    apply: function (items) {
      var byId = {};
      items.forEach(function (it) { byId[it.id] = it; });
      var list = Profiles.list(), added = [], removed = [], changed = false;
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
        if (!ex) { data.id = uid(); list.push(data); added.push(data); changed = true; return; }
        ['type', 'name', 'url', 'server', 'username', 'password'].forEach(function (k) {
          if ((ex[k] || '') !== (data[k] || '')) { ex[k] = data[k]; changed = true; }
        });
      });
      if (!changed) return { changed: false };
      Profiles.save(list);
      removed.forEach(function (p) {
        Store.del('fav.' + p.id); Store.del('resume.' + p.id); Store.del('recent.' + p.id);
        if (Store.get('active') === p.id) Store.del('active');
      });
      if (added.length) toast(T('Neue Playlist empfangen: {0}', added.map(function (p) { return p.name; }).join(', ')), 4000);
      var top = Screens.top();
      if (App.profile && removed.some(function (p) { return p.id === App.profile.id; })) { App.profile = null; showProfiles(); }
      else if (top && top.name === 'profiles') showProfiles();
      return { changed: true, added: added, removed: removed };
    },
    /* Playlists, die direkt in der App eingetragen wurden, auch online speichern (damit sie auf der Webseite erscheinen) */
    upload: function () {
      var self = this;
      if (!self.registered) return;
      Profiles.list().forEach(function (p) {
        if (p.remoteId || (p.type !== 'm3u' && p.type !== 'xtream') || self.uploading[p.id]) return;
        self.uploading[p.id] = true;
        var body = { p_mac: Device.mac(), p_key: Device.key(), p_name: p.name || T('Playlist'), p_type: p.type };
        if (p.type === 'm3u') body.p_url = p.url;
        else { body.p_server = p.server; body.p_username = p.username; body.p_password = p.password; }
        self.rpc('add_playlist', body).then(function (r) {
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

  var qrLoading = null;
  function loadQrLib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLoading) {
      qrLoading = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = CONFIG.qrCdn;
        s.onload = function () { resolve(window.qrcode || null); };
        s.onerror = function () { resolve(null); };
        document.head.appendChild(s);
      });
    }
    return qrLoading;
  }
  /* Webseite im normalen Browser öffnen (Handy/PC). Auf dem Fernseher gibt es keinen Browser – dort scannt man. */
  function openExternal(url) {
    if (Platform.tv) { toast(T('Scanne den QR-Code mit deinem Handy.')); return; }
    if (Platform.capacitor) { window.location.href = url; return; }   // Handy-App: öffnet den System-Browser
    var w = null;
    try { w = window.open(url, '_blank'); } catch (e) {}
    if (!w) window.location.href = url;
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
      h('p', { class: 'hint', text: s ? T('Gerade läuft das {0}-Design. Danach gilt wieder das Lumio-Violett.', T(SEASONS[s].name)) : T('Automatisch richtet sich nach deinem Gerät. Fernseher bleiben dunkel.') }));
  }

  /* Hintergrund für Startseite und Playlists: dezenter Lichtschein und ein großes, kaum sichtbares Logo */
  function heroArt() {
    var box = h('div', { class: 'hero-art', 'aria-hidden': 'true' });
    box.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M14 20v44a20 20 0 0 0 20 20h44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M38 23.6c0-3.6 3.9-5.8 7-4l35.4 22.2c3 1.8 3 6.2 0 8L45 72c-3.1 1.8-7-.4-7-4z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>' +
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
  function resetAll() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) { if (k.indexOf('lumio.') === 0 && k !== 'lumio.mac' && k !== 'lumio.devkey') localStorage.removeItem(k); });
    } catch (e) {}
    location.reload();
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
      var f = inputField(has ? T('Admin-PIN') : T('Neue Admin-PIN (4 bis 8 Ziffern)'), '', 'password');
      f.input.setAttribute('inputmode', 'numeric');
      f.input.setAttribute('data-autofocus', '');
      var f2 = has ? null : inputField(T('PIN wiederholen'), '', 'password');
      if (f2) f2.input.setAttribute('inputmode', 'numeric');
      var err = h('div', { class: 'error' });
      function go() {
        var a = f.input.value.trim();
        if (!/^\d{4,8}$/.test(a)) { err.textContent = T('Bitte 4 bis 8 Ziffern eingeben.'); return; }
        if (!has) {
          if (f2.input.value.trim() !== a) { err.textContent = T('Die PINs stimmen nicht überein.'); return; }
          Settings.set('adminPin', pinHash(a));
        } else if (pinHash(a) !== Settings.get('adminPin')) {
          err.textContent = T('Falsche PIN.'); f.input.value = ''; return;
        }
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

  function makeProvider(p) {
    if (p.type === 'xtream') return XtreamProvider(p);
    if (p.type === 'm3u') return M3UProvider(p);
    return DemoProvider();
  }
  function pid() { return App.profile ? App.profile.id : 'none'; }
  function slim(item) {
    var o = {};
    ['kind', 'id', 'name', 'logo', 'backdrop', 'num', 'ext', 'url', 'catId', 'season', 'seriesId', 'seriesName', 'year', 'rating', 'plot', 'genre', 'duration'].forEach(function (k) {
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
      var a = this.all(); var k = this.key(item);
      if (!d || t < 30 || t > d - 60) delete a[k];
      else a[k] = { t: Math.floor(t), d: Math.floor(d), at: Date.now(), item: slim(item) };
      var keys = Object.keys(a).sort(function (x, y) { return a[y].at - a[x].at; });
      keys.slice(40).forEach(function (x) { delete a[x]; });
      Store.set('resume.' + pid(), a);
    },
    recent: function () { var a = this.all(); return Object.keys(a).map(function (k) { return a[k]; }).sort(function (x, y) { return y.at - x.at; }); },
    clear: function () { Store.del('resume.' + pid()); }
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
      if (!it || !it.id) return;
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
  function toast(msg, ms) {
    var t = h('div', { class: 'toast', text: msg });
    $('#toast-layer').appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 2500);
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
    move: function (dir) {
      var cur = document.activeElement;
      var list = this.candidates();
      if (!cur || list.indexOf(cur) < 0) { if (list[0]) this.focus(list[0]); return; }
      var a = cur.getBoundingClientRect();
      var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      var best = null, bestScore = Infinity;
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el === cur) continue;
        var b = el.getBoundingClientRect();
        var bx = b.left + b.width / 2, by = b.top + b.height / 2;
        var main, side, overlap;
        if (dir === 'right') { if (b.left < a.right - 2 && bx <= ax + 1) continue; main = b.left - a.right; side = Math.abs(by - ay); overlap = b.bottom > a.top && b.top < a.bottom; }
        else if (dir === 'left') { if (b.right > a.left + 2 && bx >= ax - 1) continue; main = a.left - b.right; side = Math.abs(by - ay); overlap = b.bottom > a.top && b.top < a.bottom; }
        else if (dir === 'down') { if (b.top < a.bottom - 2 && by <= ay + 1) continue; main = b.top - a.bottom; side = Math.abs(bx - ax); overlap = b.right > a.left && b.left < a.right; }
        else { if (b.bottom > a.top + 2 && by >= ay - 1) continue; main = a.top - b.bottom; side = Math.abs(bx - ax); overlap = b.right > a.left && b.left < a.right; }
        var score = Math.max(main, 0) + (overlap ? side * 0.1 : side * 2.5 + 200);
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (best) this.focus(best);
      return !!best;
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
      if (r.top < pr.top + pad) p.scrollTop -= (pr.top + pad - r.top);
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
    var i = h('img', { src: src, class: cls || '', loading: 'lazy', alt: '' });
    i.onerror = function () { if (onFail) onFail(i); else i.style.display = 'none'; };
    return i;
  }

  function logoBox(item) {
    var box = h('span', { class: 'logo-box' });
    var ph = h('span', { class: 'ph', text: initials(item.name) });
    if (item.logo) {
      box.appendChild(img(item.logo, '', function (i) { i.parentNode.replaceChild(ph, i); }));
    } else box.appendChild(ph);
    return box;
  }

  function posterArt(item, extra) {
    var art = h('span', { class: 'art' });
    var ph = h('span', { class: 'ph', style: 'background:' + gradientFor(item.name), text: item.name });
    if (item.logo) art.appendChild(img(item.logo, '', function (i) { i.parentNode.replaceChild(ph, i); }));
    else art.appendChild(ph);
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
    var cur = EpgCache.now(item);
    var row = h('button', { class: 'chan f', 'data-cid': item.id, onclick: onClick },
      h('span', { class: 'num', text: item.num ? String(item.num) : '' }),
      logoBox(item),
      h('span', { class: 'ch-txt' }, h('span', { class: 'name', text: item.name }), h('span', { class: 'now', text: cur ? cur.title : '' })),
      Favs.has(item) ? h('span', { class: 'fav', title: T('Favorit') }, icon('heartFill')) : null);
    if (onFocus) {
      row.addEventListener('focus', function () { onFocus(item); });
      row.addEventListener('mouseenter', function () { onFocus(item); });
    }
    return row;
  }

  /* Sender als Kachel (Startseite, Favoriten, Suche) */
  function chanTile(item, onClick) {
    var box = h('span', { class: 'ct-logo' });
    var ph = h('span', { class: 'ph', text: initials(item.name) });
    if (item.logo) box.appendChild(img(item.logo, '', function (i) { if (i.parentNode) i.parentNode.replaceChild(ph, i); }));
    else box.appendChild(ph);
    box.appendChild(h('span', { class: 'ct-live', text: 'LIVE' }));
    return h('button', { class: 'chan-tile f', title: item.name, onclick: onClick }, box, h('span', { class: 'ct-name', text: item.name }));
  }

  /* Film- oder Serien-Cover */
  function posterCard(item, onClick, opts) {
    opts = opts || {};
    var prog = opts.progress ? h('span', { class: 'prog' }, h('i', { style: 'width:' + Math.round(opts.progress * 100) + '%' })) : null;
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
    return h('button', { class: 'cw f k-' + (ep || it.kind === 'series' ? 'series' : it.kind === 'live' ? 'live' : 'movie') + (it.backdrop ? '' : ' is-poster'), title: title, onclick: function () { playItem(it, { list: [it], index: 0 }); } },
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
    scroller.addEventListener('scroll', function () {
      if (scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 600) more();
    });
    return { upTo: function (idx) { while (done <= idx && done < items.length) more(); } };
  }

  /* ==========================================================
     Startbildschirm: Profile / Playlists
     ========================================================== */
  function showProfiles() {
    var list = Profiles.list();
    if (!list.length) {
      var welcome = h('div', { class: 'profiles is-empty' }, heroArt(),
        h('div', { class: 'profiles-top' }, h('div', { class: 'brand' }, brandMark(), wordmark()), langButton()),
        h('div', { class: 'welcome' },
          h('div', { class: 'qr-hero' },
            qrBox(Device.portalLink(), 'big'),
            h('div', { class: 'qr-info' },
              h('h1', { text: T('Playlist hinzufügen') }),
              h('p', { class: 'lead', text: T('Scanne den QR-Code mit deinem Handy. Dort gibst du nur noch deinen M3U-Link oder Xtream-Zugang ein – die Playlist erscheint dann automatisch hier.') }),
              h('div', { class: 'id-box' },
                h('div', { class: 'id-row' }, h('span', { text: 'MAC' }), h('b', { text: Device.mac() }), copyBtn(Device.mac(), 'MAC')),
                h('div', { class: 'id-row' }, h('span', { text: 'KEY' }), h('b', { text: Device.key() }), copyBtn(Device.key(), 'KEY'))),
              h('p', { class: 'hint', text: T('Oder öffne diese Seite und gib MAC und KEY ein:') }),
              portalLinkBtn(),
              h('div', { class: 'row small-actions' },
                h('button', { class: 'btn small ghost f', onclick: showAddProfile, 'data-autofocus': true }, icon('plus'), h('span', { text: T('M3U oder Xtream hier eingeben') })))))));
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

  function showAddProfile() {
    var mode = 'xtream';
    var err = h('div', { class: 'error' });
    var fName = inputField(T('Name (frei wählbar)'), T('z. B. Wohnzimmer'), 'text');
    var fServer = inputField(T('Server-Adresse'), 'http://beispiel.de:8080', 'url');
    var fUser = inputField(T('Benutzername'), '', 'text');
    var fPass = inputField(T('Passwort'), '', 'password');
    var fUrl = inputField(T('M3U-Link'), 'http://…/playlist.m3u', 'url');
    var xBox = h('div', { class: 'form-sub' }, fServer.wrap, fUser.wrap, fPass.wrap,
      h('p', { class: 'hint', text: T('Tipp: Du kannst auch einen kompletten Link (…/get.php?username=…&password=…) in das Feld „Server-Adresse“ einfügen.') }));
    var mBox = h('div', { class: 'form-sub', style: 'display:none' }, fUrl.wrap,
      h('p', { class: 'hint', text: T('Funktioniert mit jeder .m3u oder .m3u8 Playlist-Adresse.') }));
    var tX = h('button', { class: 'btn f is-on', onclick: function () { setMode('xtream'); } }, T('Xtream Codes'));
    var tM = h('button', { class: 'btn f', onclick: function () { setMode('m3u'); } }, T('M3U-Link'));
    function setMode(m) {
      mode = m;
      tX.classList.toggle('is-on', m === 'xtream'); tM.classList.toggle('is-on', m === 'm3u');
      xBox.style.display = m === 'xtream' ? '' : 'none'; mBox.style.display = m === 'm3u' ? '' : 'none';
      err.textContent = '';
    }
    var saveBtn = h('button', { class: 'btn f primary', onclick: save }, T('Speichern & verbinden'));

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
        if (xl) { p = { type: 'xtream', server: xl.server, username: xl.username, password: xl.password }; toast(T('Als Xtream-Zugang erkannt – mit Kategorien, Serien und EPG')); }
        else p = { type: 'm3u', url: u };
      }
      p.name = name || (p.type === 'xtream' ? p.username : T('Meine Playlist'));
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
        fName.wrap, xBox, mBox, err,
        h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn f ghost', onclick: goBack }, T('Abbrechen'))),
        h('p', { class: 'hint', text: T('Diese App enthält keine Sender oder Inhalte. Du benötigst einen eigenen Zugang von deinem Anbieter.') })));
    Screens.push('add', el);
    setTimeout(function () { Nav.focus(tX); }, 30);
  }

  function inputField(label, ph, type) {
    var input = h('input', { class: 'f', type: type, placeholder: ph || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    return { input: input, wrap: h('label', { class: 'field' }, h('span', { text: label }), input) };
  }

  function activateProfile(p, isNew, restore) {
    App.profile = p;
    App.provider = makeProvider(p);
    Store.set('active', p.id);
    if (isNew || p.type === 'demo') { Shell.open(); Expiry.check(); return; }
    // Kurz prüfen, ob der Zugang noch funktioniert – die Startseite erscheint trotzdem sofort
    Shell.open(restore);
    App.provider.login().catch(function (e) { toast(T('Hinweis: {0}', e.message), 4000); });
    Expiry.check();
  }

  /* ==========================================================
     Hauptansicht mit Seitenleiste
     ========================================================== */
  var Shell = {
    el: null, view: null, current: null, buttons: {}, pendingFocus: null,
    open: function (restore) {
      var self = this;
      self.buttons = {};
      self.view = h('div', { class: 'view' });
      var tabs = h('nav', { class: 'main-tabs', 'aria-label': T('Hauptmenü') });
      [['home', T('Start'), 'home'], ['live', T('Live TV'), 'live'], ['movie', T('Filme'), 'movie'], ['series', T('Serien'), 'series']].forEach(function (it) {
        var b = h('button', { class: 'tab f k-' + it[0] + (it[0] === 'home' ? ' tab-home' : ''), title: it[1], 'aria-label': it[1], onclick: function () { self.show(it[0], true); } }, icon(it[2]), h('span', { text: it[1] }));
        self.buttons[it[0]] = b;
        tabs.appendChild(b);
      });
      function tool(name, label, ic) {
        var b = h('button', { class: 'icon-btn f', title: label, 'aria-label': label, onclick: function () { self.show(name, true); } }, icon(ic || name));
        self.buttons[name] = b;
        return b;
      }
      var searchBtn = h('button', { class: 'icon-btn f', title: T('Suche'), 'aria-label': T('Suche'), onclick: function () { QuickSearch.toggle(); } }, icon('search'));
      var head = h('header', { class: 'topnav' },
        h('div', { class: 'brand' }, brandMark(), wordmark()),
        tabs,
        h('div', { class: 'top-tools' }, searchBtn, tool('favs', T('Favoriten'), 'heart'), tool('settings', T('Einstellungen')), tool('profile', T('Profil'))));
      var runTime = h('div', { class: 'mac-tag sb-days' });
      App.provider.account().then(function (a) {
        if (!a || a.expires === undefined) return;
        var d = a.expires ? Math.ceil((Number(a.expires) * 1000 - Date.now()) / 86400000) : null;
        var txt = d === null ? T('unbegrenzt') : d <= 0 ? T('abgelaufen') : d === 1 ? T('1 Tag') : T('{0} Tage', d);
        runTime.appendChild(h('span', { text: T('Laufzeit') }));
        runTime.appendChild(h('b', { text: txt }));
        if (d !== null && d <= 30) runTime.classList.add(d <= 0 ? 'is-expired' : 'is-warn');
      }).catch(function () {});
      self.el = h('div', { class: 'shell' }, head, h('main', { class: 'content' }, self.view), h('footer', { class: 'statusbar' }, macTag(profileUser(App.profile)), runTime));
      QuickSearch.build(self.el, searchBtn);
      Screens.reset('shell', self.el, {
        onBack: function () {
          if (QuickSearch.isOpen) { QuickSearch.close(); return true; }
          if (self.viewBack && self.viewBack() === true) return true;
          if (self.current !== 'home') { self.show('home', true); return true; }
          return false;
        },
        onShow: function () { if (self.current === 'home') self.show('home', false, true); }
      });
      self.show('home');
      if (restore) self.restoreLast();
    },
    /* Beim App-Start dort weitermachen, wo man aufgehört hat */
    restoreLast: function () {
      var r = Last.get();
      if (!r || !r.item || Date.now() - r.at > 30 * 86400000) return;
      var it = r.item, kind = it.kind === 'live' ? 'live' : it.kind === 'series' ? 'series' : it.kind === 'movie' ? 'movie' : null;
      if (!kind) return;
      if (it.catId) lastCat[pid() + kind] = String(it.catId);
      this.pendingFocus = { kind: kind, id: it.id };
      this.show(kind, false);
      if (kind === 'movie') setTimeout(function () { showMovie(it); }, 150);
      if (kind === 'series') setTimeout(function () { showSeries(it); }, 150);
    },
    show: function (name, focusContent, keepFocus) {
      var self = this;
      self.current = name;
      // Mini-Player beenden, wenn man zu Filmen oder Serien wechselt
      if ((name === 'movie' || name === 'series') && Player.mini) Player.close();
      Object.keys(self.buttons).forEach(function (k) { self.buttons[k].classList.toggle('is-on', k === name); });
      self.viewBack = null;
      clear(self.view);
      var view;
      if (name === 'home') view = HomeView();
      else if (name === 'search') view = SearchView();
      else if (name === 'settings') view = SettingsView();
      else if (name === 'profile') view = ProfileView();
      else if (name === 'favs') view = FavoritesView();
      else view = SectionView(name);
      self.view.appendChild(view);
      if (keepFocus) return;
      setTimeout(function () {
        if (focusContent || !document.activeElement || document.activeElement === document.body) Nav.focusFirst(self.view);
      }, 30);
    }
  };

  var INPUT = { mode: 'key' };

  /* ---------- Gemeinsame Listen (Start, Suche, Empfehlungen) ---------- */
  var searchCache = {}, homeCache = {};
  /* Alle Einträge einer Art (für die Suche) */
  function allItems(kind) {
    var k = pid() + kind;
    if (!searchCache[k]) { searchCache[k] = App.provider.items(kind, '__all'); searchCache[k].catch(function () { delete searchCache[k]; }); }
    return searchCache[k];
  }
  /* Sprache der Filme und Serien auf der Startseite: frei wählbar (pro Playlist), sonst die App-Sprache */
  function homeLang() { return Settings.get('homeLang.' + pid()) || Lang.cur; }
  function pickGroup(groups) {
    if (!groups) return null;
    var want = homeLang(), g = groups.filter(function (x) { return x.key === want; })[0];
    return g || groups.filter(function (x) { return x.key !== '_'; })[0] || null;
  }
  /* Auswahl für die Startseite: bei Xtream nur die ersten Kategorien (schnell, auch auf schwachen Geräten).
     Sind die Kategorien nach Sprachen benannt, kommen nur Filme/Serien der gewählten Sprache. */
  function sampleItems(kind) {
    var k = pid() + kind + '|' + homeLang();
    if (homeCache[k]) return homeCache[k];
    var prov = App.provider;
    var pr = prov.categories(kind).then(function (cats) {
      cats = cats || [];
      var mine = pickGroup(groupCats(cats));
      if (prov.type === 'xtream') {
        return Promise.all((mine ? mine.cats : cats).slice(0, 3).map(function (c) { return prov.items(kind, c.id).catch(function () { return []; }); }))
          .then(function (lists) {
            var seen = {}, out = [];
            lists.forEach(function (l) { l.forEach(function (x) { if (!seen[x.id]) { seen[x.id] = 1; out.push(x); } }); });
            return out;
          });
      }
      return prov.items(kind, '__all').then(function (all) {
        if (!mine) return all;
        var ids = {};
        mine.cats.forEach(function (c) { ids[c.id] = 1; });
        return all.filter(function (x) { return ids[x.catId]; });
      });
    });
    homeCache[k] = pr;
    pr.catch(function () { delete homeCache[k]; });
    return pr;
  }
  function byAdded(a, b) { return Number(b.added || 0) - Number(a.added || 0); }
  function byRating(a, b) { return Number(b.rating || 0) - Number(a.rating || 0); }
  function some(list, fn) { for (var i = 0; i < list.length; i++) if (fn(list[i])) return true; return false; }
  function daySeed(s) { var d = new Date(); return hashCode(s + '|' + d.getFullYear() + d.getMonth() + d.getDate()); }

  /* Empfehlungen: aus den Kategorien, die du schaust oder gemerkt hast – täglich neu gemischt */
  function recommendations(exclude) {
    var cats = { movie: [], series: [] };
    function addCat(kind, id) { if (id && cats[kind].indexOf(id) < 0) cats[kind].push(id); }
    Resume.recent().forEach(function (r) { if (r.item.kind === 'movie') addCat('movie', r.item.catId); });
    Favs.list('movie').forEach(function (x) { addCat('movie', x.catId); });
    Favs.list('series').forEach(function (x) { addCat('series', x.catId); });
    var jobs = [];
    cats.movie.slice(0, 2).forEach(function (c) { jobs.push(App.provider.items('movie', c).catch(function () { return []; })); });
    cats.series.slice(0, 1).forEach(function (c) { jobs.push(App.provider.items('series', c).catch(function () { return []; })); });
    if (!jobs.length) jobs = [sampleItems('movie').catch(function () { return []; }), sampleItems('series').catch(function () { return []; })];
    var skip = {};
    Object.keys(exclude).forEach(function (k) { skip[k] = 1; });
    Resume.recent().forEach(function (r) { skip[r.item.kind + r.item.id] = 1; });
    Favs.list('movie').concat(Favs.list('series')).forEach(function (x) { skip[x.kind + x.id] = 1; });
    return Promise.all(jobs).then(function (lists) {
      var pool = [];
      lists.forEach(function (l) { l.forEach(function (x) { var k = x.kind + x.id; if (skip[k]) return; skip[k] = 1; pool.push(x); }); });
      var scored = pool.map(function (x) { return { x: x, s: (Number(x.rating) || 5) + (daySeed(x.id) % 1000) / 250 }; });
      scored.sort(function (a, b) { return b.s - a.s; });
      return scored.slice(0, 18).map(function (o) { return o.x; });
    });
  }

  /* Auswahl „Filme & Serien auf: Deutsch / Türkisch / …“ – erscheint nur, wenn die Playlist Sprachen kennt */
  function homeLangBar() {
    var bar = h('div', { class: 'home-lang' });
    App.provider.categories('movie').then(function (cats) {
      var groups = groupCats(cats || []), cur = pickGroup(groups);
      if (!groups || !cur) return;
      bar.appendChild(h('span', { class: 'hl-label', text: T('Filme & Serien auf') }));
      groups.filter(function (g) { return g.key !== '_'; }).slice(0, 8).forEach(function (g) {
        var b = h('button', { class: 'hl-chip f' + (g === cur ? ' is-on' : ''), title: g.name, 'data-k': g.key, onclick: function () {
          if (g === cur) return;
          Settings.set('homeLang.' + pid(), g.key);
          Shell.show('home', false, true);
          setTimeout(function () { var nb = $('.hl-chip[data-k="' + g.key + '"]'); if (nb) Nav.focus(nb); }, 80);
        } }, h('span', { class: 'lc-code', text: g.code }), h('span', { text: g.name }));
        bar.appendChild(b);
      });
    }).catch(function () {});
    return bar;
  }

  /* ---------- Startseite ---------- */
  function HomeView() {
    var p = App.profile, season = Season.current();
    var status = h('span', { class: 'hero-status' }, h('i', { class: 'dot' }), h('span', { text: p.type === 'demo' ? T('Demo-Modus') : p.name }));
    App.provider.account().then(function (a) {
      if (!a || !a.expires) return;
      var days = Math.ceil((Number(a.expires) * 1000 - Date.now()) / 86400000);
      if (days <= 0) { status.classList.add('is-off'); status.lastChild.textContent = T('{0} – abgelaufen am {1}', p.name, fmtDate(a.expires)); }
      else if (days <= 30) { status.classList.add('is-warn'); status.lastChild.textContent = days === 1 ? T('{0} – läuft in 1 Tag ab', p.name) : T('{0} – läuft in {1} Tagen ab', p.name, days); }
      else status.lastChild.textContent = T('{0} – gültig bis {1}', p.name, fmtDate(a.expires));
    }).catch(function () { status.classList.add('is-off'); status.lastChild.textContent = T('{0} – keine Verbindung', p.name); });
    var hero = h('section', { class: 'hero' }, heroArt(),
      h('div', { class: 'hero-in' },
        status,
        h('h1', { class: 'hero-title' },
          h('span', { class: 'hero-kicker', text: season ? T(SEASONS[season].greet) : T('Willkommen bei') }),
          wordmark()),
        h('p', { class: 'hero-sub', text: p.type === 'demo' ? T('Probiere die App mit freien Test-Videos aus.') : T('Dein Licht für Live TV, Filme und Serien.') }),
        homeLangBar()));
    var rows = h('div', { class: 'rows' });
    var el = h('div', { class: 'page home' }, hero, rows);

    function rail(title, kids, moreKind, kind) {
      var track = h('div', { class: 'rail-track' }, kids);
      if (moreKind) track.appendChild(h('button', { class: 'more-card f', onclick: function () { Shell.show(moreKind, true); } }, icon('arrowR'), h('span', { text: T('Mehr anzeigen') })));
      kind = kind || moreKind;
      return h('section', { class: 'rail' + (kind ? ' k-' + kind : '') }, h('h2', null, kind ? icon(kind) : null, h('span', { text: title })), track);
    }
    function asyncRail(title, pr, build) {
      var kids = [];
      for (var i = 0; i < 8; i++) kids.push(h('span', { class: 'sk poster-sk' }));
      var sk = rail(title, kids);
      rows.appendChild(sk);
      pr.then(function (res) {
        if (!sk.parentNode) return;
        var r = build(res || []);
        if (r) rows.replaceChild(r, sk); else rows.removeChild(sk);
      }, function () { if (sk.parentNode) rows.removeChild(sk); });
    }

    var resume = Resume.recent().slice(0, 12);
    if (resume.length) rows.appendChild(rail(T('Weiterschauen'), resume.map(continueCard)));
    var recent = Recent.list();
    if (recent.length) rows.appendChild(rail(T('Zuletzt gesehene Sender'), recent.map(function (it, i) { return chanTile(it, function () { playItem(it, { list: recent, index: i }); }); }), null, 'live'));

    var shown = {};
    var moviesP = sampleItems('movie'), seriesP = sampleItems('series');
    asyncRail(T('Top bewertet'), moviesP, function (list) {
      if (!list.length) return null;
      var fresh = some(list, function (x) { return Number(x.added) > 0; });
      var rated = some(list, function (x) { return Number(x.rating) > 0; });
      var pool = list.slice();
      if (fresh) pool = pool.sort(byAdded).slice(0, 300);
      if (rated) pool.sort(byRating);
      var top = pool.slice(0, 18);
      top.forEach(function (x) { shown[x.kind + x.id] = 1; });
      // Echte Zuschauerzahlen gibt es nicht – sortiert wird nach der Bewertung, die der Anbieter mitschickt
      return rail(rated ? T('Top bewertet') : (fresh ? T('Neue Filme') : T('Filme')), top.map(function (it) { return posterCard(it, function () { openItem(it); }); }), 'movie');
    });
    asyncRail(T('Neue Serien'), seriesP, function (list) {
      if (!list.length) return null;
      var fresh = some(list, function (x) { return Number(x.added) > 0; });
      var pool = list.slice();
      if (fresh) pool.sort(byAdded);
      var top = pool.slice(0, 18);
      top.forEach(function (x) { shown[x.kind + x.id] = 1; });
      return rail(fresh ? T('Neue Serien') : T('Serien'), top.map(function (it) { return posterCard(it, function () { openItem(it); }); }), 'series');
    });
    asyncRail(T('Empfehlungen für dich'), Promise.all([moviesP.catch(function () { return []; }), seriesP.catch(function () { return []; })]).then(function () { return recommendations(shown); }), function (list) {
      if (!list.length) return null;
      return rail(T('Empfehlungen für dich'), list.map(function (it) { return posterCard(it, function () { openItem(it); }); }));
    });
    return el;
  }

  /* ---------- Kategorien nach Sprache ordnen ----------
     Viele Anbieter schreiben die Sprache vor den Namen, z. B. „TR ⚡ AKSİYON“ oder „DE | Action“.
     Wird das erkannt, zeigt die App zuerst die Sprachen und darin die Kategorien (ohne das Kürzel). */
  var LANG_CODES = {
    de: 'DE GER DEU DEUTSCH DEUTSCHLAND GERMAN GERMANY AT AUT AUSTRIA OSTERREICH CH',
    en: 'EN ENG ENGLISH UK GB US USA',
    tr: 'TR TUR TURK TURKEY TURKISH TURKIYE TURKCE',
    fr: 'FR FRA FRENCH FRANCE',
    it: 'IT ITA ITALY ITALIA',
    es: 'ES ESP SPAIN ESPANA SPANISH LAT LATINO',
    nl: 'NL NLD NED DUTCH NEDERLAND',
    pl: 'PL POL POLSKA POLISH',
    pt: 'PT POR PORTUGAL BR BRA BRASIL BRAZIL',
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
    az: 'AZ AZE AZERBAIJAN'
  };
  var LANG_NAMES = {
    de: 'Deutsch', en: 'Englisch', tr: 'Türkisch', fr: 'Französisch', it: 'Italienisch', es: 'Spanisch',
    nl: 'Niederländisch', pl: 'Polnisch', pt: 'Portugiesisch', ar: 'Arabisch', ru: 'Russisch', ua: 'Ukrainisch',
    ku: 'Kurdisch', al: 'Albanisch', bg: 'Bulgarisch', ro: 'Rumänisch', gr: 'Griechisch', yu: 'Ex-Jugoslawien',
    se: 'Schwedisch', no: 'Norwegisch', dk: 'Dänisch', fi: 'Finnisch', hu: 'Ungarisch', cz: 'Tschechisch',
    sk: 'Slowakisch', 'in': 'Indisch', fa: 'Persisch', az: 'Aserbaidschanisch'
  };
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
      g.cats.push({ id: c.id, name: r ? r.label : c.name, full: c.name });
    });
    if (groups.filter(function (g) { return g.key !== '_'; }).length < 2 || tagged < list.length * 0.4) return null;
    // Sprache der App zuerst, „Weitere“ zuletzt, sonst wie beim Anbieter sortiert
    function rank(g) { return g.key === Lang.cur ? -1 : g.key === '_' ? 1e6 : g.ord; }
    groups.sort(function (a, b) { return rank(a) - rank(b); });
    return groups;
  }

  /* Anzahl der Einträge je Kategorie (aus der Gesamtliste, die beim Anbieter ohnehin zwischengespeichert wird) */
  var countCache = {};
  function catCounts(kind) {
    var k = pid() + kind;
    if (!countCache[k]) {
      countCache[k] = App.provider.items(kind, '__all').then(function (list) {
        var by = {};
        list.forEach(function (x) { var c = String(x.catId); by[c] = (by[c] || 0) + 1; });
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
    var titles = { live: T('Live TV'), movie: T('Filme'), series: T('Serien') };
    var allNames = { live: T('Alle Sender'), movie: T('Alle Filme'), series: T('Alle Serien') };
    var count = h('span', { class: 'count' });
    var cats = h('div', { class: 'cats' });
    var items = h('div', { class: 'items' }, loader());
    var panel = kind === 'live' ? LivePanel() : null;
    var el = h('div', { class: 'section section-' + kind + ' k-' + kind },
      h('div', { class: 'section-head' }, h('h1', null, icon(kind), h('span', { text: titles[kind] })), count),
      h('div', { class: 'section-body' }, cats, items, panel ? panel.el : null));
    var key = pid() + kind;
    var allCat = { id: '__all', name: allNames[kind] };
    var groups = null, curGroup = null, activeId = null, req = 0, counts = null;
    // Zahlen hinter Sprachen und Kategorien: bei einer Sprache alle Einträge dieser Sprache, sonst je Kategorie
    function paintCounts() {
      if (!counts) return;
      for (var i = 0; i < cats.children.length; i++) {
        var b = cats.children[i], n = null, slot = b.querySelector('.lc-n');
        if (!slot) continue;
        if (b._group) { n = 0; b._group.cats.forEach(function (c) { n += counts.by[c.id] || 0; }); }
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
      var b = h('button', { class: 'cat f has-n', title: c.full || c.name }, h('span', { class: 'cat-name', text: c.name }), h('span', { class: 'lc-n' }));
      b._cat = c;
      b.addEventListener('click', function () { selectCat(c, true); });
      return b;
    }
    function langBtn(g) {
      var b = h('button', { class: 'cat lang-cat f', title: g.name },
        h('span', { class: 'lc-code', text: g.code || '…' }), h('span', { class: 'lc-name', text: g.name }),
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
        icon('back'), h('span', { class: 'lc-code', text: g.code || '…' }), h('span', { class: 'lc-name', text: g.name }));
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
    Shell.viewBack = function () {
      if (curGroup && document.body.contains(el)) { showLanguages(curGroup); return true; }
      return false;
    };

    function selectCat(cat, focusList) {
      lastCat[key] = cat.id;
      activeId = cat.id;
      markActive();
      var my = ++req;
      clear(items).appendChild(loader());
      count.textContent = '';
      App.provider.items(kind, cat.id).then(function (list) {
        if (my !== req) return;
        // „Alle Filme/Serien“: die neuesten zuerst
        if (cat.id === '__all' && kind !== 'live' && some(list, function (x) { return Number(x.added) > 0; })) list = list.slice().sort(byAdded);
        clear(items);
        items.scrollTop = 0;
        count.textContent = String(list.length);
        if (!list.length) { items.appendChild(stateBox(T('Keine Einträge'), T('In dieser Kategorie ist gerade nichts enthalten.'))); return; }
        var box = h('div', { class: kind === 'live' ? 'chan-list' : 'poster-grid' });
        items.appendChild(box);
        var rc = renderChunked(box, items, list, function (it, i) {
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
      list = list || [];
      var want = lastCat[key], target = null;
      groups = groupCats(list);
      if (!groups) {
        // Keine Sprachen erkannt: alle Kategorien untereinander wie bisher
        var all = [allCat].concat(list);
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
    var epg = h('div', { class: 'lp-epg' });
    var el = h('aside', { class: 'live-panel' }, box,
      h('p', { class: 'lp-hint', text: T('Denselben Sender noch einmal wählen öffnet das Vollbild.') }), name, epg);
    var cur = null, timer = null;
    function show(item) {
      if (!item || (cur && cur.id === item.id)) return;
      cur = item;
      clear(ph).appendChild(logoBox(item));
      ph.appendChild(h('span', null, icon('play'), T('Zum Abspielen auswählen')));
      name.textContent = item.name;
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
      self.btn = btn;
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
      var nav = this.btn.closest ? this.btn.closest('.topnav').getBoundingClientRect() : { right: 0, bottom: r.bottom };
      var st = this.el.style, ps = this.pop.style;
      st.left = st.right = ps.left = ps.right = 'auto';
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
    open: function () {
      var self = this;
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
    toggle: function () { if (this.isOpen) this.close(); else this.open(); },
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
          var all = list.filter(function (x) { return norm(x.name).indexOf(q) >= 0; });
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

  /* ---------- Suche (ganze Seite, wird nicht mehr über das Menü geöffnet) ---------- */
  function SearchView() {
    var input = h('input', { class: 'f', type: 'search', placeholder: T('Sender, Filme oder Serien suchen …'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'data-autofocus': '', 'aria-label': T('Suche') });
    var results = h('div', { class: 'results' });
    var timer = null;
    function hint() { clear(results).appendChild(h('p', { class: 'hint', text: T('Gib mindestens zwei Buchstaben ein. Gesucht wird in allen Sendern, Filmen und Serien deiner Playlist.') })); }
    function run() {
      var q = norm(input.value.trim());
      if (q.length < 2) { hint(); return; }
      clear(results).appendChild(loader());
      Promise.all(['live', 'movie', 'series'].map(function (k) { return allItems(k).catch(function () { return []; }); })).then(function (lists) {
        if (norm(input.value.trim()) !== q) return;
        clear(results);
        var labels = [T('Sender'), T('Filme'), T('Serien')], kinds = ['live', 'movie', 'series'], total = 0;
        lists.forEach(function (list, i) {
          var hits = list.filter(function (x) { return norm(x.name).indexOf(q) >= 0; }).slice(0, 60);
          total += hits.length;
          if (!hits.length) return;
          var box = h('div', { class: i === 0 ? 'tile-grid' : 'poster-grid' });
          hits.forEach(function (it, j) {
            box.appendChild(i === 0 ? chanTile(it, function () { playItem(it, { list: hits, index: j }); }) : posterCard(it, function () { openItem(it); }));
          });
          results.appendChild(h('section', { class: 'k-' + kinds[i] }, h('h2', null, icon(kinds[i]), h('span', { text: labels[i] }), h('small', { text: String(hits.length) })), box));
        });
        if (!total) results.appendChild(stateBox(T('Nichts gefunden'), T('Prüfe die Schreibweise oder versuche einen kürzeren Begriff.')));
      });
    }
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 400); });
    input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { clearTimeout(timer); run(); } });
    hint();
    return h('div', { class: 'page search' },
      h('div', { class: 'page-head' }, h('h1', { text: T('Suche') })),
      h('label', { class: 'search-box' }, icon('search'), input),
      results);
  }

  /* ---------- Einstellungen ---------- */
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
        panel('phone', T('Dieses Gerät'), [dev, h('p', { class: 'hint', text: T('Mit MAC-Adresse und KEY kannst du Playlists per Handy oder über die Webseite auf dieses Gerät schicken.') })])));
  }

  function SettingsView() {
    var p = App.profile;
    var fmtRow = null;
    if (p.type === 'xtream') {
      var seg = h('div', { class: 'seg' });
      var bH = h('button', { class: 'btn f' }, 'HLS (.m3u8)');
      var bT = h('button', { class: 'btn f' }, 'MPEG-TS (.ts)');
      seg.appendChild(bH); seg.appendChild(bT);
      var paint = function () { var v = Settings.get('liveFormat'); bH.classList.toggle('is-on', v !== 'ts'); bT.classList.toggle('is-on', v === 'ts'); };
      bH.onclick = function () { Settings.set('liveFormat', 'm3u8'); paint(); toast(T('Live-Format: HLS')); };
      bT.onclick = function () { Settings.set('liveFormat', 'ts'); paint(); toast(T('Live-Format: MPEG-TS')); };
      paint();
      fmtRow = panel('live', T('Live-Stream-Format'), [seg,
        h('p', { class: 'hint', text: T('Wenn Sender nicht starten, probiere das andere Format. HLS funktioniert auf den meisten Geräten am besten.') })]);
    }

    var idleSeg = h('div', { class: 'seg' });
    var idleBtns = [[0, T('Aus')], [2, T('{0} Std.', 2)], [3, T('{0} Std.', 3)], [4, T('{0} Std.', 4)]].map(function (o) {
      var b = h('button', { class: 'btn f', onclick: function () { Settings.set('idleHours', o[0]); paintIdle(); } }, o[1]);
      idleSeg.appendChild(b);
      return [o[0], b];
    });
    function paintIdle() { var v = StillWatching.hours(); idleBtns.forEach(function (x) { x[1].classList.toggle('is-on', x[0] === v); }); }
    paintIdle();

    return h('div', { class: 'page settings' },
      h('div', { class: 'page-head' }, h('h1', { text: T('Einstellungen') })),
      h('div', { class: 'settings-grid' },
        panel('profile', T('Profil'), [
          h('p', { class: 'hint', text: T('Zugangsdaten, Ablaufdatum und Geräte-Kennung findest du auf deiner Profilseite.') }),
          h('div', { class: 'row' },
            h('button', { class: 'btn f primary', onclick: function () { Shell.show('profile', true); }, 'data-autofocus': true }, icon('profile'), h('span', { text: T('Profil öffnen') })),
            h('button', { class: 'btn f', onclick: showProfiles }, icon('restart'), h('span', { text: T('Playlist wechseln') })))]),
        appearancePanel(),
        panel('globe', T('Sprache'), [h('div', { class: 'row' }, langButton()),
          h('p', { class: 'hint', text: T('Deutsch ist voreingestellt. Drücke auf die Sprache, um sie zu ändern.') })]),
        h('div', { class: 'panel wide' }, remotePanel()),
        fmtRow,
        panel('play', T('Schaust du noch?'), [idleSeg,
          h('p', { class: 'hint', text: T('Wie bei Netflix: Wurde so lange keine Taste gedrückt, fragt die App nach. Ohne Antwort stoppt die Wiedergabe nach einer Minute – das hält deinen Zugang frei.') })]),
        panel('history', T('Verlauf'), [
          h('p', { class: 'hint', text: T('„Weiterschauen“ und „Zuletzt gesehene Sender“ auf diesem Gerät.') }),
          h('div', { class: 'row' },
            h('button', { class: 'btn f', onclick: function () { confirmBox(T('Verlauf löschen?'), T('„Weiterschauen“ und „Zuletzt gesehene Sender“ werden geleert.'), T('Löschen'), function () { Resume.clear(); Store.del('recent.' + pid()); toast(T('Verlauf gelöscht')); }); } }, icon('trash'), h('span', { text: T('Verlauf löschen') })))]),
        panel('info', T('Über'), [
          h('button', { class: 'about-version f', onclick: function () { Admin.tap(); } }, CONFIG.appName + ' ' + CONFIG.version),
          h('p', { class: 'hint', text: T('Dieser Player enthält keine Inhalte. Du bist selbst dafür verantwortlich, nur Streams zu nutzen, für die du eine Berechtigung hast. Datenschutz und Impressum: splix66.github.io/lumio-player') })])));
  }

  /* ==========================================================
     Detailseite: Film oder Serie
     ========================================================== */
  function openItem(item) {
    if (item.kind === 'movie') return showMovie(item);
    if (item.kind === 'series') return showSeries(item);
    if (item.kind === 'episode') return playItem(item, { list: [item], index: 0 });
    return playItem(item, { list: [item], index: 0 });
  }

  function detailFrame(item) {
    var bg = h('div', { class: 'd-bg' });
    if (item.logo) bg.style.backgroundImage = 'url("' + String(item.logo).replace(/"/g, '%22') + '")';
    var top = h('div', { class: 'd-hero' }, bg);
    var info = h('div', { class: 'detail-info' }, h('h1', { text: item.name }));
    var main = h('div', { class: 'detail-main' }, h('div', { class: 'poster' }, posterArt(item)), info);
    var close = h('button', { class: 'd-close f', title: T('Schließen'), onclick: goBack }, icon('close'), h('span', { text: T('Schließen') }));
    var panel = h('div', { class: 'detail modal-panel' }, top, main);
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
      if (d.director || d.cast) f.info.appendChild(h('p', { class: 'credits', text: [d.director ? T('Regie: {0}', d.director) : '', d.cast ? T('Mit: {0}', d.cast) : ''].filter(Boolean).join('. ') }));
      if (d.backdrop) { item.backdrop = d.backdrop; f.setBackdrop(d.backdrop); }
    }).catch(function () {});
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
            r ? h('span', { class: 'seen' }, h('i', { style: 'width:' + Math.round(r.t / r.d * 100) + '%' })) : null),
          h('span', { class: 't' }, h('b', { text: ep.name }), ep.plot || ep.duration ? h('small', { text: [ep.duration ? String(ep.duration).replace(/^00:/, '') : '', ep.plot].filter(Boolean).join(' – ') }) : null),
          h('span', { class: 'play-i' }, icon('play'))));
      });
    }
    function paintContinue() {
      if (continueBtn && continueBtn.parentNode) continueBtn.parentNode.removeChild(continueBtn);
      var last = Resume.recent().filter(function (r) { return r.item.kind === 'episode' && r.item.seriesId === item.id; })[0];
      var target = last ? last.item : (seasons[0] && seasons[0].episodes[0]);
      if (!target) return;
      var label = last ? T('Weiter: S{0} E{1}', target.season, target.num) : T('Folge 1 abspielen');
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
      seasons = (d && d.seasons) || [];
      if (!seasons.length) { clear(epBox).appendChild(stateBox(T('Keine Folgen gefunden'), null)); return; }
      seasons.forEach(function (s) {
        seasonsBar.appendChild(h('button', { class: 'btn f', 'data-s': s.num, onclick: function () { renderEpisodes(s); } }, T('Staffel {0}', s.num)));
      });
      renderEpisodes(seasons[0]);
      paintContinue();
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
  function ensureHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsLoading) {
      hlsLoading = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = CONFIG.hlsCdn;
        s.onload = function () { resolve(window.Hls || null); };
        s.onerror = function () { resolve(null); };
        document.head.appendChild(s);
      });
    }
    return hlsLoading;
  }
  function isHlsUrl(u) { return /\.m3u8(\?|$)/i.test(u) || /\/hls\//i.test(u) || /\.ism\/\.m3u8/i.test(u); }

  function playItem(item, ctx) {
    ctx = ctx || { list: [item], index: 0 };
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
      self.info = h('div', { class: 'epg' });
      self.bar = h('div', { class: 'bar' }, h('i', { style: 'width:0%' }));
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
      self.osd = h('div', { class: 'osd' },
        h('div', { class: 'osd-top' }, h('button', { class: 'btn f', onclick: goBack }, icon('back'), h('span', { text: T('Zurück') })), self.liveTag, self.title),
        h('div', { class: 'osd-bottom' }, self.info, self.barWrap, self.times,
          h('div', { class: 'ctrl-row' }, self.ctrlLeft, self.ctrls, h('div', { class: 'ctrl-side right' }, self.volumeUi()))));
      self.miniTitle = h('span', { class: 'mini-title' });
      self.miniUi = h('div', { class: 'mini-ui' },
        h('button', { class: 'mini-open f', title: T('Vollbild'), onclick: function () { self.maximize(); } }, self.miniTitle),
        self.miniMute = h('button', { class: 'mini-mute f', title: T('Ton an/aus'), 'aria-label': T('Ton an/aus'), onclick: function () { self.setMuted(!self.video.muted); } }),
        h('button', { class: 'mini-close f', title: T('Schließen'), onclick: function () { self.close(); } }, icon('close')));
      self.el = h('div', { class: 'player' }, video, self.spinner, self.osd, self.zap, self.err, self.miniUi);
      self.paintVol();

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
      self.el.addEventListener('click', function (e) { if (e.target === video || e.target === self.osd) self.toggleOsd(); });
      self.el.addEventListener('mousemove', function () { self.showOsd(); });
      // Mausrad = Lautstärke (PC)
      self.el.addEventListener('wheel', function (e) {
        if (self.mini) return;
        e.preventDefault();
        self.setVolume(self.video.volume + (e.deltaY < 0 ? 0.05 : -0.05));
        self.showOsd();
      }, { passive: false });

      video.addEventListener('waiting', function () { self.loadTxt.textContent = T('Wird geladen …'); self.spinner.style.display = ''; });
      video.addEventListener('playing', function () { self.spinner.style.display = 'none'; self.err.style.display = 'none'; self.paintCtrls(); });
      video.addEventListener('pause', function () { self.paintCtrls(); self.showOsd(true); });
      video.addEventListener('loadedmetadata', function () {
        if (self.isVod() && self.resumeAt) { try { video.currentTime = self.resumeAt; } catch (e) {} toast(T('Fortgesetzt bei {0}', fmtTime(self.resumeAt))); self.resumeAt = 0; }
      });
      video.addEventListener('timeupdate', function () { self.paintProgress(); });
      video.addEventListener('ended', function () { self.onEnded(); });
      video.addEventListener('error', function () { self.onError(T('Das Video konnte nicht abgespielt werden (Format oder Verbindung).')); });

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
      clearInterval(self.placeTimer);
      self.el.classList.remove('is-mini', 'is-docked');
      document.body.classList.remove('has-mini');
      var st = self.el.style;
      st.left = st.top = st.width = st.height = '';
      self.lastPlace = '';
      Screens.push('player', self.el, self.screenOpts());
      self.enterFullscreen();
      self.showOsd();
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
      self.triedAlt = false; self.retried = false; self.forceHlsJs = false;
      self.err.style.display = 'none';
      self.spinner.style.display = '';
      self.loadTxt.textContent = item.kind === 'live' ? T('{0} wird geladen …', item.name) : T('Wird geladen …');
      self.epgNow = ''; self.epgNext = '';
      if (self.miniTitle) self.miniTitle.textContent = item.name;
      self.lastPlace = '';
      self.title.textContent = item.kind === 'episode' ? (item.seriesName ? item.seriesName + ' · ' : '') + 'S' + item.season + ' E' + item.num + ' – ' + item.name : item.name;
      self.liveTag.style.display = item.kind === 'live' ? '' : 'none';
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
    },

    attach: function (url) {
      var self = this, video = self.video;
      self.destroyHls();
      self.curUrl = url;
      self.usingNative = false;
      var nativeHls = !!video.canPlayType('application/vnd.apple.mpegurl');
      // Android-App: zuerst den eingebauten Android-Player nutzen (zuverlässiger für Live-Sender),
      // nur wenn das scheitert, hls.js versuchen
      var preferNative = Platform.safari || Platform.tizen || Platform.webos || (Platform.android && !self.forceHlsJs);
      if (isHlsUrl(url) && !(nativeHls && preferNative)) {
        ensureHls().then(function (Hls) {
          if (self.video !== video) return;
          if (Hls && Hls.isSupported()) {
            var hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
            self.hls = hls;
            hls.on(Hls.Events.ERROR, function (ev, data) {
              if (!data.fatal) return;
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !self.retried) { self.retried = true; hls.recoverMediaError(); return; }
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !self.retried) { self.retried = true; setTimeout(function () { hls.startLoad(); }, 1000); return; }
              self.onError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? T('Der Stream ist nicht erreichbar.') : T('Der Stream konnte nicht abgespielt werden.'));
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function () { self.playSafe(); });
          } else {
            video.src = url; self.playSafe();
          }
        });
      } else {
        self.usingNative = isHlsUrl(url);
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
      clear(self.err);
      self.err.appendChild(h('h3', { text: T('Wiedergabe nicht möglich') }));
      self.err.appendChild(h('p', { text: msg }));
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
      if (self.item.kind === 'episode' && c && c.list && c.index < c.list.length - 1) {
        toast(T('Nächste Folge startet …'));
        c.index++;
        setTimeout(function () { if (self.el) self.load(c.list[c.index]); }, 1200);
      } else if (self.isVod()) {
        goBack();
      }
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
      this.times.lastChild.textContent = '-' + fmtTime(d - cur);
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
      if (self.item && self.item.kind !== 'episode') {
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
      if (this.err.style.display !== 'none') return;
      this.osd.classList.add('is-hidden');
      if (this.osd.contains(document.activeElement)) document.activeElement.blur();
    },
    toggleOsd: function () { if (this.osd.classList.contains('is-hidden')) this.showOsd(); else this.hideOsd(); },

    /* Tasten im Player. true = Taste wurde verarbeitet */
    handleKey: function (k) {
      var self = this;
      if (Dialog.open) return false;
      var hidden = self.osd.classList.contains('is-hidden');
      var errOpen = self.err.style.display !== 'none';
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
      self.video.volume = v;
      self.video.muted = !!Settings.get('muted');
      self.muteBtn = h('button', { class: 'cbtn f', 'data-c': 'mute', title: T('Ton an/aus'), 'aria-label': T('Ton an/aus'), onclick: function () { self.setMuted(!self.video.muted); } });
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
    destroyHls: function () { if (this.hls) { try { this.hls.destroy(); } catch (e) {} this.hls = null; } },

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
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        var fe = document.fullscreenElement || document.webkitFullscreenElement;
        if (fe) { var ex = document.exitFullscreen || document.webkitExitFullscreen; var r = ex.call(document); if (r && r.catch) r.catch(function () {}); }
      } catch (e) {}
    },

    teardown: function () {
      this.saveResume();
      clearInterval(this.saveTimer); clearInterval(this.epgTimer); clearTimeout(this.hideTimer); clearTimeout(this.zapTimer);
      this.destroyHls();
      clearTimeout(this.scrubTimer); this.scrubT = null;
      try { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } catch (e) {}
      this.exitFullscreen();
      clearInterval(this.placeTimer);
      this.mini = false;
      document.body.classList.remove('has-mini');
      this.el = null; this.video = null; this.item = null; this.ctx = null;
    }
  };

  /* ==========================================================
     Tasten der Fernbedienungen
     ========================================================== */
  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK_TIZEN: 10009, BACK_WEBOS: 461, ESC: 27, BACKSPACE: 8,
    PLAYPAUSE: 10252, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412,
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
    if (dirs[k]) {
      if (inInput && t.type === 'range' && (k === 37 || k === 39)) return;
      if (inInput && (k === 37 || k === 39)) {
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
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', function () { INPUT.mode = 'pointer'; if (!Platform.tv) document.body.classList.remove('kbd'); }, true);
    // Video weiterlaufen lassen, aber beim Verlassen der App den Fortschritt sichern
    document.addEventListener('visibilitychange', function () { if (document.hidden && Player.el) Player.saveResume(); });
    registerTvKeys();

    var active = Profiles.get(Store.get('active'));
    if (active) activateProfile(active, false, true);
    else showProfiles();
    Cloud.start();
    StillWatching.start();
    var reloaded = false;
    try { reloaded = sessionStorage.getItem('lumio.reloaded'); sessionStorage.removeItem('lumio.reloaded'); } catch (e) {}
    if (reloaded) setTimeout(function () { toast(T('Daten neu geladen')); }, 600);
  }

  // Für automatische Tests von außen erreichbar
  window.LumioDebug = { parseM3U: parseM3U, parseXtreamLink: parseXtreamLink, normalizeServer: normalizeServer, Nav: Nav, Screens: Screens, StillWatching: StillWatching };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
