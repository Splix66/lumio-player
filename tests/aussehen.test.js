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
})();
