/* Tests: Neues Aussehen (1.15.10) – Icons, Leiste oben, Hintergrund, Aktualisieren ohne eigene Seite */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'Aussehen';

  t(G, 'Icons kommen aus dem Icon-Set (Zeichenfläche 256) und kein benutzter Name ist leer', function () {
    eq(D.icon('search').getAttribute('viewBox'), '0 0 256 256');
    var names = ['home', 'live', 'movie', 'series', 'heart', 'heartFill', 'bookmark', 'bookmarkFill', 'search', 'refresh', 'settings', 'play', 'pause', 'back', 'next',
      'check', 'close', 'lock', 'globe', 'down', 'plus', 'playlist', 'info', 'archive', 'users', 'pencil', 'eye', 'eyeOff', 'bell', 'trash', 'tracks', 'timer', 'swap', 'sun',
      'star', 'starFill', 'sort', 'skipNext', 'radio', 'profile', 'pip', 'help', 'guide', 'fullscreen', 'copy', 'ball', 'arrowR', 'wifi', 'wifiLow', 'wifiOff', 'player', 'warn',
      'avSmile', 'avCat', 'avDog', 'avGhost', 'avRocket', 'avCrown', 'avGame', 'avMusic', 'moon', 'restart', 'device', 'vol', 'volOff', 'history', 'clock', 'checkCircle'];
    names.forEach(function (n) { ok(D.icon(n).innerHTML.length > 20, 'Icon „' + n + '“ ist leer'); });
    ok(!/stroke-linecap/.test(D.icon('home').outerHTML), 'keine alten Strich-Symbole mehr');
  });
  // Leiste öffnen wie nach dem Start mit der Demo-Playlist; danach wieder zur Willkommensseite
  function withShell(fn) {
    var keepProfile = D.App.profile, keepProv = D.App.provider;
    D.App.profile = { id: 'tst-aussehen', type: 'demo', name: 'Demo' };
    D.App.provider = D.makeProvider(D.App.profile);
    D.Shell.open();
    function done() {
      try { D.Screens.reset('leer', document.createElement('div'), {}); } catch (e) {}
      D.App.profile = keepProfile; D.App.provider = keepProv;
    }
    return Promise.resolve().then(fn).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }
  function labels(list) { return Array.prototype.map.call(list, function (b) { return b.getAttribute('aria-label'); }); }

  t(G, 'Leiste oben: kein Balken unten, rechts Suche · Aktualisieren · Einstellungen, keine Leuchtfläche, kein Profil-Knopf', function () {
    return withShell(function () {
      var el = D.Shell.el;
      ok(!el.querySelector('.statusbar'), 'Balken unten ist weg');
      ok(!el.querySelector('.tab-glider'), 'keine gleitende Leuchtfläche mehr (zweite Markierung)');
      eq(labels(el.querySelectorAll('.nb-tools > button')), ['Suche', 'Playlist aktualisieren', 'Einstellungen']);
      eq(Array.prototype.map.call(el.querySelectorAll('.nb-tabs > button'), function (b) { return b.getAttribute('data-tab'); }), ['home', 'live', 'movie', 'series', 'favs']);
      ok(!D.Shell.buttons.profile, 'Profil-Knopf ist aus der Leiste');
      ok(!el.querySelector('.wordmark'), 'kein Schriftzug „Telvo Player“ in der Leiste');
      ok(el.querySelector('.nb-left .brand-mark'), 'Logo-Zeichen links');
      ok(/^\d{1,2}[:.]\d{2}/.test(el.querySelector('.nb-time').textContent), 'Uhr läuft in der Leiste: ' + el.querySelector('.nb-time').textContent);
    });
  });

  t(G, 'Leiste oben: Datum nur auf der Startseite, Uhr auf jeder Seite', function () {
    return withShell(function () {
      var el = D.Shell.el;
      D.Shell.show('home');
      ok(el.classList.contains('is-launcher'), 'Startseite markiert die Leiste');
      ok(el.querySelector('.nb-date').textContent.length > 3, 'Datum steht da');
      D.Shell.show('movie');
      ok(!el.classList.contains('is-launcher'), 'auf Filme kein Datum (per Klasse ausgeblendet)');
      ok(el.querySelector('.nb-time').textContent.length >= 4, 'Uhr bleibt');
    });
  });

  t(G, 'Statuszeichen: drei Symbole ohne Text in fester Reihenfolge; abgelaufene Playlist ist rot und anwählbar', function () {
    return withShell(function () {
      var S = D.StatusLine, box = D.Shell.el.querySelector('.nb-status');
      function keys() { return Array.prototype.map.call(box.children, function (c) { return c.getAttribute('data-key'); }); }
      eq(keys(), ['net', 'playlist', 'player'], 'Internet, Playlist, Player');
      eq(box.textContent.trim(), '', 'kein Text neben den Symbolen');
      var now = Math.floor(Date.now() / 1000);
      S.acctPid = 'tst-aussehen'; S.acctAt = Date.now();
      S.acct = { expires: now + 3 * 86400, status: 'Active' }; S.paint();
      var pl = box.querySelector('[data-key="playlist"]');
      ok(pl.classList.contains('is-warn'), 'noch 3 Tage → Warnfarbe');
      S.acct = { expires: now - 86400, status: 'Expired' }; S.paint();
      pl = box.querySelector('[data-key="playlist"]');
      ok(pl.classList.contains('is-off'), 'abgelaufen → rot');
      eq(pl.tagName, 'BUTTON', 'bei einem Problem anwählbar (zeigt den Grund)');
      ok(pl.getAttribute('aria-label').indexOf('abgelaufen') >= 0, 'Beschriftung für Vorleser: ' + pl.getAttribute('aria-label'));
      eq(keys(), ['net', 'playlist', 'player'], 'Reihenfolge bleibt gleich');
      S.acct = null; S.acctAt = 0;
    });
  });

  t(G, 'Leiste oben: Links/Rechts bleibt in der Leiste (springt nicht in den Inhalt darunter); Profil liegt in den Einstellungen', function () {
    return withShell(function () {
      var view = D.Shell.view, extra = document.createElement('button');
      extra.className = 'f'; extra.textContent = 'Inhalt'; view.appendChild(extra);
      var tabs = D.Shell.el.querySelectorAll('.nb-tabs .ntab'), first = tabs[0], keep = D.Nav.pick, keepC = D.Nav.candidates, seen = null;
      // Die App läuft auf der Testseite unsichtbar mit – zum Anwählen kurz einblenden
      var app = document.getElementById('app'); app.hidden = false;
      first.focus();
      // Die Testseite lädt kein Stylesheet (keine Maße) – deshalb die Ziele fest vorgeben und nur die Auswahl-Regel prüfen
      D.Nav.candidates = function () { return [first, tabs[1], extra]; };
      D.Nav.pick = function (cur, list, dir) { seen = list; return null; };
      try { D.Nav.move('left'); } finally { D.Nav.pick = keep; D.Nav.candidates = keepC; app.hidden = true; }
      ok(seen && seen.length > 0, 'es gibt Ziele in der Leiste');
      ok(seen.every(function (el) { return !!el.closest('.topnav'); }), 'nur Ziele aus der Leiste – nichts aus dem Inhalt');
      if (extra.parentNode) extra.parentNode.removeChild(extra);
      D.Shell.show('settings');
      return new Promise(function (r) { setTimeout(r, 60); }).then(function () {
        var names = Array.prototype.map.call(D.Shell.view.querySelectorAll('.sp-nav .sp-name, .st-nav .sp-name, .sp-item .sp-name'), function (e) { return e.textContent; });
        ok(D.Shell.view.textContent.indexOf('Mein Zugang') >= 0, 'Einstellungen zeigen „Mein Zugang“ (Profil): ' + names.join(','));
        ok(D.Shell.buttons.settings.classList.contains('is-on'), 'Knopf „Einstellungen“ ist gewählt');
      });
    });
  });

  t(G, 'Nur noch dunkel: eine früher gespeicherte helle Einstellung macht die App nicht mehr hell; „Farben“ steht nicht mehr in den Einstellungen', function () {
    var keep = D.Settings.get('theme'), root = document.documentElement;
    try {
      D.Settings.set('theme', 'light'); D.Theme.apply();
      eq(root.getAttribute('data-theme'), 'dark', 'hell gespeichert → trotzdem dunkel');
      D.Settings.set('theme', 'auto'); D.Theme.apply();
      eq(root.getAttribute('data-theme'), 'dark', 'automatisch gespeichert → dunkel');
    } finally { D.Settings.set('theme', keep || null); D.Theme.apply(); }
    return withShell(function () {
      D.Shell.show('settings');
      return new Promise(function (r) { setTimeout(r, 60); }).then(function () {
        // Jeden Bereich der Einstellungen einmal öffnen und alle Beschriftungen einsammeln
        var labels = [], secs = D.Shell.view.querySelectorAll('.st-sec');
        function collect() { Array.prototype.forEach.call(D.Shell.view.querySelectorAll('.st-row .st-txt b'), function (e) { labels.push(e.textContent); }); }
        collect();
        Array.prototype.forEach.call(secs, function (b) { b.click(); collect(); });
        ok(secs.length >= 7, 'Bereiche der Einstellungen sind da: ' + secs.length);
        ok(labels.indexOf('Sprache') >= 0, 'bekannte Kachel gefunden (Sprache)');
        ok(labels.indexOf('Farben') < 0, 'keine Kachel „Farben“');
        ok(labels.indexOf('Wetter neben der Uhr') < 0, 'keine Kachel „Wetter neben der Uhr“');
      });
    });
  });

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  t(G, 'Lade-Kacheln: jede Seite hat ihre eigene Form (Start, Live TV, Filme, Serien, Favoriten, Einstellungen)', function () {
    var kinds = {};
    ['home', 'live', 'movie', 'series', 'favs', 'settings'].forEach(function (n) {
      var el = D.Skeleton.forView(n);
      ok(el.classList.contains('sk-view'), n + ': Lade-Ansicht');
      eq(el.getAttribute('aria-hidden'), 'true', n + ': für Vorleser unsichtbar');
      ok(el.querySelectorAll('.sk').length >= 6, n + ': genug Platzhalter (' + el.querySelectorAll('.sk').length + ')');
      ok(!el.querySelector('.f'), n + ': nichts Anwählbares');
      kinds[n] = el.className;
    });
    ok(kinds.home !== kinds.live && kinds.live !== kinds.movie, 'Start, Live TV und Filme sehen verschieden aus');
    eq(kinds.movie, kinds.series, 'Filme und Serien gleich');
  });

  t(G, 'Aktualisieren: bleibt auf derselben Seite, zeigt kurz Lade-Kacheln und ein kleines Feld mit Live TV · Filme · Serien, danach „Alles aktuell“', function () {
    return withShell(function () {
      D.Shell.show('movie');
      var p = D.refreshInline();
      ok(p && typeof p.then === 'function', 'liefert ein Versprechen');
      ok(D.Shell.view.querySelector('.sk-view'), 'sofort Lade-Kacheln auf der Seite');
      var card = D.Shell.el.querySelector('.rf-card');
      ok(card, 'Feld unter dem Knopf ist da');
      eq(card.querySelectorAll('.rf-row').length, 3, 'drei Zeilen: Live TV, Filme, Serien');
      ok(D.Shell.reloadBtn.classList.contains('is-busy'), 'Knopf dreht sich');
      ok(!document.querySelector('.rl-screen'), 'keine eigene Ladeseite mehr');
      eq(D.refreshInline(), p, 'zweiter Druck startet nichts Zweites');
      eq(D.Shell.el.querySelectorAll('.rf-card').length, 1, 'nur ein Feld');
      var t0 = Date.now();
      return p.then(function (res) {
        ok(res.ok, 'hat geklappt');
        ok(Date.now() - t0 >= 450, 'Lade-Kacheln mindestens eine halbe Sekunde sichtbar (' + (Date.now() - t0) + ' ms)');
        ok(Date.now() - t0 < 2500, 'keine erzwungene lange Wartezeit (' + (Date.now() - t0) + ' ms)');
        eq(D.Shell.current, 'movie', 'bleibt auf Filme (nicht zurück zur Startseite)');
        ok(!D.Shell.view.querySelector('.sk-view'), 'Lade-Kacheln sind wieder weg');
        ok(D.Shell.view.firstChild, 'Seite ist neu aufgebaut');
        ok(card.classList.contains('is-done'), 'Feld meldet fertig');
        ok(card.textContent.indexOf('Alles aktuell') >= 0, 'Text „Alles aktuell“');
        ok(/\d/.test(card.querySelector('.rf-row.k-movie').textContent), 'Anzahl Filme steht da: ' + card.querySelector('.rf-row.k-movie').textContent);
        ok(!D.Shell.reloadBtn.classList.contains('is-busy'), 'Knopf steht wieder');
        return wait(1800);
      }).then(function () {
        ok(!D.Shell.el.querySelector('.rf-card'), 'Feld verschwindet von selbst');
      });
    });
  });

  t(G, 'Aktualisieren ohne Internet: Feld zeigt den Fehler, man bleibt auf der Seite, nichts hängt', function () {
    return withShell(function () {
      D.Shell.show('live');
      var prov = D.App.provider, keepI = prov.items, keepC = prov.categories, keepR = prov.reset;
      prov.items = function () { return Promise.reject(new Error('Kein Netz')); };
      prov.categories = function () { return Promise.reject(new Error('Kein Netz')); };
      prov.reset = function () {};
      function back() { prov.items = keepI; prov.categories = keepC; prov.reset = keepR; }
      return D.refreshInline().then(function (res) {
        back();
        ok(!res.ok, 'meldet Fehlschlag');
        var card = D.Shell.el.querySelector('.rf-card');
        ok(card && card.classList.contains('is-failed'), 'Feld zeigt Fehler');
        ok(card.textContent.indexOf('nicht geklappt') >= 0, 'verständlicher Text: ' + card.textContent);
        eq(D.Shell.current, 'live', 'bleibt auf Live TV');
        ok(!D.Shell.view.querySelector('.sk-view'), 'Lade-Kacheln sind weg');
        ok(!D.Shell.reloadBtn.classList.contains('is-busy'), 'Knopf steht wieder');
        return D.refreshInline();
      }, function (e) { back(); throw e; }).then(function (res2) {
        ok(res2.ok, 'danach klappt ein neuer Versuch');
      });
    });
  });

  t(G, 'Aktualisieren und Seitenwechsel: wer währenddessen woanders hingeht, wird nicht zurückgeholt', function () {
    return withShell(function () {
      D.Shell.show('movie');
      var p = D.refreshInline();
      D.Shell.show('settings');
      return p.then(function () {
        eq(D.Shell.current, 'settings', 'bleibt in den Einstellungen');
        ok(!D.Shell.view.querySelector('.sk-view'), 'keine Lade-Kacheln über den Einstellungen');
      });
    });
  });

  t(G, 'Aktualisieren, wenn der Anbieter sofort einen Fehler wirft: nichts bleibt hängen (keine Lade-Kacheln für immer, Knopf steht wieder)', function () {
    return withShell(function () {
      D.Shell.show('movie');
      var prov = D.App.provider, keepR = prov.reset;
      prov.reset = function () { throw new Error('kaputt'); };
      var p;
      try { p = D.refreshInline(); } catch (e) { prov.reset = keepR; throw new Error('wirft statt zu melden: ' + e.message); }
      return p.then(function (res) {
        prov.reset = keepR;
        ok(!res.ok, 'meldet Fehlschlag');
        ok(!D.Shell.view.querySelector('.sk-view'), 'Lade-Kacheln sind weg');
        ok(!D.Shell.reloadBtn.classList.contains('is-busy'), 'Knopf steht wieder');
        ok(D.Shell.el.querySelector('.rf-card.is-failed'), 'Feld zeigt den Fehler');
        return D.refreshInline();
      }, function (e) { prov.reset = keepR; throw e; }).then(function (res2) { ok(res2.ok, 'neuer Versuch klappt'); });
    });
  });
})();
