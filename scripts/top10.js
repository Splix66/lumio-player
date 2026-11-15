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
const WD = 'https://www.wikidata.org/w/api.php';
const WD_UA = 'TelvoPlayerTop10/1.0 (https://github.com/Splix66/lumio-player)';

// Wikidata-Arten: Film bzw. Serie (P31 „ist ein(e)“)
const FILM = ['Q11424', 'Q24869', 'Q506240', 'Q202866', 'Q93204', 'Q24862', 'Q17123180', 'Q130232', 'Q157443', 'Q188473', 'Q1054574', 'Q200092', 'Q959790', 'Q2484376', 'Q1361932', 'Q20650540', 'Q622548', 'Q29168811'];
const SERIES = ['Q5398426', 'Q63952888', 'Q581714', 'Q1259759', 'Q117467246', 'Q526877', 'Q15416', 'Q3464665', 'Q21191270', 'Q1366112', 'Q24856', 'Q7725310', 'Q29982117', 'Q1407245', 'Q113687694', 'Q2635894'];

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

/* Deutscher Titel, weitere Namen und Jahr über Wikidata. Treffer nur, wenn die Art passt (Film bzw. Serie);
   Einträge mit Netflix-Kennung (P1874) gehen vor. Kein sicherer Treffer → nur der englische Titel. */
async function wikidata(title, kind) {
  try {
    const q = WD + '?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=7&search=' + encodeURIComponent(title);
    const s = await (await get(q, { 'User-Agent': WD_UA })).json();
    const ids = (s.search || []).map((x) => x.id);
    if (!ids.length) return null;
    const e = await (await get(WD + '?action=wbgetentities&format=json&props=labels|aliases|claims&languages=de|en&ids=' + ids.join('|'), { 'User-Agent': WD_UA })).json();
    const want = kind === 'movie' ? FILM : SERIES;
    let best = null, bestScore = -1;
    ids.forEach((id, pos) => {
      const it = e.entities && e.entities[id];
      if (!it || !it.claims) return;
      const types = (it.claims.P31 || []).map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value.id);
      if (!types.some((t) => want.indexOf(t) >= 0)) return;
      const en = it.labels && it.labels.en && it.labels.en.value;
      const enAliases = ((it.aliases && it.aliases.en) || []).map((a) => a.value);
      const nameFits = [en].concat(enAliases).some((n) => n && n.toLowerCase() === title.toLowerCase());
      if (!nameFits) return;
      const score = (it.claims.P1874 ? 10 : 0) + (7 - pos);
      if (score > bestScore) { bestScore = score; best = it; }
    });
    if (!best) return null;
    const de = best.labels && best.labels.de && best.labels.de.value;
    const deAliases = ((best.aliases && best.aliases.de) || []).map((a) => a.value).slice(0, 4);
    const years = (best.claims.P577 || []).map((c) => { const v = c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; return v && v.time ? Number(v.time.slice(1, 5)) : 0; }).filter(Boolean);
    return { wd: best.id, de: de || '', aka: deAliases, year: years.length ? Math.min.apply(null, years) : 0 };
  } catch (err) {
    console.warn('Wikidata nicht erreichbar für „' + title + '“: ' + err.message);
    return null;
  }
}

async function enrich(list, kind) {
  for (const x of list) {
    const w = await wikidata(x.title, kind);
    if (w) {
      x.wd = w.wd;
      if (w.de && w.de !== x.title) x.de = w.de;
      const aka = w.aka.filter((a) => a !== x.title && a !== w.de);
      if (aka.length) x.aka = aka;
      if (w.year) x.year = w.year;
    }
    await sleep(250);
  }
  return list;
}

async function main() {
  const out = process.argv[2] || 'de.json';
  const tsv = await (await get(NETFLIX_TSV, { 'User-Agent': UA, 'Accept': 'text/tab-separated-values,text/plain,*/*' })).text();
  const nf = parseNetflix(tsv);
  await enrich(nf.movies, 'movie');
  await enrich(nf.series, 'series');
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
module.exports = { parseNetflix: parseNetflix };
