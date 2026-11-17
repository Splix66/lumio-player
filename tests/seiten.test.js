/* Tests: Neues Aussehen Teil 2 „Seiten“ (1.15.10) – Einstellungen aufgeräumt, Profil, Playlist löschen, Hinweis „abgelaufen“, Startseite, Filme/Serien */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'Seiten';
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withShell(fn, profile) {
    var keepProfile = D.App.profile, keepProv = D.App.provider;
    D.App.profile = profile || { id: 'tst-seiten', type: 'demo', name: 'Demo' };
    D.App.provider = D.makeProvider(D.App.profile);
    D.Shell.open();
    function done() { try { if (D.Dialog.open) D.Dialog.close(); D.Screens.reset('leer', document.createElement('div'), {}); } catch (e) {} D.App.profile = keepProfile; D.App.provider = keepProv; }
    return Promise.resolve().then(fn).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }
  function texts(root, sel) { return Array.prototype.map.call(root.querySelectorAll(sel), function (e) { return e.textContent.trim(); }); }
  function dialogButtons() { return texts(document.getElementById('dialog-layer'), '.dialog .btn'); }

  t(G, 'Einstellungen: Profil + 7 Bereiche, gestrichene Einträge sind weg, „Darstellung“ steckt in „Allgemein“', function () {
    return withShell(function () {
      D.Shell.show('settings');
      return wait(60).then(function () {
        var view = D.Shell.view, secs = view.querySelectorAll('.st-sec'), by = {};
        eq(Array.prototype.map.call(secs, function (b) { return b.getAttribute('data-sec'); }), ['profile', 'general', 'play', 'content', 'users', 'devices', 'advanced', 'help'], 'Bereiche in dieser Reihenfolge');
        Array.prototype.forEach.call(secs, function (b) { b.click(); by[b.getAttribute('data-sec')] = texts(view, '.st-row .st-txt b'); });
        var all = [].concat.apply([], Object.keys(by).map(function (k) { return by[k]; }));
        ['Jetzt aktualisieren', 'Zwischenspeicher leeren', 'Schlaf-Timer', 'Zeitformat', 'Bildqualität', 'Vorschau auf Film- und Serienseiten', 'Tipps im Bildschirmschoner',
          'Problem melden', 'Feedback geben', 'Farben', 'Wetter neben der Uhr'].forEach(function (x) { ok(all.indexOf(x) < 0, '„' + x + '“ ist weg'); });
        ok(by.general.indexOf('Sprache') >= 0 && by.general.indexOf('App beim Start') >= 0, 'Allgemein: Sprache, App beim Start');
        ok(by.general.indexOf('Größe der Cover bei Filmen und Serien') >= 0 && by.general.indexOf('Bildschirmschoner') >= 0, 'Allgemein enthält Cover-Größe und Bildschirmschoner: ' + by.general.join(', '));
        ok(by.play.indexOf('Vorschau bei Live TV') >= 0 && by.play.indexOf('Untertitel') >= 0, 'Wiedergabe: ' + by.play.join(', '));
        ok(by.help.indexOf('Nachricht an den Support') >= 0, 'Hilfe: Nachricht an den Support – ' + by.help.join(', '));
        ok(by.advanced.indexOf('Fehlerberichte senden') >= 0 && by.advanced.indexOf('Schaust du noch?') >= 0, 'Erweitert: ' + by.advanced.join(', '));
        ok(by.content.indexOf('Automatisch aktualisieren') >= 0 && by.content.indexOf('Sender sortieren') >= 0, 'Inhalte: ' + by.content.join(', '));
        ok(all.length <= 32, 'höchstens 32 Einträge (hier: ' + all.length + ')');
      });
    });
  });

  t(G, 'Gestrichene Einstellungen: früher gespeicherte Werte wirken nicht mehr', function () {
    var S = D.Settings, keep = JSON.stringify(S.data);
    try {
      S.set('quality', 'best'); S.set('heroPreview', true); S.set('saverTips', true); S.set('clock12', true); S.set('weatherLoc', { name: 'Köln', lat: 50.9, lon: 6.9 }); S.set('chanSort', 'za');
      eq(S.get('quality'), 'auto', 'Bildqualität immer automatisch');
      eq(S.get('heroPreview'), false, 'keine Vorschau auf Film- und Serienseiten');
      eq(S.get('saverTips'), false, 'keine Tipps im Bildschirmschoner');
      eq(S.get('weatherLoc'), null, 'kein Wetter');
      eq(S.get('chanSort'), 'az', 'Z–A gibt es nicht mehr → A–Z');
      var keepLang = D.Lang.cur; D.Lang.cur = 'de';
      ok(!/AM|PM/.test(D.clockStr(new Date(2026, 10, 17, 15, 5))), 'Deutsch: 24 Stunden, auch wenn früher 12 h gewählt war: ' + D.clockStr(new Date(2026, 10, 17, 15, 5)));
      eq(D.clockStr(new Date(2026, 10, 17, 15, 5)), '15:05');
      D.Lang.cur = keepLang;
    } finally { S.data = JSON.parse(keep); D.Store.set('settings', S.data); }
  });

  t(G, 'Externer Player: nur noch An/Aus – eine früher gewählte App zählt als „An“ (Android fragt selbst)', function () {
    var S = D.Settings, keep = S.data.extPlayer;
    try {
      S.data.extPlayer = 'vlc'; eq(D.extMode(), 'ask', 'VLC gespeichert → An');
      S.data.extPlayer = 'ask'; eq(D.extMode(), 'ask');
      S.data.extPlayer = 'off'; eq(D.extMode(), 'off');
      S.data.extPlayer = undefined; eq(D.extMode(), 'off', 'nichts gespeichert → Aus');
    } finally { S.data.extPlayer = keep; }
  });

  t(G, 'Profil in den Einstellungen: Playlist mit Laufzeit, „Playlist wechseln“, rotes „Playlist löschen“ mit Rückfrage (Abbrechen vorgewählt), Zugang, Dieses Gerät', function () {
    var prof = { id: 'tst-seiten-x', type: 'xtream', name: 'Meine Playlist', server: 'http://beispiel.invalid', username: 'demo-nutzer', password: 'x' };
    return withShell(function () {
      var now = Math.floor(Date.now() / 1000);
      D.App.provider.account = function () { return Promise.resolve({ expires: now + 90 * 86400, status: 'Active' }); };
      D.openProfile();
      return wait(80).then(function () {
        var view = D.Shell.view;
        eq(D.Shell.current, 'settings', 'Profil ist ein Bereich der Einstellungen');
        ok(view.querySelector('.st-sec[data-sec="profile"]').classList.contains('is-on'), 'Bereich Profil gewählt');
        var card = view.querySelector('.pf-hero');
        ok(card && card.textContent.indexOf('Meine Playlist') >= 0, 'Name der Playlist');
        ok(/Gültig bis/.test(card.textContent), 'Laufzeit steht da: ' + card.textContent);
        var btns = texts(card, '.btn');
        eq(btns, ['Playlist wechseln', 'Playlist löschen'], 'zwei Knöpfe, kein „Daten neu laden“');
        ok(card.querySelectorAll('.btn')[1].classList.contains('danger'), '„Playlist löschen“ ist rot');
        ok(view.textContent.indexOf('demo-nutzer') >= 0 && view.textContent.indexOf('Xtream Codes') >= 0, 'Zugang: Typ und Benutzername');
        eq(view.querySelectorAll('.kv-copy').length, 2, 'Dieses Gerät: MAC und KEY zum Kopieren');
        ok(view.textContent.indexOf(D.config.version) >= 0, 'Version steht bei „Dieses Gerät“');
        var removed = null, keepRemove = D.Profiles.remove;
        D.Profiles.remove = function (id) { removed = id; };
        card.querySelectorAll('.btn')[1].click();
        ok(D.Dialog.open, 'Rückfrage erscheint');
        var layer = document.getElementById('dialog-layer');
        ok(layer.textContent.indexOf('Meine Playlist') >= 0 && layer.textContent.indexOf('Favoriten und Verlauf') >= 0, 'Rückfrage nennt die Playlist und die Folgen');
        eq(dialogButtons(), ['Abbrechen', 'Löschen']);
        ok(layer.querySelectorAll('.dialog .btn')[0]._focus, '„Abbrechen“ ist vorgewählt');
        ok(layer.querySelectorAll('.dialog .btn')[1].classList.contains('danger'), '„Löschen“ ist rot');
        layer.querySelectorAll('.dialog .btn')[0].click();
        eq(removed, null, 'Abbrechen löscht nichts');
        card.querySelectorAll('.btn')[1].click();
        document.getElementById('dialog-layer').querySelectorAll('.dialog .btn')[1].click();
        D.Profiles.remove = keepRemove;
        eq(removed, 'tst-seiten-x', 'Löschen entfernt genau diese Playlist');
        ok(!D.Screens.top() || D.Screens.top().name !== 'shell', 'danach ist man nicht mehr in der gelöschten Playlist');
      });
    }, prof);
  });

  t(G, 'Hinweis „Playlist abgelaufen“: Fenster mit Name und Datum, „Zum Profil“ (vorgewählt) und „Später“; kommt bei jedem Start wieder', function () {
    var prof = { id: 'tst-seiten-ab', type: 'xtream', name: 'Meine Playlist', server: 'http://beispiel.invalid', username: 'u', password: 'x' };
    return withShell(function () {
      var now = Math.floor(Date.now() / 1000);
      D.App.provider.account = function () { return Promise.resolve({ expires: now - 2 * 86400, status: 'Expired' }); };
      D.Store.del('expiry.tst-seiten-ab');
      D.Expiry.shown = {};
      D.Expiry.check();
      return wait(1500).then(function () {
        ok(D.Dialog.open, 'Fenster erscheint');
        var layer = document.getElementById('dialog-layer');
        ok(layer.querySelector('h3').textContent === 'Playlist abgelaufen', 'Überschrift: ' + layer.querySelector('h3').textContent);
        ok(layer.textContent.indexOf('Meine Playlist') >= 0, 'nennt die Playlist');
        eq(dialogButtons(), ['Zum Profil', 'Später']);
        ok(layer.querySelectorAll('.dialog .btn')[0].classList.contains('primary'), '„Zum Profil“ ist der Hauptknopf');
        layer.querySelectorAll('.dialog .btn')[1].click();
        ok(!D.Dialog.open, '„Später“ schließt');
        D.Expiry.check();
        return wait(1500);
      }).then(function () {
        ok(!D.Dialog.open, 'im selben Lauf der App nicht noch einmal (kein Nerven alle 6 Stunden)');
        D.Expiry.shown = {};   // = App neu gestartet
        D.Expiry.check();
        return wait(1500);
      }).then(function () {
        ok(D.Dialog.open, 'nach einem Neustart kommt der Hinweis wieder');
        document.getElementById('dialog-layer').querySelectorAll('.dialog .btn')[0].click();
        return wait(80);
      }).then(function () {
        eq(D.Shell.current, 'settings', '„Zum Profil“ öffnet die Einstellungen');
        ok(D.Shell.view.querySelector('.st-sec[data-sec="profile"]').classList.contains('is-on'), '… im Bereich Profil');
        D.Store.del('expiry.tst-seiten-ab');
      });
    }, prof);
  });

  function demoMovie() { return D.App.provider.items('movie', '__all').then(function (l) { return l[0]; }); }

  t(G, 'Filme und Serien: nur Kategorien und Cover – keine Reihen „Weiterschauen“ und „Top 10“ mehr', function () {
    return withShell(function () {
      return demoMovie().then(function (m) {
        D.Resume.set(m, 300, 3000);
        D.Shell.show('movie');
        return wait(400).then(function () {
          var v = D.Shell.view;
          ok(v.querySelector('.mv-side .cat'), 'Kategorien links');
          ok(v.querySelector('.mv-grid'), 'Cover-Raster');
          ok(!v.querySelector('.mv-resume') || !v.querySelector('.mv-resume').firstChild, 'keine Reihe „Weiterschauen“');
          ok(!v.querySelector('.mv-top') || !v.querySelector('.mv-top').firstChild, 'keine Reihe „Top 10“');
          ok(v.textContent.indexOf('Weiterschauen') < 0, 'Wort „Weiterschauen“ steht nirgends');
          ok(v.querySelector('.mv-head .sort-wrap, .mv-head .sort-btn, .mv-head button'), '„Sortieren“ bleibt in der Kopfzeile');
          D.Resume.set(m, 0, 0);
        });
      });
    });
  });

  t(G, 'Startseite: oben der Vorschlag, darunter nur Reihen – kein „Alle anzeigen“, keine Pfeile, nie die drei Kacheln', function () {
    return withShell(function () {
      D.Store.set('stats.tst-seiten', { live: { n: 6, at: Date.now() }, movie: { n: 4, at: Date.now() }, series: { n: 1, at: Date.now() } });
      return demoMovie().then(function (m) {
        D.Resume.set(m, 300, 3000);
        D.Shell.show('home');
        return wait(500).then(function () {
          var el = D.Shell.view.querySelector('.launcher');
          ok(el.classList.contains('hm2'), 'neuer Aufbau');
          eq(Array.prototype.map.call(el.children, function (c) { return c.className.split(' ')[0] + (c.className.indexOf('hm-t10rows') >= 0 ? ':t10' : ''); }),
            ['hm-heroslot', 'hm-rows', 'hm-rows:t10', 'hm-empty'], 'Reihenfolge: Vorschlag, Weiterschauen, Top 10');
          ok(!el.querySelector('.hm-quickrow, .hm-quick'), 'keine drei Kacheln');
          ok(!el.querySelector('.lr-all'), 'kein „Alle anzeigen“');
          ok(!el.querySelector('.hm-arrow'), 'keine Pfeile am Vorschlag');
          var row = el.querySelector('.hm-rows .hm-row');
          ok(row && row.querySelector('.hm-rtitle').textContent === 'Weiterschauen', 'Reihe „Weiterschauen“');
          ok(row.querySelectorAll('.lr-card').length >= 1 && row.querySelectorAll('.lr-card').length <= 10, 'höchstens 10 Kacheln');
          var play = el.querySelector('[data-key="hero:play"]');
          if (play) eq(play.textContent.trim(), 'Jetzt ansehen', 'oben nie „Weiter bei …“');
          ok(!el.classList.contains('is-loading'), 'fertig geladen');
          ok(!el.querySelector('.hm-w'), 'keine Felder der leeren Startseite');
          eq(D.Store.get('homeEmpty.tst-seiten', null), false, 'gemerkt: Startseite hat Inhalt');
          D.Resume.set(m, 0, 0); D.Store.del('stats.tst-seiten'); D.Store.del('homeEmpty.tst-seiten');
        });
      });
    });
  });

  t(G, 'Startseite Top 10: je Dienst zwei Reihen (Filme, Serien), bis zu 10 Plätze, nur Titel aus der Playlist mit echtem Platz', function () {
    var M = D.Top10Match, keep = D.Store.get('top10.de', null);
    var data = { v: 1, country: 'DE', services: [{ id: 'netflix', name: 'Netflix', week: '2026-11-08', separate: true,
      movies: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return { rank: n, title: 'Film ' + n }; }),
      series: [{ rank: 1, title: 'S1' }, { rank: 2, title: 'S2' }] }] };
    return withShell(function () {
      var stamp = M.stamp(data);
      D.Store.set('top10.de', { at: Date.now(), d: data });
      D.Store.set('stats.tst-seiten', { movie: { n: 4, at: Date.now() } });
      D.Store.set(M.key('movie'), { stamp: stamp, m: { 'netflix:1': { kind: 'movie', id: 'a', name: 'Film 1' }, 'netflix:3': { kind: 'movie', id: 'c', name: 'Film 3' }, 'netflix:9': { kind: 'movie', id: 'i', name: 'Film 9' } } });
      D.Store.set(M.key('series'), { stamp: stamp, m: {} });
      var rows = D.top10Rows(data.services[0]);
      eq(rows.map(function (r) { return r.kind + ':' + r.total + ':' + r.hits.map(function (x) { return x.rank; }).join(','); }), ['movie:10:1,3,9', 'series:2:'], 'Treffer mit echtem Platz, auch jenseits von Platz 5');
      D.Shell.show('home');
      return wait(500).then(function () {
        var el = D.Shell.view.querySelector('.launcher'), t10 = el.querySelectorAll('.hm-t10row');
        eq(t10.length, 1, 'Reihe ohne Treffer (Serien) entfällt');
        eq(t10[0].querySelector('.hm-rtitle').textContent, 'Top 10 Filme');
        var info = t10[0].querySelector('.hm-t10info').textContent;
        ok(info.indexOf('Netflix') >= 0 && info.indexOf('3 von 10') >= 0, 'Hinweis rechts: ' + info);
        eq(Array.prototype.map.call(t10[0].querySelectorAll('.t10-n'), function (n) { return n.textContent; }), ['1', '3', '9'], 'nur die Treffer, Plätze nicht doppelt');
        ok(!t10[0].querySelector('.is-missing'), 'keine grauen Kacheln');
        D.Store.del(M.key('movie')); D.Store.del(M.key('series')); D.Store.del('stats.tst-seiten'); D.Store.del('homeEmpty.tst-seiten');
        if (keep) D.Store.set('top10.de', keep); else D.Store.del('top10.de');
      });
    });
  });

  t(G, 'Startseite beim Laden: Platzhalter in derselben Form, keine Kacheln; „leer“ wird erst nach dem Laden festgestellt', function () {
    var keep = D.Store.get('top10.de', null);
    return withShell(function () {
      D.Store.set('top10.de', { at: Date.now(), d: { v: 1, country: 'DE', services: [] } });
      D.Store.del('stats.tst-laden'); D.Store.del('homeEmpty.tst-laden');
      var hold = D.App.provider.items;
      D.App.provider.items = function () { return new Promise(function () {}); };   // lädt „ewig“
      D.Shell.show('home');
      return wait(400).then(function () {
        var el = D.Shell.view.querySelector('.launcher');
        ok(el.classList.contains('is-loading'), 'Startseite lädt noch');
        ok(el.querySelectorAll('.sk').length >= 5, 'Platzhalter stehen da (' + el.querySelectorAll('.sk').length + ')');
        ok(!el.querySelector('.hm-quick'), 'keine drei Kacheln');
        ok(!el.querySelector('.hm-w'), 'noch keine Felder „leere Startseite“');
        eq(D.Store.get('homeEmpty.tst-laden', null), null, 'noch nichts gemerkt');
        D.App.provider.items = hold;
        if (keep) D.Store.set('top10.de', keep); else D.Store.del('top10.de');
      });
    }, { id: 'tst-laden', type: 'demo', name: 'Demo' });
  });

  t(G, 'Leere Startseite (z. B. Playlist nur mit Sendern): drei Felder statt Kacheln; beim nächsten Start öffnet die App Live TV', function () {
    var keep = D.Store.get('top10.de', null);
    return withShell(function () {
      D.Store.set('top10.de', { at: Date.now(), d: { v: 1, country: 'DE', services: [] } });
      D.Store.set('stats.tst-leer', { live: { n: 120, at: Date.now() } });
      D.Store.del('homeEmpty.tst-leer');
      D.Shell.show('home');
      return wait(600).then(function () {
        var el = D.Shell.view.querySelector('.launcher'), w = el.querySelectorAll('.hm-empty .hm-w');
        ok(!el.classList.contains('is-loading'), 'fertig geladen');
        eq(Array.prototype.map.call(w, function (x) { return x.querySelector('h2').textContent; }), ['Neuigkeiten', 'Deine Playlist', 'Zuletzt gesehene Sender'], 'drei Felder');
        ok(el.querySelector('.hm-w-pl').textContent.indexOf('120') >= 0, 'Zahl der Sender steht bei „Deine Playlist“');
        ok(el.querySelector('.hm-w-pl .btn'), 'Knopf Aktualisieren');
        ok(el.textContent.indexOf('Wusstest du schon') < 0, 'kein Feld „Wusstest du schon?“');
        ok(!el.querySelector('.hm-quick'), 'keine drei Kacheln');
        eq(D.Store.get('homeEmpty.tst-leer', null), true, 'gemerkt: Startseite ist leer');
        eq(D.startTabNow('home'), 'live', 'App beim Start = Startseite → es öffnet sich Live TV');
        eq(D.startTabNow('movie'), 'movie', 'eigene Wahl des Nutzers bleibt gültig');
        eq(D.startTabNow('last'), 'live');
        D.Store.set('homeEmpty.tst-leer', false);
        eq(D.startTabNow('home'), 'home', 'mit Inhalt wieder die Startseite');
        D.Store.del('stats.tst-leer'); D.Store.del('homeEmpty.tst-leer');
        if (keep) D.Store.set('top10.de', keep); else D.Store.del('top10.de');
      });
    }, { id: 'tst-leer', type: 'demo', name: 'Nur Sender' });
  });

  t(G, 'Startseite ohne Internet: Platzhalter bleiben nicht für immer – nach kurzer Zeit stehen die Felder da, „leer“ wird aber nicht gemerkt', function () {
    var keep = D.Store.get('top10.de', null);
    return withShell(function () {
      D.Store.set('top10.de', { at: Date.now(), d: { v: 1, country: 'DE', services: [] } });
      D.Store.del('stats.tst-offline'); D.Store.del('homeEmpty.tst-offline');
      var hold = D.App.provider.items;
      D.App.provider.items = function () { return new Promise(function () {}); };
      D.Shell.show('home');
      return wait(13500).then(function () {
        var el = D.Shell.view.querySelector('.launcher');
        ok(!el.classList.contains('is-loading'), 'lädt nicht mehr „ewig“');
        ok(!el.querySelector('.hm-skrow, .hm-skhero'), 'Platzhalter sind weg');
        ok(el.querySelectorAll('.hm-w').length === 3, 'die drei Felder stehen da');
        eq(D.Store.get('homeEmpty.tst-offline', null), null, 'nicht als „leer“ gemerkt (die Playlist wurde ja nie geladen) – kein falscher Sprung zu Live TV');
        D.App.provider.items = hold;
        if (keep) D.Store.set('top10.de', keep); else D.Store.del('top10.de');
      });
    }, { id: 'tst-offline', type: 'demo', name: 'Demo' });
  });
})();
