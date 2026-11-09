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

  function m3uProvider(text, id) {
    var realFetch = window.fetch;
    window.fetch = function () { return Promise.resolve({ ok: true, status: 200, body: null, text: function () { return Promise.resolve(text); } }); };
    var prov = D.makeProvider({ id: id, type: 'm3u', name: 'Test', url: 'http://test.invalid/' + id + '.m3u' });
    return prov.items('live', '__all').then(function (l) { window.fetch = realFetch; return { prov: prov, live: l }; }, function (e) { window.fetch = realFetch; throw e; });
  }
  var PL1 = '#EXTM3U\n#EXTINF:-1 group-title="News",Sender A\nhttp://x.invalid/a.ts\n#EXTINF:-1 group-title="News",Sender B\nhttp://x.invalid/b.ts\n';
  var PL2 = '#EXTM3U\n#EXTINF:-1 group-title="News",Neuer Sender\nhttp://x.invalid/neu.ts\n#EXTINF:-1 group-title="News",Sender A\nhttp://x.invalid/a.ts\n#EXTINF:-1 group-title="News",Sender B\nhttp://x.invalid/b.ts\n';

  t(G, 'M3U: Kennung bleibt gleich, wenn der Anbieter oben einen Sender einfügt (Favoriten rutschen nicht mehr)', function () {
    var a, b;
    return m3uProvider(PL1, 'idtest1').then(function (r) { a = r.live; return m3uProvider(PL2, 'idtest2'); }).then(function (r) {
      b = r.live;
      var idB1 = a.filter(function (x) { return x.name === 'Sender B'; })[0].id;
      var idB2 = b.filter(function (x) { return x.name === 'Sender B'; })[0].id;
      eq(idB1, idB2, 'Sender B behält seine Kennung');
      ok(!/^l\d+$/.test(idB1), 'keine Positions-Kennung mehr: ' + idB1);
    }).then(function () { ['idtest1', 'idtest2'].forEach(function (p) { D.Store.del('idv.' + p); }); });
  });

  t(G, 'M3U: gespeicherte Favoriten, Weiterschauen und Häkchen werden einmalig auf die neue Kennung umgestellt', function () {
    var P = 'idtest3';
    D.Store.set('fav.' + P, { live: [{ kind: 'live', id: 'l1', name: 'Sender B', url: 'http://x.invalid/b.ts' }], movie: [], series: [] });
    D.Store.set('recent.' + P, [{ kind: 'live', id: 'l0', name: 'Sender A', url: 'http://x.invalid/a.ts' }]);
    D.Store.set('seen.' + P, { 'live:l1': 123 });
    D.Store.set('resume.' + P, { 'live:l0': { t: 50, d: 100, at: 1, item: { kind: 'live', id: 'l0', url: 'http://x.invalid/a.ts' } } });
    D.Store.del('idv.' + P);
    // Der Anbieter hat inzwischen oben einen Sender eingefügt: Zuordnung muss über die Adresse laufen, nicht über die Position
    return m3uProvider(PL2, P).then(function (r) {
      var A = r.live.filter(function (x) { return x.name === 'Sender A'; })[0].id, B = r.live.filter(function (x) { return x.name === 'Sender B'; })[0].id;
      eq(D.Store.get('fav.' + P).live[0].id, B, 'Favorit zeigt weiter auf Sender B');
      eq(D.Store.get('recent.' + P)[0].id, A, 'Zuletzt gesehen: Sender A');
      ok(D.Store.get('resume.' + P)['live:' + A], 'Weiterschauen umgestellt');
      eq(D.Store.get('idv.' + P), 2, 'Umstellung gemerkt (läuft nur einmal)');
    }).then(function () { ['fav', 'recent', 'seen', 'resume', 'idv'].forEach(function (k) { D.Store.del(k + '.' + P); }); });
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

  t(G, 'Fehlerprotokoll: keine Links, Benutzernamen oder Passwörter – und nur die letzten 15', function () {
    var L = D.ErrLog, before = L.list();
    try {
      Store_clear();
      L.add('Wiedergabe', 'Fehler bei http://anbieter.example:8080/live/maxmuster/geheim123/42.ts und get.php?username=maxmuster&password=geheim123');
      var e = L.list()[0];
      ok(e && e.m.indexOf('[Link]') >= 0, 'Link ersetzt: ' + (e && e.m));
      ok(!/maxmuster|geheim123|anbieter/.test(JSON.stringify(L.list())), 'keine Zugangsdaten gespeichert');
      L.add('Wiedergabe', 'gleich'); L.add('Wiedergabe', 'gleich');
      eq(L.list()[L.list().length - 1].n, 2, 'gleicher Fehler wird gezählt statt doppelt gespeichert');
      for (var i = 0; i < 30; i++) L.add('Test', 'Fehler ' + i);
      eq(L.list().length, 15, 'höchstens 15 Einträge');
      eq(L.list()[14].m, 'Fehler 29', 'der neueste bleibt erhalten');
      ok(!/maxmuster|geheim123/.test(D.techInfo()), 'technische Angaben ohne Zugangsdaten');
    } finally {
      try { localStorage.setItem('lumio.errlog', JSON.stringify(before)); } catch (x) {}
    }
    function Store_clear() { try { localStorage.removeItem('lumio.errlog'); } catch (x) {} }
  });

  t('Catch-up', 'Xtream: Archiv-Sender, vergangene Sendungen und Abspiel-Adresse in Serverzeit', function () {
    var realFetch = window.fetch, now = Math.floor(Date.now() / 1000), h0 = now - (now % 3600);
    function two(n) { return n < 10 ? '0' + n : '' + n; }
    function srvTime(ts) { var d = new Date((ts + 7200) * 1000); return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()) + ' ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ':00'; }
    var listings = [], k;
    for (k = -60; k <= 2; k++) {
      var st = h0 + k * 3600;
      listings.push({ title: btoa('Sendung ' + k), description: '', start_timestamp: String(st), stop_timestamp: String(st + 3600),
        start: k === -2 ? '' : srvTime(st), has_archive: st + 3600 <= now ? 1 : 0 });
    }
    window.fetch = function (url) {
      var body = /get_live_streams/.test(url) ? [{ stream_id: 7, name: 'A', category_id: '1', tv_archive: 1, tv_archive_duration: '2' }, { stream_id: 8, name: 'B', category_id: '1', tv_archive: 0 }]
        : /get_simple_data_table/.test(url) ? { epg_listings: listings }
        : { user_info: { auth: 1, status: 'Active' }, server_info: { time_now: srvTime(now), timestamp_now: now } };
      return Promise.resolve({ ok: true, status: 200, body: null, text: function () { return Promise.resolve(JSON.stringify(body)); } });
    };
    var p = D.makeProvider({ type: 'xtream', server: 'http://srv.invalid:8080', username: 'u', password: 'p w' });
    return p.items('live', '__all').then(function (l) {
      eq(l[0].archive, 2, 'Sender mit Archiv: 2 Tage');
      eq(l[1].archive, 0, 'Sender ohne Archiv');
      return p.archive(l[0]).then(function (progs) {
        window.fetch = realFetch;
        ok(progs.length >= 48 && progs.length <= 51, 'nur die letzten 2 Tage (+ laufende Sendung): ' + progs.length);
        ok(progs[0].start <= now && progs[0].end > now, 'neueste zuerst – laufende Sendung oben');
        ok(progs.every(function (e) { return e.start <= now; }), 'keine künftigen Sendungen');
        var e1 = progs[1], it = p.catchup(l[0], e1);
        eq(it.kind, 'catchup', 'eigener Typ');
        eq(it.url, 'http://srv.invalid:8080/timeshift/u/p%20w/60/' + srvTime(e1.start).slice(0, 10) + ':' + srvTime(e1.start).slice(11, 13) + '-' + srvTime(e1.start).slice(14, 16) + '/7.ts', 'Adresse mit Startzeit des Servers');
        ok(/\.m3u8$/.test(it.alt), 'Ersatz-Adresse als HLS');
        var e2 = progs.filter(function (e) { return e.start === h0 - 2 * 3600; })[0];
        eq(e2.at, srvTime(e2.start).slice(0, 10) + ':' + srvTime(e2.start).slice(11, 13) + '-' + srvTime(e2.start).slice(14, 16), 'ohne Zeittext: aus Serverzeit-Abstand (+2 h) berechnet');
        eq(p.streamUrl(it).url, it.url, 'Player nimmt die Catch-up-Adresse');
      });
    }).catch(function (e) { window.fetch = realFetch; throw e; });
  });

  t('Catch-up', 'Programmführer-Zeit: Verschiebung um +1 Std. bei Xtream und M3U', function () {
    var realFetch = window.fetch, now = Math.floor(Date.now() / 1000), h0 = now - (now % 3600), listings = [], k;
    for (k = -3; k <= 3; k++) listings.push({ title: btoa('S' + k), description: '', start_timestamp: String(h0 + k * 3600), stop_timestamp: String(h0 + (k + 1) * 3600) });
    window.fetch = function (url) {
      var body = /get_simple_data_table/.test(url) ? { epg_listings: listings } : /get_short_epg/.test(url) ? { epg_listings: listings.slice(3) } : {};
      return Promise.resolve({ ok: true, status: 200, body: null, text: function () { return Promise.resolve(JSON.stringify(body)); } });
    };
    var prof = { type: 'xtream', server: 'http://srv.invalid', username: 'u', password: 'p', epgShift: 60 };
    var p = D.makeProvider(prof);
    return p.epg({ id: '1' }, 3).then(function (l) {
      eq(l[0].title, 'S-1', 'läuft gerade: die Sendung, die laut Programm eine Stunde früher war');
      eq(l[0].start, h0, 'um eine Stunde verschoben');
      prof.epgShift = 0;
      return p.epg({ id: '1' }, 3);
    }).then(function (l) {
      window.fetch = realFetch;
      eq(l[0].title, 'S0', 'ohne Verschiebung wie vom Server');
      eq(l[0].start, h0, 'Originalzeit');
    }, function (e) { window.fetch = realFetch; throw e; });
  });

  t(G, 'Kategorien: anheften, umbenennen – Umbenennen hebt die Kindersicherung nicht auf', function () {
    var C = D.CatPrefs, key = 'lumio.' + C.key(), before = localStorage.getItem(key), sBefore = localStorage.getItem('lumio.settings');
    try {
      localStorage.removeItem(key);
      var cats = [{ id: '1', name: 'Nachrichten' }, { id: '2', name: 'Sport' }, { id: '3', name: 'XXX Adults' }, { id: '4', name: 'Kinder' }];
      C.togglePin('live', '4'); C.togglePin('live', '2');
      C.setName('live', '3', 'Doku'); C.set('live', 'hide', '1', true);
      var v = D.visibleCats('live', cats);
      eq(v.map(function (c) { return c.name; }).join(','), 'Kinder,Sport,Doku', 'ausgeblendet weg, angeheftete zuerst (in Reihenfolge), eigener Name');
      eq(v[2].orig, 'XXX Adults', 'Originalname bleibt erhalten');
      ok(D.Parental.isAdult(v[2]), 'umbenannte Erwachsenen-Kategorie wird weiter erkannt');
      eq(cats[2].name, 'XXX Adults', 'Liste des Anbieters bleibt unverändert');
      C.setName('live', '3', '');
      eq(D.visibleCats('live', cats)[2].name, 'XXX Adults', 'leerer Name = Originalname');
    } finally {
      if (before === null) localStorage.removeItem(key); else localStorage.setItem(key, before);
      if (sBefore !== null) localStorage.setItem('lumio.settings', sBefore);
    }
  });

  t('Catch-up', 'M3U: Catch-up-Angaben lesen und Archiv-Adressen bauen (default, append, shift, flussonic, xc)', function () {
    var m3u = '#EXTM3U url-tvg="http://epg.invalid/e.xml" catchup="shift" catchup-days="2"\n' +
      '#EXTINF:-1 tvg-id="a" catchup="default" catchup-days="7" catchup-source="http://cdn.invalid/a/{utc}/{utcend}/{Y}-{m}-{d}:{H}-{M}.m3u8",A\nhttp://cdn.invalid/a/live.m3u8\n' +
      '#EXTINF:-1 catchup="append" catchup-days="3" catchup-source="?start=${start}&dur=${duration}",B\nhttp://cdn.invalid/b.m3u8?token=1\n' +
      '#EXTINF:-1,C (Vorgabe aus Kopfzeile)\nhttp://cdn.invalid/c.m3u8\n' +
      '#EXTINF:-1 catchup="flussonic" catchup-days="1",D\nhttp://fs.invalid/kanal/index.m3u8?token=x\n' +
      '#EXTINF:-1 catchup="xc" catchup-days="4",E\nhttp://xc.invalid:8080/user/pass/123.ts\n' +
      '#EXTINF:-1 timeshift="5",F\nhttp://old.invalid/f.m3u8\n' +
      '#EXTINF:-1 catchup="flussonic",G (unbekannte Form)\nhttp://fs.invalid/kanal/live.php\n';
    var e = D.parseM3U(m3u), byName = {};
    e.forEach(function (x) { byName[x.name.charAt(0)] = x; });
    var st = Date.UTC(2026, 10, 9, 18, 0, 0) / 1000, en = st + 3600;
    function url(n) { var x = byName[n]; return D.catchupUrl({ url: x.url, cu: x.cu }, st, en); }
    eq(byName.A.cu.d, 7, 'catchup-days');
    eq(url('A'), 'http://cdn.invalid/a/' + st + '/' + en + '/2026-11-09:18-00.m3u8', 'default mit Vorlage');
    eq(url('B'), 'http://cdn.invalid/b.m3u8?token=1?start=' + st + '&dur=3600', 'append hängt die Vorlage an');
    ok(/^http:\/\/cdn\.invalid\/c\.m3u8\?utc=\d+&lutc=\d+$/.test(url('C')) && url('C').indexOf('utc=' + st) > 0, 'Vorgabe aus der Kopfzeile: shift → ' + url('C'));
    eq(byName.C.cu.d, 2, 'Tage aus der Kopfzeile');
    eq(url('D'), 'http://fs.invalid/kanal/index-' + st + '-3600.m3u8?token=x', 'flussonic');
    eq(url('E'), 'http://xc.invalid:8080/timeshift/user/pass/60/2026-11-09:18-00/123.ts', 'xc');
    ok(/f\.m3u8\?utc=/.test(url('F')) && byName.F.cu.d === 5, 'alte Form timeshift="5"');
    eq(url('G'), null, 'unbekannte Form → kein Catch-up');
  });

  t('Sichern', 'Sichern und auf einem „neuen Gerät“ wiederherstellen: ohne Passwörter, Zuordnung über Fingerabdruck', function () {
    var S = D.Store, B = D.Backup, saved = {}, k;
    // aktuellen Zustand merken (Test läuft im echten Speicher der Test-Seite)
    for (k = 0; k < localStorage.length; k++) { var n = localStorage.key(k); if (n.indexOf('lumio.') === 0) saved[n] = localStorage.getItem(n); }
    var settingsBefore = JSON.stringify(D.Settings.data);
    try {
      var A = { id: 'altA', type: 'xtream', name: 'Mein TV', server: 'http://srv.invalid:8080/', username: 'Max', password: 'geheim123' };
      var M = { id: 'altM', type: 'm3u', name: 'Liste', url: 'http://m3u.invalid/get.php?username=u&password=geheimM' };
      D.Profiles.save([A, M]);
      S.set('fav.altA', { live: [{ kind: 'live', id: '7', name: 'Sender 7' }], movie: [], series: [] });
      S.set('cats.altA', { hide: { live: { '3': 1 } }, pin: { live: ['5'] } });
      S.set('hidech.altM', { 'l-abc': 'Teleshop' });
      D.Settings.data = { lang: 'de', theme: 'light', parentPin: 'hash-pin', deviceType: 'tv' };
      var b = B.build(), js = JSON.stringify(b);
      ok(js.indexOf('geheim') < 0 && js.indexOf('get.php') < 0 && js.indexOf('srv.invalid') < 0, 'keine Passwörter, Links oder Server in der Sicherung');
      ok(js.indexOf('hash-pin') < 0 && !b.settings.deviceType, 'keine PIN, kein Gerätetyp');
      eq(b.lists.length, 2, 'beide Playlists');
      // „neues Gerät“: andere Kennungen, Xtream mit anderer Schreibweise; M3U fehlt noch
      D.Profiles.save([{ id: 'neuA', type: 'xtream', name: 'TV', server: 'http://SRV.invalid:8080', username: 'max', password: 'geheim123' }]);
      ['fav.altA', 'cats.altA', 'hidech.altM'].forEach(function (x) { S.del(x); });
      D.Settings.data = { lang: 'en', deviceType: 'touch' };
      var res = B.apply({ backup: b, playlists: [] });
      eq(res.matched, 1, 'Xtream-Playlist wiedererkannt');
      eq(res.waiting, 1, 'M3U wartet, bis sie eingetragen wird');
      eq(S.get('fav.neuA', {}).live[0].id, '7', 'Favoriten übernommen');
      eq(S.get('cats.neuA', {}).pin.live[0], '5', 'Kategorien übernommen');
      eq(D.Settings.data.theme, 'light', 'Einstellung übernommen');
      eq(D.Settings.data.deviceType, 'touch', 'Gerätetyp des neuen Geräts bleibt');
      // M3U wird eingetragen und geöffnet → wartende Daten kommen dazu
      var M2 = { id: 'neuM', type: 'm3u', name: 'Liste', url: 'http://m3u.invalid/get.php?username=u&password=geheimM' };
      ok(B.pendingFor(M2), 'beim Öffnen übernommen');
      eq(S.get('hidech.neuM', {})['l-abc'], 'Teleshop', 'ausgeblendete Sender übernommen');
      ok(!B.pendingFor(M2), 'nur einmal');
      // Playlists von der Webseite (mit Zugangsdaten aus dem Online-Dienst) kommen dazu, ohne Doppel
      var r2 = B.apply({ backup: null, playlists: [{ name: 'TV', type: 'xtream', server: 'http://SRV.invalid:8080', username: 'max', password: 'geheim123' }, { name: 'Neu', type: 'm3u', url: 'http://neu.invalid/x.m3u' }] });
      eq(r2.added, 1, 'nur die neue Playlist hinzugefügt');
    } finally {
      for (k = localStorage.length - 1; k >= 0; k--) { var n2 = localStorage.key(k); if (n2.indexOf('lumio.') === 0) localStorage.removeItem(n2); }
      Object.keys(saved).forEach(function (x) { localStorage.setItem(x, saved[x]); });
      D.Settings.data = JSON.parse(settingsBefore);
    }
  });

  t('Filme & Serien', 'Nächste Folge in „Weiterschauen“, „Neue Folgen“, Sortieren und Gesehene ausblenden', function () {
    var saved = {}, k, n;
    for (k = 0; k < localStorage.length; k++) { n = localStorage.key(k); if (n.indexOf('lumio.') === 0) saved[n] = localStorage.getItem(n); }
    var sBefore = JSON.stringify(D.Settings.data), profBefore = D.App.profile;
    try {
      D.App.profile = { id: 'vodtest', type: 'xtream' };
      ['seen', 'resume', 'upnext', 'swatch'].forEach(function (x) { localStorage.removeItem('lumio.' + x + '.vodtest'); });
      var eps = [1, 2, 3].map(function (i) { return { kind: 'episode', id: 'e' + i, name: 'Folge ' + i, season: 1, num: i, seriesId: 's9', seriesName: 'Serie' }; });
      // Player kennt die Folgenliste; Folge 1 zu Ende → Serie mit Folge 2 in „Weiterschauen“
      D.UpNext.hint(eps);
      D.Seen.add(eps[0]);
      var e = D.UpNext.entries();
      eq(e.length, 1, 'ein Eintrag');
      eq(e[0].item.id, 'e2', 'nächste Folge');
      eq(e[0].upNext.series.name, 'Serie', 'Serienname');
      // Folge 2 angefangen → Eintrag weicht der angefangenen Folge
      D.Resume.set(eps[1], 300, 2700);
      eq(D.UpNext.entries().length, 0, 'angefangene Folge geht vor');
      // Von Hand gesehen markieren entfernt den Fortsetzen-Punkt
      D.Seen.setMany([eps[1]], true);
      ok(D.Seen.has(eps[1]) && !D.Resume.get(eps[1]), 'gesehen markiert, kein Fortsetzen mehr');
      D.Seen.setMany([eps[1]], false);
      ok(!D.Seen.has(eps[1]), 'wieder ungesehen');
      // Neue Folgen: Anbieter hat die Serie nach dem letzten Schauen geändert
      D.SeriesWatch.touch('s9');
      var later = { kind: 'series', id: 's9', added: String(Math.floor(Date.now() / 1000) + 3600) };
      var older = { kind: 'series', id: 's9', added: String(Math.floor(Date.now() / 1000) - 3600) };
      ok(D.SeriesWatch.hasNew(later), 'neue Folgen erkannt');
      ok(!D.SeriesWatch.hasNew(older), 'keine neuen Folgen');
      ok(!D.SeriesWatch.hasNew({ kind: 'series', id: 'nie', added: later.added }), 'nie geschaut → kein Hinweis');
      // Sortieren und Gesehene ausblenden
      var films = [
        { kind: 'movie', id: 'a', name: 'Zebra (2019)', rating: '6.1', added: '100' },
        { kind: 'movie', id: 'b', name: 'Apfel', year: '2024', rating: '8.4', added: '300' },
        { kind: 'movie', id: 'c', name: 'Mond (2021)', rating: '7.0', added: '200' }];
      function ids(l) { return l.map(function (x) { return x.id; }).join(''); }
      D.Settings.data.vodSort = { movie: 'az' }; eq(ids(D.sortVod('movie', films)), 'bca', 'A–Z');
      D.Settings.data.vodSort = { movie: 'rating' }; eq(ids(D.sortVod('movie', films)), 'bca', 'Bewertung');
      D.Settings.data.vodSort = { movie: 'year' }; eq(ids(D.sortVod('movie', films)), 'bca', 'Jahr (auch aus dem Namen)');
      D.Settings.data.vodSort = { movie: 'new' }; eq(ids(D.sortVod('movie', films)), 'bca', 'Neueste');
      D.Settings.data.vodSort = { movie: 'default' }; eq(ids(D.sortVod('movie', films)), 'abc', 'wie beim Anbieter');
      eq(ids(D.sortVod('movie', films, true)), 'bca', '„Alle“: neueste zuerst wie bisher');
      D.Seen.setMany([films[1]], true);
      D.Settings.data.vodHide = { movie: true };
      eq(ids(D.sortVod('movie', films)), 'ac', 'gesehener Film ausgeblendet');
      eq(films.length, 3, 'Liste des Anbieters unverändert');
    } finally {
      for (k = localStorage.length - 1; k >= 0; k--) { n = localStorage.key(k); if (n.indexOf('lumio.') === 0) localStorage.removeItem(n); }
      Object.keys(saved).forEach(function (x) { localStorage.setItem(x, saved[x]); });
      D.Settings.data = JSON.parse(sBefore); D.App.profile = profBefore;
    }
  });
})();
