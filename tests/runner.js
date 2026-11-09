/* ==========================================================
   Telvo Player – kleine Testumgebung (ohne Zusatzprogramme)
   Läuft im Browser: tests/run.html öffnen. Auf GitHub automatisch
   (siehe .github/workflows/tests.yml) in einem unsichtbaren Chrome.
   Ergebnis: <div id="summary" data-status="pass|fail"> und Klartext in <pre id="report">.
   ========================================================== */
var Test = (function () {
  'use strict';
  var cases = [], notes = [];
  // Automatischer Lauf (GitHub, unsichtbarer Chrome mit „virtueller Zeit“): dort laufen Wartezeiten
  // im Zeitraffer – ein Zeitlimit pro Test würde fälschlich auslösen. Das Gesamtlimit setzt der Workflow.
  var CI = /[?&]ci\b/.test(location.search);

  function test(group, name, fn) { cases.push({ group: group, name: name, fn: fn }); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function eq(actual, expected, msg) {
    if (!same(actual, expected)) throw new Error((msg ? msg + ': ' : '') + JSON.stringify(actual) + ' – erwartet: ' + JSON.stringify(expected));
  }
  function ok(value, msg) { if (!value) throw new Error(msg || 'Bedingung nicht erfüllt'); }
  // Hinweis, der den Testlauf NICHT fehlschlagen lässt (z. B. fehlende Übersetzungen)
  function note(text) { notes.push(text); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function script(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Datei nicht ladbar: ' + src)); };
      document.head.appendChild(s);
    });
  }
  // Uhrzeit für einen Test festlegen (z. B. für Programmführer-Testdateien mit festem Datum)
  function withTime(ms, fn) {
    var real = Date.now;
    Date.now = function () { return ms + (real() - start); };
    var start = real();
    var restore = function () { Date.now = real; };
    return Promise.resolve().then(fn).then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
  }

  function timeout(p, ms) {
    return Promise.race([p, new Promise(function (resolve, reject) { setTimeout(function () { reject(new Error('Zeitüberschreitung nach ' + ms / 1000 + ' s')); }, ms); })]);
  }

  function run() {
    var list = document.getElementById('results'), lines = [], failed = 0, i = 0;
    function line(cls, text) { var li = document.createElement('li'); li.className = cls; li.textContent = text; list.appendChild(li); lines.push(text); }
    function next() {
      if (i >= cases.length) return finish();
      var c = cases[i++], t0 = Date.now();
      var pr = Promise.resolve().then(c.fn);
      return (CI ? pr : timeout(pr, 20000)).then(function () {
        line('pass', '✓ ' + c.group + ' – ' + c.name + ' (' + (Date.now() - t0) + ' ms)');
      }, function (e) {
        failed++;
        line('fail', '✗ ' + c.group + ' – ' + c.name + ': ' + (e && e.message ? e.message : e));
        if (window.console) console.error('[FEHLER]', c.group, c.name, e);
      }).then(next);
    }
    function finish() {
      notes.forEach(function (n) { line('note', 'ℹ ' + n); });
      var pass = failed === 0;
      var sum = document.getElementById('summary');
      sum.setAttribute('data-status', pass ? 'pass' : 'fail');
      sum.textContent = pass ? 'Alle ' + cases.length + ' Tests bestanden.' : failed + ' von ' + cases.length + ' Tests fehlgeschlagen.';
      lines.unshift(sum.textContent, '');
      document.getElementById('report').textContent = lines.join('\n');
      document.title = (pass ? 'BESTANDEN' : 'FEHLGESCHLAGEN') + ' – Telvo Tests';
      if (window.console) console.log(lines.join('\n'));
    }
    return next();
  }

  return { test: test, eq: eq, ok: ok, note: note, wait: wait, script: script, withTime: withTime, run: run };
})();
