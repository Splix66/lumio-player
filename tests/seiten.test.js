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
})();
