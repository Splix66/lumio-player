/* Tests: Robustheit – Fehler aus der App-Prüfung vom 09.11.2026, damit sie nicht zurückkommen */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'Robustheit';

  function fakeResponse(chunks, opts) {
    // Antwort mit Datenstrom: chunks = Uint8Arrays; opts.stall = danach keine Daten mehr (Server hängt)
    var i = 0;
    return {
      ok: true, status: 200,
      body: { getReader: function () {
        return {
          read: function () {
            if (i < chunks.length) return Promise.resolve({ done: false, value: chunks[i++] });
            if (opts && opts.stall) return new Promise(function () {});
            return Promise.resolve({ done: true });
          },
          cancel: function () {}
        };
      } },
      text: function () { return Promise.resolve(''); }
    };
  }
  function bytes(arr) { return new Uint8Array(arr); }

  t(G, 'Playlist-Download bricht ab, wenn der Server mitten in der Übertragung stehen bleibt', function () {
    var res = fakeResponse([bytes([35, 69, 88, 84, 77, 51, 85, 10])], { stall: true });
    var t0 = Date.now();
    return D.readText(res, 300).then(function () { ok(false, 'hätte abbrechen müssen'); }, function (e) {
      ok(/Zeitüberschreitung|timeout/i.test(e.message), 'Meldung: ' + e.message);
      ok(Date.now() - t0 < 3000, 'bricht nach kurzer Zeit ab');
    });
  });

  t(G, 'Langsamer, aber laufender Download wird nicht abgebrochen', function () {
    var chunks = [], i;
    for (i = 0; i < 4; i++) chunks.push(bytes([65 + i]));
    var res = fakeResponse([]), n = 0;
    res.body.getReader = function () {
      return { read: function () {
        if (n >= chunks.length) return Promise.resolve({ done: true });
        var c = chunks[n++];
        return new Promise(function (r) { setTimeout(function () { r({ done: false, value: c }); }, 120); });
      }, cancel: function () {} };
    };
    // Gesamtdauer ~480 ms > Zeitlimit 300 ms, aber nie 300 ms ohne Daten
    return D.readText(res, 300).then(function (txt) { eq(txt, 'ABCD'); });
  });

  t(G, 'Zeichensatz: UTF-8 bleibt UTF-8, alte Latin-1-Playlists zeigen Umlaute richtig', function () {
    eq(D.decodeBytes(bytes([0x4b, 0xc3, 0xbc, 0x63, 0x68, 0x65])), 'Küche', 'UTF-8');
    eq(D.decodeBytes(bytes([0x4b, 0xfc, 0x63, 0x68, 0x65])), 'Küche', 'Latin-1/Windows-1252');
  });

  t(G, 'Gleiche Playlist wird erkannt (verhindert doppelte Kopien beim Hochladen)', function () {
    ok(D.sameConnection({ type: 'm3u', url: 'http://a/b.m3u' }, { type: 'm3u', url: ' http://a/b.m3u ' }), 'M3U gleich');
    ok(!D.sameConnection({ type: 'm3u', url: 'http://a/b.m3u' }, { type: 'm3u', url: 'http://a/c.m3u' }), 'M3U verschieden');
    ok(D.sameConnection({ type: 'xtream', server: 'http://srv:8080/', username: 'u', password: 'p' }, { type: 'xtream', server: 'http://srv:8080', username: 'u', password: 'p' }), 'Xtream gleich');
    ok(!D.sameConnection({ type: 'xtream', server: 'http://srv:8080', username: 'u', password: 'p' }, { type: 'xtream', server: 'http://srv:8080', username: 'u', password: 'x' }), 'anderes Passwort');
  });

  t(G, 'Auf dem Gerät gelöschte Playlist kommt beim nächsten Abgleich nicht zurück', function () {
    var before = D.Store.get('profiles', []), pend = D.Store.get('cloudDel', []);
    try {
      D.Store.set('profiles', []);
      D.Store.set('cloudDel', ['remote-weg']);
      var r = D.Cloud.apply([{ id: 'remote-weg', type: 'm3u', name: 'Gelöscht', url: 'http://x/a.m3u' }]);
      eq(r.changed, false, 'nichts übernommen');
      eq(D.Store.get('profiles', []).length, 0);
    } finally { D.Store.set('profiles', before); D.Store.set('cloudDel', pend); }
  });

  t(G, 'Verspätete Upload-Antwort: Online-Kopie wird mit der Playlist verknüpft statt verdoppelt', function () {
    var before = D.Store.get('profiles', []);
    try {
      D.Store.set('profiles', [{ id: 'lokal1', type: 'm3u', name: 'Lokal', url: 'http://x/a.m3u' }]);
      D.Cloud.apply([{ id: 'r9', type: 'm3u', name: 'Lokal', url: 'http://x/a.m3u' }]);
      var l = D.Store.get('profiles', []);
      eq(l.length, 1, 'keine Kopie');
      eq(l[0].remoteId, 'r9', 'verknüpft');
    } finally { D.Store.set('profiles', before); }
  });

  t(G, 'Xtream: abgelaufener Zugang wird als Fehler gemeldet, nicht als leere Liste', function () {
    var realFetch = window.fetch;
    window.fetch = function (url) {
      var body = /action=/.test(url) ? { user_info: { auth: 1, status: 'Expired' } } : { user_info: { auth: 1, status: 'Expired' } };
      return Promise.resolve({ ok: true, status: 200, body: null, text: function () { return Promise.resolve(JSON.stringify(body)); } });
    };
    var p = D.makeProvider({ type: 'xtream', server: 'http://test.invalid:8080', username: 'u', password: 'p' });
    return p.items('live', '__all').then(function (l) {
      window.fetch = realFetch; ok(false, 'hätte Fehler melden müssen, kam: ' + l.length + ' Einträge');
    }, function (e) {
      window.fetch = realFetch; ok(/Expired/.test(e.message), 'Meldung: ' + e.message);
    });
  });
})();
