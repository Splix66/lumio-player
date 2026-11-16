/* Tests: Sicherheit & Datenschutz in der App */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'Sicherheit & Daten';

  t(G, 'PIN-Sperre: 4 Fehlversuche frei, ab dem 5. Wartezeit, die sich verdoppelt', function () {
    var scope = 'test-' + Date.now(), T0 = Date.UTC(2030, 0, 1);
    return Test.withTime(T0, function () {
      var waits = [];
      for (var i = 1; i <= 4; i++) waits.push(D.PinGuard.fail(scope));
      eq(waits, [0, 0, 0, 0], 'erste 4 Fehlversuche ohne Sperre');
      eq(D.PinGuard.fail(scope), 30, '5. Fehlversuch: 30 s');
      eq(D.PinGuard.fail(scope), 60, '6. Fehlversuch: 60 s');
      eq(D.PinGuard.fail(scope), 120, '7. Fehlversuch: 120 s');
      for (var j = 0; j < 10; j++) D.PinGuard.fail(scope);
      eq(D.PinGuard.wait(scope), 1800, 'höchstens 30 Minuten');
      D.PinGuard.ok(scope);
      eq(D.PinGuard.wait(scope), 0, 'nach richtiger PIN zurückgesetzt');
      eq(D.Store.get('pinguard.' + scope, null), null, 'Zähler gelöscht');
    });
  });

  t(G, 'PIN-Sperre läuft nach Ablauf der Wartezeit ab', function () {
    var scope = 'test2-' + Date.now(), T0 = Date.UTC(2030, 0, 1);
    return Test.withTime(T0, function () {
      for (var i = 0; i < 5; i++) D.PinGuard.fail(scope);
      eq(D.PinGuard.wait(scope), 30);
    }).then(function () {
      return Test.withTime(T0 + 31000, function () { eq(D.PinGuard.wait(scope), 0, 'nach 31 s wieder frei'); D.PinGuard.ok(scope); });
    });
  });

  t(G, 'Playlist löschen entfernt alle gespeicherten Datenarten (auch „Top Sender“ und Titelbild der Startseite)', function () {
    var id = 'test-profil-' + Date.now();
    D.Profiles.DATA_KEYS.forEach(function (k) { D.Store.set(k + '.' + id, { x: 1 }); });
    D.Store.set('hero.' + id + '.movie', [{ id: 1 }]); D.Store.set('hero.' + id + '.series', [{ id: 2 }]);
    eq(D.Profiles.DATA_KEYS.length, 16);
    ok(D.Profiles.DATA_KEYS.indexOf('chcount') >= 0, '„Top Sender“ (chcount) gehört dazu');
    D.Profiles.dropData(id);
    var left = D.Profiles.DATA_KEYS.filter(function (k) { return D.Store.get(k + '.' + id, null) !== null; });
    eq(left, [], 'nichts bleibt übrig');
    eq(D.Store.get('hero.' + id + '.movie', null), null, 'Titelbild-Auswahl (Filme) gelöscht');
    eq(D.Store.get('hero.' + id + '.series', null), null, 'Titelbild-Auswahl (Serien) gelöscht');
  });

  t(G, 'Gespeicherter Programmführer wird beim Löschen ebenfalls entfernt', function () {
    var id = 'test-epg-del-' + Date.now();
    return D.EpgStore.set('epg.' + id, { at: 1, progs: {} }).then(function () {
      return D.EpgStore.get('epg.' + id);
    }).then(function (v) {
      ok(v, 'Testeintrag gespeichert');
      D.Profiles.dropData(id);
      return Test.wait(200).then(function () { return D.EpgStore.get('epg.' + id); });
    }).then(function (v) { eq(v, null, 'Eintrag gelöscht'); });
  });

  t(G, 'Testmodus (?nocloud): keine Verbindung zum Online-Dienst', function () {
    eq(D.config.cloudUrl, '', 'Adresse des Online-Dienstes ist leer');
    return D.Cloud.rpc('list_playlists', {}).then(function () { throw new Error('Anfrage hätte abgelehnt werden müssen'); }, function (e) {
      eq(e.message, 'offline');
      var sent = performance.getEntriesByType('resource').filter(function (r) { return /supabase/.test(r.name); });
      eq(sent.length, 0, 'keine Anfrage an Supabase');
    });
  });

  t(G, 'Speicher übersteht kaputte Einträge', function () {
    try { localStorage.setItem('lumio.test-kaputt', '{nicht json'); } catch (e) {}
    eq(D.Store.get('test-kaputt', 'Ersatz'), 'Ersatz');
    D.Store.del('test-kaputt');
  });
})();

/* Tests: „Online“-Zeichen an den Online-Dienst (devices.last_seen) */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq;
  var G = 'Online-Dienst';

  t(G, 'Online-Zeichen: sichtbar normaler Abgleich, verdeckt nur bei Wiedergabe und höchstens alle 2 Minuten', function () {
    var C = D.Cloud, calls = [], syncs = 0;
    var keep = { call: C.call, sync: C.sync, registered: C.registered, lastPing: C.lastPing, url: D.config.cloudUrl, active: D.NativePlayer.active };
    var hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return hidden; } });
    C.call = function (fn) { calls.push(fn); return Promise.resolve({ ok: true, items: [] }); };
    C.sync = function () { syncs++; return Promise.resolve(null); };
    C.registered = true; C.lastPing = 0; D.config.cloudUrl = 'https://test.invalid/';
    function restore() {
      delete document.hidden;
      C.call = keep.call; C.sync = keep.sync; C.registered = keep.registered; C.lastPing = keep.lastPing;
      D.config.cloudUrl = keep.url; D.NativePlayer.active = keep.active;
    }
    return Promise.resolve().then(function () {
      D.NativePlayer.active = false;
      return C.tick();
    }).then(function () {
      eq(calls.length, 0, 'verdeckt ohne Wiedergabe: nichts senden');
      D.NativePlayer.active = true;
      return C.tick();
    }).then(function (r) {
      eq(r, true, 'Lebenszeichen gesendet');
      eq(calls, ['list_playlists'], 'TV-Player offen: ein Lebenszeichen');
      return C.tick();
    }).then(function () {
      eq(calls.length, 1, 'gleich danach kein zweites');
      C.lastPing = Date.now() - D.config.pingInterval - 1;
      return C.tick();
    }).then(function () {
      eq(calls.length, 2, 'nach 2 Minuten wieder');
      eq(syncs, 0, 'verdeckt: kein voller Abgleich (keine Playlist-Änderung im Hintergrund)');
      hidden = false;
      return C.tick();
    }).then(function () {
      eq(syncs, 1, 'sichtbar: normaler Abgleich');
      eq(calls.length, 2, 'sichtbar: kein zusätzliches Lebenszeichen');
      C.registered = false; hidden = true; C.lastPing = 0;
      return C.tick();
    }).then(function (r) {
      eq(r, false, 'nicht angemeldet: nichts senden');
      eq(calls.length, 2);
      restore();
    }, function (e) { restore(); throw e; });
  });
})();

/* Test: Lebenszeichen für den TV-Player (Android schickt es selbst, weil die Seite dort nach ~1 min stillsteht) */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq;
  t('Online-Dienst', 'TV-Player bekommt das Lebenszeichen als fertige Anfrage – nur angemeldet, nur Abruf, gleicher Abstand', function () {
    var C = D.Cloud, keep = { registered: C.registered, mode: C.mode, url: D.config.cloudUrl };
    try {
      C.registered = false; D.config.cloudUrl = 'https://test.invalid/rpc/';
      eq(C.pingReq(), null, 'nicht angemeldet: keine Anfrage');
      C.registered = true; D.config.cloudUrl = '';
      eq(C.pingReq(), null, 'ohne Online-Dienst: keine Anfrage');
      D.config.cloudUrl = 'https://test.invalid/rpc/'; C.mode = null;
      var r = C.pingReq(), b = JSON.parse(r.body);
      eq(r.url, 'https://test.invalid/rpc/list_playlists', 'nur Abruf (list_playlists)');
      eq(r.every, D.config.pingInterval, 'gleicher Abstand wie die Seite');
      eq(r.key, D.config.cloudKey);
      eq(Object.keys(b).sort(), ['p_key', 'p_mac'], 'alter Weg: MAC + KEY');
      C.mode = 'token';
      r = C.pingReq(); b = JSON.parse(r.body);
      eq(r.url, 'https://test.invalid/rpc/app_list_playlists', 'sicherer Weg: app_-Funktion');
      eq(Object.keys(b).sort(), ['p_mac', 'p_token'], 'sicherer Weg: MAC + Token, kein KEY');
    } finally {
      C.registered = keep.registered; C.mode = keep.mode; D.config.cloudUrl = keep.url;
    }
  });
})();
