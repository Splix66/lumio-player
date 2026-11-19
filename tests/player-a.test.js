/* Tests: Player im Stil A (1.15.12) – Erays Entwürfe „Player A4“ und „Stil A für alle Player“ vom 17.11.2026 */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'Player Stil A';
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withPlayer(kind, tv, fn, prep) {
    var P = D.Player, keepTv = D.Platform.tv, keepProf = D.App.profile, keepProv = D.App.provider;
    D.Platform.tv = tv;
    D.App.profile = { id: 'tst-player-a', type: 'demo', name: 'Demo' };
    D.App.provider = D.makeProvider(D.App.profile);
    if (prep) prep();
    function done() { try { if (P.el) P.close(); } catch (e) {} D.Platform.tv = keepTv; D.App.profile = keepProf; D.App.provider = keepProv; }
    return D.App.provider.items(kind === 'episode' ? 'series' : kind, '__all').then(function (l) {
      if (kind !== 'episode') { P.open(l[0], { list: l, index: 0 }); return; }
      return D.App.provider.seriesInfo(l[0]).then(function (info) {
        var eps = (info.seasons ? info.seasons[0].episodes : info.episodes) || [];
        P.open(eps[0], { list: eps, index: 0 });
      });
    }).then(function () { return wait(300); }).then(function () { return fn(P); }).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }
  function keys(box) { return Array.prototype.map.call(box.querySelectorAll('.cbtn'), function (b) { return b.getAttribute('data-c'); }); }

  t(G, 'Live am Fernseher: unten Pause, Senderliste, Zuletzt gesehen, Herz, Rad – kein „Letzter Sender“, kein „Verpasst“ unten, LIVE oben links', function () {
    return withPlayer('live', true, function (P) {
      eq(keys(P.ctrlLeft), ['play', 'list', 'recent', 'fav', 'menu']);
      ok(!P.osd.querySelector('[data-c="last"]'), 'kein Knopf „Letzter Sender“');
      ok(P.osd.querySelector('.osd-top .live-tag'), 'LIVE steht oben');
      ok(!P.osd.querySelector('.osd-top .p-back'), 'am Fernseher kein Zurück-Knopf im Bild (Zurück-Taste)');
      ok(P.ctrlLeft.querySelector('[data-c="play"] span'), 'Pause ist ein Knopf mit Schrift');
      ok(!P.ctrlLeft.querySelector('[data-c="menu"] span'), 'Rad nur als Symbol');
    }, function () { D.Recent.push({ kind: 'live', id: 'demo-x', name: 'Vorher' }); });
  });

  t(G, 'Handy/Tablet/PC: in der Mitte Sender zurück · Pause · Sender vor; bei Filmen 10 Sek. zurück · Pause · 10 Sek. vor', function () {
    return withPlayer('live', false, function (P) {
      eq(keys(P.ctrls), ['prev', 'cplay', 'next']);
      ok(!P.ctrlLeft.querySelector('[data-c="play"]'), 'unten kein zweiter Pause-Knopf');
    }).then(function () {
      return withPlayer('movie', false, function (P) {
        eq(keys(P.ctrls), ['rew', 'cplay', 'fwd']);
        eq(P.ctrls.querySelector('[data-c="rew"]').getAttribute('aria-label'), '10 Sekunden zurück');
      });
    });
  });

  // Erays Wunsch 18.11.2026: „Sender ausblenden“ nur noch in den Einstellungen der App – nicht im Rad
  t(G, 'Rad: Bild & Wiedergabe, Bild-in-Bild, Schlaf-Timer, Ton an/aus – kein „Sender ausblenden“, Favoriten sind NICHT im Rad', function () {
    return withPlayer('live', true, function (P) {
      P.openMenu();
      var txt = Array.prototype.map.call(P.el.querySelectorAll('.pa-list.is-menu .tp-item span'), function (s) { return s.textContent; });
      ok(txt.indexOf('Bild & Wiedergabe') >= 0 && txt.indexOf('Bild-in-Bild') >= 0 && txt.indexOf('Ton an/aus') >= 0, txt.join(', '));
      ok(txt.indexOf('Sender ausblenden') < 0, 'kein „Sender ausblenden“ im Rad');
      ok(txt.join(' ').indexOf('Schlaf-Timer') >= 0, 'Schlaf-Timer');
      ok(txt.indexOf('Merken') < 0 && txt.indexOf('Letzter Sender') < 0, 'kein Merken, kein Letzter Sender');
      P.openMenu();
      ok(!P.el.querySelector('.pa-list.is-menu'), 'zweimal Rad = zu');
    });
  });

  t(G, '„Zuletzt gesehen“: höchstens 5 Sender, der laufende ist markiert', function () {
    return withPlayer('live', true, function (P) {
      P.openRecent();
      var rows = P.el.querySelectorAll('.pa-list.is-recent .tp-item');
      ok(rows.length <= 5 && rows.length >= 2, rows.length + ' Zeilen');
      eq(P.el.querySelectorAll('.pa-list.is-recent .tp-item.is-on').length, 1, 'genau einer läuft gerade');
    }, function () { for (var i = 0; i < 8; i++) D.Recent.push({ kind: 'live', id: 'demo-r' + i, name: 'Sender ' + i }); });
  });

  t(G, '„Als Nächstes“ unten rechts ist nur Text (kein Knopf); Serie: „Nächste Folge“ ist ein Knopf; Film: kein „Ende um“', function () {
    return withPlayer('live', true, function (P) {
      return wait(300).then(function () {
        var n = P.paRight.querySelector('.pa-next');
        ok(n, 'Als Nächstes steht da (Demo hat Programmdaten)');
        ok(!P.paRight.querySelector('button'), 'kein Knopf');
      });
    }).then(function () {
      return withPlayer('episode', true, function (P) {
        ok(P.paRight.querySelector('button[data-c="nextep"]'), 'Knopf Nächste Folge');
      });
    }).then(function () {
      return withPlayer('movie', true, function (P) {
        ok(P.times.textContent.indexOf('Ende') < 0, 'kein „Ende um“: ' + P.times.textContent);
        eq(P.chName.textContent, 'FILM');
      });
    });
  });

  // Gerätetest 17.11.2026: Im TV-Player umgeschaltete Sender fehlten in „Zuletzt gesehen“ (nur erster und letzter kamen an)
  t(G, 'TV-Player (Android): umgeschaltete Sender kommen in „Zuletzt gesehen“, der letzte steht vorn', function () {
    var realPlugin = D.NativePlayer.plugin, realProv = D.App.provider;
    D.NativePlayer.plugin = function () { return { play: function () { return Promise.resolve({ index: 7, visited: [2, 5, 7] }); } }; };
    D.App.provider = { streamUrl: function (it) { return { url: 'http://srv.example/live/' + it.id + '.ts' }; } };
    D.Store.del('recent.none');
    var list = [];
    for (var i = 0; i < 10; i++) list.push({ kind: 'live', id: 'v' + i, name: 'Sender ' + i, num: i + 1 });
    return D.NativePlayer.play(list[2], { list: list, index: 2 }).then(function () {
      eq(D.Recent.list().slice(0, 3).map(function (x) { return x.id; }), ['v7', 'v5', 'v2']);
    }).then(cleanup, function (e) { cleanup(); throw e; });
    function cleanup() { D.NativePlayer.plugin = realPlugin; D.App.provider = realProv; D.Store.del('recent.none'); D.Store.del('last.none'); }
  });

  // Erays Wunsch 17.11.2026: Herz überall gleich – nie als Wort, leer = nicht gemerkt, rot gefüllt = gemerkt
  t(G, 'TV-Player (Android): Herz bekommt die gemerkten Sender mit, Merken/Entfernen kommt in der App an', function () {
    var realPlugin = D.NativePlayer.plugin, realProv = D.App.provider, sent = null;
    D.NativePlayer.plugin = function () { return { play: function (o) { sent = o; return Promise.resolve({ index: 1, favAdd: [1], favDel: [0] }); } }; };
    D.App.provider = { streamUrl: function (it) { return { url: 'http://srv.example/live/' + it.id + '.ts' }; } };
    D.Store.del('fav.none');
    var list = [];
    for (var i = 0; i < 4; i++) list.push({ kind: 'live', id: 'h' + i, name: 'Sender ' + i, num: i + 1 });
    D.Favs.toggle(list[0], true);
    return D.NativePlayer.play(list[0], { list: list, index: 0 }).then(function () {
      eq(sent.menuTexts.favIdx, [0], 'gemerkte Sender gehen an den TV-Player');
      ok(sent.menuTexts.favOk, 'Herz bei Live');
      ok(D.Favs.has(list[1]), 'im TV-Player gemerkt');
      ok(!D.Favs.has(list[0]), 'im TV-Player entfernt');
    }).then(cleanup, function (e) { cleanup(); throw e; });
    function cleanup() { D.NativePlayer.plugin = realPlugin; D.App.provider = realProv; D.Store.del('fav.none'); D.Store.del('recent.none'); D.Store.del('last.none'); }
  });

  t(G, 'Merken ist überall nur ein Herz ohne Wort – im Player und im eingebauten Player', function () {
    return withPlayer('live', true, function (P) {
      var b = P.ctrlLeft.querySelector('[data-c="fav"]');
      ok(b, 'Herz-Knopf da');
      eq(b.textContent.trim(), '', 'kein Wort auf dem Knopf');
      ok(b.querySelector('svg'), 'Herz-Symbol');
    });
  });

  // Erays Auftrag 18.11.2026: Filme in der PC-App auch als MKV (mit Endung .mp4), AVI oder mit Dolby-Ton
  t(G, 'PC-App: Umpack-Dienst – Adresse, Zeit ab Startpunkt, Spulen über die gemerkte Länge', function () {
    var keep = window.telvoDesktop;
    window.telvoDesktop = { remux: 'http://127.0.0.1:4711|geheim' };
    function done() { if (keep === undefined) delete window.telvoDesktop; else window.telvoDesktop = keep; }
    try {
      ok(D.Remux.ok(), 'Dienst erkannt');
      var u = D.Remux.url('http://srv/movie/a/b/1.mp4', 90.7, false);
      ok(u.indexOf('http://127.0.0.1:4711/play?k=geheim&t=90&u=') === 0, u);
      ok(u.indexOf(encodeURIComponent('http://srv/movie/a/b/1.mp4')) > 0, 'Film-Adresse verschlüsselt mitgegeben');
      ok(D.Remux.url('http://x/1.mkv', 0, true).indexOf('&v=h264') > 0, 'H.264-Neuberechnung als Rückfall');
      ok(D.Remux.canCopy('h264') && D.Remux.canCopy('av1'), 'H.264/AV1 unverändert');
      ok(!D.Remux.canCopy('mpeg4') && !D.Remux.canCopy('vc1'), 'DivX/VC-1 neu berechnen');
      ok(D.Remux.nativeOk({ video: 'h264', audio: 'aac' }), 'H.264 + AAC direkt');
      ok(!D.Remux.nativeOk({ video: 'h264', audio: 'ac3' }), 'Dolby-Ton (AC3) umpacken – direkt bliebe es stumm');
      ok(!D.Remux.nativeOk({ video: 'h264', audio: 'eac3' }) && !D.Remux.nativeOk({ video: 'mpeg4', audio: 'mp3' }), 'EAC3 bzw. DivX umpacken');
      ok(D.Remux.nativeOk(null), 'ohne Angaben direkt versuchen');
    } catch (e) { done(); throw e; }
    return withPlayer('movie', false, function (P) {
      P.remux = { off: 600, dur: 7200 };
      eq(P.dur(), 7200, 'Länge aus dem Dienst');
      ok(P.ct() >= 600, 'Zeit zählt ab dem Startpunkt: ' + P.ct());
      ok(P.canSeek(), 'spulen möglich');
      P.remux = null;
    }).then(done, function (e) { done(); throw e; });
  });

  t(G, 'Open-Source-Lizenzen: FFmpeg (PC-App) steht mit GPL-3.0-Text und Quellcode-Hinweis in der Liste', function () {
    return fetch('../www/js/licenses.js').then(function (r) { return r.text(); }).then(function (s) {
      ok(s.indexOf('"id": "ffmpeg"') > 0, 'FFmpeg-Eintrag');
      ok(s.indexOf('"GPL-3.0": "') > 0 && s.indexOf('GNU GENERAL PUBLIC LICENSE') > 0, 'vollständiger GPL-3.0-Text');
      ok(s.indexOf('github.com/FFmpeg/FFmpeg') > 0, 'Quellcode-Hinweis');
    });
  });

  t(G, 'Ohne PC-App kein Umpacken (Handy, Fernseher, Webseite bleiben wie bisher)', function () {
    var keep = window.telvoDesktop;
    delete window.telvoDesktop;
    try { ok(!D.Remux.ok(), 'kein Dienst'); } finally { if (keep !== undefined) window.telvoDesktop = keep; }
  });
})();
