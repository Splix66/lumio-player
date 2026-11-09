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

  t(G, 'Datenschutz: Zugangsdaten werden nur mit Zustimmung („Auch auf der Webseite verwalten“) hochgeladen', function () {
    var before = D.Store.get('profiles', []), realRpc = D.Cloud.rpc, wasReg = D.Cloud.registered, sent = [];
    try {
      D.Store.set('profiles', [
        { id: 'ohne', type: 'xtream', name: 'Ohne Zustimmung', server: 'http://s', username: 'u', password: 'geheim' },
        { id: 'mit', type: 'm3u', name: 'Mit Zustimmung', url: 'http://x/a.m3u', cloud: true }
      ]);
      D.Cloud.registered = true;
      D.Cloud.rpc = function (fn, body) { sent.push(fn + ':' + body.p_name); return Promise.resolve({ ok: true, id: 'r-' + sent.length }); };
      D.Cloud.upload();
      return Test.wait(50).then(function () {
        eq(sent, ['add_playlist:Mit Zustimmung'], 'nur die freigegebene Playlist');
      });
    } finally {
      setTimeout(function () { D.Cloud.rpc = realRpc; D.Cloud.registered = wasReg; D.Store.set('profiles', before); }, 100);
    }
  });

  t(G, 'Online-Dienst: sicherer Weg mit Token, sonst bisheriger Weg mit KEY', function () {
    var realRpc = D.Cloud.rpc, mode = D.Cloud.mode, sent = [];
    D.Cloud.rpc = function (fn, body) { sent.push(fn + ':' + (body.p_token ? 'token' : '') + (body.p_key ? 'key' : '')); return Promise.resolve({ ok: true }); };
    try {
      D.Cloud.mode = 'token'; D.Cloud.call('list_playlists', { p_mac: 'AA:BB:CC:DD:EE:FF' });
      D.Cloud.mode = 'legacy'; D.Cloud.call('list_playlists', { p_mac: 'AA:BB:CC:DD:EE:FF' });
      eq(sent, ['app_list_playlists:token', 'list_playlists:key']);
    } finally { D.Cloud.rpc = realRpc; D.Cloud.mode = mode; }
  });

  t(G, 'Anmeldung: fehlt die neue Datenbank-Funktion, wird der bisherige Weg genommen', function () {
    var realRpc = D.Cloud.rpc, mode = D.Cloud.mode, sent = [];
    D.Cloud.rpc = function (fn) {
      sent.push(fn);
      return Promise.resolve(fn === 'app_register' ? { code: 'PGRST202', message: 'Could not find the function' } : { ok: true });
    };
    return D.Cloud.register().then(function (r) {
      eq(sent, ['app_register', 'register_device']); eq(D.Cloud.mode, 'legacy'); ok(r.ok);
    }).then(function () { D.Cloud.rpc = realRpc; D.Cloud.mode = mode; }, function (e) { D.Cloud.rpc = realRpc; D.Cloud.mode = mode; throw e; });
  });

  t(G, 'TV-Player (Android): Übergabe bleibt klein – auch bei 30.000 Sendern mit langen Adressen', function () {
    var realPlugin = D.NativePlayer.plugin, realProv = D.App.provider, sent = null;
    var long = new Array(1200).join('x');   // Adresse mit sehr langem Zugangs-Token
    D.NativePlayer.plugin = function () { return { play: function (o) { sent = o; return Promise.resolve({}); } }; };
    D.App.provider = { streamUrl: function (it) { return { url: 'http://srv.example/live/' + long + '/' + it.id + '.ts' }; } };
    var list = [];
    for (var i = 0; i < 30000; i++) list.push({ kind: 'live', id: 'c' + i, name: 'Sender ' + i, num: i + 1 });
    var item = list[15000];
    return D.NativePlayer.play(item, { list: list, index: 15000 }).then(function () {
      var size = JSON.stringify(sent.items).length;
      ok(size <= 200000, 'Größe ' + size + ' Zeichen');
      eq(sent.items[sent.index].title, '15001   Sender 15000', 'aktueller Sender an der richtigen Stelle');
      ok(sent.items.length > 10, 'genug Nachbarn zum Umschalten: ' + sent.items.length);
    }).then(cleanup, function (e) { cleanup(); throw e; });
    function cleanup() { D.NativePlayer.plugin = realPlugin; D.App.provider = realProv; D.Store.del('recent.none'); D.Store.del('last.none'); }
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
