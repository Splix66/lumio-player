# Telvo Player

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
| Webseite & Kundenportal | `docs/index.html`, `docs/assets/` (GitHub Pages) | Start, Download, Hilfe, Playlists per MAC + KEY; `site.css`, `site.js`, Sprachen in `assets/i18n/<code>.js` (14 wie die App), Schrift Inter lokal |
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

### Webseite testen

`tests/site.e2e.js` prüft die Webseite in einem unsichtbaren Chrome mit erfundenem Online-Dienst: alle Seiten,
Sicherheitsregel (CSP), Menü und Zurück-Knopf, alle 14 Sprachen auf Desktop und Handy, Sprachauswahl und das
Kundenportal (verbinden, Playlist anlegen/bearbeiten/löschen, Support). Läuft automatisch bei Änderungen an `docs/`
(„Actions“ → „Webseite testen“). Lokal: `npm i --no-save playwright`, dann `node tests/site.e2e.js`.

**Neue Texte auf der Webseite:** im HTML mit `data-t` markieren (bzw. `tr('…')` im Skript) und in **allen**
Dateien unter `docs/assets/i18n/` ergänzen – der Test meldet fehlende Übersetzungen.
**Neue externe Adressen** (z. B. ein weiterer Dienst) müssen in der `Content-Security-Policy` in `docs/index.html`
eingetragen werden, sonst blockiert der Browser sie.

## Sicherheits-Update der Datenbank (November 2026)

`server/sicherheit-2026-11.sql` einmal im Supabase SQL-Editor ausführen (wiederholbar, ändert keine Daten):
lückenlose Zählung von Fehlversuchen (max. 20 pro Stunde und Gerät), eigener langer App-Schlüssel (Token) – die App
lässt sich dadurch nicht mehr von Fremden aussperren –, „Neuen KEY erzeugen“ in der App und tägliches Aufräumen
(erledigte Support-Nachrichten nach 30 Tagen, Geräte nach 12 Monaten ohne Verbindung).
Für das Aufräumen vorher **Database → Extensions → pg_cron** einschalten (sonst gibt das Skript einen Hinweis aus).
Die App erkennt selbst, ob das Update eingespielt ist; ohne Update arbeitet sie wie bisher mit MAC + KEY.
Automatischer Test: `tests/sql/run.sh` („Actions“ → „Datenbank testen“).

## Sichern & Wiederherstellen (Datenbank, November 2026)

`server/sicherung-2026-11.sql` einmal im Supabase SQL-Editor ausführen – **nach** dem Sicherheits-Update
(wiederholbar, ändert keine bestehenden Daten): neue Tabelle `backups` (pro Gerät höchstens 512 KB, ohne Passwörter),
Funktionen `app_save_backup`, `app_backup_info`, `app_delete_backup` (App-Token) und `restore_backup` (MAC + KEY, mit
Fehlversuch-Sperre). Die Sicherung wird mit dem Gerät gelöscht. Ohne das Skript meldet die App beim Sichern
„Der Online-Dienst kennt diese Funktion noch nicht.“ – alles andere läuft weiter.

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
