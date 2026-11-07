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
    version: '1.0.0',
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
    movie: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    series: '<rect x="2" y="7" width="15" height="13" rx="2"/><path d="M6 3h14a2 2 0 0 1 2 2v11"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" stroke="none"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
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
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(name) {
    var span = document.createElement('span');
    span.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    return span.firstChild;
  }
  function brandMark() { var m = h('span', { class: 'brand-mark' }); m.appendChild(icon('play')); return m; }

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
  function fmtDate(ts) { if (!ts) return 'unbegrenzt'; var d = new Date(Number(ts) * 1000); return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
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
    portalLink: function () { return CONFIG.portalUrl + '?mac=' + encodeURIComponent(this.mac()) + '&key=' + this.key(); }
  };
  function macTag() {
    return h('div', { class: 'mac-tag' }, h('span', { text: 'MAC' }), h('b', { text: Device.mac() }), h('span', { text: 'KEY' }), h('b', { text: Device.key() }));
  }

  /* ---------------- Darstellung: Hell/Dunkel und Akzentfarbe ---------------- */
  var ACCENTS = [
    { id: 'orange', name: 'Sonnenorange', a: '#ff7849', b: '#ffb347', ink: '#1a0d06' },
    { id: 'red', name: 'Rot', a: '#ff4d5e', b: '#ff8a6b', ink: '#22040a' },
    { id: 'pink', name: 'Pink', a: '#ff5fa2', b: '#ff9ad1', ink: '#26030f' },
    { id: 'violet', name: 'Violett', a: '#8b7bff', b: '#c38bff', ink: '#0d0824' },
    { id: 'blue', name: 'Blau', a: '#3d8bff', b: '#5fd0ff', ink: '#03132a' },
    { id: 'teal', name: 'Türkis', a: '#19c8b9', b: '#6ff0c4', ink: '#022320' },
    { id: 'green', name: 'Grün', a: '#3ddc84', b: '#b6f05a', ink: '#04220f' },
    { id: 'gold', name: 'Gold', a: '#ffc53d', b: '#ffe27a', ink: '#261c02' }
  ];
  function rgba(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }
  var Theme = {
    media: window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null,
    accent: function () { var id = Settings.get('accent'); return ACCENTS.filter(function (x) { return x.id === id; })[0] || ACCENTS[0]; },
    apply: function () {
      var mode = Settings.get('theme') || 'auto';
      var light = mode === 'light' || (mode === 'auto' && !Platform.tv && !!(this.media && this.media.matches));
      var root = document.documentElement;
      root.setAttribute('data-theme', light ? 'light' : 'dark');
      var acc = this.accent();
      root.style.setProperty('--accent', acc.a);
      root.style.setProperty('--accent-2', acc.b);
      root.style.setProperty('--accent-ink', acc.ink);
      root.style.setProperty('--accent-soft', rgba(acc.a, light ? 0.14 : 0.18));
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', light ? '#f4f5f8' : '#0a0c11');
    },
    watch: function () {
      var self = this;
      if (self.media && self.media.addListener) self.media.addListener(function () { self.apply(); });
    }
  };

  /* ---------------- Netzwerk ---------------- */
  function fetchWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || CONFIG.requestTimeout);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('Server-Fehler (HTTP ' + res.status + ')');
      return res;
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') throw new Error('Zeitüberschreitung – der Server antwortet nicht.');
      throw new Error('Keine Verbindung zum Server. Prüfe Adresse und Internet.');
    });
  }
  function fetchText(url) { return fetchWithTimeout(url).then(function (r) { return r.text(); }); }
  function fetchJson(url) {
    return fetchText(url).then(function (t) {
      t = t.replace(/^\uFEFF/, '').trim();
      if (!t) return null;
      try { return JSON.parse(t); } catch (e) { throw new Error('Unerwartete Antwort vom Server.'); }
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
      if (kind === 'live') return { kind: 'live', id: String(s.stream_id), name: s.name || 'Kanal', logo: s.stream_icon, num: s.num, catId: String(s.category_id) };
      if (kind === 'movie') return { kind: 'movie', id: String(s.stream_id), name: s.name || 'Film', logo: s.stream_icon, ext: s.container_extension || 'mp4', rating: s.rating, catId: String(s.category_id), added: s.added };
      return { kind: 'series', id: String(s.series_id), name: s.name || 'Serie', logo: s.cover, rating: s.rating, catId: String(s.category_id), year: s.releaseDate || s.release_date, plot: s.plot };
    }
    return {
      type: 'xtream',
      login: function () {
        return api('', '', true).then(function (d) {
          if (!d || !d.user_info) throw new Error('Das ist kein gültiger Xtream-Server.');
          if (String(d.user_info.auth) !== '1') throw new Error('Benutzername oder Passwort falsch.');
          if (d.user_info.status && d.user_info.status !== 'Active') throw new Error('Konto-Status: ' + d.user_info.status);
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
          return (Array.isArray(list) ? list : []).map(function (c) { return { id: String(c.category_id), name: c.category_name || 'Ohne Name' }; });
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
                  name: e.title || ('Folge ' + e.episode_num), ext: e.container_extension || 'mp4',
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
      epg: function (item) {
        return api('get_short_epg', '&stream_id=' + item.id + '&limit=3', true).then(function (d) {
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
          name: cur.name || cur.attrs['tvg-name'] || 'Ohne Name',
          logo: cur.attrs['tvg-logo'] || '',
          group: cur.attrs['group-title'] || 'Ohne Kategorie',
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
          if (t.indexOf('#EXT') < 0) throw new Error('Das ist keine gültige M3U-Playlist.');
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
      ['Demo Live 1', 'news', S.live1], ['Demo Test-Bild', 'news', S.bip], ['Demo Kino 24/7', 'film', S.bbb],
      ['Demo Animation', 'film', S.sintel], ['Demo Science-Fiction', 'film', S.tos], ['Demo Live 2', 'news', S.live1]
    ].map(function (x, i) { return { kind: 'live', id: 'd' + i, name: x[0], catId: x[1], url: x[2], num: i + 1 }; });
    var movies = [
      { id: 'm1', name: 'Big Buck Bunny', url: S.bbb, catId: 'anim', year: '2008', plot: 'Ein gutmütiger Riesenhase rächt sich mit viel Fantasie an drei frechen Nagern. Offener Animationsfilm der Blender Foundation.', genre: 'Animation, Komödie', duration: '00:09:56', rating: '7.2' },
      { id: 'm2', name: 'Sintel', url: S.sintel, catId: 'anim', year: '2010', plot: 'Eine junge Frau sucht ihren verlorenen Drachen und findet dabei mehr, als sie erwartet hat. Offener Kurzfilm der Blender Foundation.', genre: 'Animation, Fantasy', duration: '00:14:48', rating: '7.4' },
      { id: 'm3', name: 'Tears of Steel', url: S.tos, catId: 'scifi', year: '2012', plot: 'Eine Gruppe Wissenschaftler versucht in Amsterdam, die Welt vor Robotern zu retten. Offener Kurzfilm der Blender Foundation.', genre: 'Science-Fiction', duration: '00:12:14', rating: '6.1' },
      { id: 'm4', name: 'Apple Testbild', url: S.bip, catId: 'scifi', year: '2014', plot: 'Ein technischer Teststream zum Prüfen der Wiedergabe.', genre: 'Test', duration: '00:30:00', rating: '' }
    ].map(function (m) { m.kind = 'movie'; return m; });
    var series = [{ kind: 'series', id: 's1', name: 'Open Movie Classics', catId: 'anim', year: '2008', plot: 'Eine kleine Demo-Serie aus freien Kurzfilmen, um Staffeln und Folgen auszuprobieren.', genre: 'Animation' }];
    var eps = [
      { season: 1, num: 1, name: 'Big Buck Bunny', url: S.bbb }, { season: 1, num: 2, name: 'Sintel', url: S.sintel },
      { season: 2, num: 1, name: 'Tears of Steel', url: S.tos }
    ].map(function (e, i) { e.kind = 'episode'; e.id = 'e' + i; e.seriesId = 's1'; e.seriesName = 'Open Movie Classics'; return e; });
    var cats = {
      live: [{ id: 'news', name: 'Demo Nachrichten' }, { id: 'film', name: 'Demo Filmkanäle' }],
      movie: [{ id: 'anim', name: 'Animation' }, { id: 'scifi', name: 'Science-Fiction' }],
      series: [{ id: 'anim', name: 'Animation' }]
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
          { title: 'Demo-Sendung', desc: 'Beispiel für den Programmführer.', start: start, end: start + 3600 },
          { title: 'Nächste Demo-Sendung', desc: '', start: start + 3600, end: start + 7200 }
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
    registered: false, timer: null, busy: false,
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
        return self.apply(r.items || []);
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
      if (added.length) toast('Neue Playlist empfangen: ' + added.map(function (p) { return p.name; }).join(', '), 4000);
      var top = Screens.top();
      if (App.profile && removed.some(function (p) { return p.id === App.profile.id; })) { App.profile = null; showProfiles(); }
      else if (top && top.name === 'profiles') showProfiles();
      return { changed: true, added: added, removed: removed };
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
  function qrBox(text) {
    var box = h('div', { class: 'qr' });
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
  function appearancePanel() {
    var modes = [['auto', 'Automatisch'], ['dark', 'Dunkel'], ['light', 'Hell']];
    var row = h('div', { class: 'row' });
    var modeBtns = modes.map(function (m) {
      var b = h('button', { class: 'btn f', onclick: function () { Settings.set('theme', m[0]); Theme.apply(); paint(); } }, m[1]);
      row.appendChild(b);
      return [m[0], b];
    });
    var sw = h('div', { class: 'swatches' });
    var swBtns = ACCENTS.map(function (a) {
      var b = h('button', {
        class: 'swatch f', title: a.name, 'aria-label': a.name,
        style: 'background:linear-gradient(135deg,' + a.a + ',' + a.b + ')',
        onclick: function () { Settings.set('accent', a.id); Theme.apply(); paint(); }
      });
      sw.appendChild(b);
      return [a.id, b];
    });
    var label = h('p', { class: 'hint' });
    function paint() {
      var t = Settings.get('theme') || 'auto', c = Theme.accent();
      modeBtns.forEach(function (x) { x[1].classList.toggle('is-on', x[0] === t); });
      swBtns.forEach(function (x) { x[1].classList.toggle('is-on', x[0] === c.id); });
      label.textContent = 'Gewählt: ' + c.name;
    }
    paint();
    return h('div', { class: 'panel' },
      h('h3', { text: 'Darstellung' }),
      h('p', { class: 'hint', text: 'Automatisch passt sich dem Gerät an (Fernseher bleiben dunkel).' }),
      row,
      h('h3', { text: 'Farbe' }),
      sw, label);
  }

  function remotePanel() {
    return h('div', { class: 'remote' },
      qrBox(Device.portalLink()),
      h('div', { class: 'remote-text' },
        h('h3', { text: 'Playlist per Handy hinzufügen' }),
        h('p', { text: 'QR-Code mit dem Handy scannen und dort deinen M3U-Link oder Xtream-Zugang eingeben. Die Playlist erscheint danach automatisch hier.' }),
        h('p', { class: 'hint', text: 'Ohne QR-Code: ' + CONFIG.portalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') + ' öffnen und MAC + KEY eingeben.' })));
  }

  var App = { profile: null, provider: null };

  function makeProvider(p) {
    if (p.type === 'xtream') return XtreamProvider(p);
    if (p.type === 'm3u') return M3UProvider(p);
    return DemoProvider();
  }
  function pid() { return App.profile ? App.profile.id : 'none'; }
  function slim(item) {
    var o = {};
    ['kind', 'id', 'name', 'logo', 'num', 'ext', 'url', 'catId', 'season', 'seriesId', 'seriesName', 'year', 'rating', 'plot', 'genre', 'duration'].forEach(function (k) {
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
      toast(on ? 'Aus Favoriten entfernt' : 'Zu Favoriten hinzugefügt');
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
    show: function (title, text, buttons) {
      var layer = $('#dialog-layer');
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
      layer.appendChild(h('div', { class: 'dialog', role: 'dialog' }, h('h3', { text: title }), text ? h('p', { text: text }) : null, row));
      self.open = true;
      setTimeout(function () { Nav.focus(first); }, 30);
    },
    close: function () {
      clear($('#dialog-layer')); this.open = false;
      if (this.prevFocus && document.body.contains(this.prevFocus)) Nav.focus(this.prevFocus);
    }
  };
  function confirmBox(title, text, okLabel, onOk) {
    Dialog.show(title, text, [{ label: 'Abbrechen' }, { label: okLabel || 'OK', primary: true, action: onOk }]);
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
    confirmBox('App beenden?', null, 'Beenden', exitApp);
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

  function channelRow(item, onClick) {
    var fav = Favs.has(item);
    return h('button', { class: 'chan f', onclick: onClick },
      h('span', { class: 'num', text: item.num ? String(item.num) : '' }),
      logoBox(item),
      h('span', { class: 'name', text: item.name }),
      fav ? h('span', { class: 'star' }, icon('starFill')) : null);
  }

  function posterCard(item, onClick, opts) {
    opts = opts || {};
    var badge = item.rating && Number(item.rating) > 0 ? h('span', { class: 'badge', text: '★ ' + Number(item.rating).toFixed(1) }) : null;
    var prog = opts.progress ? h('span', { class: 'prog' }, h('i', { style: 'width:' + Math.round(opts.progress * 100) + '%' })) : null;
    return h('button', { class: 'poster f', onclick: onClick },
      posterArt(item, [badge, prog]),
      h('span', { class: 'title', text: opts.title || item.name }));
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
  }

  /* ==========================================================
     Startbildschirm: Profile / Playlists
     ========================================================== */
  function showProfiles() {
    var list = Profiles.list();
    var grid = h('div', { class: 'profile-grid' });
    list.forEach(function (p) {
      var sub = p.type === 'xtream' ? 'Xtream Codes' : p.type === 'm3u' ? 'M3U-Playlist' : 'Demo';
      if (p.remoteId) sub += ' · per Handy';
      grid.appendChild(h('div', { class: 'profile' },
        h('button', { class: 'card f', onclick: function () { activateProfile(p); }, 'data-autofocus': p.id === Store.get('active') ? true : null },
          h('span', { class: 'avatar', style: 'background:' + colorFor(p.name), text: initials(p.name) }),
          h('span', { class: 'label', text: p.name }),
          h('span', { class: 'sub', text: sub })),
        h('button', {
          class: 'btn small ghost f danger', onclick: function () {
            confirmBox('„' + p.name + '“ löschen?', 'Favoriten und Verlauf dieses Profils werden ebenfalls entfernt.', 'Löschen', function () { Profiles.remove(p.id); showProfiles(); });
          }
        }, 'Löschen')));
    });
    grid.appendChild(h('div', { class: 'profile' },
      h('button', { class: 'card add f', onclick: showAddProfile, 'data-autofocus': list.length ? null : true },
        icon('plus'), h('span', { class: 'label', text: 'Playlist hinzufügen' }), h('span', { class: 'sub', text: 'Xtream oder M3U' }))));
    if (!list.some(function (p) { return p.type === 'demo'; })) {
      grid.appendChild(h('div', { class: 'profile' },
        h('button', {
          class: 'card add f', onclick: function () { activateProfile(Profiles.add({ type: 'demo', name: 'Demo' })); }
        }, icon('play'), h('span', { class: 'label', text: 'Demo ansehen' }), h('span', { class: 'sub', text: 'Mit freien Test-Videos' }))));
    }
    var el = h('div', { class: 'profiles' },
      h('div', { class: 'brand' }, brandMark(), h('span', { text: CONFIG.appName })),
      h('div', { class: 'profiles-mac' }, macTag()),
      h('h2', { text: list.length ? 'Welche Playlist möchtest du öffnen?' : 'Füge deine erste Playlist hinzu' }),
      grid,
      remotePanel());
    Screens.reset('profiles', el);
  }

  function showAddProfile() {
    var mode = 'xtream';
    var err = h('div', { class: 'error' });
    var fName = inputField('Name (frei wählbar)', 'z. B. Wohnzimmer', 'text');
    var fServer = inputField('Server-Adresse', 'http://beispiel.de:8080', 'url');
    var fUser = inputField('Benutzername', '', 'text');
    var fPass = inputField('Passwort', '', 'password');
    var fUrl = inputField('M3U-Link', 'http://…/playlist.m3u', 'url');
    var xBox = h('div', { class: 'form' , style: 'gap:1rem;margin:0' }, fServer.wrap, fUser.wrap, fPass.wrap,
      h('p', { class: 'hint', text: 'Tipp: Du kannst auch einen kompletten Link (…/get.php?username=…&password=…) in das Feld „Server-Adresse“ einfügen.' }));
    var mBox = h('div', { class: 'form', style: 'gap:1rem;margin:0;display:none' }, fUrl.wrap,
      h('p', { class: 'hint', text: 'Funktioniert mit jeder .m3u oder .m3u8 Playlist-Adresse.' }));
    var tX = h('button', { class: 'btn f is-on', onclick: function () { setMode('xtream'); } }, 'Xtream Codes');
    var tM = h('button', { class: 'btn f', onclick: function () { setMode('m3u'); } }, 'M3U-Link');
    function setMode(m) {
      mode = m;
      tX.classList.toggle('is-on', m === 'xtream'); tM.classList.toggle('is-on', m === 'm3u');
      xBox.style.display = m === 'xtream' ? '' : 'none'; mBox.style.display = m === 'm3u' ? '' : 'none';
      err.textContent = '';
    }
    var saveBtn = h('button', { class: 'btn f primary', onclick: save }, 'Speichern & verbinden');

    function save() {
      err.textContent = '';
      var name = fName.input.value.trim();
      var p;
      if (mode === 'xtream') {
        var link = parseXtreamLink(fServer.input.value);
        p = link ? { type: 'xtream', server: link.server, username: link.username, password: link.password }
          : { type: 'xtream', server: normalizeServer(fServer.input.value), username: fUser.input.value.trim(), password: fPass.input.value };
        if (!p.server || !p.username || !p.password) { err.textContent = 'Bitte Server, Benutzername und Passwort ausfüllen.'; return; }
      } else {
        var u = fUrl.input.value.trim();
        if (!/^https?:\/\//i.test(u)) { err.textContent = 'Bitte einen gültigen Link (http:// oder https://) eingeben.'; return; }
        var xl = parseXtreamLink(u);
        if (xl) { p = { type: 'xtream', server: xl.server, username: xl.username, password: xl.password }; toast('Als Xtream-Zugang erkannt – mit Kategorien, Serien und EPG'); }
        else p = { type: 'm3u', url: u };
      }
      p.name = name || (p.type === 'xtream' ? p.username : 'Meine Playlist');
      saveBtn.disabled = true; saveBtn.textContent = 'Verbinde …';
      makeProvider(p).login().then(function () {
        var saved = Profiles.add(p);
        activateProfile(saved, true);
      }, function (e) {
        err.textContent = e.message || 'Verbindung fehlgeschlagen.';
        saveBtn.disabled = false; saveBtn.textContent = 'Speichern & verbinden';
      });
    }

    var el = h('div', { class: 'form-wrap' },
      h('div', { class: 'form' },
        h('h1', { text: 'Playlist hinzufügen' }),
        h('div', null, macTag()),
        h('div', { class: 'tabs' }, tX, tM),
        fName.wrap, xBox, mBox, err,
        h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn f ghost', onclick: goBack }, 'Abbrechen')),
        h('p', { class: 'hint', text: 'Diese App enthält keine Sender oder Inhalte. Du benötigst einen eigenen Zugang von deinem Anbieter.' })));
    Screens.push('add', el);
    setTimeout(function () { Nav.focus(tX); }, 30);
  }

  function inputField(label, ph, type) {
    var input = h('input', { class: 'f', type: type, placeholder: ph || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    return { input: input, wrap: h('label', { class: 'field' }, h('span', { text: label }), input) };
  }

  function activateProfile(p, isNew) {
    App.profile = p;
    App.provider = makeProvider(p);
    Store.set('active', p.id);
    if (isNew || p.type === 'demo') { Shell.open(); return; }
    // Kurz prüfen, ob der Zugang noch funktioniert – die Startseite erscheint trotzdem sofort
    Shell.open();
    App.provider.login().catch(function (e) { toast('Hinweis: ' + e.message, 4000); });
  }

  /* ==========================================================
     Hauptansicht mit Seitenleiste
     ========================================================== */
  var Shell = {
    el: null, content: null, current: null, buttons: {},
    open: function () {
      var self = this;
      self.view = h('div', { class: 'view' });
      self.content = h('main', { class: 'content' }, h('div', { class: 'topbar' }, macTag()), self.view);
      var items = [['home', 'Start'], ['live', 'Live TV'], ['movie', 'Filme'], ['series', 'Serien'], ['search', 'Suche'], ['settings', 'Mehr']];
      var nav = h('nav', { class: 'sidebar' }, h('div', { class: 'brand' }, brandMark(), h('span', { text: CONFIG.appName })));
      items.forEach(function (it) {
        if (it[0] === 'settings') nav.appendChild(h('div', { class: 'spacer' }));
        var b = h('button', { class: 'nav-btn f', title: it[1], onclick: function () { self.show(it[0], true); } }, icon(it[0]), h('span', { text: it[1] }));
        self.buttons[it[0]] = b;
        nav.appendChild(b);
      });
      self.el = h('div', { class: 'shell' }, nav, self.content);
      // Seitenleiste wird schmal, sobald man in Live TV, Filme, Serien oder Suche nach rechts in den Inhalt geht
      self.el.addEventListener('focusin', function (e) {
        var inNav = e.target && e.target.closest && e.target.closest('.sidebar');
        if (inNav && INPUT.mode !== 'key') return;
        self.el.classList.toggle('nav-collapsed', !inNav && !!COMPACT_NAV[self.current]);
      });
      Screens.reset('shell', self.el, {
        onBack: function () {
          if (self.current !== 'home') { self.show('home', true); return true; }
          return false;
        },
        onShow: function () { if (self.current === 'home') self.show('home', false, true); }
      });
      self.show('home');
    },
    show: function (name, focusContent, keepFocus) {
      var self = this;
      self.current = name;
      if (!COMPACT_NAV[name]) self.el.classList.remove('nav-collapsed');
      Object.keys(self.buttons).forEach(function (k) { self.buttons[k].classList.toggle('is-on', k === name); });
      clear(self.view);
      var view;
      if (name === 'home') view = HomeView();
      else if (name === 'search') view = SearchView();
      else if (name === 'settings') view = SettingsView();
      else view = SectionView(name);
      self.view.appendChild(view);
      if (keepFocus) return;
      setTimeout(function () {
        if (focusContent || !document.activeElement || document.activeElement === document.body) Nav.focusFirst(self.view);
      }, 30);
    }
  };

  var COMPACT_NAV = { live: true, movie: true, series: true, search: true };
  var INPUT = { mode: 'key' };

  /* ---------- Start ---------- */
  function HomeView() {
    var p = App.profile;
    var chip = h('span', { class: 'chip' }, h('span', { class: 'dot' }), p.type === 'demo' ? 'Demo-Modus' : 'Verbunden');
    var head = h('div', { class: 'home-head' },
      h('div', null, h('h1', { text: p.name }), h('p', { text: p.type === 'demo' ? 'Probiere die App mit freien Test-Videos aus.' : 'Was möchtest du heute schauen?' })),
      chip);
    App.provider.account().then(function (a) {
      if (a && a.expires) chip.lastChild.textContent = 'Gültig bis ' + fmtDate(a.expires);
      if (a && a.count) chip.lastChild.textContent = a.count + ' Einträge';
    }).catch(function () { chip.lastChild.textContent = 'Offline'; chip.firstChild.style.background = 'var(--live)'; });

    function tile(kind, title, sub) {
      return h('button', { class: 'tile f ' + kind, onclick: function () { Shell.show(kind, true); }, 'data-autofocus': kind === 'live' ? true : null },
        icon(kind), h('h3', { text: title }), h('p', { text: sub }));
    }
    var el = h('div', { class: 'home' }, head,
      h('div', { class: 'tiles' }, tile('live', 'Live TV', 'Sender & Programm'), tile('movie', 'Filme', 'Filme auf Abruf'), tile('series', 'Serien', 'Staffeln & Folgen')));

    var resume = Resume.recent().slice(0, 15);
    if (resume.length) {
      var track = h('div', { class: 'rail-track' });
      resume.forEach(function (r) {
        var it = r.item;
        var title = it.kind === 'episode' ? (it.seriesName || '') + ' · S' + it.season + 'E' + it.num : it.name;
        track.appendChild(posterCard(it, function () { playItem(it, { list: [it], index: 0 }); }, { progress: r.t / r.d, title: title }));
      });
      el.appendChild(h('section', { class: 'rail' }, h('h2', { text: 'Weiterschauen' }), track));
    }
    var recent = Recent.list();
    if (recent.length) {
      var track2 = h('div', { class: 'rail-track' });
      recent.forEach(function (it, i) {
        track2.appendChild(h('button', { class: 'chan-chip f', onclick: function () { playItem(it, { list: recent, index: i }); } }, logoBox(it), h('span', { class: 'name', text: it.name })));
      });
      el.appendChild(h('section', { class: 'rail' }, h('h2', { text: 'Zuletzt gesehene Sender' }), track2));
    }
    ['movie', 'series'].forEach(function (kind) {
      var favs = Favs.list(kind);
      if (!favs.length) return;
      var t = h('div', { class: 'rail-track' });
      favs.forEach(function (it) { t.appendChild(posterCard(it, function () { openItem(it); })); });
      el.appendChild(h('section', { class: 'rail' }, h('h2', { text: kind === 'movie' ? 'Lieblingsfilme' : 'Lieblingsserien' }), t));
    });
    return el;
  }

  /* ---------- Live / Filme / Serien ---------- */
  var lastCat = {};
  function SectionView(kind) {
    var titles = { live: 'Live TV', movie: 'Filme', series: 'Serien' };
    var count = h('span', { class: 'count' });
    var cats = h('div', { class: 'cats' });
    var items = h('div', { class: 'items' }, loader());
    var el = h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h1', { text: titles[kind] }), count),
      h('div', { class: 'section-body' }, cats, items, kind === 'live' ? h('div', { class: 'mini-slot' }, h('div', { class: 'mini-slot-box' }), h('div', { class: 'mini-slot-info' })) : null));

    var activeBtn = null;
    function selectCat(cat, btn, focusList) {
      lastCat[pid() + kind] = cat.id;
      if (activeBtn) activeBtn.classList.remove('is-on');
      btn.classList.add('is-on'); activeBtn = btn;
      clear(items).appendChild(loader());
      count.textContent = '';
      var pr = cat.id === '__fav' ? Promise.resolve(Favs.list(kind)) : App.provider.items(kind, cat.id);
      pr.then(function (list) {
        if (activeBtn !== btn) return;
        clear(items);
        items.scrollTop = 0;
        count.textContent = list.length + (list.length === 1 ? ' Eintrag' : ' Einträge');
        if (!list.length) {
          items.appendChild(stateBox(cat.id === '__fav' ? 'Noch keine Favoriten' : 'Keine Einträge', cat.id === '__fav' ? 'Markiere Inhalte mit dem Stern, um sie hier zu sammeln.' : null));
          return;
        }
        var box = h('div', { class: kind === 'live' ? 'chan-list' : 'poster-grid' });
        items.appendChild(box);
        renderChunked(box, items, list, function (it, i) {
          return kind === 'live' ? channelRow(it, function () { playItem(it, { list: list, index: i }); })
            : posterCard(it, function () { openItem(it); });
        });
        if (focusList) Nav.focusFirst(box);
      }, function (e) {
        if (activeBtn !== btn) return;
        clear(items).appendChild(stateBox('Laden fehlgeschlagen', e.message, 'Erneut versuchen', function () { selectCat(cat, btn, true); }));
      });
    }

    App.provider.categories(kind).then(function (list) {
      var all = [{ id: '__fav', name: '★ Favoriten' }, { id: '__all', name: 'Alle' }].concat(list || []);
      var want = lastCat[pid() + kind] || (list && list[0] ? list[0].id : '__all');
      var toSelect = null;
      all.forEach(function (c) {
        var b = h('button', { class: 'cat f', title: c.name }, c.name);
        b.addEventListener('click', function () { selectCat(c, b, true); });
        cats.appendChild(b);
        if (c.id === want) toSelect = [c, b];
      });
      if (!toSelect) toSelect = [all[1], cats.children[1]];
      selectCat(toSelect[0], toSelect[1], false);
      if (document.activeElement === document.body) Nav.focus(toSelect[1]);
    }, function (e) {
      clear(items).appendChild(stateBox('Laden fehlgeschlagen', e.message, 'Erneut versuchen', function () { Shell.show(kind, true); }));
    });
    return el;
  }

  /* ---------- Suche ---------- */
  var searchCache = {};
  function SearchView() {
    var f = inputField('Suche nach Sendern, Filmen und Serien', 'Titel eingeben …', 'search');
    var results = h('div', { style: 'display:flex;flex-direction:column;gap:1.6rem' });
    var timer = null;
    function getAll(kind) {
      var k = pid() + kind;
      if (!searchCache[k]) { searchCache[k] = App.provider.items(kind, '__all'); searchCache[k].catch(function () { delete searchCache[k]; }); }
      return searchCache[k];
    }
    function run() {
      var q = norm(f.input.value.trim());
      clear(results);
      if (q.length < 2) { results.appendChild(h('p', { class: 'hint', text: 'Mindestens 2 Buchstaben eingeben.' })); return; }
      results.appendChild(loader());
      Promise.all(['live', 'movie', 'series'].map(function (k) { return getAll(k).catch(function () { return []; }); })).then(function (lists) {
        if (norm(f.input.value.trim()) !== q) return;
        clear(results);
        var labels = ['Sender', 'Filme', 'Serien'], total = 0;
        lists.forEach(function (list, i) {
          var hits = list.filter(function (x) { return norm(x.name).indexOf(q) >= 0; }).slice(0, 60);
          total += hits.length;
          if (!hits.length) return;
          var box = h('div', { class: i === 0 ? 'chan-list' : 'poster-grid' });
          hits.forEach(function (it, j) {
            box.appendChild(i === 0 ? channelRow(it, function () { playItem(it, { list: hits, index: j }); }) : posterCard(it, function () { openItem(it); }));
          });
          results.appendChild(h('section', null, h('h2', { style: 'font-size:1.1rem;margin-bottom:.8rem', text: labels[i] + ' (' + hits.length + ')' }), box));
        });
        if (!total) results.appendChild(stateBox('Nichts gefunden', 'Versuche einen anderen Suchbegriff.'));
      });
    }
    f.input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 400); });
    f.input.addEventListener('keydown', function (e) { if (e.keyCode === 13) { clearTimeout(timer); run(); } });
    f.input.setAttribute('data-autofocus', '');
    return h('div', { class: 'search' }, h('h1', { text: 'Suche' }), f.wrap, results);
  }

  /* ---------- Einstellungen ---------- */
  function SettingsView() {
    var p = App.profile;
    var kv = h('div', { class: 'kv' });
    function row(k, v) { kv.appendChild(h('span', { text: k })); kv.appendChild(h('b', { text: v })); }
    row('MAC-Adresse', Device.mac());
    row('Profil', p.name);
    row('Typ', p.type === 'xtream' ? 'Xtream Codes' : p.type === 'm3u' ? 'M3U-Playlist' : 'Demo');
    if (p.type === 'xtream') { row('Server', p.server); row('Benutzer', p.username); }
    if (p.type === 'm3u') row('Playlist', p.url);
    App.provider.account().then(function (a) {
      if (!a) return;
      if (a.expires !== undefined) row('Gültig bis', fmtDate(a.expires));
      if (a.status) row('Status', a.status);
      if (a.maxCons) row('Verbindungen', (a.activeCons || 0) + ' von ' + a.maxCons + ' aktiv');
    }).catch(function () {});

    var fmtRow = null;
    if (p.type === 'xtream') {
      var bH = h('button', { class: 'btn f' }, 'HLS (.m3u8)');
      var bT = h('button', { class: 'btn f' }, 'MPEG-TS (.ts)');
      var paint = function () { var v = Settings.get('liveFormat'); bH.classList.toggle('is-on', v !== 'ts'); bT.classList.toggle('is-on', v === 'ts'); };
      bH.onclick = function () { Settings.set('liveFormat', 'm3u8'); paint(); toast('Live-Format: HLS'); };
      bT.onclick = function () { Settings.set('liveFormat', 'ts'); paint(); toast('Live-Format: MPEG-TS'); };
      paint();
      fmtRow = h('div', { class: 'panel' }, h('h3', { text: 'Live-Stream-Format' }),
        h('p', { class: 'hint', text: 'Wenn Sender nicht starten, probiere das andere Format. HLS funktioniert auf den meisten Geräten am besten.' }),
        h('div', { class: 'row' }, bH, bT));
    }

    return h('div', { class: 'settings' },
      h('h1', { text: 'Mehr' }),
      h('div', { class: 'panel' }, h('h3', { text: 'Konto' }), kv,
        h('div', { class: 'row' },
          h('button', { class: 'btn f primary', onclick: showProfiles, 'data-autofocus': true }, icon('profile'), 'Profil wechseln'),
          h('button', { class: 'btn f', onclick: function () { App.provider.reset(); searchCache = {}; toast('Daten werden neu geladen'); } }, icon('restart'), 'Daten neu laden'))),
      appearancePanel(),
      remotePanel(),
      fmtRow,
      h('div', { class: 'panel' }, h('h3', { text: 'Verlauf' }),
        h('div', { class: 'row' },
          h('button', { class: 'btn f', onclick: function () { confirmBox('Verlauf löschen?', '„Weiterschauen“ und „Zuletzt gesehen“ werden geleert.', 'Löschen', function () { Resume.clear(); Store.del('recent.' + pid()); toast('Verlauf gelöscht'); }); } }, icon('trash'), 'Verlauf löschen'))),
      h('div', { class: 'panel' }, h('h3', { text: 'Über' }),
        h('p', { class: 'hint', text: CONFIG.appName + ' ' + CONFIG.version + ' · Dieser Player enthält keine Inhalte. Du bist selbst dafür verantwortlich, nur Streams zu nutzen, für die du eine Berechtigung hast. Datenschutz und Impressum: splix66.github.io/lumio-player' })));
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
    var bg = h('div', { class: 'detail-bg' });
    if (item.logo) bg.style.backgroundImage = 'url("' + String(item.logo).replace(/"/g, '%22') + '")';
    var info = h('div', { class: 'detail-info' }, h('h1', { text: item.name }));
    var main = h('div', { class: 'detail-main' }, h('div', { class: 'poster' }, posterArt(item)), info);
    var top = h('div', { class: 'detail-top' }, h('button', { class: 'btn f ghost', onclick: goBack }, icon('close'), 'Schließen'));
    var panel = h('div', { class: 'detail modal-panel' }, bg, top, main);
    var el = h('div', { class: 'modal' }, h('div', { class: 'modal-backdrop', onclick: goBack }), panel);
    return { el: el, panel: panel, info: info, bg: bg };
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
    var b = h('button', { class: 'btn f' });
    function paint() { clear(b); var on = Favs.has(item); b.appendChild(icon(on ? 'starFill' : 'star')); b.appendChild(document.createTextNode(on ? 'Favorit' : 'Merken')); }
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
        actions.appendChild(h('button', { class: 'btn f primary', 'data-autofocus': true, onclick: function () { playItem(item, { list: [item], index: 0 }); } }, icon('play'), 'Weiter bei ' + fmtTime(r.t)));
        actions.appendChild(h('button', { class: 'btn f', onclick: function () { playItem(item, { list: [item], index: 0, fromStart: true }); } }, icon('restart'), 'Von vorne'));
      } else {
        actions.appendChild(h('button', { class: 'btn f primary', 'data-autofocus': true, onclick: function () { playItem(item, { list: [item], index: 0 }); } }, icon('play'), 'Abspielen'));
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
      if (d.director || d.cast) f.info.appendChild(h('p', { class: 'hint', text: [d.director ? 'Regie: ' + d.director : '', d.cast ? 'Mit: ' + d.cast : ''].filter(Boolean).join(' · ') }));
      if (d.backdrop) f.bg.style.backgroundImage = 'url("' + d.backdrop + '")';
    }).catch(function () {});
    Screens.push('movie', f.el, { overlay: true, onShow: function () { var had = document.activeElement; paintActions(); if (!document.body.contains(had)) Nav.focusFirst(actions); } });
  }

  function showSeries(item) {
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
          h('span', { class: 'n', text: String(ep.num || i + 1) }),
          h('span', { class: 't' }, h('b', { text: ep.name }), ep.plot || ep.duration ? h('small', { text: [ep.duration, ep.plot].filter(Boolean).join(' · ') }) : null),
          r ? h('span', { class: 'seen' }, h('i', { style: 'width:' + Math.round(r.t / r.d * 100) + '%' })) : null));
      });
    }
    function paintContinue() {
      if (continueBtn && continueBtn.parentNode) continueBtn.parentNode.removeChild(continueBtn);
      var last = Resume.recent().filter(function (r) { return r.item.kind === 'episode' && r.item.seriesId === item.id; })[0];
      var target = last ? last.item : (seasons[0] && seasons[0].episodes[0]);
      if (!target) return;
      var label = last ? 'Weiter: S' + target.season + ' E' + target.num : 'Folge 1 abspielen';
      continueBtn = h('button', { class: 'btn f primary', 'data-autofocus': true, onclick: function () {
        var s = seasons.filter(function (x) { return x.num === target.season; })[0] || seasons[0];
        var idx = 0; s.episodes.forEach(function (e, i) { if (e.id === target.id) idx = i; });
        playItem(s.episodes[idx], { list: s.episodes, index: idx });
      } }, icon('play'), label);
      actions.insertBefore(continueBtn, actions.firstChild);
    }

    App.provider.seriesInfo(item).then(function (d) {
      metaBox.appendChild(metaLine(d || {}));
      if (d && d.plot) plotBox.textContent = d.plot;
      if (d && d.backdrop) f.bg.style.backgroundImage = 'url("' + d.backdrop + '")';
      seasons = (d && d.seasons) || [];
      if (!seasons.length) { clear(epBox).appendChild(stateBox('Keine Folgen gefunden', null)); return; }
      seasons.forEach(function (s) {
        seasonsBar.appendChild(h('button', { class: 'btn f', 'data-s': s.num, onclick: function () { renderEpisodes(s); } }, 'Staffel ' + s.num));
      });
      renderEpisodes(seasons[0]);
      paintContinue();
      if (Screens.top() && Screens.top().el === f.el) Nav.focus(continueBtn || $('.f', f.el));
    }, function (e) {
      clear(epBox).appendChild(stateBox('Laden fehlgeschlagen', e.message));
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
      var video = h('video', { playsinline: true, 'webkit-playsinline': true, autoplay: true, preload: 'auto' });
      self.video = video;
      self.title = h('h2');
      self.liveTag = h('span', { class: 'live-tag', text: 'LIVE' });
      self.info = h('div', { class: 'epg' });
      self.bar = h('div', { class: 'bar' }, h('i', { style: 'width:0%' }));
      self.times = h('div', { class: 'times' }, h('span', { text: '0:00' }), h('span', { text: '0:00' }));
      self.ctrls = h('div', { class: 'ctrls' });
      self.spinner = h('div', { class: 'spinner' });
      self.err = h('div', { class: 'state', style: 'display:none' });
      self.zap = h('div', { class: 'zap is-hidden' });
      self.osd = h('div', { class: 'osd' },
        h('div', { class: 'osd-top' }, h('button', { class: 'btn f', onclick: goBack }, icon('back'), h('span', { text: 'Zurück' })), self.liveTag, self.title),
        h('div', { class: 'osd-bottom' }, self.info, self.bar, self.times, self.ctrls));
      self.miniTitle = h('span', { class: 'mini-title' });
      self.miniUi = h('div', { class: 'mini-ui' },
        h('button', { class: 'mini-open f', title: 'Vollbild', onclick: function () { self.maximize(); } }, self.miniTitle),
        h('button', { class: 'mini-close f', title: 'Schließen', onclick: function () { self.close(); } }, icon('close')));
      self.el = h('div', { class: 'player' }, video, self.spinner, self.osd, self.zap, self.err, self.miniUi);

      self.bar.addEventListener('click', function (e) {
        if (!self.isVod() || !video.duration) return;
        var r = self.bar.getBoundingClientRect();
        video.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * video.duration;
      });
      self.el.addEventListener('click', function (e) { if (e.target === video || e.target === self.osd) self.toggleOsd(); });
      self.el.addEventListener('mousemove', function () { self.showOsd(); });

      video.addEventListener('waiting', function () { self.spinner.style.display = ''; });
      video.addEventListener('playing', function () { self.spinner.style.display = 'none'; self.err.style.display = 'none'; self.paintCtrls(); });
      video.addEventListener('pause', function () { self.paintCtrls(); self.showOsd(true); });
      video.addEventListener('loadedmetadata', function () {
        if (self.isVod() && self.resumeAt) { try { video.currentTime = self.resumeAt; } catch (e) {} toast('Fortgesetzt bei ' + fmtTime(self.resumeAt)); self.resumeAt = 0; }
      });
      video.addEventListener('timeupdate', function () { self.paintProgress(); });
      video.addEventListener('ended', function () { self.onEnded(); });
      video.addEventListener('error', function () { self.onError('Das Video konnte nicht abgespielt werden (Format oder Verbindung).'); });

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
      info.appendChild(h('p', { class: 'hint', text: 'Denselben Sender noch einmal wählen öffnet das Vollbild.' }));
    },

    switchTo: function (item, ctx) {
      this.saveResume();
      if (ctx) this.ctx = ctx;
      this.load(item);
    },

    load: function (item) {
      var self = this;
      self.item = item;
      self.triedAlt = false; self.retried = false;
      self.err.style.display = 'none';
      self.spinner.style.display = '';
      self.epgNow = ''; self.epgNext = '';
      if (self.miniTitle) self.miniTitle.textContent = item.name;
      self.lastPlace = '';
      self.title.textContent = item.kind === 'episode' ? (item.seriesName ? item.seriesName + ' · ' : '') + 'S' + item.season + ' E' + item.num + ' – ' + item.name : item.name;
      self.liveTag.style.display = item.kind === 'live' ? '' : 'none';
      self.bar.classList.toggle('seek', self.isVod());
      self.times.style.display = self.isVod() ? '' : 'none';
      self.bar.firstChild.style.width = '0%';
      clear(self.info);
      self.paintCtrls();
      self.showOsd();

      var r = Resume.get(item);
      self.resumeAt = self.isVod() && r && !(self.ctx && self.ctx.fromStart) ? r.t : 0;
      if (self.ctx) self.ctx.fromStart = false;
      if (item.kind === 'live') { Recent.push(item); self.loadEpg(); }

      var src = App.provider.streamUrl(item);
      self.alt = src.alt;
      self.attach(src.url);

      clearInterval(self.saveTimer);
      self.saveTimer = setInterval(function () { self.saveResume(); }, 10000);
    },

    attach: function (url) {
      var self = this, video = self.video;
      self.destroyHls();
      var nativeHls = !!video.canPlayType('application/vnd.apple.mpegurl');
      var preferNative = Platform.safari || Platform.tizen || Platform.webos;
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
              self.onError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'Der Stream ist nicht erreichbar.' : 'Der Stream konnte nicht abgespielt werden.');
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function () { self.playSafe(); });
          } else {
            video.src = url; self.playSafe();
          }
        });
      } else {
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
      if (self.alt && !self.triedAlt) { self.triedAlt = true; self.retried = false; self.attach(self.alt); return; }
      self.spinner.style.display = 'none';
      clear(self.err);
      self.err.appendChild(h('h3', { text: 'Wiedergabe nicht möglich' }));
      self.err.appendChild(h('p', { text: msg }));
      self.err.appendChild(h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'btn f primary', onclick: function () { self.load(self.item); } }, 'Erneut versuchen'),
        h('button', { class: 'btn f', onclick: goBack }, 'Schließen')));
      self.err.style.display = '';
      setTimeout(function () { if (!self.mini) Nav.focus($('.btn', self.err)); }, 30);
    },

    onEnded: function () {
      var self = this;
      Resume.set(self.item, 0, 0);
      var c = self.ctx;
      if (self.item.kind === 'episode' && c && c.list && c.index < c.list.length - 1) {
        toast('Nächste Folge startet …');
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
          if (next) self.info.appendChild(h('div', { class: 'next', text: 'Danach: ' + fmtClock(next.start) + '  ' + next.title }));
          self.epgNow = fmtClock(cur.start) + ' – ' + fmtClock(cur.end) + '  ' + cur.title;
          self.epgNext = next ? 'Danach: ' + fmtClock(next.start) + '  ' + next.title : '';
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
      this.bar.style.display = '';
      this.bar.firstChild.style.width = (v.currentTime / d * 100) + '%';
      this.times.firstChild.textContent = fmtTime(v.currentTime);
      this.times.lastChild.textContent = '-' + fmtTime(d - v.currentTime);
    },

    paintCtrls: function () {
      var self = this, v = self.video;
      if (!self.ctrls) return;
      var had = self.ctrls.contains(document.activeElement) ? document.activeElement.getAttribute('data-c') : null;
      clear(self.ctrls);
      var playBtn = h('button', { class: 'btn f big primary', 'data-c': 'play', 'data-autofocus': true, onclick: function () { self.togglePlay(); } }, icon(v.paused ? 'play' : 'pause'), h('span', { text: v.paused ? 'Abspielen' : 'Pause' }));
      if (self.isVod()) {
        self.ctrls.appendChild(h('button', { class: 'btn f', 'data-c': 'rew', onclick: function () { self.seek(-15); } }, icon('rew'), h('span', { text: '15 s' })));
        self.ctrls.appendChild(playBtn);
        self.ctrls.appendChild(h('button', { class: 'btn f', 'data-c': 'fwd', onclick: function () { self.seek(30); } }, h('span', { text: '30 s' }), icon('fwd')));
      } else {
        self.ctrls.appendChild(h('button', { class: 'btn f', 'data-c': 'prev', onclick: function () { self.zapBy(-1); } }, icon('up'), h('span', { text: 'Vorheriger' })));
        self.ctrls.appendChild(playBtn);
        self.ctrls.appendChild(h('button', { class: 'btn f', 'data-c': 'next', onclick: function () { self.zapBy(1); } }, icon('down'), h('span', { text: 'Nächster' })));
      }
      if (self.item && self.item.kind !== 'episode') {
        var on = Favs.has(self.item);
        self.ctrls.appendChild(h('button', { class: 'btn f', 'data-c': 'fav', onclick: function () { Favs.toggle(self.item); self.paintCtrls(); } }, icon(on ? 'starFill' : 'star'), h('span', { text: on ? 'Favorit' : 'Merken' })));
      }
      var target = had ? $('[data-c="' + had + '"]', self.ctrls) : null;
      if (target) Nav.focus(target);
    },

    togglePlay: function () { if (this.video.paused) this.playSafe(); else this.video.pause(); this.showOsd(); },
    seek: function (s) {
      var v = this.video;
      if (!v.duration || !isFinite(v.duration)) return;
      v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + s));
      this.paintProgress(); this.showOsd();
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
        if (self.isVod() && k === KEY.LEFT) { self.seek(-15); return true; }
        if (self.isVod() && k === KEY.RIGHT) { self.seek(30); return true; }
        if (k === KEY.ENTER || k === KEY.UP || k === KEY.DOWN || k === KEY.LEFT || k === KEY.RIGHT) { self.showOsd(); return true; }
        return false;
      }
      self.showOsd();
      return false;
    },

    saveResume: function () {
      var v = this.video;
      if (this.item && this.isVod() && v && v.duration && isFinite(v.duration)) Resume.set(this.item, v.currentTime, v.duration);
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
    if (Player.el && Screens.top() && Screens.top().el === Player.el && Player.handleKey(k)) { e.preventDefault(); return; }

    var t = e.target;
    var inInput = t && t.tagName === 'INPUT';
    if (dirs[k]) {
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
  function boot() {
    Theme.apply();
    Theme.watch();
    if (Platform.tv) document.body.classList.add('is-tv');
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', function () { INPUT.mode = 'pointer'; if (!Platform.tv) document.body.classList.remove('kbd'); }, true);
    // Video weiterlaufen lassen, aber beim Verlassen der App den Fortschritt sichern
    document.addEventListener('visibilitychange', function () { if (document.hidden && Player.el) Player.saveResume(); });
    registerTvKeys();

    var active = Profiles.get(Store.get('active'));
    if (active) activateProfile(active);
    else showProfiles();
    Cloud.start();
  }

  // Für automatische Tests von außen erreichbar
  window.LumioDebug = { parseM3U: parseM3U, parseXtreamLink: parseXtreamLink, normalizeServer: normalizeServer, Nav: Nav, Screens: Screens };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
