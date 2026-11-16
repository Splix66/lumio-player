/* ==========================================================
   Top 10 der Streamingdienste für Deutschland holen (läuft täglich auf GitHub, Workflow „Top 10 abrufen“).
   Ergebnis: eine kleine JSON-Datei, die die App lädt (Zweig top10-daten, Datei de.json).

   Quellen – nur echte Ranglisten, nichts wird erfunden oder aufgefüllt:
   - Netflix: offizielle Wochenliste von Netflix (Tudum „Top 10“), Filme und Serien getrennt,
     erscheint dienstags für die Vorwoche (Montag bis Sonntag).
   - Prime Video, Disney+, Apple TV+, WOW, Paramount+, RTL+: keine eigene öffentliche Rangliste
     (Stand 15.11.2026) → keine Reihe. Kommt eine Quelle dazu, hier als weiteren Dienst ergänzen.

   Netflix nennt die Titel englisch. Damit die App sie in deutschen Playlists findet, holt das Skript
   über Wikidata (frei nutzbar, CC0) den deutschen Titel und das Erscheinungsjahr dazu.

   Aufruf: node scripts/top10.js <ausgabe.json>
   ========================================================== */
'use strict';
const fs = require('fs');

const COUNTRY = 'DE';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const NETFLIX_TSV = 'https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv';
const WD_SPARQL = 'https://query.wikidata.org/sparql';
const WD_UA = 'TelvoPlayerTop10/1.0 (https://github.com/Splix66/lumio-player)';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function get(url, headers, tries) {
  let last;
  for (let i = 0; i < (tries || 3); i++) {
    try {
      const r = await fetch(url, { headers: headers || {}, redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' bei ' + url);
      return r;
    } catch (e) { last = e; await sleep(2000 * (i + 1)); }
  }
  throw last;
}

/* Netflix-Datei lesen: neueste Woche für Deutschland, Filme und Serien getrennt.
   Bei Serien zählt jede Staffel einzeln (z. B. „Lupin: Part 4“ und „Lupin: Part 1“) – die App zeigt eine Serie
   nur einmal, mit ihrem besten (echten) Platz. */
function parseNetflix(tsv) {
  const rows = tsv.split(/\r?\n/);
  const head = rows.shift().split('\t');
  const col = (n) => { const i = head.indexOf(n); if (i < 0) throw new Error('Spalte fehlt: ' + n); return i; };
  const ci = col('country_iso2'), wi = col('week'), ki = col('category'), ri = col('weekly_rank'), ti = col('show_title'), si = col('season_title');
  let week = '';
  const de = [];
  for (const line of rows) {
    if (!line) continue;
    const f = line.split('\t');
    if (f[ci] !== COUNTRY) continue;
    de.push(f);
    if (f[wi] > week) week = f[wi];
  }
  if (!week) throw new Error('Keine Netflix-Daten für ' + COUNTRY + ' gefunden');
  const pick = (cat) => {
    const seen = {}, out = [];
    de.filter((f) => f[wi] === week && f[ki] === cat)
      .sort((a, b) => Number(a[ri]) - Number(b[ri]))
      .forEach((f) => {
        const t = f[ti].trim();
        if (!t || seen[t.toLowerCase()]) return;
        seen[t.toLowerCase()] = 1;
        const season = f[si] && f[si] !== 'N/A' ? f[si].trim() : '';
        out.push({ rank: Number(f[ri]), title: t, season: season });
      });
    return out;
  };
  const movies = pick('Films'), series = pick('TV');
  if (!movies.length && !series.length) throw new Error('Netflix-Liste für ' + COUNTRY + ' ist leer');
  return { week: week, movies: movies, series: series };
}

/* Deutscher Titel, weitere deutsche Namen und Jahr über Wikidata. Nur Einträge mit Netflix-Kennung (P1874),
   deren englischer Name genau passt und deren Art stimmt (Film bzw. Serie). Kein eindeutiger Treffer → nur der
   englische Titel (lieber kein deutscher Titel als ein falscher – sonst fände die App einen anderen Film). */
function sparql(title, anyItem) {
  const t = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return 'SELECT ?item (SAMPLE(?deL) AS ?de) (GROUP_CONCAT(DISTINCT ?deA; separator="|") AS ?aka) (MIN(YEAR(?date)) AS ?year)' +
    ' (SAMPLE(?f) AS ?film) (SAMPLE(?s) AS ?series) WHERE {' +
    ' ?item rdfs:label|skos:altLabel "' + t + '"@en' + (anyItem ? '' : ' ; wdt:P1874 ?nf') + ' .' +
    ' BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q11424 } AS ?f)' +
    ' BIND(EXISTS { VALUES ?r { wd:Q5398426 wd:Q526877 wd:Q1259759 } ?item wdt:P31/wdt:P279* ?r } AS ?s)' +
    ' OPTIONAL { ?item rdfs:label ?deL FILTER(LANG(?deL) = "de") }' +
    ' OPTIONAL { ?item skos:altLabel ?deA FILTER(LANG(?deA) = "de") }' +
    ' OPTIONAL { ?item wdt:P577 ?date }' +
    ' } GROUP BY ?item';
}
/* Einträge zu einem englischen Titel holen. anyItem: auch ohne Netflix-Kennung (für den zweiten Schritt). */
async function wdRows(title, kind, anyItem) {
  const s = await (await get(WD_SPARQL + '?format=json&query=' + encodeURIComponent(sparql(title, anyItem)), { 'User-Agent': WD_UA, 'Accept': 'application/sparql-results+json' })).json();
  return ((s.results && s.results.bindings) || []).filter((b) => (kind === 'movie' ? b.film : b.series) && (kind === 'movie' ? b.film : b.series).value === 'true');
}
function wdOut(b) {
  return {
    wd: b.item.value.split('/').pop(),
    de: b.de ? b.de.value : '',
    aka: b.aka && b.aka.value ? b.aka.value.split('|').filter(Boolean).slice(0, 4) : [],
    year: b.year ? Number(b.year.value) || 0 : 0
  };
}
/* Neuheit: erschienen höchstens 2 Jahre vor der Netflix-Woche (z. B. Woche 2026 → 2024, 2025, 2026) */
function recent(b, weekYear) { const y = b.year ? Number(b.year.value) || 0 : 0; return y >= weekYear - 2 && y <= weekYear + 1; }
/* Zwei Schritte:
   1. Einträge MIT Netflix-Kennung: genau einer passt → nehmen.
   2. Sonst (lizenzierte Filme haben oft keine Netflix-Kennung, z. B. „Sinners“ = „Blood & Sinners“, 2025):
      Einträge ohne Kennung, aber nur Neuheiten. Genau eine Neuheit mit diesem Namen → nehmen; ältere
      gleichnamige Filme zählen dabei nicht (die App prüft das Jahr ohnehin gegen die Playlist, ±1 Jahr).
   Mehrere oder keine → nur der englische Titel (lieber kein deutscher Titel als ein falscher). */
async function wikidata(title, kind, weekYear) {
  try {
    const rows = await wdRows(title, kind, false);
    // Genau ein passender Eintrag – sonst lieber keinen (z. B. zwei Filme „Collision Course“ von 1989 und 2025)
    if (rows.length === 1) return wdOut(rows[0]);
    if (rows.length > 1 || !weekYear) return null;
    await sleep(400);
    const fresh = (await wdRows(title, kind, true)).filter((b) => recent(b, weekYear));
    return fresh.length === 1 ? wdOut(fresh[0]) : null;
  } catch (err) {
    console.warn('Wikidata nicht erreichbar für „' + title + '“: ' + err.message);
    return null;
  }
}

async function enrich(list, kind, weekYear) {
  for (const x of list) {
    const w = await wikidata(x.title, kind, weekYear);
    if (w) {
      x.wd = w.wd;
      if (w.de && w.de !== x.title) x.de = w.de;
      const aka = w.aka.filter((a) => a !== x.title && a !== w.de);
      if (aka.length) x.aka = aka;
      if (w.year) x.year = w.year;
    }
    await sleep(400);
  }
  return list;
}

async function main() {
  const out = process.argv[2] || 'de.json';
  const tsv = await (await get(NETFLIX_TSV, { 'User-Agent': UA, 'Accept': 'text/tab-separated-values,text/plain,*/*' })).text();
  const nf = parseNetflix(tsv);
  const weekYear = Number(String(nf.week).slice(0, 4)) || 0;
  await enrich(nf.movies, 'movie', weekYear);
  await enrich(nf.series, 'series', weekYear);
  const data = {
    v: 1,
    country: COUNTRY,
    generated: new Date().toISOString(),
    services: [{
      id: 'netflix',
      name: 'Netflix',
      period: 'week',
      week: nf.week,                 // letzter Tag (Sonntag) der Woche Montag–Sonntag
      source: 'Netflix Top 10 (offiziell)',
      separate: true,                // Filme und Serien kommen aus getrennten Listen
      movies: nf.movies,
      series: nf.series
    }]
  };
  fs.writeFileSync(out, JSON.stringify(data, null, 1) + '\n');
  console.log('Netflix ' + COUNTRY + ', Woche bis ' + nf.week + ': ' + nf.movies.length + ' Filme, ' + nf.series.length + ' Serien');
  nf.movies.concat(nf.series).forEach((x) => console.log('  ' + x.rank + '. ' + x.title + (x.de ? ' → ' + x.de : '') + (x.year ? ' (' + x.year + ')' : '')));
}

if (require.main === module) main().catch((e) => { console.error('Fehler: ' + e.message); process.exit(1); });
module.exports = { parseNetflix: parseNetflix, recent: recent };
