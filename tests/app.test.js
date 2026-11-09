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

  t(G, 'Playlist löschen entfernt alle 13 gespeicherten Datenarten', function () {
    var id = 'test-profil-' + Date.now();
    D.Profiles.DATA_KEYS.forEach(function (k) { D.Store.set(k + '.' + id, { x: 1 }); });
    eq(D.Profiles.DATA_KEYS.length, 13);
    D.Profiles.dropData(id);
    var left = D.Profiles.DATA_KEYS.filter(function (k) { return D.Store.get(k + '.' + id, null) !== null; });
    eq(left, [], 'nichts bleibt übrig');
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
