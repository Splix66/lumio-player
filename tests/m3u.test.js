/* Tests: M3U-Playlists lesen, Xtream-Links erkennen, Server-Adressen */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'M3U & Zugang';

  t(G, 'Name nach dem ersten Komma außerhalb von Anführungszeichen', function () {
    var l = D.parseM3U('#EXTM3U\n#EXTINF:-1 tvg-name="A, B" group-title="Sport, Live",Kanal, mit Komma\nhttp://s/1.ts');
    eq(l.length, 1);
    eq(l[0].name, 'Kanal, mit Komma');
    eq(l[0].group, 'Sport, Live');
  });

  t(G, 'Fehlender Name → tvg-name, fehlende Gruppe → Platzhalter', function () {
    var l = D.parseM3U('#EXTM3U\n#EXTINF:-1 tvg-name="Ersatzname",\nhttp://s/1.ts');
    eq(l[0].name, 'Ersatzname');
    ok(l[0].group.length > 0, 'Gruppe darf nicht leer sein');
  });

  t(G, '#EXTGRP, Windows-Zeilenenden, Kommentarzeilen', function () {
    var l = D.parseM3U('#EXTM3U\r\n#EXTINF:-1,Eins\r\n#EXTGRP:Nachrichten\r\n#EXTVLCOPT:http-user-agent=x\r\nhttp://s/1.ts\r\n\r\nhttp://ohne-extinf/2.ts\r\n');
    eq(l.length, 1, 'Adresse ohne #EXTINF wird ignoriert');
    eq([l[0].name, l[0].group, l[0].url], ['Eins', 'Nachrichten', 'http://s/1.ts']);
  });

  t(G, 'Kopfzeile: EPG-Adressen (url-tvg, x-tvg-url, mehrere, keine Doppelten)', function () {
    var l = D.parseM3U('#EXTM3U url-tvg="http://a/e.xml, http://b/e.xml.gz" x-tvg-url="http://a/e.xml"\n#EXTINF:-1 tvg-id="x.de",X\nhttp://s/1.ts');
    eq(l.epgUrls, ['http://a/e.xml', 'http://b/e.xml.gz']);
    eq(l[0].tvgId, 'x.de');
  });

  t(G, 'Kopfzeile ohne EPG / Adresse ohne http wird ignoriert', function () {
    eq(D.parseM3U('#EXTM3U\n').epgUrls, []);
    eq(D.parseM3U('#EXTM3U url-tvg="ftp://x/e.xml"\n').epgUrls, []);
  });

  t(G, 'Xtream-Link erkennen (get.php, player_api.php, Unterordner, kodiertes Passwort)', function () {
    eq(D.parseXtreamLink('http://host:8080/get.php?username=anna&password=geheim&type=m3u_plus'), { server: 'http://host:8080', username: 'anna', password: 'geheim' });
    eq(D.parseXtreamLink('https://h.de/player_api.php?username=a&password=p%26w%3D1'), { server: 'https://h.de', username: 'a', password: 'p&w=1' });
    eq(D.parseXtreamLink('http://h.de/pfad/get.php?password=p&username=u'), { server: 'http://h.de', username: 'u', password: 'p' });
  });

  t(G, 'Kein Xtream-Link: normale M3U-Adresse oder fehlendes Passwort', function () {
    eq(D.parseXtreamLink('http://h.de/playlist.m3u'), null);
    eq(D.parseXtreamLink('http://h.de/get.php?username=u'), null);
    eq(D.parseXtreamLink(''), null);
  });

  t(G, 'Server-Adresse aufräumen', function () {
    eq(D.normalizeServer('beispiel.de:8080'), 'http://beispiel.de:8080');
    eq(D.normalizeServer(' https://b.de:443/ '), 'https://b.de:443');
    eq(D.normalizeServer('http://b.de/player_api.php?username=x'), 'http://b.de');
    eq(D.normalizeServer(''), '');
  });

  t(G, 'M3U-Provider: Live, Filme und Serien richtig eingeteilt', function () {
    var m3u = '#EXTM3U\n' +
      '#EXTINF:-1 group-title="Nachrichten",News 24\nhttp://s/live/1.ts\n' +
      '#EXTINF:-1 group-title="Kino",Ein Film (2024)\nhttp://s/movie/u/p/7.mp4\n' +
      '#EXTINF:-1 group-title="Serien",Meine Serie S01E02\nhttp://s/series/u/p/9.mkv\n' +
      '#EXTINF:-1 group-title="Serien",Meine Serie S01 E01\nhttp://s/series/u/p/8.mkv\n' +
      '#EXTINF:-1 group-title="Serien",Meine Serie S02E01\nhttp://s/series/u/p/10.mkv\n';
    var p = D.makeProvider({ type: 'm3u', url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(m3u) });
    return Promise.all([p.items('live'), p.items('movie'), p.items('series'), p.categories('live')]).then(function (r) {
      eq(r[0].map(function (x) { return x.name; }), ['News 24']);
      eq(r[1].map(function (x) { return x.name; }), ['Ein Film (2024)']);
      eq(r[2].map(function (x) { return x.name; }), ['Meine Serie'], 'Folgen werden zu einer Serie zusammengefasst');
      eq(r[3].map(function (x) { return x.name; }), ['Nachrichten']);
      return p.seriesInfo(r[2][0]).then(function (info) {
        eq(info.seasons.map(function (s) { return [s.num, s.episodes.map(function (e) { return e.num; })]; }), [[1, [1, 2]], [2, [1]]], 'Staffeln und Folgen sortiert');
      });
    });
  });

  t(G, 'M3U-Provider: kaputte Playlist ergibt verständliche Fehlermeldung', function () {
    var p = D.makeProvider({ type: 'm3u', url: 'data:text/plain,' + encodeURIComponent('<html>Fehlerseite</html>') });
    return p.login().then(function () { throw new Error('hätte fehlschlagen müssen'); }, function (e) {
      ok(/M3U/.test(e.message), 'Meldung erwähnt M3U: ' + e.message);
    });
  });
})();
