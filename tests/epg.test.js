/* Tests: Programmführer (EPG) für M3U – XMLTV lesen, zuordnen, zwischenspeichern */
(function () {
  var D = window.LumioDebug, X = D.Xmltv, t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'Programmführer';
  // Testdateien in tests/fixtures enthalten Sendungen am 01.01.2030 – die Uhr wird im Test darauf gestellt
  var NOW = Date.UTC(2030, 0, 1, 12, 30);
  var BASE = location.origin + location.pathname.replace(/[^\/]*$/, '') + 'fixtures/';

  function playlist(epgUrl) {
    return '#EXTM3U' + (epgUrl ? ' url-tvg="' + epgUrl + '"' : '') + '\n' +
      '#EXTINF:-1 tvg-id="TEST.EINS" group-title="Test",Eins mit tvg-id\nhttp://s/live/1.ts\n' +
      '#EXTINF:-1 group-title="Test",DE: Test Zwei FHD\nhttp://s/live/2.ts\n' +
      '#EXTINF:-1 group-title="Test",Ohne Programm\nhttp://s/live/3.ts\n';
  }
  function provider(id, epgInList, ownEpg) {
    var p = { id: id, type: 'm3u', url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(playlist(epgInList)) };
    if (ownEpg) p.epgUrl = ownEpg;
    return D.makeProvider(p);
  }
  // Anfragen der App direkt beim Abschicken zählen (zuverlässiger als die Browser-Statistik)
  var requests = [], realFetch = window.fetch;
  window.fetch = function (input) {
    requests.push(String(input && input.url ? input.url : input));
    return realFetch.apply(this, arguments);
  };
  function downloads(name) {
    return requests.filter(function (u) { return u.indexOf('/fixtures/' + name) >= 0; }).length;
  }
  function epgAll(p) {
    return p.items('live').then(function (live) {
      return Promise.all(live.map(function (x) { return p.epg(x, 3); })).then(function (r) { return { live: live, r: r }; });
    });
  }
  function clean(id) { return function () { return D.EpgStore.del('epg.' + id); }; }

  /* ---------- Einzelteile ---------- */
  t(G, 'Zeitangaben mit Zeitzonen', function () {
    eq(X.time('20261109153000 +0100'), Date.UTC(2026, 10, 9, 14, 30) / 1000);
    eq(X.time('20261109153000 -0500'), Date.UTC(2026, 10, 9, 20, 30) / 1000);
    eq(X.time('20261109153000 +01:00'), Date.UTC(2026, 10, 9, 14, 30) / 1000);
    eq(X.time('20261109153000'), Date.UTC(2026, 10, 9, 15, 30) / 1000, 'ohne Zone = UTC');
    eq(X.time('202611091530'), Date.UTC(2026, 10, 9, 15, 30) / 1000, 'ohne Sekunden');
    eq(X.time('kaputt'), 0);
  });

  t(G, 'Sonderzeichen, CDATA und HTML-Formatierung', function () {
    eq(X.text('A &amp; B &lt;x&gt; &#252;ber &#x263A; &quot;q&quot; &apos;s&apos;'), 'A & B <x> über ☺ "q" \'s\'');
    eq(X.text('<![CDATA[Mit <Spitzklammern> & <b>fett</b><br>Zeile 2]]>'), 'Mit <Spitzklammern> & fett Zeile 2');
    eq(X.text('  viel   \n  Leerraum  '), 'viel Leerraum');
  });

  t(G, 'Sendernamen vergleichen', function () {
    eq(D.chanKey('DE: ZDF HD'), D.chanKey('ZDF'));
    eq(D.chanKey('|DE| Das Erste FHD'), D.chanKey('Das Erste'));
    eq(D.chanKey('DE - Sat.1'), D.chanKey('SAT 1'));
    eq(D.chanKey('TR: TRT 1 UHD'), D.chanKey('TRT 1'));
    ok(D.chanKey('Первый канал').length > 0, 'kyrillische Namen ergeben einen Schlüssel');
    ok(D.chanKey('ZDF') !== D.chanKey('ZDFneo'), 'ähnliche Sender bleiben verschieden');
  });

  t(G, 'Datei in kleinen Stücken (mitten in Einträgen zerteilt)', function () {
    var now = Date.now() / 1000;
    var f = function (s) { return new Date(s * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'; };
    var xml = '<tv><channel id="a.de"><display-name>Alpha</display-name></channel><channel id="z.de"><display-name>Zulu</display-name></channel>' +
      '<programme start="' + f(now - 1800) + '" stop="' + f(now + 1800) + '" channel="a.de"><title lang="en">Now</title><title lang="de">Jetzt</title></programme>' +
      '<programme start="' + f(now + 1800) + '" channel="a.de"><title>Ohne Ende</title></programme>' +
      '<programme start="' + f(now + 5400) + '" stop="' + f(now + 9000) + '" channel="a.de"><title>Später</title></programme>' +
      '<programme start="' + f(now + 86400 * 3) + '" stop="' + f(now + 86400 * 3 + 3600) + '" channel="a.de"><title>Zu weit weg</title></programme>' +
      '<programme start="' + f(now) + '" stop="' + f(now + 3600) + '" channel="z.de"><title>Nicht gewollt</title></programme></tv>';
    var ps = X.parser({ ids: {}, names: (function () { var o = {}; o[D.chanKey('Alpha')] = true; return o; })() }, { from: now - 3 * 3600, to: now + 36 * 3600 });
    for (var i = 0; i < xml.length; i += 37) ps.push(xml.slice(i, i + 37));
    var st = ps.done();
    eq(Object.keys(st.progs), ['a.de'], 'nur Sender aus der Playlist');
    eq(st.progs['a.de'].map(function (x) { return x[2]; }), ['Jetzt', 'Ohne Ende', 'Später'], 'Zeitfenster und Sprache');
    eq(st.progs['a.de'][1][1], st.progs['a.de'][2][0], 'fehlende Endzeit = Beginn der nächsten Sendung');
    ok(X.find(st, { name: 'DE: Alpha HD' }), 'Zuordnung über den Namen');
    ok(X.find(st, { name: 'egal', epgId: 'A.DE' }), 'Zuordnung über tvg-id (Groß/klein egal)');
    eq(X.find(st, { name: 'Bravo' }), null);
  });

  /* ---------- Über einen echten Server (wie in der App) ---------- */
  t(G, 'Ungepackte Datei laden: nur benötigte Sender', function () {
    return Test.withTime(NOW, function () {
      var want = { ids: { 'test.eins': true }, names: {} };
      want.names[D.chanKey('Test Zwei')] = true;
      return X.load([BASE + 'epg.xml'], want).then(function (st) {
        eq(Object.keys(st.progs).sort(), ['test.eins', 'test.zwei'], '„Fremder Sender“ wird nicht gespeichert');
        eq(st.channels, 2);
      });
    });
  });

  t(G, 'Gepackte Datei (.gz) aus der Playlist-Kopfzeile, Zuordnung, Zeitzone, Status', function () {
    var p = provider('test-epg-gz', BASE + 'epg.xml.gz');
    return Test.withTime(NOW, function () {
      return epgAll(p).then(function (res) {
        var r = res.r;
        eq(r[0].map(function (x) { return x.title; }), ['Sendung Eins 12 Uhr', 'Sendung Eins 13 Uhr', 'Sendung Eins 14 Uhr'], 'über tvg-id');
        eq(r[1][0].title, 'Zwei 12 & mehr', 'über den Namen, deutsche Fassung');
        eq(r[1][0].start, Date.UTC(2030, 0, 1, 12) / 1000, 'Zeitzone +0100 richtig umgerechnet');
        eq(r[2], [], 'Sender ohne Programm');
        var s = p.epgStatus();
        eq([s.state, s.channels, s.own], ['ok', 2, false]);
        eq(p.epgNow(res.live[0]).title, 'Sendung Eins 12 Uhr', 'läuft gerade (sofort, ohne Laden)');
      });
    }).then(clean('test-epg-gz'));
  });

  // Wartet, bis der Zwischenspeicher geschrieben ist (passiert im Hintergrund) und der Browser
  // alle Downloads in seiner Statistik verbucht hat
  function settled(key) {
    var tries = 0;
    function poll() {
      return D.EpgStore.get(key).then(function (v) {
        if (v || ++tries > 40) return Test.wait(300);
        return Test.wait(50).then(poll);
      });
    }
    return poll();
  }

  t(G, 'Zwischenspeicher: zweiter Start lädt die Datei nicht erneut', function () {
    return Test.withTime(NOW, function () {
      return epgAll(provider('test-epg-cache', BASE + 'epg.xml.gz')).then(function () { return settled('epg.test-epg-cache'); }).then(function () {
        var before = downloads('epg.xml.gz');
        ok(before >= 1, 'erster Start hat geladen');
        return epgAll(provider('test-epg-cache', BASE + 'epg.xml.gz')).then(function (res) {
          eq(res.r[0][0].title, 'Sendung Eins 12 Uhr', 'Programm kommt aus dem Zwischenspeicher');
          return Test.wait(300).then(function () { eq(downloads('epg.xml.gz'), before, 'kein weiterer Download'); });
        });
      });
    }).then(clean('test-epg-cache'));
  });

  t(G, 'Eigene EPG-Adresse mit Zeichensatz ISO-8859-1', function () {
    var p = provider('test-epg-latin', null, BASE + 'epg-latin1.xml');
    return Test.withTime(NOW, function () {
      return epgAll(p).then(function (res) {
        eq(res.r[0][0].title, 'Grün Eins 12 Uhr', 'Umlaut richtig gelesen');
        eq(p.epgStatus().own, true);
      });
    }).then(clean('test-epg-latin'));
  });

  t(G, 'Falsche Adresse: Fehlermeldung, aber kein Dauer-Nachladen', function () {
    var p = provider('test-epg-404', null, BASE + 'gibt-es-nicht.xml');
    return Test.withTime(NOW, function () {
      return epgAll(p).then(function (res) {
        eq(res.r, [[], [], []], 'leere Programme statt Absturz');
        var s = p.epgStatus();
        eq(s.state, 'error');
        ok(s.error && s.error.length > 5, 'verständliche Fehlermeldung: ' + s.error);
        return Test.wait(300).then(function () {
          var before = downloads('gibt-es-nicht.xml');
          return epgAll(p).then(function () { return Test.wait(300); }).then(function () {
            eq(downloads('gibt-es-nicht.xml'), before, 'innerhalb von 10 Minuten kein neuer Versuch');
          });
        });
      });
    });
  });

  t(G, 'Playlist ohne EPG: Status „keine Quelle“, keine Anfrage', function () {
    var p = provider('test-epg-none', null);
    return epgAll(p).then(function (res) {
      eq(res.r, [[], [], []]);
      eq(p.epgStatus().state, 'none');
      eq(p.epgStatus().sources, []);
    });
  });
})();
