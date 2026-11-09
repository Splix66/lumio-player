/* Tests: Übersetzungen (alle Sprachen) */
(function () {
  var t = Test.test, eq = Test.eq, ok = Test.ok;
  var G = 'Sprachen';
  var EXTRA = ['pl', 'ru', 'uk', 'ar', 'ro', 'it', 'el', 'ku', 'hr', 'es', 'fr'];
  var ALL = ['en', 'tr'].concat(EXTRA);
  var loaded = null;
  function loadAll() {
    if (!loaded) loaded = EXTRA.reduce(function (p, l) { return p.then(function () { return Test.script('../www/js/i18n/' + l + '.js'); }); }, Promise.resolve());
    return loaded;
  }
  function ph(s) {
    var seen = {};
    (String(s).match(/\{\d+\}/g) || []).forEach(function (x) { seen[x] = 1; });
    return Object.keys(seen).sort().join(' ');
  }
  // Alle festen Texte aus app.js: T('…')
  var appSource = '';
  function appTexts() {
    return fetch('../www/js/app.js', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (src) {
      appSource = src;
      var re = /\bT\('((?:[^'\\]|\\.)*)'/g, m, set = {};
      while ((m = re.exec(src))) set[m[1].replace(/\\'/g, '\'').replace(/\\\\/g, '\\')] = 1;
      return Object.keys(set);
    });
  }

  t(G, 'Alle 13 Sprachdateien laden ohne Fehler', function () {
    return loadAll().then(function () {
      var missing = ALL.filter(function (l) { return !window.LUMIO_I18N[l] || !Object.keys(window.LUMIO_I18N[l]).length; });
      eq(missing, [], 'fehlende oder leere Sprachen');
    });
  });

  t(G, 'Keine leeren Übersetzungen', function () {
    return loadAll().then(function () {
      var bad = [];
      ALL.forEach(function (l) {
        var d = window.LUMIO_I18N[l];
        Object.keys(d).forEach(function (k) { if (typeof d[k] !== 'string' || !d[k].trim()) bad.push(l + ': „' + k + '“'); });
      });
      eq(bad, []);
    });
  });

  t(G, 'Platzhalter ({0}, {1} …) stimmen in allen Übersetzungen', function () {
    return loadAll().then(function () {
      var bad = [];
      ALL.forEach(function (l) {
        var d = window.LUMIO_I18N[l];
        Object.keys(d).forEach(function (k) {
          if (ph(k) !== ph(d[k])) bad.push(l + ': „' + k + '“ → „' + d[k] + '“');
        });
      });
      if (bad.length) throw new Error(bad.length + ' Übersetzung(en) mit falschen Platzhaltern:\n  ' + bad.join('\n  '));
    });
  });

  t(G, 'Übersetzungsstand (nur Hinweis)', function () {
    return Promise.all([loadAll(), appTexts()]).then(function (r) {
      var texts = r[1];
      ok(texts.length > 300, 'Texte aus app.js gefunden: ' + texts.length);
      ALL.forEach(function (l) {
        var d = window.LUMIO_I18N[l], miss = texts.filter(function (k) { return d[k] == null; });
        if (miss.length) Test.note(l + ': ' + miss.length + ' von ' + texts.length + ' Texten nicht übersetzt (erscheinen auf Deutsch), z. B. „' + miss.slice(0, 2).join('“, „') + '“');
      });
      // Übersetzungen, deren deutscher Text nirgends mehr in app.js steht (Überbleibsel früherer Versionen).
      // Texte, die nur indirekt übersetzt werden (z. B. aus Listen), zählen nicht dazu.
      var unused = Object.keys(window.LUMIO_I18N.en).filter(function (k) {
        return texts.indexOf(k) < 0 && appSource.indexOf('\'' + k.replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\'') < 0;
      });
      if (unused.length) Test.note('en: ' + unused.length + ' Übersetzungen werden in app.js nicht mehr verwendet (Überbleibsel, unschädlich), z. B. „' + unused.slice(0, 3).join('“, „') + '“');
    });
  });
})();
