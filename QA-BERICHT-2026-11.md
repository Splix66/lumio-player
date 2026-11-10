# QA-Bericht Telvo Player – 10.11.2026 (Version 1.13.1)

## Wie getestet wurde

- **App** (`www/`) im Chrome-Browser, gesteuert wie ein Nutzer (Maus, Tastatur, Fernbedienungs-Tasten), gegen einen
  **nachgestellten Xtream-Server** mit echten Test-Videos: 44 Live-Sender (darunter Arabisch, sehr lange Namen, ein
  Sender mit HTML im Namen, Erwachsenen-Kategorie, zwei absichtlich kaputte Streams, Sender mit Aufzeichnung),
  30 Filme, 6 Serien mit Staffeln und Folgen, Programmführer. Vier Testkonten: aktiv, läuft bald ab, abgelaufen, gesperrt.
  Zusätzlich M3U-Playlists (klein, kaputt, und groß mit 48.000 Einträgen für die Performance).
- **Größen:** PC 1920/1366, Fernseher-Modus 1920, Tablet 1024×768 und 768×1024, Handy quer 844×390 und hochkant 390×844.
- **Webseite, Kundenportal, Verwaltungsbereich** (`docs/`) mit nachgestelltem Online-Dienst, 14 Sprachen, 5 Größen.
- **Datenbank** (`server/*.sql`) in einer echten, leeren PostgreSQL 16 mit den Rollen von Supabase; Angriffe als
  `anon`/`authenticated` ausprobiert. Der echte Supabase-Dienst wurde **nicht** angefasst.
- **Android-TV-Player** (Java): auf GitHub gebaut („Android-APK bauen“ auf dem Test-Zweig, erfolgreich) – nicht auf
  einem echten Gerät getestet.
- Ergebnis aller automatischen Tests nach den Korrekturen: App 58/58, Webseite 60/60, Datenbank alle 5 Pakete bestanden,
  eigene Nutzer-Abläufe (Einrichten, Live TV, Player, Filme, Serien, Suche, Favoriten, Catch-up, Radio,
  Kindersicherung, Benutzer, alle 32 Einstellungen, Portal) bestanden.

**Nicht vorhanden – daher nicht testbar:** Shop, Warenkorb, Bestellablauf. Es gibt auch keine Kunden-Registrierung mit
Passwort: Geräte melden sich automatisch mit MAC + KEY an. Login/Logout gibt es nur im Verwaltungsbereich (getestet).

## Gefundene und behobene Fehler

| Bereich | Gefundener Fehler | Ursache | Lösung | Status | Nachtest |
|---|---|---|---|---|---|
| App · Playlists (**kritisch**) | Neue Playlist (von Hand, Webseite, Sicherung) bekam die Kennung der aktiven → gemeinsame Favoriten/Verlauf, falsche Zahlen („44 Sender“ bei einer M3U mit 3), Wechseln/Löschen traf ggf. die falsche | Zwei Funktionen hießen `uid()`, die zweite überschrieb die Zufallsfunktion | Eigene Funktion `newId()`; doppelte Kennungen werden beim Start repariert; Test ergänzt | Behoben | Erfolgreich |
| App · Einrichten | Abgelaufener/gesperrter Zugang: „Konto-Status: Expired / Banned“ (Englisch) | Server-Status roh eingesetzt (2 Stellen) | Übersetzt: „Playlist abgelaufen“ / „Zugang gesperrt“ | Behoben | Erfolgreich |
| App · Ablauf | Gleich beim Einrichten eines Monatszugangs „Dein Zugang läuft bald ab“ | Erste Erinnerung bei 30 Tagen | Erste Erinnerung 7 Tage vorher | Behoben | Erfolgreich |
| App · Fußzeile | Bei M3U „Benutzername: <Playlist-Name>“ | Beschriftung fest | „Playlist“, wenn kein Benutzername | Behoben | Erfolgreich |
| App · Live TV | „Favoriten“/„Zuletzt gesehen“ blieben auf 0 | Zähler nur beim Aufbau berechnet | Änderungen werden gemeldet, Zähler neu gezeichnet | Behoben | Erfolgreich |
| App · Kindersicherung | „Alle Sender 44“, angezeigt 43 | gesperrte Kategorie mitgezählt | nicht mehr mitzählen | Behoben | Erfolgreich |
| App · Player | Senderliste verdeckte links Knöpfe und oben den Zurück-Knopf, schloss nicht beim 2. Druck | volle Höhe; kein Umschalten | endet über der Bedienleiste/unter der Titelleiste; 2. Druck schließt | Behoben | Erfolgreich |
| App · Player | Nicht vorhandener Stream: 18 s „Verbindung wird wiederhergestellt“ | 4 Wiederholungen auch bei HTTP 404 | bei 4xx 1 Wiederholung → Ersatzformat nach < 3 s | Behoben | Erfolgreich |
| App · Player | Beide Formate fehlen → Hinweis auf „RAW-Sender“ und VLC | mpegts-Fehler immer als Direktwiedergabe gedeutet | bei 4xx „Der Stream ist nicht erreichbar.“ | Behoben | Erfolgreich |
| App · Player (Hochformat) | Senderliste, Favorit, Letzter Sender fehlten – Sender ließ sich nicht merken | linke Knöpfe per CSS ausgeblendet | in der gestapelten Leiste mittig sichtbar | Behoben | Erfolgreich |
| App · Player | Hochformatige Senderlogos ragten aus dem Rahmen | `max-height` greift in Grid-Zelle nicht | Bild füllt Box mit `object-fit: contain` | Behoben | Erfolgreich |
| App · Player | Pause-Bildschirm ohne Programm: Sendername doppelt | Name als Titel und Untertitel | Untertitel nur mit Sendezeit | Behoben | Erfolgreich |
| App · Serien | „Testserie - S01E02 - Folge 2“ statt „Folge 2“ | Präfix nur bei exakt gleichem Seriennamen entfernt | alles bis „S01E02“ entfernen, wenn Titel folgt | Behoben | Erfolgreich |
| App · Logos | Anfangsbuchstaben „1“/„?“ bei arabischen, kyrillischen, griechischen Sendern | nur lateinische Buchstaben erlaubt | Unicode-Buchstaben (mit Ersatz für alte TVs) | Behoben | Erfolgreich |
| App · Logos | „javascript:“-Logo-Adressen wurden geladen | jede Adresse übernommen | nur Bildadressen | Behoben | Erfolgreich |
| App · TV-Programm | Vorschaufenster verdeckte die letzten Zeilen | kein Platz reserviert | Abstand unter dem Programm | Behoben | Erfolgreich |
| App · Suche (Handy/Tablet hochkant) | Suchfeld außerhalb des Bildschirms bzw. 50 px breit | Seitenleiste an der Lage der Lupe erkannt | an der Form erkannt; bis 960 px volle Breite | Behoben | Erfolgreich |
| App · Startbildschirm Handy hochkant | Knöpfe lagen über „Telvo Player“ | Kopfzeile zu breit | nur „Telvo“, Sprache nur als Flagge | Behoben | Erfolgreich |
| App · Filme/Serien Handy | gewählte Kategorie unlesbar (dunkel auf dunkel) | Regel überschrieb hellen Hintergrund | eigene Regel für gewählte Kategorie | Behoben | Erfolgreich |
| App · Handy quer | Profilbild-Knopf auf 9 px geschrumpft | Regel für den Namen traf auch das Bild | Regel nur für den Namen | Behoben | Erfolgreich |
| App · Tablet | Statusanzeigen abgeschnitten („ernet“), „Favoriten“ überdeckt, Fußzeile lief aus dem Bild | kein Tablet-Layout | Tablet-Regeln; Hochformat-Layout bis 900 px | Behoben | Erfolgreich |
| App · Fernbedienung | Rechts aus Kategorien sprang auf „Sortieren“ statt aufs erste Cover | erstes Element im Ablauf gewählt | Cover vor der Kopfzeile | Behoben | Erfolgreich |
| App · Browser | „App beenden?“ erschien, „Beenden“ tat nichts | Browser-Tab lässt sich nicht schließen | im Browser nicht anbieten | Behoben | Erfolgreich |
| App · Browser | 404-Fehler `webapis.js` bei jedem Start | Samsung-Datei überall geladen | nur auf Samsung laden | Behoben | Erfolgreich |
| App · Über & Updates | Version doppelt angezeigt | Status zeigte sie zusätzlich | Status leer, wenn nichts Neues | Behoben | Erfolgreich |
| App · Support | Mit fremder MAC + 20 falschen KEYs ließ sich „Problem melden“/Feedback sperren | Support nur über KEY | Support mit App-Schlüssel (`app_send_support`), Rückfall auf KEY | Behoben | Erfolgreich (Datenbank-Test) |
| Webseite · Hilfe | „Gerät verbinden“ setzte Cursor nicht ins MAC-Feld | Bereich beim Fokussieren noch versteckt | erst umschalten, dann fokussieren | Behoben | Erfolgreich |
| Webseite · Portal Handy | Überschrift des Playlist-Editors hinter der Kopfzeile | fester Abstand für einzeilige Kopfzeile | Abstand nach echter Höhe | Behoben | Erfolgreich |
| Webseite · Portal | MAC-Feld: Cursor sprang ans Ende, Rücktaste hinter „:“ wirkungslos, „MAC: …“ einfügen ergab Unsinn | Wert neu gesetzt ohne Cursor; Länge 17 | Eingabe neu geschrieben, Länge 40 | Behoben | Erfolgreich |
| Webseite · Portal | Leerer Name beim Bearbeiten → „Meine Playlist“ | Standardname auch beim Bearbeiten | alter Name bleibt | Behoben | Erfolgreich |
| Webseite · Portal | „Anderes Gerät“: Nachricht/Kontakt der vorigen Person blieb stehen | Formular nicht geleert | wird geleert | Behoben | Erfolgreich |
| Webseite · Portal | Ohne Internet neu geladen → Gerät vergessen | jeder Fehler löschte die Sitzung | nur bei falschen Zugangsdaten | Behoben | Erfolgreich |
| Webseite · Arabisch | Lateinische Playlist-Namen vom Ende her abgeschnitten | keine Schreibrichtung gesetzt | `dir="auto"` | Behoben | Erfolgreich |
| Webseite · Handy | Knöpfe 33–35 px hoch | kleine Polsterung | mindestens 44 px | Behoben | Erfolgreich |
| Webseite · Russisch | Größe „MB“ statt „МБ“ | Einheit fest | Einheit in der Seitensprache | Behoben | Erfolgreich |
| Verwaltung | E-Mail „a@b.de?bcc=…“ ergab Antwort-Link mit fremden Empfängern | Prüfung ließ `?`/`&` zu | strengere Prüfung | Behoben | Erfolgreich |
| Verwaltung | Fokus nach „Gerät löschen“ verloren | Zeile wird neu gebaut | Fokus ins Suchfeld | Behoben | Nur Code geprüft |
| Datenbank (**hoch**) | Unbegrenzt Geräte, Support-Spam (10.000 Nachrichten in 1 s), gefälschte Bewertungen, Speicher füllbar | Grenzen nur je MAC | `schutz-2026-11.sql`: Grenzen je IP und gesamt, Speicherobergrenze | Behoben (Datei) – **muss in Supabase eingespielt werden** | Erfolgreich (lokale DB) |
| Datenbank | Xtream-Server „javascript:…“ speicherbar | keine Prüfung | nur http(s) | Behoben (Datei) | Erfolgreich |
| Datenbank | Rechte an der Zählfolge des Protokolls für anon | Supabase-Standard | entzogen | Behoben (Datei) | Nur Code geprüft (lokale Test-DB vergibt das Recht nicht) |

Zusätzlich vor diesem Durchgang (gleicher Tag, ebenfalls 1.13.1, siehe CHANGELOG): weitere Korrekturen im Web-Player,
Android-TV-Player, bei Einstellungen, Wetter und Bewertung.

## Nachtrag: Geräte-Kompatibilität (ohne echte Geräte geprüft)

- **APK** (veröffentlichte Datei zerlegt): erscheint im TV-Startmenü (Leanback), Banner vorhanden, kein Touchscreen nötig,
  Querformat, eigener TV-Player und Bibliotheken enthalten, mit festem Schlüssel signiert. Mindestens Android 6.
  **Behoben (1.13.2):** Paketversion stand immer auf „1.0 (1)“.
- **JavaScript:** gesamter App-Code und alle Bibliotheken sind ES5 – auch sehr alte Browser-Kerne können ihn lesen.
- **Behoben (1.13.2):** Auf Browser-Kernen bis Chrome 57 wurden laufende Sendung und TV-Programm nie geladen
  (`isIntersecting` fehlt). Nachgestellt: vorher 0 von 14 Programmzeilen, danach 14.
- **Offen – Risiko für sehr alte Geräte:** Das Layout nutzt CSS-Grid (52 Stellen, erst ab Chrome 57) und Abstände
  mit `gap` in Flex-Zeilen (erst ab Chrome 84). Auf LG-Fernsehern bis 2019 (webOS 4.x, Chrome 53), Samsung 2018 und
  Android-Boxen mit nie aktualisiertem Browser-Kern fällt das Layout deshalb vermutlich zusammen bzw. Abstände fehlen.
  Fire TV und aktuelle Android-TV-Geräte sind nicht betroffen. Ein Test in alten Browser-Kernen (Electron 1.4/2/3)
  wurde vorbereitet, durfte in der Testumgebung aber nicht ausgeführt werden (Programme aus externer Quelle).

## Noch offene Punkte

| Bereich | Problem | Warum offen |
|---|---|---|
| Webseite · Impressum/Datenschutz (**hoch, rechtlich**) | Öffentlich sichtbar „[VORNAME NACHNAME] [STRASSE HAUSNUMMER] [PLZ ORT]“ | Echte Angaben des Betreibers nötig (`docs/impressum.html`, `docs/datenschutz.html`) |
| Datenbank | `server/schutz-2026-11.sql` und `bewertung-2026-11.sql` sind nicht im echten Supabase eingespielt | Nur der Betreiber spielt ein; danach Anmeldung und „Problem melden“ einmal prüfen |
| App · Arabisch | Oberfläche wird nicht gespiegelt (rechts-nach-links) | Größerer Umbau aller Layouts – eigenes Vorhaben |
| App · Handy quer | Viele Tippflächen 28–29 px; Einstellungen/Profil unten in der Seitenleiste ohne Hinweis | Neues Seitenleisten-Layout nötig |
| App · Tablet/Handy quer | Kategorienamen gekürzt („TV-Progr…“) | Schmalere Spalte bewusst; zweizeilige Namen wären ein Design-Entscheid |
| App · Handy hochkant | Statusleiste in Live TV abgeschnitten („Pla…“) | niedrig |
| App · Erster Start | Hinweis „Gut zu wissen“ liegt 9 s über Formularfeldern / Demo-Knopf (Handy quer) | niedrig, verschwindet von selbst |
| App · Sprachauswahl | „Bosanski / Hrvatski / S…“ abgeschnitten | niedrig |
| App · Platzhalter | Poster ohne Bild wiederholen den Titel; Folgen ohne Vorschaubild sind graue Flächen | Design-Entscheid |
| App · Player | Gewähltes Tempo (z. B. 1,5×) gilt für weitere Filme der Sitzung | evtl. gewollt |
| Webseite | Rechtstexte und 404-Seite nur Deutsch; neue Server-Meldungen nur Deutsch | Übersetzung der Rechtstexte rechtlich prüfen lassen |
| Datenbank | „Gerät nicht gefunden“ vs. „KEY falsch“ verrät, ob eine MAC existiert; KEY-Hash ohne Salz | niedrig (46-Bit-MAC, Playlists liegen ohnehin im Klartext) |
| Verwaltung | Abmeldung nach 30 Min. zählt Mausbewegung nicht als Aktivität | evtl. gewollt |
| Geräte | Android-TV-Player nur kompiliert; Samsung/LG/PC-App und echte Anbieter-Streams nicht getestet | keine Geräte/Zugänge in der Testumgebung |
