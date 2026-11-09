# Änderungsprotokoll – Telvo Player (früher Lumio Player)

## Noch nicht veröffentlicht

**App – Willkommensseite neu angeordnet:** QR-Code in der Mitte · rechts MAC, KEY, „Playlist hinzufügen“, „Demo“ und
neuer Knopf „Aktualisieren“ (sieht sofort nach, ob auf der Webseite eine Playlist eingetragen wurde) · Begrüßung über der
Karte · Link zur Webseite als ruhige Schaltfläche statt unterstrichen · eigene kompakte Ansicht für Handys im Querformat
(alles ohne Scrollen sichtbar; die Android-App läuft weiterhin nur quer).

**Sicherheit:** MAC und KEY stehen im QR-Code jetzt hinter „#“ – dieser Teil der Adresse wird nie an einen Server
geschickt. Die Webseite liest beides, QR-Codes älterer App-Versionen funktionieren weiter.

**App – „Problem melden“** (Einstellungen → Darstellung & Gerät): Thema wählen, Nachricht schreiben, freiwillig E-Mail
für eine Antwort. Technische Angaben (Version, Gerät, letzte Fehler) lassen sich abschalten und vorher ansehen – Links,
Benutzernamen und Passwörter werden nie mitgeschickt. Kommt im Verwaltungsbereich unter „Support“ an.

**App – Open-Source-Lizenzen** (Einstellungen → Über & Updates): alle eingebauten Bausteine mit Lizenz, Urheber und
vollständigem Lizenztext (Apache 2.0, MIT, OFL 1.1) – auch mit der Fernbedienung lesbar. Pflicht für die Stores.

**Nutzungsbedingungen:** neue Seite auf der Webseite (Fußzeile, Impressum, Datenschutz verlinkt) und einmaliger Hinweis
beim ersten Start der App („Bevor es losgeht“ → „Verstanden“). Erscheint erneut nur, wenn sich die Bedingungen ändern.

**Neu: „Verpasste Sendungen“ (Catch-up)** für Xtream-Zugänge, wenn der Anbieter aufzeichnet: Sender mit Archiv sind
in der Senderliste markiert. Rechts neben der Liste und im Player öffnet „Verpasste Sendungen“ die vergangenen Sendungen
nach Tagen (Heute, Gestern …), die laufende Sendung lässt sich von Anfang an schauen. Startzeit in Serverzeit, Ersatz-
Adresse als HLS. Vergangene Sendungen landen nicht unter „Weiterschauen“. Im Demo-Modus zum Ausprobieren. Neuer Test.
Auch für **M3U-Playlists** mit Catch-up-Angaben (catchup, catchup-days, catchup-source – Formate default, append, shift,
flussonic, xc; auch als Vorgabe in der Kopfzeile). Der Programmführer behält dafür die vergangenen Tage nur bei diesen
Sendern (Speicher auf schwachen Boxen); ohne Programmdaten erscheinen Stundenblöcke.

**Neu: Programmführer-Zeit** (Einstellungen → Playlist): Zeigt der Anbieter das Programm zu früh oder zu spät, lässt es
sich je Playlist um bis zu ±5 Stunden verschieben – gilt für Senderliste, Vorschau, Player und „Verpasste Sendungen“.

**Neu: Kategorien verwalten** (Einstellungen → Live-/Film-/Serien-Kategorien verwalten): ausblenden wie bisher, dazu
mit dem Stern ganz nach oben anheften und mit dem Stift umbenennen. Umbenennen hebt keine Kindersicherung auf.
**Neu: Sender ausblenden** – bei Live TV rechts neben der Senderliste oder im Player (Auge-Symbol); wieder einblenden
unter Einstellungen → Ausgeblendete Sender. Favoriten und „Zuletzt gesehen“ bleiben unberührt.

**Neu: Sichern & Wiederherstellen** (Einstellungen → Darstellung & Gerät): Einstellungen, Favoriten, Weiterschauen,
Verlauf, Kategorien und ausgeblendete Sender online sichern – ohne Passwörter, Links und PINs (Playlists werden über einen
Prüfwert wiedererkannt). Wiederherstellen auf diesem Gerät (z. B. nach „Alles zurücksetzen“) oder auf einem neuen Gerät mit
MAC + KEY des alten; Playlists von der Webseite kommen mit, andere übernehmen ihre Daten, sobald man sie einträgt.
Optional täglich automatisch. Datenbank: `server/sicherung-2026-11.sql` (mit Tests). Datenschutzerklärung ergänzt
(auch „Problem melden“). „Alles zurücksetzen“ behält jetzt auch den App-Token (gehört wie MAC und KEY zum Gerät).

**Neu: Feedback geben** (Einstellungen → Darstellung & Gerät): 1–5 Sterne (auch mit der Fernbedienung), freiwillig Text und
E-Mail. Kommt im Verwaltungsbereich unter „Support“ mit dem Thema „Feedback“ an; mitgeschickt werden nur App-Version,
Gerätetyp und Sprache. Auf der Webseite im Kontaktformular neues Thema „Feedback oder Idee“.

**Neues Logo:** Der Balken des „T“ biegt rechts in einem Bogen nach unten, darunter das lila Play-Zeichen (#b06cff → #7c3aed);
der gelbe Lichtpunkt entfällt. App-Symbol dunkel mit leichtem Verlauf und feinem hellem Rand. Geändert in der App, auf der
Webseite (Kopf- und Fußzeile, Verwaltungsbereich, Download-Seite), Favicon, iPhone-Symbol, Vorschaubild für geteilte Links
und in `scripts/make-icons.py` (Android, Fire TV, Samsung, LG, Windows/Mac, TV-Banner, Startbildschirm).

**Android-TV-Player:** Media3 (ExoPlayer) von 1.4.1 auf 1.9.4 – gut ein Jahr Fehlerbehebungen, u. a. für HLS-Livestreams.

## 1.11.1 – 2026-11-09 · Neue Willkommensseite

**App – Willkommensseite (noch keine Playlist) neu:** dunkles Premium-Design (#0B0B0F, Karten #17171E, Akzent #9B83D5) ·
Einrichtungshilfe in 3 Schritten (QR-Code scannen → Playlist eintragen → Loslegen) · großer QR-Code · MAC und KEY gut
lesbar mit Kopier-Knopf (nie abgekürzt, Werte immer vom Gerät) · Statusanzeige mit echten Werten (Internet / Online-Dienst,
Player, Playlist; prüft alle 3 Sekunden) · Hilfe-Knopf mit kurzen Antworten · weniger Text · Handy: Seite startet oben.

**App – Startseite:** Kacheln leuchten nicht mehr, Pfeil und Kreis entfernt. **PC:** vorsichtigere Videoqualität beim Start
(weniger Hänger bei schwacher Verbindung).

## 1.11.0 – 2026-11-09 · Telvo: neuer Name, neue Webseite, mehr Sicherheit

**App – behobene Fehler:** endloses Hängen beim Aktualisieren, wenn der Server mitten in der Übertragung stehen blieb ·
Kindersicherung über Favoriten/Zuletzt gesehen/Weiterschauen umgehbar · gelöschte Playlists kamen zurück ·
doppelte Playlists bei langsamer Verbindung · abgelaufener Xtream-Zugang erschien als leere Playlist ·
Zahlen bei falscher Playlist gespeichert · Umlaute in Latin-1-Playlists · zwei Videoplayer gleichzeitig ·
Links unter Windows/Mac doppelt geöffnet · möglicher Absturz des TV-Players bei langen Senderlisten ·
Favoriten rutschten auf Nachbarsender, wenn der Anbieter die M3U-Liste umsortierte (stabile Kennungen, automatische Umstellung).

**App – Datenschutz & Sicherheit:** Zugangsdaten gehen nur noch mit Zustimmung online („Auch auf der Webseite verwalten“,
„Webseite: an/aus“) · eigener App-Schlüssel (Token) für den Online-Abgleich · „Neuen KEY erzeugen“ · Bibliotheken fest
eingebaut mit fester Version und Prüfsumme. Datenbank: `server/sicherheit-2026-11.sql` (am 09.11.2026 eingespielt).

**Tests:** 43 App-Tests, 54 Webseiten-Tests, Datenbank-Tests gegen PostgreSQL.

### Umbenennung in „Telvo“

**Neuer Name: Telvo Player** (vorher „Lumio Player“ – den Namen nutzen bereits andere Apps, u. a. ein
Android-Videoplayer und eine Schul-Software). Geändert ist nur der **sichtbare** Name und das Logo:
- Neues Logo „T mit Play-Zeichen und Lichtpunkt“ (Webseite, App, Favicon, App-Symbole über `scripts/make-icons.py`)
- App-Name in App, Android/Fire TV (Capacitor), Samsung, LG, Windows/Mac (`productName` → Mac-App heißt jetzt
  „Telvo Player.app“), Release-Titel auf GitHub
- **Bewusst unverändert** (damit bestehende Installationen, Updates, QR-Codes und der Downloader-Code 5619512
  weiter funktionieren): Repository und Webadresse `splix66.github.io/lumio-player`, Dateinamen `lumio-player.apk` /
  `lumio-player-setup.exe` / `lumio-player-mac.dmg`, App-Kennung `de.lumio.player`, Datenbankfunktionen `lumio_*`,
  gespeicherte Einstellungen `lumio.*`, Test-Schnittstelle `window.LumioDebug`

Webseite (`docs/`): neues Design, 14 Sprachen mit Sprachauswahl wie in der App, Sicherheitsregel (CSP),
automatischer Webseiten-Test – Details in `WEBSEITE-BESTANDSAUFNAHME.md`.

## 1.10.0 – 2026-11-09 · Automatische Tests

Neue Dateien: `tests/run.html`, `tests/runner.js`, `tests/*.test.js`, `tests/fixtures/*`,
`.github/workflows/tests.yml`. Die App selbst ist unverändert bis auf zusätzliche Einträge in der
Test-Schnittstelle `window.LumioDebug`. Die Tests werden nicht mit in die Apps gepackt (nur `www/` wird ausgeliefert).

### 30 Tests in 4 Bereichen
- **M3U & Zugang (10):** Sendernamen mit Kommas, Ersatzname/-gruppe, `#EXTGRP`, Windows-Zeilenenden,
  EPG-Adressen in der Kopfzeile, Xtream-Links (auch mit kodiertem Passwort und Unterordner), Server-Adressen,
  Einteilung in Live/Filme/Serien inkl. Staffeln und Folgen, verständliche Meldung bei kaputter Playlist.
- **Programmführer (10):** Zeitzonen, Sonderzeichen/CDATA, Namensvergleich, zerteilte Dateien,
  echte Downloads über einen Webserver: ungepackt, gzip, ISO-8859-1, Zwischenspeicher (kein zweiter
  Download), falsche Adresse (Meldung, kein Dauer-Nachladen), Playlist ohne EPG.
- **Sicherheit & Daten (6):** PIN-Sperre (Stufen, Höchstwert, Ablauf, Zurücksetzen), Löschen aller
  9 Datenarten und des gespeicherten Programmführers, Testmodus sendet nichts an den Online-Dienst,
  kaputte Speicher-Einträge.
- **Sprachen (4):** alle Sprachdateien laden, keine leeren Texte, **Platzhalter `{0}`, `{1}` stimmen in
  jeder Übersetzung**, Übersicht über fehlende und nicht mehr genutzte Übersetzungen.

### Dabei gefunden und behoben
- „NEU“ (Abzeichen auf den Startkacheln) und „Neue Serien oder Folgen“ waren in **keiner** Sprache übersetzt
  und erschienen immer auf Deutsch – jetzt in allen 13 Sprachen.

### Hinweise aus den Tests (keine Fehler)
- 50 Übersetzungen werden in der App nicht mehr verwendet (Überbleibsel früherer Versionen, unschädlich).
  Darunter „Demo ansehen“ und „Karte „Demo ansehen“ bei den Playlists.“ – es gab also früher einen
  Demo-Zugang, der entfernt wurde. Falls das **bewusst** war (z. B. wegen einer App-Store-Prüfung),
  sollte der neue Knopf „Demo ausprobieren“ wieder entfernt werden.

### Geprüft
- Im Browser und dreimal hintereinander im unsichtbaren Chrome (genau wie auf GitHub): jeweils alle 30 bestanden.
- Auf GitHub (Workflow „Tests“, Pull Request #1): alle 30 bestanden.

## 1.10.0 – 2026-11-09 · Programmführer (EPG) für M3U-Playlists

Bisher gab es Programmdaten nur für Xtream-Zugänge – M3U-Nutzer sahen nie, was gerade läuft.

### Neu
- **XMLTV-Programmführer für M3U:** Die Adresse wird aus der Playlist-Kopfzeile gelesen
  (`url-tvg`, `x-tvg-url`, `tvg-url`, auch mehrere mit Komma) oder selbst eingetragen.
  Bis zu 3 Quellen werden zusammengeführt (doppelte Sendungen entfallen).
- **Zuordnung der Sender** über `tvg-id` (Groß-/Kleinschreibung egal), sonst über den Namen –
  Vorsilben und Qualitätsangaben werden dabei ignoriert („DE: ZDF HD“ ≈ „ZDF“, „|DE| Das Erste FHD“ ≈ „Das Erste“).
- **Überall sichtbar, wo es auch bei Xtream erscheint:** Seitenpanel in Live TV (Jetzt + Fortschritt +
  nächste Sendungen), „Jetzt / Danach“ im Player. Zusätzlich zeigt die **Senderliste bei M3U für alle
  Sender „läuft gerade“**, sobald der Programmführer geladen ist.
- **Eingabe der EPG-Adresse:** optionales Feld beim Anlegen einer M3U-Playlist; auf der Profilseite
  neuer Bereich „Programmführer (EPG)“ mit Quelle, Stand (Anzahl Sender, Ladezeit), Fehlermeldung,
  „EPG-Adresse ändern“, „Adresse aus der Playlist verwenden“ und „Jetzt neu laden“.
  Die eigene Adresse bleibt beim Abgleich mit dem Kundenportal erhalten.
- Titel und Beschreibung bevorzugt in der App-Sprache, wenn die EPG-Datei mehrere Sprachen enthält.

### Leistung & Speicher (wichtig für TV-Boxen)
- EPG-Dateien (oft 50–200 MB) werden **Stück für Stück gelesen** statt komplett in den Speicher.
  Behalten wird nur, was gebraucht wird: Sender der Playlist, 3 Stunden zurück bis 36 Stunden voraus.
- **gzip-Dateien (.xml.gz)** werden automatisch erkannt und entpackt (an den ersten Bytes, nicht am Namen).
- Zeichensatz aus der XML-Kopfzeile (z. B. ISO-8859-1) wird beachtet.
- Geladen wird erst, wenn der Programmführer gebraucht wird (Live TV, Player) – nicht beim App-Start.
- **Zwischenspeicher im Gerät (IndexedDB), 12 Stunden gültig:** Nach einem Neustart ist das Programm
  sofort da, ohne erneuten Download. „Playlist aktualisieren“ und „Jetzt neu laden“ holen ihn frisch.
- Nach einem Fehler wird 10 Minuten lang nicht erneut geladen – sonst würde die große Datei bei jedem
  Senderwechsel neu angefragt.

### Datenschutz
- Gespeicherter Programmführer wird beim Löschen einer Playlist und bei „Alles zurücksetzen“ mit entfernt.

### Getestet (Browser, eigene Test-Playlist und Test-EPG, keine Kundendaten)
- 19 Einzeltests: Zeitzonen (+0100, -0500, +01:00, ohne Zone), Sonderzeichen/CDATA, Namenszuordnung,
  Kopfzeile mit mehreren Adressen, Zeitfenster, fehlende Endzeit, Datei mitten in Einträgen zerteilt
- Gesamtablauf: Playlist mit gepacktem EPG anlegen → Live TV → Seitenpanel, Senderliste, Player
- Zwischenspeicher: nach Neustart kein erneuter Download
- Profilseite: eigene Adresse (.xml), falsche Adresse (Fehlermeldung, keine Wiederholungs-Downloads),
  zurück zur Playlist-Adresse
- Alle 25 neuen Texte in 13 Sprachen, Platzhalter geprüft; keine Konsolenfehler

**Nicht getestet:** echte große EPG-Dateien von Anbietern sowie das Verhalten in der **Android-App**:
Dort laufen Anfragen über das native HTTP-Modul von Capacitor (`CapacitorHttp`). Ob es große bzw.
gepackte (.gz) Dateien unverändert durchreicht, ist ungeklärt. Falls auf Android kein Programm erscheint:
eine ungepackte `.xml`-Adresse eintragen und mir Bescheid geben.

## 1.10.0 – 2026-11-09 · Neuer Web-Verwaltungsbereich

Neue Dateien: `docs/admin.html`, `docs/admin.css`, `docs/admin.js`, `server/admin.sql`.
Bestehende Tabellen, Funktionen, App und Kundenportal bleiben unverändert (nur Ergänzungen).
Einrichtung: siehe README → „Verwaltungsbereich einrichten“.

### Funktionen
- **Anmeldung** mit Supabase-Konto; Zugriff nur für Konten in der Tabelle `admins`.
  Sitzung gilt nur im Browser-Tab, automatische Abmeldung nach 30 Minuten ohne Aktivität,
  Token werden automatisch erneuert.
- **Übersicht:** Geräte gesamt / neu in 7 Tagen, aktiv heute / 7 Tage, Playlists (Xtream/M3U),
  offene Support-Anfragen, gesperrte Geräte; Diagramm „Neue Geräte pro Tag“ (14 Tage) mit
  Tooltip und Tabellenansicht; die neuesten offenen Anfragen.
- **Support-Postfach:** Filter Offen/Erledigt/Alle, Suche (MAC, Text, Kontakt), interne Notiz,
  „Als erledigt markieren“ / „Wieder öffnen“ (mit Zeitpunkt und bearbeitendem Admin),
  Antwort per E-Mail-Link, Sprung zum Gerät.
- **Geräte:** Liste mit Suche (MAC, auch ohne Doppelpunkte), Filter Aktiv / Inaktiv /
  Fehlversuche, Status-Kennzeichen, seitenweises Laden. Detailansicht mit Playlists,
  Support-Verlauf, „Sperre aufheben“ und „Gerät löschen“ (Bestätigung per Doppelklick).
- **Protokoll:** Jede ändernde Admin-Aktion wird mit Admin, Zeitpunkt und Ziel gespeichert.

### Sicherheit & Datenschutz
- Datenbankfunktionen prüfen bei jedem Aufruf die Admin-Berechtigung (`security definer`,
  nur für angemeldete Benutzer freigegeben). Tabellen bleiben per RLS gesperrt.
- **Keine Kunden-Zugangsdaten im Verwaltungsbereich:** Benutzername, Passwort und vollständige
  M3U-Links werden vom Server gar nicht ausgeliefert – nur Name, Typ und Server-Host
  (auch `benutzer:passwort@` in Adressen wird entfernt).
- Kundentexte werden nur als Text dargestellt (kein HTML) – Support-Nachrichten können keinen
  Code einschleusen. Strenge Content-Security-Policy (Skripte nur aus eigener Datei,
  Verbindungen nur zu Supabase), Schutz vor Einbetten in fremde Seiten, `noindex`.

### Getestet (Demo-Modus `admin.html?demo` auf localhost, erfundene Daten)
- Anmeldung, Wiederherstellen der Sitzung nach Neuladen, Abmelden, automatische Abmeldung nach
  30 Minuten (Daten werden aus der Seite entfernt)
- Kennzahlen, Diagramm inkl. Tooltip, Liste offener Anfragen
- Support: Notiz, erledigt/wieder öffnen inkl. Zähler, Filter, Suche, E-Mail-Link
- Geräte: Seitenweises Laden, Filter, Suche, Detailansicht, Sperre aufheben, Löschen
- Protokoll, Navigation per Adresse (#support, #geraete …) und Zurück-Taste
- Desktop und Handy (375 px): keine waagerechte Scrollleiste, Tabellen werden zu Karten
- Keine Konsolenfehler, keine CSP-Verstöße

**Nicht getestet:** `server/admin.sql` gegen die echte Datenbank und die echte Supabase-Anmeldung –
beides habe ich bewusst nicht an der Produktionsdatenbank ausgeführt. Bitte nach dem Einrichten
einmal anmelden und die Bereiche durchklicken; Fehlermeldungen werden in der Oberfläche angezeigt.

## 1.10.0 – 2026-11-09 · Überarbeitung Sicherheit, Stabilität, Bedienung

Alle Abschnitte mit „1.10.0“ zusammen sind Version 1.10.0 (vorher 1.9.1). Der Demo-Knopf bleibt auf Wunsch
des Nutzers (am 09.11. bestätigt).

Sicherung des Stands vor der Überarbeitung: `../lumio-backup-2026-11-09-vor-Ueberarbeitung.zip`

### Sicherheit
- **Kindersicherung umgehbar (behoben):** Ohne Admin-PIN konnte jeder durch 7× Tippen auf die
  Versionsnummer eine neue Admin-PIN festlegen und über „Alles zurücksetzen“ die Kindersicherung
  löschen. Ist die Kindersicherung aktiv, wird jetzt vorher deren PIN verlangt. (`www/js/app.js`, `Admin.unlock`)
- **PIN-Sperre gegen Durchprobieren (neu):** Kindersicherungs- und Admin-PIN sperren ab dem
  5. Fehlversuch für 30 s, danach jeweils doppelt so lange (max. 30 min). Der Zähler übersteht
  Neustarts; während der Sperre wird auch die richtige PIN abgelehnt. (`PinGuard`)
- **Desktop-App (Electron):** Externe Links werden nur noch mit `http/https` geöffnet
  (vorher jedes Schema, z. B. `file:` oder `ms-…:` → konnte Programme starten). Das App-Fenster
  kann nicht mehr auf fremde Seiten wegnavigieren, Renderer läuft in der Sandbox,
  Kamera/Mikrofon/Standort-Anfragen werden abgelehnt. (`desktop/main.js`)
- **Android-Plugin:** `NativePlayer.openExternal` akzeptiert nur noch Web-/Streaming-Schemata
  (http, https, rtmp, rtsp, rtp, udp, mms) – keine `intent:`, `file:` oder `content:` Links.
  (`platforms/android/java/NativePlayerPlugin.java`)
- **Test-Webserver:** Path-Traversal in Nachbarordner (z. B. `www-alt`) geschlossen, kaputte
  URL-Kodierung lässt den Server nicht mehr abstürzen, Sicherheits-Header ergänzt. (`scripts/serve.js`)

### Fehlerbehebungen
- **Playlist-Abgleich hing dauerhaft:** Eine nie beantwortete Anfrage an den Online-Dienst ließ
  den Abgleich für immer auf „beschäftigt“ stehen – neue Playlists vom Handy kamen bis zum
  Neustart nicht mehr an. Jetzt mit 15-s-Zeitlimit (`CONFIG.cloudTimeout`). Gleiches Zeitlimit
  im Kundenportal (`docs/index.html`), dort blieb sonst der Knopf auf „Verbinde …“ stehen.
- **Speicherleck beim Playlist-Wechsel:** Wurde die Oberfläche ersetzt (Playlist wechseln,
  Playlist übers Portal gelöscht), liefen die Timer des Startbildschirms weiter und luden im
  Hintergrund Listen der alten Playlist. Die Ansicht wird jetzt beim Verlassen aufgeräumt.
- **Datenreste beim Löschen einer Playlist (Datenschutz):** Es wurden nur 5 von 9 gespeicherten
  Datenarten entfernt (beim Löschen über das Portal sogar nur 3). Jetzt werden Favoriten,
  Weiterschauen, Verlauf, Gesehen, Zuletzt, Statistik, Neu-Markierung, Kategorie-Einstellungen
  und Ablauf-Erinnerungen vollständig gelöscht (`Profiles.dropData`).

### Bedienung & Funktionen
- **„Demo ausprobieren“** auf dem Willkommensbildschirm: Der vorhandene Demo-Modus (freie
  Test-Videos) war nirgends erreichbar. Nützlich für neue Nutzer und für die App-Store-Prüfung
  (Apple/Google verlangen eine testbare App ohne eigenen Zugang). Die Demo bleibt lokal.
- **Passwort anzeigen/verbergen** (Auge-Knopf) im Formular „Playlist hinzufügen“.
- **Enter im letzten Feld** (Passwort bzw. M3U-Link) speichert direkt.
- Alle neuen Texte in allen 14 Sprachen übersetzt.

### Leistung
- Schnellsuche: Der normalisierte Name wird pro Eintrag einmal berechnet und gemerkt statt bei
  jedem Tastendruck für jeden Eintrag neu – spürbar bei Playlists mit zehntausenden Einträgen
  auf schwachen TV-Boxen.

### Entwicklung
- `?nocloud` an der Adresse (z. B. `http://localhost:8080/?nocloud`) startet die App ohne
  Online-Dienst – es wird dann kein Testgerät in der Produktionsdatenbank angelegt.

### Getestet (Browser, Demo-Modus, ohne Online-Dienst)
- Willkommensbildschirm inkl. Demo-Knopf (Desktop- und Handy-Breite), Demo-Start
- Passwort-Auge, keine Anfragen an Supabase mit `?nocloud`
- PIN-Sperre: 4 Fehlversuche → Hinweis, 5. → 30 s Sperre, richtige PIN in der Sperre abgelehnt,
  nach Ablauf angenommen und Zähler gelöscht
- Admin-Zugang bei aktiver Kindersicherung verlangt zuerst die Kindersicherungs-PIN
- Timer des Startbildschirms wird beim Ersetzen der Oberfläche beendet
- Löschen einer Playlist entfernt alle 9 Datenarten
- Alle 13 Übersetzungsdateien laden fehlerfrei, Platzhalter `{0}` vorhanden
- Kundenportal lädt fehlerfrei

**Nicht getestet** (auf dem Entwicklungs-PC fehlen Node.js, Android Studio, Electron):
Android-Build (`NativePlayerPlugin.java`), Desktop-Build (`desktop/main.js`), `scripts/serve.js`,
das Zeitlimit gegen einen echt hängenden Server.
