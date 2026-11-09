# Lumio Player

IPTV-Player für Handy, Tablet, Fernseher und PC (Xtream Codes & M3U).
Die App enthält keine Inhalte – Nutzer brauchen einen eigenen Zugang ihres Anbieters.

Änderungen: siehe [CHANGELOG.md](CHANGELOG.md)

## Aufbau

| Bereich | Ort | Technik |
|---|---|---|
| App (alle Geräte) | `www/` – `js/app.js`, `css/style.css`, `index.html` | Reines JavaScript ohne Build-Schritt (läuft auch auf TVs ab ca. 2019) |
| Übersetzungen | `www/js/i18n.js` (en, tr), `www/js/i18n/*.js` (weitere) | Wörterbuch Deutsch → Sprache; fehlende Texte bleiben deutsch |
| Android / Fire TV / iOS | `capacitor.config.json`, `platforms/android/java/` | Capacitor 7, eigener ExoPlayer für TV-Boxen |
| Samsung / LG | `platforms/tizen/`, `platforms/webos/` | `npm run tv:bauen` kopiert `www/` nach `dist/` |
| Windows / Mac | `desktop/` | Electron, lädt dieselbe App |
| Kundenportal | `docs/` (GitHub Pages) | Playlists per MAC + KEY hochladen, bearbeiten, Support |
| Verwaltungsbereich | `docs/admin.html`, `admin.css`, `admin.js` | Support-Postfach, Geräte, Kennzahlen, Protokoll – Anmeldung über Supabase Auth |
| Online-Dienst | `server/supabase.sql`, `server/admin.sql` | Supabase; Zugriff nur über RPC-Funktionen (MAC + Geräteschlüssel bzw. Admin-Konto) |

**Datenfluss „Playlist per Handy“:** Die App erzeugt beim ersten Start eine zufällige MAC und einen
6-stelligen KEY, meldet sich bei Supabase an (`register_device`) und fragt alle 30 s die Playlists ab
(`list_playlists`). Das Portal schreibt Playlists mit denselben Daten (`add_playlist`, `update_playlist`).
Die Tabellen sind per Row-Level-Security gesperrt; der öffentliche Supabase-Schlüssel in App und Portal
ist ein *publishable key* und darf öffentlich sein.

**In der App gespeichert (localStorage, Präfix `lumio.`):** Einstellungen, Playlists inkl. Zugangsdaten,
und pro Playlist: `fav`, `resume`, `recent`, `seen`, `last`, `stats`, `seenNew`, `cats`, `expiry`.
Der Programmführer für M3U liegt wegen seiner Größe in IndexedDB (Datenbank `lumio-epg`, Schlüssel `epg.<Playlist-ID>`).

**Programmführer (EPG):** Xtream über `get_short_epg` pro Sender. M3U über XMLTV-Dateien
(`Xmltv` in `app.js`): Adresse aus `#EXTM3U url-tvg="…"` oder selbst eingetragen (Profil → Programmführer),
Zuordnung über `tvg-id` bzw. den Sendernamen, Datei wird gestreamt gelesen und auf ein Zeitfenster gekürzt.

## Entwickeln & Testen

```bash
npm install
```

```bash
npm start
```

Dann `http://localhost:8080/?nocloud` öffnen – mit `?nocloud` legt die App **kein** Gerät im
Online-Dienst an. Ohne Zugang: auf dem Startbildschirm „Demo ausprobieren“ wählen.
Für automatische Tests ist `window.LumioDebug` erreichbar (z. B. `parseM3U`, `Xmltv`, `PinGuard`).

### Automatische Tests

`tests/run.html` prüft mit erfundenen Testdaten (ohne Kundendaten, ohne Online-Dienst):
M3U lesen und einteilen, Xtream-Links, Server-Adressen, Programmführer (Zeitzonen, Sonderzeichen,
gzip, ISO-8859-1, Zwischenspeicher, falsche Adressen), PIN-Sperre, vollständiges Löschen von
Playlist-Daten und alle Übersetzungen (u. a. dass `{0}`/`{1}` in jeder Sprache erhalten sind).

- **Automatisch:** bei jedem Upload auf GitHub (`.github/workflows/tests.yml`, Reiter „Actions“ → „Tests“).
  Bei Fehlern hängt der Testbericht als Datei „testbericht“ am Lauf.
- **Im Browser ansehen:** einen Webserver im **Projektordner** (nicht in `www/`) starten, z. B.
  `python -m http.server 8000`, dann `http://localhost:8000/tests/run.html` öffnen.
- Testdateien für den Programmführer liegen in `tests/fixtures/` (Sendungen am 01.01.2030;
  die Tests stellen die Uhr auf diesen Tag).
- Neuer Test: in einer der Dateien `tests/*.test.js` mit `Test.test('Gruppe', 'Name', function () { … })`.

## Verwaltungsbereich einrichten

Adresse nach dem Veröffentlichen: `https://splix66.github.io/lumio-player/admin.html` (nicht verlinkt, `noindex`).

1. **Datenbank:** Inhalt von `server/admin.sql` im Supabase SQL-Editor ausführen
   (Voraussetzung: `server/supabase.sql` lief bereits; kann gefahrlos wiederholt werden).
2. **Admin-Konto:** Supabase → Authentication → Users → „Add user“ (E-Mail + sicheres Passwort,
   „Auto Confirm User“). Dann im SQL-Editor, mit deiner E-Mail:
   ```sql
   insert into public.admins(user_id, email)
   select id, email from auth.users where email = 'admin@example.com'
   on conflict (user_id) do nothing;
   ```
3. **Empfohlen:** Authentication → Sign In / Providers → „Allow new users to sign up“ ausschalten.
4. Optional: Mehr-Faktor-Anmeldung (MFA) in Supabase aktivieren.

Weitere Admins: Schritt 2 wiederholen. Admin entfernen: `delete from public.admins where email = '…';`

Ohne Online-Dienst testen (erfundene Daten, nur auf localhost): einen lokalen Webserver im Ordner
`docs/` starten und `http://localhost:<port>/admin.html?demo` öffnen.

## Offene Empfehlungen (noch nicht umgesetzt)

1. **Git einrichten** – auf dem Entwicklungs-PC ist Git nicht installiert; Änderungen sind bisher nur
   per ZIP gesichert.
2. **Supabase-Missbrauchsschutz:** Wer eine fremde MAC kennt (sie steht auf dem TV-Bildschirm), kann
   durch 20 falsche Schlüssel das Gerät für eine Stunde sperren. Außerdem kann jeder beliebig viele
   Geräte anlegen. Empfehlung: Rate-Limit pro IP (Supabase Edge Function oder vorgeschalteter Proxy).
3. **Zugangsdaten in der Datenbank** liegen im Klartext (nötig, damit die App sie abrufen kann).
   Möglich: Verschlüsselung mit Supabase Vault/pgsodium, Schlüssel nur in den RPC-Funktionen.
4. **Antworten an Kunden im Portal:** Derzeit antwortet der Support per E-Mail. Eine Antwort, die der
   Kunde im Kundenportal oder in der App sieht, wäre der nächste Ausbauschritt.
5. **Admin-PIN-Hash** ist ein einfacher 32-bit-Hash (nur lokal gespeichert, durch die neue
   Fehlversuchs-Sperre abgesichert).
