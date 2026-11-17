/* Tests: Neues Aussehen (1.15.10) – Icons, Leiste oben, Hintergrund, Aktualisieren ohne eigene Seite */
(function () {
  var D = window.LumioDebug, t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'Aussehen';

  t(G, 'Icons kommen aus dem Icon-Set (Zeichenfläche 256) und kein benutzter Name ist leer', function () {
    eq(D.icon('search').getAttribute('viewBox'), '0 0 256 256');
    var names = ['home', 'live', 'movie', 'series', 'heart', 'heartFill', 'bookmark', 'bookmarkFill', 'search', 'refresh', 'settings', 'play', 'pause', 'back', 'next',
      'check', 'close', 'lock', 'globe', 'down', 'plus', 'playlist', 'info', 'archive', 'users', 'pencil', 'eye', 'eyeOff', 'bell', 'trash', 'tracks', 'timer', 'swap', 'sun',
      'star', 'starFill', 'sort', 'skipNext', 'radio', 'profile', 'pip', 'help', 'guide', 'fullscreen', 'copy', 'ball', 'arrowR', 'wifi', 'wifiLow', 'wifiOff', 'player', 'warn',
      'avSmile', 'avCat', 'avDog', 'avGhost', 'avRocket', 'avCrown', 'avGame', 'avMusic', 'moon', 'restart', 'device', 'vol', 'volOff', 'history', 'clock', 'checkCircle'];
    names.forEach(function (n) { ok(D.icon(n).innerHTML.length > 20, 'Icon „' + n + '“ ist leer'); });
    ok(!/stroke-linecap/.test(D.icon('home').outerHTML), 'keine alten Strich-Symbole mehr');
  });
})();
