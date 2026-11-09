/* ==========================================================
   Telvo Player – Verwaltungsbereich (admin.html)
   Anmeldung über Supabase Auth, Daten nur über die Funktionen aus server/admin.sql.
   Sicherheit:
   - Alle Inhalte (Support-Texte kommen von Kunden!) werden ausschließlich als Text
     eingefügt – nie als HTML.
   - Anmeldung gilt nur in diesem Browser-Tab (sessionStorage) und endet nach
     30 Minuten ohne Aktivität.
   - Kundendaten wie Passwörter oder vollständige Playlist-Links liefert der Server gar nicht erst.
   Test ohne Online-Dienst: http://localhost:…/admin.html?demo (nur auf localhost, erfundene Daten)
   ========================================================== */
(function () {
  'use strict';

  // Schutz gegen Einbetten in fremde Seiten (Clickjacking)
  if (window.top !== window.self) { document.body.textContent = ''; return; }

  var SUPABASE = 'https://oofzhklrbrpxjoicwbsf.supabase.co';
  var KEY = 'sb_publishable_cx6n8buREFat_yE7kKW6FA_SnMsOQX7';   // öffentlicher Schlüssel (wie im Kundenportal)
  var SESSION_KEY = 'lumio.admin.session';
  var IDLE_MINUTES = 30;
  var PAGE = 50;
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var DEMO = LOCAL && /[?&]demo\b/.test(location.search);

  /* ---------------- Helfer ---------------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function icon(name) {
    var s = svg('svg', { class: 'i', 'aria-hidden': 'true' });
    s.appendChild(svg('use', { href: '#i-' + name }));
    return s;
  }
  function btn(label, cls, ic, onClick) {
    var b = el('button', cls);
    b.type = 'button';
    if (ic) b.appendChild(icon(ic));
    if (label) b.appendChild(el('span', null, label));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  var DF = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  var DTF = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var TF = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
  var NF = new Intl.NumberFormat('de-DE');
  function d(v) { return v ? new Date(v) : null; }
  function fmtDate(v) { return v ? DF.format(d(v)) : '–'; }
  function fmtDateTime(v) { return v ? DTF.format(d(v)) : '–'; }
  function ago(v) {
    if (!v) return '–';
    var s = (Date.now() - d(v).getTime()) / 1000;
    if (s < 90) return 'gerade eben';
    if (s < 3600) return 'vor ' + Math.round(s / 60) + ' Min.';
    if (s < 86400) return 'vor ' + Math.round(s / 3600) + ' Std.';
    if (s < 86400 * 30) { var n = Math.round(s / 86400); return n === 1 ? 'vor 1 Tag' : 'vor ' + n + ' Tagen'; }
    return fmtDate(v);
  }
  function num(n) { return NF.format(Number(n) || 0); }
  var toastTimer = null;
  function toast(text) {
    var t = $('toast');
    t.textContent = text; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }
  function debounce(fn, ms) { var t = null; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function isEmail(s) { return /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[A-Za-z]{2,}$/.test(String(s || '').trim()); }
  function copyText(text) {
    var done = function () { toast(text + ' kopiert'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast(text); });
    else toast(text);
  }
  // Zweimal klicken zum Bestätigen (wie im Kundenportal) – schützt vor Versehen
  function armed(b, label, armedLabel, action) {
    var span = b.querySelector('span'), timer = null;
    b.addEventListener('click', function () {
      if (!b.classList.contains('is-armed')) {
        b.classList.add('is-armed'); span.textContent = armedLabel;
        timer = setTimeout(function () { b.classList.remove('is-armed'); span.textContent = label; }, 4000);
        return;
      }
      clearTimeout(timer);
      b.classList.remove('is-armed'); span.textContent = label;
      action();
    });
    return b;
  }
  function errorBox(box, err, retry) {
    clear(box);
    var p = el('div', 'empty');
    p.appendChild(el('p', 'msg bad', err && err.message ? err.message : String(err)));
    if (retry) { var r = btn('Erneut versuchen', 'ghost small', 'refresh', retry); r.style.marginTop = '.8rem'; p.appendChild(r); }
    box.appendChild(p);
  }

  /* ---------------- Netzwerk ---------------- */
  function request(url, opts, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 15000);
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        return { status: r.status, ok: r.ok, json: j };
      });
    }, function (e) {
      clearTimeout(timer);
      throw new Error(e && e.name === 'AbortError' ? 'Zeitüberschreitung – der Server antwortet nicht.' : 'Keine Verbindung. Bitte Internet prüfen.');
    });
  }

  var Auth = {
    s: null, refreshing: null,
    load: function () {
      try { this.s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { this.s = null; }
      return this.s;
    },
    set: function (j) {
      this.s = {
        access: j.access_token, refresh: j.refresh_token,
        exp: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
        email: (j.user && j.user.email) || (this.s && this.s.email) || ''
      };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.s)); } catch (e) {}
    },
    clear: function () { this.s = null; try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} },
    call: function (path, body, token) {
      var headers = { apikey: KEY, 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return request(SUPABASE + '/auth/v1/' + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
    },
    login: function (email, password) {
      var self = this;
      if (DEMO) { self.set({ access_token: 'demo', refresh_token: 'demo', expires_in: 3600, user: { email: email || 'demo@example.com' } }); return Promise.resolve(); }
      return self.call('token?grant_type=password', { email: email, password: password }).then(function (res) {
        if (!res.ok) throw new Error(authError(res));
        self.set(res.json);
      });
    },
    refresh: function () {
      var self = this;
      if (!self.s || !self.s.refresh) return Promise.reject(new Error('Nicht angemeldet.'));
      if (self.refreshing) return self.refreshing;
      self.refreshing = self.call('token?grant_type=refresh_token', { refresh_token: self.s.refresh }).then(function (res) {
        self.refreshing = null;
        if (!res.ok) { signOut('Sitzung abgelaufen. Bitte neu anmelden.'); throw new Error('Sitzung abgelaufen.'); }
        self.set(res.json);
        return self.s.access;
      }, function (e) { self.refreshing = null; throw e; });
      return self.refreshing;
    },
    token: function () {
      if (!this.s) return Promise.reject(new Error('Nicht angemeldet.'));
      if (DEMO || this.s.exp - 60 > Date.now() / 1000) return Promise.resolve(this.s.access);
      return this.refresh();
    },
    logout: function () {
      var t = this.s && this.s.access;
      this.clear();
      if (t && !DEMO) this.call('logout', {}, t).catch(function () {});
    }
  };
  function authError(res) {
    var j = res.json || {};
    var code = String(j.error_code || j.error || j.code || ''), text = String(j.msg || j.error_description || j.message || '');
    if (res.status === 429) return 'Zu viele Anmeldeversuche. Bitte kurz warten und erneut versuchen.';
    if (code === 'email_not_confirmed') return 'Die E-Mail-Adresse ist noch nicht bestätigt.';
    if (res.status === 400 && /invalid/i.test(code + ' ' + text)) return 'E-Mail oder Passwort falsch.';
    return text || ('Anmeldung fehlgeschlagen (HTTP ' + res.status + ').');
  }

  function api(fn, body, retried) {
    if (DEMO) return Mock.call(fn, body || {});
    return Auth.token().then(function (tok) {
      return request(SUPABASE + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
    }).then(function (res) {
      if (res.status === 401 && !retried) return Auth.refresh().then(function () { return api(fn, body, true); });
      if (res.status === 401) { signOut('Sitzung abgelaufen. Bitte neu anmelden.'); throw new Error('Sitzung abgelaufen.'); }
      var j = res.json;
      if (!res.ok) {
        if (j && j.code === 'PGRST202') throw new Error('Die Verwaltungsfunktionen fehlen in der Datenbank. Bitte server/admin.sql im Supabase SQL-Editor ausführen.');
        throw new Error((j && (j.message || j.msg)) || ('Server-Fehler (HTTP ' + res.status + ').'));
      }
      if (!j || j.ok !== true) throw new Error((j && j.error) || 'Unerwartete Antwort vom Server.');
      return j;
    });
  }

  /* ---------------- Anmeldung, Abmeldung, Inaktivität ---------------- */
  var lastActive = Date.now(), idleTimer = null;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true, capture: true });
  });
  function startIdle() {
    clearInterval(idleTimer);
    lastActive = Date.now();
    idleTimer = setInterval(function () {
      if (Date.now() - lastActive > IDLE_MINUTES * 60000) signOut('Aus Sicherheitsgründen abgemeldet (' + IDLE_MINUTES + ' Minuten ohne Aktivität).');
    }, 30000);
  }
  function showLogin(msg) {
    $('app').hidden = true; closeDrawer(true);
    $('login').hidden = false;
    $('demoNote').hidden = !DEMO;
    var m = $('loginMsg'); m.textContent = msg || ''; m.className = 'msg' + (msg ? ' bad' : '');
    $('password').value = '';
    setTimeout(function () { ($('email').value ? $('password') : $('email')).focus(); }, 30);
  }
  function signOut(msg) {
    clearInterval(idleTimer);
    Auth.logout();
    resetState();
    showLogin(msg);
  }
  function enter(email) {
    $('login').hidden = true;
    $('app').hidden = false;
    $('whoEmail').textContent = email || (Auth.s && Auth.s.email) || '';
    $('demoBadge').hidden = !DEMO;
    startIdle();
    var first = HASH[location.hash] || 'overview';
    showTab(first, true);
    // Zähler „offene Anfragen“ im Menü auch dann füllen, wenn man direkt in einem anderen Bereich startet
    if (first !== 'overview') api('admin_list_support', { p_filter: 'open', p_limit: 1, p_offset: 0 }).then(function (r) { setSupportCount(r.total); }, function () {});
  }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('email').value.trim(), pw = $('password').value, b = $('loginBtn'), m = $('loginMsg');
    if (!DEMO && (!isEmail(email) || !pw)) { m.textContent = 'Bitte E-Mail und Passwort eingeben.'; m.className = 'msg bad'; return; }
    b.disabled = true; b.textContent = 'Anmelden …'; m.textContent = '';
    Auth.login(email, pw).then(function () { return api('admin_whoami'); }).then(function (r) {
      b.disabled = false; b.textContent = 'Anmelden';
      enter(r.email);
    }, function (err) {
      b.disabled = false; b.textContent = 'Anmelden';
      var denied = /Berechtigung/.test(err.message);
      if (Auth.s) Auth.logout();
      m.textContent = denied ? 'Dieses Konto hat keine Admin-Berechtigung.' : err.message;
      m.className = 'msg bad';
      $('password').value = ''; $('password').focus();
    });
  });
  $('logoutBtn').addEventListener('click', function () { signOut('Du wurdest abgemeldet.'); });

  /* ---------------- Bereiche ---------------- */
  var TABS = ['overview', 'support', 'devices', 'log'];
  var HASH = { '#support': 'support', '#geraete': 'devices', '#protokoll': 'log', '#uebersicht': 'overview' };
  var HASH_OF = { overview: '#uebersicht', support: '#support', devices: '#geraete', log: '#protokoll' };
  var loaded = {};
  function showTab(name, force) {
    if (TABS.indexOf(name) < 0) name = 'overview';
    Array.prototype.forEach.call(document.querySelectorAll('.nav [data-tab]'), function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name));
    });
    TABS.forEach(function (t) { $('tab-' + t).hidden = t !== name; });
    try { history.replaceState(null, '', location.pathname + location.search + HASH_OF[name]); } catch (e) {}
    if (force || !loaded[name]) { loaded[name] = true; LOADERS[name](); }
    window.scrollTo(0, 0);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.nav [data-tab]'), function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });
  // Zurück-Taste des Browsers und direkte Links (…/admin.html#geraete) wechseln den Bereich
  window.addEventListener('hashchange', function () {
    if (!$('app').hidden && HASH[location.hash]) showTab(HASH[location.hash]);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-go')); });
  });
  function setSupportCount(n) { $('supportCount').textContent = n > 0 ? String(n) : ''; $('supportCount').title = n > 0 ? n + ' offen' : ''; }

  /* ---------------- Übersicht ---------------- */
  function kpi(label, value, sub, opts) {
    opts = opts || {};
    var k = el(opts.onClick ? 'button' : 'div', 'kpi' + (opts.alert ? ' is-alert' : ''));
    if (opts.onClick) { k.type = 'button'; k.addEventListener('click', opts.onClick); }
    k.appendChild(el('small', null, label));
    k.appendChild(el('b', null, value));
    if (sub) k.appendChild(el('span', null, sub));
    return k;
  }
  function loadOverview() {
    var box = $('kpis');
    clear(box);
    for (var i = 0; i < 5; i++) box.appendChild(el('div', 'skeleton'));
    clear($('chart'));
    api('admin_stats').then(function (s) {
      clear(box);
      box.appendChild(kpi('Geräte gesamt', num(s.devices), '+' + num(s.new7) + ' in 7 Tagen'));
      box.appendChild(kpi('Aktiv heute', num(s.active1), num(s.active7) + ' in 7 Tagen'));
      box.appendChild(kpi('Playlists', num(s.playlists), 'Xtream ' + num(s.xtream) + ' · M3U ' + num(s.m3u)));
      box.appendChild(kpi('Offene Anfragen', num(s.supportOpen), num(s.support7) + ' neu in 7 Tagen',
        { alert: s.supportOpen > 0, onClick: function () { showTab('support'); } }));
      box.appendChild(kpi('Geräte mit Sperre', num(s.locked), 'nach zu vielen falschen Schlüsseln',
        { alert: s.locked > 0, onClick: function () { Devices.filter = 'locked'; paintSeg('dfilter', 'locked'); showTab('devices', true); } }));
      setSupportCount(s.supportOpen);
      Chart.data = s.daily || [];
      Chart.draw();
    }, function (err) { errorBox(box, err, loadOverview); });
    var list = $('latestSupport');
    clear(list).appendChild(el('li', 'empty', 'Lädt …'));
    api('admin_list_support', { p_filter: 'open', p_limit: 5, p_offset: 0 }).then(function (r) {
      clear(list);
      if (!r.items.length) { list.appendChild(el('li', 'empty', 'Keine offenen Anfragen – alles erledigt.')); return; }
      r.items.forEach(function (it) {
        var li = el('li'), b = el('button');
        b.type = 'button';
        var top = el('span', 't-meta');
        top.appendChild(el('span', 'chip', it.topic));
        top.appendChild(el('span', null, ago(it.created_at)));
        b.appendChild(top);
        b.appendChild(el('p', null, it.message));
        b.addEventListener('click', function () { Support.q = it.mac; $('supportSearch').value = it.mac; showTab('support', true); });
        li.appendChild(b); list.appendChild(li);
      });
    }, function (err) { errorBox(list, err); });
  }
  $('reloadStats').addEventListener('click', loadOverview);

  /* Balkendiagramm „Neue Geräte pro Tag“: eine Datenreihe, Akzentfarbe, dünne Balken mit
     gerundeten Enden an der Grundlinie, Tooltip beim Überfahren, Tabelle als Alternative. */
  var Chart = {
    data: [],
    draw: function () {
      var box = $('chart'), data = this.data;
      clear(box);
      var table = clear($('chartTable'));
      var hr = el('tr'); hr.appendChild(el('th', null, 'Tag')); hr.appendChild(el('th', null, 'Neue Geräte')); table.appendChild(hr);
      data.forEach(function (p) { var tr = el('tr'); tr.appendChild(el('td', null, fmtDate(p.day))); tr.appendChild(el('td', null, num(p.n))); table.appendChild(tr); });
      if (!data.length) { box.appendChild(el('p', 'empty', 'Noch keine Daten.')); return; }
      var W = box.clientWidth || 600, H = box.clientHeight || 208;
      var padL = 30, padR = 4, padT = 18, padB = 24, iw = W - padL - padR, ih = H - padT - padB;
      var max = 0; data.forEach(function (p) { max = Math.max(max, Number(p.n) || 0); });
      var step = niceStep(max), top = Math.max(step * 2, Math.ceil(max / step) * step);
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Neue Geräte pro Tag, letzte ' + data.length + ' Tage, höchstens ' + max + ' an einem Tag' });
      for (var v = 0; v <= top; v += step) {
        var y = padT + ih - (v / top) * ih;
        s.appendChild(svg('line', { class: 'grid', x1: padL, x2: W - padR, y1: y, y2: y }));
        var t = svg('text', { class: 'axis', x: padL - 8, y: y + 4, 'text-anchor': 'end' }); t.textContent = num(v); s.appendChild(t);
      }
      var band = iw / data.length, bw = Math.max(4, Math.min(26, band - Math.max(2, band * 0.35)));
      var every = band < 26 ? 3 : band < 40 ? 2 : 1, maxIdx = -1, last = data.length - 1;
      data.forEach(function (p, i) { if (maxIdx < 0 || p.n > data[maxIdx].n) maxIdx = i; });
      data.forEach(function (p, i) {
        var n = Number(p.n) || 0, x = padL + i * band + (band - bw) / 2, h = (n / top) * ih, yb = padT + ih;
        var hit = svg('rect', { class: 'hit', x: padL + i * band, y: padT, width: band, height: ih });
        s.appendChild(hit);
        var bar = svg('path', { class: 'bar', d: roundedTop(x, yb - h, bw, h, Math.min(4, bw / 2, h)) });
        s.appendChild(bar);
        hit.addEventListener('mousemove', function (e) { bar.classList.add('is-hot'); Tip.show(e, fmtDate(p.day), num(n) + (n === 1 ? ' neues Gerät' : ' neue Geräte')); });
        hit.addEventListener('mouseleave', function () { bar.classList.remove('is-hot'); Tip.hide(); });
        // Nur ausgewählte Werte direkt beschriften: Höchstwert und heute
        if ((i === maxIdx || i === last) && n > 0) {
          var lab = svg('text', { class: 'val', x: x + bw / 2, y: yb - h - 6, 'text-anchor': 'middle' }); lab.textContent = num(n); s.appendChild(lab);
        }
        if ((last - i) % every === 0) {
          var dl = svg('text', { class: 'axis', x: padL + i * band + band / 2, y: H - 6, 'text-anchor': 'middle' });
          var dt = d(p.day); dl.textContent = i === last ? 'heute' : (dt.getDate() + '.' + (dt.getMonth() + 1) + '.');
          s.appendChild(dl);
        }
      });
      box.appendChild(s);
    }
  };
  function niceStep(max) {
    if (max <= 4) return 1;
    var raw = max / 4, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }
  function roundedTop(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.max(0, r);
    return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) +
      'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + h) + 'Z';
  }
  var Tip = {
    show: function (e, title, value) {
      var t = $('tip');
      clear(t); t.appendChild(el('div', null, title)); t.appendChild(el('b', null, value));
      t.hidden = false;
      var x = e.clientX + 14, y = e.clientY - 44;
      if (x + t.offsetWidth > window.innerWidth - 8) x = e.clientX - t.offsetWidth - 14;
      t.style.left = x + 'px'; t.style.top = Math.max(8, y) + 'px';
    },
    hide: function () { $('tip').hidden = true; }
  };
  window.addEventListener('resize', debounce(function () { if (!$('tab-overview').hidden && Chart.data.length) Chart.draw(); }, 150));

  /* ---------------- Support ---------------- */
  var Support = { filter: 'open', q: '', offset: 0, total: 0, req: 0 };
  function paintSeg(attr, value) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-' + attr) === value));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (b) {
    b.addEventListener('click', function () { Support.filter = b.getAttribute('data-filter'); paintSeg('filter', Support.filter); loadSupport(); });
  });
  $('supportSearch').addEventListener('input', debounce(function () { Support.q = $('supportSearch').value.trim(); loadSupport(); }, 300));
  $('supportMore').addEventListener('click', function () { loadSupport(true); });
  function loadSupport(more) {
    var list = $('supportList'), req = ++Support.req;
    if (!more) { Support.offset = 0; clear(list).appendChild(el('div', 'skeleton')); }
    $('supportMore').hidden = true;
    api('admin_list_support', { p_filter: Support.filter, p_search: Support.q || null, p_limit: PAGE, p_offset: Support.offset }).then(function (r) {
      if (req !== Support.req) return;
      if (!more) clear(list);
      Support.total = r.total; Support.offset += r.items.length;
      $('supportInfo').textContent = r.total === 1 ? '1 Nachricht' : num(r.total) + ' Nachrichten';
      if (!r.total) list.appendChild(el('p', 'empty', Support.q ? 'Nichts gefunden.' : Support.filter === 'open' ? 'Keine offenen Anfragen – alles erledigt.' : 'Keine Nachrichten.'));
      r.items.forEach(function (it) { list.appendChild(ticket(it)); });
      $('supportMore').hidden = Support.offset >= r.total;
    }, function (err) { if (req === Support.req) errorBox(list, err, function () { loadSupport(); }); });
  }
  function ticket(it) {
    var card = el('article', 'ticket' + (it.done ? ' is-done' : ''));
    function paint() {
      clear(card);
      card.className = 'ticket' + (it.done ? ' is-done' : '');
      var head = el('div', 't-head');
      head.appendChild(el('span', 'chip', it.topic));
      var st = el('span', 'badge ' + (it.done ? 'ok' : 'warn'));
      st.appendChild(icon(it.done ? 'check' : 'mail')); st.appendChild(el('span', null, it.done ? 'Erledigt' : 'Offen'));
      head.appendChild(st);
      var when = el('span', 'hint', ago(it.created_at)); when.title = fmtDateTime(it.created_at);
      head.appendChild(when);
      var mac = el('button', 'mac-btn', it.mac); mac.type = 'button'; mac.title = 'Gerät öffnen';
      mac.addEventListener('click', function () { openDevice(it.mac, mac); });
      head.appendChild(mac);
      card.appendChild(head);
      card.appendChild(el('p', 't-msg', it.message));
      var meta = el('div', 't-meta');
      var c = el('span'); c.appendChild(el('span', 'lbl', 'Kontakt: '));
      if (it.contact && isEmail(it.contact)) {
        var a = el('a', null, it.contact.trim());
        a.href = 'mailto:' + it.contact.trim() + '?subject=' + encodeURIComponent('Telvo Player – ' + it.topic);
        a.rel = 'noopener';
        c.appendChild(a);
      } else c.appendChild(document.createTextNode(it.contact || 'keine Angabe'));
      meta.appendChild(c);
      if (it.done && it.handled_at) meta.appendChild(el('span', null, 'Erledigt ' + fmtDateTime(it.handled_at) + (it.handled_by ? ' von ' + it.handled_by : '')));
      card.appendChild(meta);
      var act = el('div', 't-actions');
      var note = el('textarea'); note.placeholder = 'Interne Notiz (nur für Admins sichtbar)'; note.maxLength = 2000; note.value = it.admin_note || '';
      note.setAttribute('aria-label', 'Interne Notiz');
      var save = btn('Notiz speichern', 'ghost small', null, function () {
        save.disabled = true;
        api('admin_update_support', { p_id: it.id, p_note: note.value }).then(function () {
          save.disabled = false; it.admin_note = note.value.trim() || null; toast('Notiz gespeichert');
        }, function (err) { save.disabled = false; toast(err.message); });
      });
      var toggle = btn(it.done ? 'Wieder öffnen' : 'Als erledigt markieren', it.done ? 'ghost small' : 'primary small', it.done ? 'undo' : 'check', function () {
        toggle.disabled = true;
        var to = !it.done;
        api('admin_update_support', { p_id: it.id, p_done: to }).then(function () {
          it.done = to;
          it.handled_at = to ? new Date().toISOString() : null;
          it.handled_by = to ? (Auth.s && Auth.s.email) || null : null;
          toast(to ? 'Als erledigt markiert' : 'Wieder geöffnet');
          var c = Number($('supportCount').textContent) || 0;
          setSupportCount(Math.max(0, c + (to ? -1 : 1)));
          loaded.overview = false;
          // Passt nicht mehr zum Filter: Karte entfernen
          if ((Support.filter === 'open' && to) || (Support.filter === 'done' && !to)) {
            card.parentNode && card.parentNode.removeChild(card);
            Support.total--; Support.offset--;
            $('supportInfo').textContent = Support.total === 1 ? '1 Nachricht' : num(Support.total) + ' Nachrichten';
            if (!Support.total) $('supportList').appendChild(el('p', 'empty', 'Keine Nachrichten mehr in dieser Ansicht.'));
          } else paint();
        }, function (err) { toggle.disabled = false; toast(err.message); });
      });
      act.appendChild(note); act.appendChild(save); act.appendChild(toggle);
      card.appendChild(act);
    }
    paint();
    return card;
  }

  /* ---------------- Geräte ---------------- */
  var Devices = { filter: 'all', q: '', offset: 0, req: 0 };
  Array.prototype.forEach.call(document.querySelectorAll('[data-dfilter]'), function (b) {
    b.addEventListener('click', function () { Devices.filter = b.getAttribute('data-dfilter'); paintSeg('dfilter', Devices.filter); loadDevices(); });
  });
  $('deviceSearch').addEventListener('input', debounce(function () { Devices.q = $('deviceSearch').value.trim(); loadDevices(); }, 300));
  $('deviceMore').addEventListener('click', function () { loadDevices(true); });
  function statusBadges(dv) {
    var box = el('span', 'row');
    var locked = dv.locked_until && d(dv.locked_until) > new Date();
    function badge(cls, ic, text) { var b = el('span', 'badge ' + cls); if (ic) b.appendChild(icon(ic)); b.appendChild(el('span', null, text)); box.appendChild(b); }
    if (locked) badge('bad', 'lock', 'Gesperrt bis ' + TF.format(d(dv.locked_until)));
    else if (dv.fails > 0) badge('warn', null, dv.fails === 1 ? '1 Fehlversuch' : dv.fails + ' Fehlversuche');
    var active = dv.last_seen && Date.now() - d(dv.last_seen).getTime() < 7 * 864e5;
    badge(active ? 'ok' : 'mute', null, active ? 'Aktiv' : 'Inaktiv');
    if (dv.support_open > 0) badge('warn', 'mail', dv.support_open + ' offen');
    return box;
  }
  function loadDevices(more) {
    var rows = $('deviceRows'), req = ++Devices.req;
    if (!more) {
      Devices.offset = 0;
      clear(rows);
      var tr = el('tr'), td = el('td'); td.colSpan = 5; td.appendChild(el('div', 'skeleton')); tr.appendChild(td); rows.appendChild(tr);
    }
    $('deviceMore').hidden = true;
    api('admin_list_devices', { p_search: Devices.q || null, p_filter: Devices.filter, p_limit: PAGE, p_offset: Devices.offset }).then(function (r) {
      if (req !== Devices.req) return;
      if (!more) clear(rows);
      Devices.offset += r.items.length;
      $('deviceInfo').textContent = r.total === 1 ? '1 Gerät' : num(r.total) + ' Geräte';
      if (!r.total) { var tr = el('tr'), td = el('td', 'empty', 'Keine Geräte gefunden.'); td.colSpan = 5; tr.appendChild(td); rows.appendChild(tr); }
      r.items.forEach(function (dv) {
        var tr = el('tr', 'click');
        tr.tabIndex = 0;
        tr.setAttribute('aria-label', 'Gerät ' + dv.mac + ' öffnen');
        var c1 = el('td', 'mono', dv.mac);
        var c2 = el('td', null, ago(dv.last_seen)); c2.title = fmtDateTime(dv.last_seen); c2.setAttribute('data-label', 'Zuletzt aktiv');
        var c3 = el('td', null, fmtDate(dv.created_at)); c3.setAttribute('data-label', 'Angelegt');
        var c4 = el('td', 'num', num(dv.playlists)); c4.setAttribute('data-label', 'Playlists');
        var c5 = el('td'); c5.appendChild(statusBadges(dv));
        [c1, c2, c3, c4, c5].forEach(function (c) { tr.appendChild(c); });
        tr.addEventListener('click', function () { openDevice(dv.mac, tr); });
        tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDevice(dv.mac, tr); } });
        rows.appendChild(tr);
      });
      $('deviceMore').hidden = Devices.offset >= r.total;
    }, function (err) {
      if (req !== Devices.req) return;
      clear(rows);
      var tr = el('tr'), td = el('td'); td.colSpan = 5; tr.appendChild(td); rows.appendChild(tr);
      errorBox(td, err, function () { loadDevices(); });
    });
  }

  /* ---------------- Geräte-Details (Seitenpanel) ---------------- */
  var drawerOpener = null;
  function openDevice(mac, opener) {
    drawerOpener = opener || document.activeElement;
    var body = clear($('drawerBody'));
    $('drawerTitle').textContent = mac;
    body.appendChild(el('div', 'skeleton'));
    $('drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var c = $('drawer').querySelector('.drawer-head button'); if (c) c.focus(); }, 30);
    api('admin_device', { p_mac: mac }).then(function (r) { renderDevice(r); }, function (err) { errorBox(body, err, function () { openDevice(mac, drawerOpener); }); });
  }
  function renderDevice(r) {
    var dv = r.device, body = clear($('drawerBody'));
    var sec1 = el('section');
    var top = el('div', 'row');
    top.appendChild(statusBadges(dv));
    top.appendChild(btn('MAC kopieren', 'ghost small', 'copy', function () { copyText(dv.mac); }));
    sec1.appendChild(top);
    var kv = el('dl', 'kv');
    function row(k, v, title) { kv.appendChild(el('dt', null, k)); var dd = el('dd', null, v); if (title) dd.title = title; kv.appendChild(dd); }
    row('Angelegt', fmtDateTime(dv.created_at));
    row('Zuletzt aktiv', ago(dv.last_seen), fmtDateTime(dv.last_seen));
    row('Fehlversuche', String(dv.fails || 0));
    row('Sperre', dv.locked_until && d(dv.locked_until) > new Date() ? 'bis ' + fmtDateTime(dv.locked_until) : 'keine');
    kv.style.marginTop = '1rem';
    sec1.appendChild(kv);
    body.appendChild(sec1);

    var sec2 = el('section');
    sec2.appendChild(el('h3', null, 'Playlists (' + r.playlists.length + ')'));
    if (!r.playlists.length) sec2.appendChild(el('p', 'hint', 'Keine Playlists online gespeichert.'));
    else {
      var ul = el('ul', 'plist');
      r.playlists.forEach(function (p) {
        var li = el('li');
        li.appendChild(icon(p.type === 'xtream' ? 'server' : 'list'));
        var t = el('div', 't');
        t.appendChild(el('b', null, p.name));
        t.appendChild(el('small', null, (p.type === 'xtream' ? 'Xtream' : 'M3U') + ' · ' + (p.host || 'unbekannter Server') + ' · seit ' + fmtDate(p.created_at)));
        li.appendChild(t);
        ul.appendChild(li);
      });
      sec2.appendChild(ul);
      sec2.appendChild(el('p', 'hint', 'Zugangsdaten (Benutzername, Passwort, vollständiger Link) werden aus Datenschutzgründen nicht angezeigt.'));
    }
    body.appendChild(sec2);

    var sec3 = el('section');
    sec3.appendChild(el('h3', null, 'Support-Nachrichten (' + r.support.length + ')'));
    if (!r.support.length) sec3.appendChild(el('p', 'hint', 'Keine.'));
    else {
      var ul2 = el('ul', 'mini-list');
      r.support.forEach(function (s) {
        var li = el('li'), b = el('button'); b.type = 'button';
        var m = el('span', 't-meta');
        m.appendChild(el('span', 'chip', s.topic));
        m.appendChild(el('span', 'badge ' + (s.done ? 'ok' : 'warn'), s.done ? 'Erledigt' : 'Offen'));
        m.appendChild(el('span', null, fmtDateTime(s.created_at)));
        b.appendChild(m);
        b.addEventListener('click', function () {
          closeDrawer();
          Support.filter = 'all'; paintSeg('filter', 'all');
          Support.q = dv.mac; $('supportSearch').value = dv.mac;
          showTab('support', true);
        });
        li.appendChild(b); ul2.appendChild(li);
      });
      sec3.appendChild(ul2);
    }
    body.appendChild(sec3);

    var dz = el('section', 'danger-zone');
    dz.appendChild(el('h3', null, 'Aktionen'));
    var acts = el('div', 'row');
    if (dv.fails > 0 || (dv.locked_until && d(dv.locked_until) > new Date())) {
      acts.appendChild(btn('Sperre aufheben', 'ghost small', 'unlock', function (e) {
        var b = e.currentTarget; b.disabled = true;
        api('admin_unlock_device', { p_mac: dv.mac }).then(function () {
          toast('Sperre aufgehoben'); loaded.overview = false; openDevice(dv.mac, drawerOpener);
          if (!$('tab-devices').hidden) loadDevices();
        }, function (err) { b.disabled = false; toast(err.message); });
      }));
    }
    var del = btn('Gerät löschen', 'ghost small danger', 'trash');
    armed(del, 'Gerät löschen', 'Wirklich löschen? Nochmal klicken', function () {
      del.disabled = true;
      api('admin_delete_device', { p_mac: dv.mac }).then(function () {
        toast('Gerät ' + dv.mac + ' gelöscht'); loaded.overview = false; closeDrawer();
        if (!$('tab-devices').hidden) loadDevices();
        if (!$('tab-support').hidden) loadSupport();
      }, function (err) { del.disabled = false; toast(err.message); });
    });
    acts.appendChild(del);
    dz.appendChild(acts);
    dz.appendChild(el('p', null, 'Löschen entfernt das Gerät mit allen online gespeicherten Playlists und Support-Nachrichten. Beim nächsten Abgleich verschwinden diese Playlists auch auf dem Gerät des Kunden. Meldet sich das Gerät wieder, wird es neu (leer) angelegt.'));
    body.appendChild(dz);
  }
  function closeDrawer(silent) {
    if ($('drawer').hidden) return;
    $('drawer').hidden = true;
    document.body.style.overflow = '';
    if (!silent && drawerOpener && document.body.contains(drawerOpener)) try { drawerOpener.focus(); } catch (e) {}
    drawerOpener = null;
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { closeDrawer(); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('drawer').hidden) { e.preventDefault(); closeDrawer(); }
    // Fokus im Panel halten, solange es offen ist
    if (e.key === 'Tab' && !$('drawer').hidden) {
      var f = Array.prototype.filter.call($('drawer').querySelectorAll('button, a[href], textarea, input'), function (x) { return !x.disabled && x.offsetParent; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------------- Protokoll ---------------- */
  var ACTIONS = {
    support_done: 'Support erledigt', support_reopen: 'Support wieder geöffnet', support_note: 'Support-Notiz gespeichert',
    device_unlock: 'Gerätesperre aufgehoben', device_delete: 'Gerät gelöscht'
  };
  var Log = { offset: 0 };
  $('logMore').addEventListener('click', function () { loadLog(true); });
  function loadLog(more) {
    var rows = $('logRows');
    if (!more) { Log.offset = 0; clear(rows); var tr0 = el('tr'), td0 = el('td'); td0.colSpan = 4; td0.appendChild(el('div', 'skeleton')); tr0.appendChild(td0); rows.appendChild(tr0); }
    $('logMore').hidden = true;
    api('admin_list_log', { p_limit: 100, p_offset: Log.offset }).then(function (r) {
      if (!more) clear(rows);
      Log.offset += r.items.length;
      if (!r.items.length && !more) { var tr = el('tr'), td = el('td', 'empty', 'Noch keine Einträge.'); td.colSpan = 4; tr.appendChild(td); rows.appendChild(tr); }
      r.items.forEach(function (x) {
        var tr = el('tr');
        var c1 = el('td', null, fmtDateTime(x.at));
        var c2 = el('td', null, x.admin_email || '–'); c2.setAttribute('data-label', 'Admin');
        var c3 = el('td', null, ACTIONS[x.action] || x.action); c3.setAttribute('data-label', 'Aktion');
        var c4 = el('td', 'mono', x.target || ''); c4.setAttribute('data-label', 'Ziel');
        if (x.detail) c4.appendChild(el('span', 'sub', x.detail));
        [c1, c2, c3, c4].forEach(function (c) { tr.appendChild(c); });
        rows.appendChild(tr);
      });
      $('logMore').hidden = r.items.length < 100;
    }, function (err) { clear(rows); var tr = el('tr'), td = el('td'); td.colSpan = 4; tr.appendChild(td); rows.appendChild(tr); errorBox(td, err, function () { loadLog(); }); });
  }

  var LOADERS = { overview: loadOverview, support: loadSupport, devices: loadDevices, log: loadLog };
  function resetState() {
    loaded = {};
    Support.filter = 'open'; Support.q = ''; $('supportSearch').value = ''; paintSeg('filter', 'open');
    Devices.filter = 'all'; Devices.q = ''; $('deviceSearch').value = ''; paintSeg('dfilter', 'all');
    ['kpis', 'chart', 'latestSupport', 'supportList', 'deviceRows', 'logRows'].forEach(function (id) { clear($(id)); });
    setSupportCount(0);
  }

  /* ==========================================================
     Demo-Modus (nur localhost): erfundene Daten im Speicher,
     damit die Oberfläche ohne Online-Dienst getestet werden kann.
     ========================================================== */
  var Mock = (function () {
    if (!DEMO) return null;
    var seed = 20261109;
    function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    function hex() { return ('0' + Math.floor(rnd() * 256).toString(16).toUpperCase()).slice(-2); }
    function iso(t) { return new Date(t).toISOString(); }
    var now = Date.now(), DAY = 864e5, devices = [], playlists = [], support = [], log = [], id = 0;
    for (var i = 0; i < 140; i++) {
      var created = now - Math.pow(rnd(), 1.7) * 60 * DAY;
      var last = rnd() < 0.55 ? now - rnd() * 2 * DAY : created + rnd() * (now - created);
      var fails = rnd() < 0.07 ? 1 + Math.floor(rnd() * 24) : 0;
      var dv = { mac: ['02', hex(), hex(), hex(), hex(), hex()].join(':'), created_at: iso(created), last_seen: iso(last), fails: fails,
        locked_until: fails >= 20 ? iso(now + (10 + rnd() * 45) * 60000) : null };
      devices.push(dv);
      var np = Math.floor(rnd() * 3.4);
      for (var j = 0; j < np; j++) {
        var x = rnd() < 0.7;
        playlists.push({ id: 'p' + (++id), mac: dv.mac, name: pick(['Wohnzimmer', 'Schlafzimmer', 'Familie', 'Sport', 'Kinder', 'Hauptzugang', 'Ferienwohnung']),
          type: x ? 'xtream' : 'm3u', host: pick(['iptv.example.net', 'tv.example.org', 'stream.example.com', 'm3u.example.de']), created_at: iso(created + rnd() * (now - created)) });
      }
    }
    var TOPICS = ['Playlist', 'Wiedergabe', 'Konto & Gerät', 'Sonstiges'];
    var TEXTS = [
      'Beispieltext: Die Playlist erscheint nach dem Hochladen nicht auf dem Fernseher.',
      'Beispieltext: Bei einigen Sendern ruckelt das Bild abends stark.',
      'Beispieltext: Ich habe einen neuen Fernseher und möchte meine Playlists übernehmen.\nWie gehe ich vor?',
      'Beispieltext: Untertitel werden bei Filmen nicht angezeigt.',
      'Beispieltext: Nach dem Update startet die App mit einem schwarzen Bild.',
      'Beispieltext: Wie kann ich die Kindersicherung wieder ausschalten?',
      'Beispieltext: Der KEY wird auf der Webseite als falsch angezeigt.'
    ];
    for (var k = 0; k < 16; k++) {
      var dv2 = pick(devices), t0 = now - Math.pow(rnd(), 1.5) * 20 * DAY, done = rnd() < 0.4;
      support.push({ id: 's' + (++id), mac: dv2.mac, topic: pick(TOPICS), message: pick(TEXTS), contact: rnd() < 0.7 ? 'kunde' + (k + 1) + '@example.com' : null,
        created_at: iso(t0), done: done, admin_note: null, handled_at: done ? iso(t0 + rnd() * DAY) : null, handled_by: done ? 'demo@example.com' : null });
    }
    function me() { return (Auth.s && Auth.s.email) || 'demo@example.com'; }
    function addLog(action, target, detail) { log.unshift({ id: ++id, admin_email: me(), action: action, target: target, detail: detail || null, at: iso(Date.now()) }); }
    function page(list, b, def) { var off = Math.max(0, b.p_offset || 0), lim = Math.min(200, Math.max(1, b.p_limit || def)); return list.slice(off, off + lim); }
    function find(mac) { mac = String(mac || '').toUpperCase(); return devices.filter(function (x) { return x.mac === mac; })[0]; }
    var fns = {
      admin_whoami: function () { return { ok: true, email: me() }; },
      admin_stats: function () {
        var t = Date.now(), daily = [];
        for (var i = 13; i >= 0; i--) {
          var day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
          var next = day.getTime() + DAY;
          daily.push({ day: iso(day.getTime()).slice(0, 10), n: devices.filter(function (x) { var c = d(x.created_at).getTime(); return c >= day.getTime() && c < next; }).length });
        }
        return { ok: true, devices: devices.length,
          active1: devices.filter(function (x) { return t - d(x.last_seen) < DAY; }).length,
          active7: devices.filter(function (x) { return t - d(x.last_seen) < 7 * DAY; }).length,
          new7: devices.filter(function (x) { return t - d(x.created_at) < 7 * DAY; }).length,
          locked: devices.filter(function (x) { return x.locked_until && d(x.locked_until) > t; }).length,
          playlists: playlists.length, xtream: playlists.filter(function (p) { return p.type === 'xtream'; }).length,
          m3u: playlists.filter(function (p) { return p.type === 'm3u'; }).length,
          supportOpen: support.filter(function (s) { return !s.done; }).length,
          support7: support.filter(function (s) { return t - d(s.created_at) < 7 * DAY; }).length, daily: daily };
      },
      admin_list_support: function (b) {
        var q = String(b.p_search || '').toLowerCase(), f = b.p_filter || 'open';
        var list = support.filter(function (s) {
          return (f === 'all' || (f === 'done' && s.done) || (f === 'open' && !s.done)) &&
            (!q || [s.mac, s.message, s.topic, s.contact || ''].some(function (v) { return v.toLowerCase().indexOf(q) >= 0; }));
        }).sort(function (a, b2) { return (a.done - b2.done) || (d(b2.created_at) - d(a.created_at)); });
        return { ok: true, total: list.length, items: page(list, b, 50) };
      },
      admin_update_support: function (b) {
        var s = support.filter(function (x) { return x.id === b.p_id; })[0];
        if (!s) return { ok: false, error: 'Nachricht nicht gefunden.' };
        if (b.p_note !== undefined && b.p_note !== null) s.admin_note = String(b.p_note).trim().slice(0, 2000) || null;
        if (b.p_done === true && !s.done) { s.done = true; s.handled_at = iso(Date.now()); s.handled_by = me(); }
        if (b.p_done === false) { s.done = false; s.handled_at = null; s.handled_by = null; }
        addLog(b.p_done === true ? 'support_done' : b.p_done === false ? 'support_reopen' : 'support_note', s.mac, 'Nachricht ' + s.id);
        return { ok: true };
      },
      admin_list_devices: function (b) {
        var q = String(b.p_search || '').toUpperCase().replace(/:/g, ''), f = b.p_filter || 'all', t = Date.now();
        var list = devices.filter(function (x) {
          return (!q || x.mac.replace(/:/g, '').indexOf(q) >= 0) &&
            (f === 'all' || (f === 'active' && t - d(x.last_seen) < 7 * DAY) || (f === 'inactive' && t - d(x.last_seen) >= 30 * DAY) ||
             (f === 'locked' && ((x.locked_until && d(x.locked_until) > t) || x.fails > 0)));
        }).sort(function (a, b2) { return d(b2.last_seen) - d(a.last_seen); }).map(function (x) {
          return { mac: x.mac, created_at: x.created_at, last_seen: x.last_seen, fails: x.fails, locked_until: x.locked_until,
            playlists: playlists.filter(function (p) { return p.mac === x.mac; }).length,
            support_open: support.filter(function (s) { return s.mac === x.mac && !s.done; }).length };
        });
        return { ok: true, total: list.length, items: page(list, b, 50) };
      },
      admin_device: function (b) {
        var x = find(b.p_mac);
        if (!x) return { ok: false, error: 'Gerät nicht gefunden.' };
        return { ok: true, device: x,
          playlists: playlists.filter(function (p) { return p.mac === x.mac; }),
          support: support.filter(function (s) { return s.mac === x.mac; }).map(function (s) { return { id: s.id, topic: s.topic, created_at: s.created_at, done: s.done }; }) };
      },
      admin_unlock_device: function (b) {
        var x = find(b.p_mac);
        if (!x) return { ok: false, error: 'Gerät nicht gefunden.' };
        x.fails = 0; x.locked_until = null; addLog('device_unlock', x.mac);
        return { ok: true };
      },
      admin_delete_device: function (b) {
        var x = find(b.p_mac);
        if (!x) return { ok: false, error: 'Gerät nicht gefunden.' };
        var n = playlists.filter(function (p) { return p.mac === x.mac; }).length;
        devices = devices.filter(function (y) { return y !== x; });
        playlists = playlists.filter(function (p) { return p.mac !== x.mac; });
        support = support.filter(function (s) { return s.mac !== x.mac; });
        addLog('device_delete', x.mac, n + ' Playlist(s)');
        return { ok: true };
      },
      admin_list_log: function (b) { return { ok: true, items: page(log, b, 100) }; }
    };
    return {
      call: function (fn, body) {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            var r = fns[fn] ? fns[fn](body) : { ok: false, error: 'Unbekannte Funktion: ' + fn };
            if (!r.ok) reject(new Error(r.error)); else resolve(JSON.parse(JSON.stringify(r)));
          }, 220);
        });
      }
    };
  })();

  /* ---------------- Start ---------------- */
  if (Auth.load()) {
    api('admin_whoami').then(function (r) { enter(r.email); }, function (err) {
      Auth.clear();
      showLogin(/Berechtigung/.test(err.message) ? 'Dieses Konto hat keine Admin-Berechtigung.' : err.message);
    });
  } else showLogin();
})();
