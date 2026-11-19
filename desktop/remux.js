// Telvo PC-App: Filme umpacken, die der eingebaute Player (Chromium) nicht selbst abspielen kann.
// Viele Anbieter liefern MKV-Dateien (auch mit der Endung .mp4), AVI oder Dolby-Ton (AC3/EAC3/DTS).
// Dieser kleine Dienst läuft nur auf diesem PC (127.0.0.1, geheimer Schlüssel je Start) und gibt den Film
// als fragmentiertes MP4 weiter: Bild unverändert (bei Bedarf H.264), Ton als AAC. (Erays Auftrag 18.11.2026)
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');

function ffmpegPath() {
  try {
    const p = require('ffmpeg-static');
    // im fertigen Programm liegt ffmpeg außerhalb des app.asar-Archivs (asarUnpack)
    return p ? p.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep) : null;
  } catch (e) { return null; }
}

function okUrl(u) {
  try { return /^https?:$/.test(new URL(u).protocol); } catch (e) { return false; }
}

// Nur EIN Umpack-Vorgang zugleich: Viele Zugänge erlauben nur eine Verbindung. Beim Spulen war die alte noch offen,
// der Anbieter lieferte dann statt des Films einen kurzen Ersatz-Clip (Test 18.11.2026). Darum die alte zuerst beenden.
const MAX_JOBS = 1;

function start(userAgent) {
  const bin = ffmpegPath();
  if (!bin) return Promise.resolve(null);
  const token = crypto.randomBytes(16).toString('hex');
  const probes = new Map();
  const jobs = new Set();

  // Länge und Formate eines Films ermitteln (ffmpeg liest nur den Anfang)
  function probe(u) {
    if (probes.has(u)) return probes.get(u);
    const p = new Promise((resolve) => {
      let out = '', done = false;
      const ff = spawn(bin, ['-hide_banner', '-nostdin', '-user_agent', userAgent, '-i', u], { windowsHide: true });
      const finish = () => {
        if (done) return; done = true;
        try { ff.kill('SIGKILL'); } catch (e) {}
        const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
        const v = /Stream #\d+:\d+[^:]*: Video: (\w+)/.exec(out);
        const a = /Stream #\d+:\d+[^:]*: Audio: (\w+)/.exec(out);
        resolve({ duration: d ? (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]) : 0, video: v ? v[1] : '', audio: a ? a[1] : '' });
      };
      // ffmpeg ohne Ausgabe-Datei schreibt die Angaben und beendet sich dann selbst
      ff.stderr.on('data', (b) => { if (out.length < 200000) out += b; });
      ff.on('close', finish);
      ff.on('error', finish);
      setTimeout(finish, 20000);
    });
    probes.set(u, p);
    p.then((r) => { if (!r.duration) probes.delete(u); });
    return p;
  }

  const server = http.createServer((req, res) => {
    let q;
    try { q = new URL(req.url, 'http://127.0.0.1'); } catch (e) { res.writeHead(400); res.end(); return; }
    if (q.searchParams.get('k') !== token) { res.writeHead(403); res.end(); return; }
    const u = q.searchParams.get('u') || '';
    if (!okUrl(u)) { res.writeHead(400); res.end(); return; }
    const head = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

    if (q.pathname === '/probe') {
      probe(u).then((info) => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, head)); res.end(JSON.stringify(info)); });
      return;
    }

    if (q.pathname === '/play') {
      const t = Math.max(0, parseFloat(q.searchParams.get('t')) || 0);
      const toH264 = q.searchParams.get('v') === 'h264';
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-user_agent', userAgent,
        '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_on_http_error', '4xx,5xx', '-reconnect_delay_max', '5'];
      if (t > 0) args.push('-ss', String(t));
      args.push('-i', u, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn');
      // Bild: unverändert (schnell, volle Qualität) – nur wenn der Player es so nicht kann, als H.264 neu berechnen
      if (toH264) args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p');
      else {
        args.push('-c:v', 'copy');
        if (q.searchParams.get('c') === 'hevc') args.push('-tag:v', 'hvc1');   // H.265 im MP4 so kennzeichnen, wie Chromium es erwartet
      }
      // Ton: immer AAC Stereo (Chromium spielt AC3/EAC3/DTS nicht ab)
      args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-avoid_negative_ts', 'make_zero',
        '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
      // Beim Spulen kommt eine neue Anfrage – ältere Vorgänge beenden und kurz warten, bis ihre Verbindung zu ist
      const old = jobs.size >= MAX_JOBS ? Array.from(jobs) : [];
      old.forEach((j) => { jobs.delete(j); try { j.kill('SIGKILL'); } catch (e) {} });
      const waitOld = Promise.all(old.map((j) => new Promise((r) => {
        if (j.exitCode !== null || j.signalCode) return r();
        j.once('close', r); setTimeout(r, 1500);
      }))).then(() => new Promise((r) => setTimeout(r, old.length ? 800 : 0)));
      let ff = null, gone = false;
      const stop = () => { gone = true; if (ff) { jobs.delete(ff); try { ff.kill('SIGKILL'); } catch (e) {} } };
      req.on('close', stop);
      res.on('close', stop);
      waitOld.then(() => {
        if (gone) return;
        ff = spawn(bin, args, { windowsHide: true });
        jobs.add(ff);
        res.writeHead(200, Object.assign({ 'Content-Type': 'video/mp4' }, head));
        ff.stdout.pipe(res);
        ff.stderr.resume();
        ff.on('close', () => { jobs.delete(ff); try { res.end(); } catch (e) {} });
        ff.on('error', () => { jobs.delete(ff); try { res.destroy(); } catch (e) {} });
      });
      return;
    }

    res.writeHead(404); res.end();
  });

  return new Promise((resolve) => {
    server.on('error', () => resolve(null));
    server.listen(0, '127.0.0.1', () => {
      resolve({ base: 'http://127.0.0.1:' + server.address().port, token: token, stop: () => { jobs.forEach((j) => { try { j.kill('SIGKILL'); } catch (e) {} }); server.close(); } });
    });
  });
}

module.exports = { start };
