# Änderungsprotokoll – Telvo Player (früher Lumio Player)

## 1.14.1 – 2026-11-11 · Korrekturen aus der Code-Durchsicht

- **Startseite:** Nach einem zu Ende geschauten Film aus „Weiterschauen“ springt der Fokus nicht mehr in die Menüleiste, sondern auf die erste Karte.
- **Startseite:** Die Knöpfe im Titelbild zeigen nach dem Schauen gleich „Weiter bei …“ statt weiter „Jetzt ansehen“.
- **Startseite:** Beim ersten Start erscheinen die Zahlen unter Live TV / Filme / Serien, sobald die Listen geladen sind (vorher blieb „…“ stehen).
- **Startseite:** Die Reihe „Top Sender“ ist weg – „Zuletzt gesehene Sender“ reicht.
- **„App beim Start“** gilt nur noch beim Start der App – nicht mehr nach Personen- oder Playlist-Wechsel oder Sprachwechsel. Bei mehreren Personen erst nach „Wer schaut?“ (vorher wurde alles doppelt geladen).
- **TV-Player:** Klangverbesserung, die ein Gerät nicht einschalten kann, wird sauber wieder freigegeben.

## 1.14.0 – 2026-11-10 · Neues Design: Startseite, Einstellungen, Filme & Serien

- **Neue Startseite** (nach Entwurf): Menüleiste oben wie überall, darunter ein großes Titelbild mit den bestbewerteten Filmen und Serien (Bewertung · Genre · Jahr, „Jetzt ansehen“ und „Details“, wechselt alle 9 Sekunden, aber nie, während man dort steht). Darunter „Weiterschauen“, „Zuletzt gesehene Sender“ und „Top Sender“ (die meistgeschauten Sender der Person, aufgefüllt mit Favoriten). Die Auswahl fürs Titelbild wird beim Aktualisieren der Listen berechnet und klein gespeichert – die Startseite lädt die großen Film- und Serienlisten nicht selbst. Gesperrte und ausgeblendete Kategorien (Kindersicherung) erscheinen nie im Titelbild oder bei den Sendern. Status (Internet, Player, Laufzeit) steht jetzt unten in der Fußleiste; Radio über Live TV → Radio, Hilfe unter Einstellungen → Hilfe & Support.
- **Einstellungen in acht Bereichen** (nach Entwurf): Allgemein, Wiedergabe, Darstellung, Inhalte & Listen, Benutzer & Sicherheit, Geräte & Verbindungen, Erweitert, Hilfe & Support. Gewählter Bereich leuchtet violett, große Überschrift mit Symbol, kurze Erklärung unter den wichtigsten Zeilen.
- **Neu in den Einstellungen:** „App beim Start“ (Startseite, letzter Sender, Live TV, Filme oder Serien – ersetzt den Schalter „Letzten Sender beim Start“, die bisherige Wahl bleibt erhalten), „Automatisch nach Updates suchen“ (Android-App, einmal am Tag), „Zwischenspeicher leeren“ (Programmführer und Suche) und „Hilfe“. Nicht übernommen aus dem Entwurf: Puffergröße und feste Videoqualität SD/HD/4K – das kann der Player nicht steuern, ein Schalter ohne Wirkung wäre irreführend.
- **Filme & Serien:** kleinere Cover, sechs statt fünf pro Reihe (die Regel für die Größe griff vorher gar nicht – eine allgemeinere Regel weiter hinten gewann). Top 10 nur noch bei „Alle“, in einer Kategorie beginnt das Raster direkt oben. Kategorien links: schmaler, gewählte Kategorie violett hervorgehoben, gewählte Sprache oben wie ein Auswahlfeld (gilt auch für Live TV).
- **Startseite, Navigation:** Hoch aus den Reihen führt erst ins Titelbild, nicht gleich in die Menüleiste; beim Öffnen steht der Fokus auf „Jetzt ansehen“.
- **Übersetzungen:** 31 neue Texte in allen 13 Sprachen.
- **TV-Player (Fire TV, Android-Boxen) im Telvo-Design:** Bisher die Media3-Standardleiste (grauer Schleier über dem ganzen Bild, eckiger grüner Fokusrahmen). Jetzt Verlauf oben und unten, runde Glas-Knöpfe – der gewählte weiß mit dunklem Symbol –, violette Zeitleiste mit weißem Punkt, Abstand zum Bildschirmrand. Die Elemente werden zur Laufzeit über ihren Namen gesucht; fehlt eines in einer anderen Media3-Version, bleibt es Standard, und ein Fehler beim Gestalten hält den Player nie an.
- **Neu: Klang im TV-Player** (Einstellungen → Wiedergabe → Klang, Android-Geräte): „Lautstärke angleichen“ (leise Sender lauter, laute Werbung leiser), „Klare Sprache“ (Stimmen 1–4 kHz angehoben, Bässe etwas zurück) und „Nachtmodus“ (starke Angleichung). Umgesetzt mit der Android-Klangbearbeitung (DynamicsProcessing, ab Android 9) direkt am Ton des Players, mit Begrenzer gegen Übersteuern. Standard bleibt „Original“; ohne Klangbearbeitung auf dem Gerät oder bei Dolby-Ton direkt an die Soundbar bleibt der Ton unverändert. 9 neue Texte in allen 13 Sprachen.
- **Aus Gerätetest und Code-Durchsicht:** Titelbild wechselt nicht mehr hinter Details, Player oder Dialog (der Fokus sprang beim Zurückkommen in die Menüleiste); Fokus auf „Jetzt ansehen“ und auf dem gewählten Einstellungs-Bereich jetzt sichtbar; Ersatzkacheln ohne Titelbild ziehen den Fokus nicht mehr zurück; Titelbild filtert gesperrte Kategorien immer streng (auch direkt nach PIN-Eingabe, ohne Kategorienliste kein Titelbild); „Verlauf löschen“ (Live TV) leert auch „Top Sender“, Löschen von Person oder Playlist räumt „Top Sender“ und die Titelbild-Auswahl mit auf; ein Sender zählt nur einmal in 10 Minuten (der TV-Player meldet Start und Ende); „Zwischenspeicher leeren“ lädt den M3U-Programmführer sofort neu; Cover-Größe „Klein“/„Groß“ greift wieder; Kategorien links nicht mehr abgeschnitten. Zwei neue Tests.

- **Filme/Serien (Fernseher):** Rechts aus der Kategorienliste landete auf „Sortieren“ statt auf der ersten Kachel, sobald „Weiterschauen“ zu sehen war – „Sortieren“ sitzt dann in dessen Überschrift. Jetzt geht es direkt zur ersten Weiterschauen-Kachel.
- **Programmbeschreibungen:** Manche Anbieter liefern Zeilenumbrüche als Text, dann stand z. B. „Stacheldraht.\n\nManch ein …“ in der Live-Vorschau. Jetzt echte Absätze (im Programm-Fenster) bzw. ein Leerzeichen (in der kurzen Vorschau). Gilt für Xtream und XMLTV, auch für schon gespeicherte Programmdaten. Neuer Test.

## 1.13.4 – 2026-11-10 · Gerätetest Fire TV: Weiterschauen, Live-Vorschau, Umschalten, Bedienung

- **TV-Player, Live-TV: Umschalten mit hoch/runter funktionierte nicht.** Beim Start mit dem letzten Sender kannte der Player nur diesen einen Sender – jetzt startet er mit der ganzen Senderliste der Kategorie. Außerdem ging das Loslassen der Taste an die Bedienleiste, die sich dadurch einblendete; danach schaltete hoch/runter nicht mehr um (nur jeder zweite Druck wirkte). Bei Live-TV entfallen die Spulknöpfe ±5/15 s, ⏮/⏭ schalten den Sender.
- **TV-Player: „Nächste Folge“ (⏭) war mit dem Steuerkreuz nicht erreichbar.** Die Bedienleiste blendete sich nach 4 s aus, auch während man darin navigierte; in dieser Phase wurde RECHTS als „+30 s spulen“ abgefangen. Jetzt bleibt sie beim Navigieren offen.
- **Verbindung testen: „Server-Fehler HTTP 404“.** Gleiche Ursache wie bei der Live-Vorschau (Segmente landeten bei `http://localhost`).
- **Hilfe:** Fokus steht beim Öffnen direkt auf dem X (Schließen) statt ganz unten auf dem Webseiten-Link.
- **Sprachmenü:** Die schon gewählte Sprache nochmals wählen schließt das Menü. Die gewählte/fokussierte Sprache ist jetzt Glas statt einer grellen weißen Fläche.
- **Hinweis zu den Nutzungsbedingungen beim ersten Start:** eine kleine Zeile, 5 statt 9 Sekunden, ohne Überschrift „Gut zu wissen“.
- **Feedback:** nach dem Senden 30 Tage gesperrt; danach lässt sich die Bewertung nur mit Begründung ändern.
- **Player wählen:** Bei jeder Option stehen die passenden Geräte (Fire TV, Chromecast mit Google TV, Nvidia Shield, Mi Box, Handys …). Externe Player zusätzlich: Kodi, Nova Video Player, mpv.
- **Ähnliche Titel (Fernseher, Filmseite):** als Glas-Schublade unten – klappt mit dem Fokus hoch und nach oben wieder zu, statt die ganze Seite wie im Browser zu rollen.
- **Startbild:** Logo und „Telvo Player“ mit Ladeleiste, solange die App lädt (vorher leer). Startbildschirm-Grafik mit Namen.
- **Fire-TV-Kachel:** Banner auch an der Start-Activity (Fire TV zeigte sonst nur das kleine Logo); Banner mit „Telvo Player“ und lila Lichtschein.
- **Download-Seite für Downloader (Fernseher):** Größen richten sich nach der Bildschirmhöhe – passt jetzt auf einen Bildschirm.
- **„App beenden?“:** Fokus steht auf „Abbrechen“ – ein versehentliches OK beendet die App nicht mehr.
- **Live TV:** Nach dem Vollbild steht der Fokus in der Senderliste auf dem zuletzt geschauten Sender. Hinweis in der Vorschau passt zum TV-Player („OK öffnet den Sender im Vollbild“).
- **Datenschutz:** Capacitor schreibt keine Protokollzeilen mehr ins System-Log – dort standen vorher vollständige Stream-Adressen mit Benutzername und Token.
- **Übersetzungen:** Die 16 neuen Texte (Feedback-Sperre, Player-Auswahl, Live-Hinweis, Nutzungshinweis) gibt es jetzt in allen 13 Sprachen.

- **„Weiter bei …“ (Filme) und „Weiter: S… E…“ (Serien)** starteten im TV-Player (Fire TV, Android-Boxen) immer bei 00:00. Weil der Neustart dann bei wenigen Sekunden beendet wurde, war anschließend auch die gespeicherte Position weg. Ursache: Das Plugin las die Startposition mit `call.getLong()`. Capacitor gibt dort nur bei echten Long-Werten etwas zurück, Startpositionen unter ~24 Tagen kommen aber als Integer an – Ergebnis war immer 0. Jetzt `optLong()`, das jede Zahl übernimmt (der Schlaf-Timer liest seine Uhrzeit vorsorglich genauso). Gefunden beim Gerätetest auf dem Fire TV Stick 4K Max.
- **Live-Vorschau und eingebauter Player (Android-App) luden bei vielen HLS-Sendern nichts** (Dauer-Ladekreis). Ursache: CapacitorHttp leitet Anfragen über `http://localhost/_capacitor_http_interceptor_?u=…` um, und hls.js löste relative Pfade der Playlist gegen `http://localhost` auf (`Failed to connect to localhost/127.0.0.1:80`). Jetzt bekommt hls.js die echte Adresse zurück, Weiterleitungen werden vorab aufgelöst. Im App-WebView geprüft: vorher `levelLoadError` bei `http://localhost/…`, nachher lädt das Segment.

## 1.13.3 – 2026-11-10 · Layout für ältere Fernseher und Android-Boxen

- **Ältere Geräte ohne CSS-Grid** (Browser-Kern vor Chrome 57: LG-Fernseher bis 2019 / webOS 4.x, Samsung 2018,
  Android-Boxen mit nie aktualisiertem WebView): Bisher fiel dort das Layout zusammen – Startbildschirm mit einer Kachel
  je Zeile, Cover-Raster als eine große Fläche, PIN-Feld unbenutzbar, Menüleiste ohne Logo und Knöpfe. Jetzt steht vor
  jedem Grid ein Flexbox-Ersatz (gleiche Spezifität, Versteck-Regeln wirken weiter), und die App setzt beim Start
  `no-grid` bzw. `no-flexgap`, damit Spalten, Abstände und Zentrierung stimmen.
- Geprüft durch Nachbilden eines alten Browser-Kerns (CSS ohne Grid, gap, place-items, min()/max()/clamp(), inset,
  aspect-ratio, env()): 17 Bildschirme in 1920×1080 und 1280×720, Vorher-/Nachher-Vergleich, und eine automatische
  Überlappungsprüfung zeigt dieselben Ergebnisse wie im modernen Browser.

## 1.13.2 – 2026-11-10 · Ältere Geräte: Programm wird wieder angezeigt, Android-Versionsnummer

- **Ältere Android-Boxen und Fernseher** (Browser-Kern bis Chrome 57, z. B. LG-Fernseher bis 2019, Samsung 2018,
  günstige Boxen mit Android 6/7): Die laufende Sendung in den Senderlisten und das TV-Programm wurden dort nie
  geladen – die App wartete auf eine Angabe („isIntersecting“), die es dort noch nicht gibt. Jetzt mit Ersatzprüfung.
  Nachgestellt im Browser: vorher 0 von 14 Programmzeilen, jetzt 14.
- **Android-Versionsnummer:** In „Einstellungen → Apps“ stand bei jedem Kunden „1.0“, und der versionCode blieb 1.
  Jetzt folgt beides der App-Version (1.13.2 → versionCode 11302) – Voraussetzung für App-Stores und klarer im Support.
- Neuer Test für alte Geräte.

## 1.13.1 – 2026-11-10 · Gründlicher QA-Durchgang: Playlists, Player, Darstellung auf Handy/Tablet, Schutz der Datenbank

**Wichtigste Korrektur – Playlists:** Jede neu hinzugefügte Playlist (von Hand, über die Webseite oder aus einer Sicherung)
bekam bisher die Kennung der gerade aktiven Playlist. Folge: gemeinsame Favoriten, Verlauf und „Weiterschauen“, falsche
Zahlen auf dem Startbildschirm (z. B. „44 Sender“ bei einer M3U mit 3 Sendern), Wechseln/Löschen konnte die falsche
Playlist treffen. Ursache: zwei Funktionen hießen `uid()`. Neue Playlists bekommen jetzt eine eigene Kennung, und auf
betroffenen Geräten werden doppelte Kennungen beim Start automatisch repariert.

- **Zugang:** abgelaufener oder gesperrter Xtream-Zugang heißt „Playlist abgelaufen“ / „Zugang gesperrt“ statt
  „Konto-Status: Expired/Banned“. Erste Ablauf-Erinnerung 7 Tage vorher (vorher schon bei 30 Tagen – bei Monatszugängen
  gleich beim Einrichten). Fußzeile zeigt bei M3U „Playlist: Name“ statt „Benutzername: Name“.
- **Player:** Senderliste im Player schließt beim zweiten Druck, verdeckt nicht mehr Bedienknöpfe und Zurück-Knopf ·
  nicht vorhandener Stream (HTTP 404) wechselt nach unter 3 s aufs andere Format (vorher 18 s „Verbindung wird
  wiederhergestellt“), gibt es beide nicht: „Der Stream ist nicht erreichbar.“ statt Hinweis auf RAW-Sender · Hochformat:
  Senderliste, Favorit, Letzter Sender sind wieder da (vorher ausgeblendet) · hochformatige Senderlogos bleiben im Rahmen ·
  Pause-Bildschirm ohne doppelten Sendernamen.
- **Live TV:** Zähler „Favoriten“/„Zuletzt gesehen“ aktualisieren sich sofort · „Alle Sender“ zählt gesperrte Kategorien
  nicht mit · Senderlogos ohne Bild zeigen die Anfangsbuchstaben auch bei arabischen, kyrillischen, griechischen Namen ·
  Logo-Adressen wie „javascript:“ werden nicht geladen · TV-Programm: letzte Zeilen lassen sich über das Vorschaufenster
  scrollen.
- **Serien:** Folgennamen ohne Seriennamen und „S01E02“ auch, wenn die Serie in der Liste anders heißt („Verloren“ statt
  „DE - Dark (2017) - S02E05 - Verloren“).
- **Handy & Tablet:** Suche im Hochformat erscheint im Bild (vorher außerhalb) · Startbildschirm-Kopfzeile überdeckt das
  Logo nicht mehr · gewählte Kategorie bei Filmen/Serien lesbar · Benutzer-Knopf (Profilbild) auf dem Handy quer wieder
  sichtbar · Tablet: Statusanzeigen, „Favoriten“ und Fußzeile nicht mehr abgeschnitten, Hochformat-Layout bis 900 px.
- **Fernbedienung:** in Filme/Serien springt „Rechts“ aus den Kategorien auf das erste Cover (vorher auf „Sortieren“).
- **Sonstiges:** „App beenden?“ erscheint im Browser nicht mehr (ließ sich dort nicht ausführen) · „Über & Updates“ zeigt
  die Version einmal · kein Ladefehler `webapis.js` mehr außerhalb von Samsung-Fernsehern · „Problem melden“ und Feedback
  nutzen den sicheren App-Schlüssel (gehen auch, wenn jemand den KEY durch Fehlversuche gesperrt hat).
- **Webseite:** „Gerät verbinden“ setzt den Cursor ins MAC-Feld · MAC-Feld: Cursor springt nicht mehr ans Ende,
  Rücktaste hinter „:“ wirkt, „MAC: AA:BB:…“ lässt sich einfügen · leerer Name beim Bearbeiten behält den alten ·
  „Anderes Gerät“ leert das Support-Formular · ohne Internet neu geladen bleibt das Gerät gemerkt · Handy: Editor-Überschrift
  nicht mehr unter der Kopfzeile, Knöpfe mindestens 44 px · Arabisch: lateinische Playlist-Namen vom Anfang her ·
  Dateigröße in der Sprache der Seite (z. B. „МБ“).
- **Verwaltung:** E-Mail-Prüfung lässt keine zusätzlichen Empfänger (`?bcc=`) mehr in Antwort-Links · Fokus nach
  „Gerät löschen“ im Suchfeld · Knöpfe auf dem Handy 44 px.
- **Datenbank – neue Datei `server/schutz-2026-11.sql` (einmal im Supabase SQL-Editor ausführen):** Grenzen je
  Internetverbindung und insgesamt für neue Geräte, Support-Nachrichten und Bewertungen (vorher nur je Gerät – mit
  ausgedachten MACs unbegrenzt), Obergrenze für den Speicher aller Sicherungen, Playlist-Adressen nur mit http(s)://,
  Support mit App-Schlüssel (`app_send_support`), keine Rechte mehr an der Zählfolge des Protokolls. Test:
  `tests/sql/schutz.test.sql`.
- Neue Tests: eigene Kennung je Playlist und Reparatur, Folgennamen, Anfangsbuchstaben in allen Schriften, Kontostatus.

**Ebenfalls in 1.13.1 – Durchsicht vor dem ersten Test:**

- **Korrekturen nach Durchsicht (Player):** schnelles Umschalten meldet nicht mehr fälschlich „Der Sender stockt“ ·
  Hoch/Runter schaltet direkt nach einem Senderwechsel weiter (vorher nur einmal) · Zurück bricht eine angefangene
  Sendernummer ab · die automatische Live-TV-Vorschau zählt erst als „gesehen“, wenn man den Sender wählt (sonst startete
  er beim nächsten App-Start im Vollbild) · ausgeblendete Sender laufen nicht mehr in der Vorschau · kein Fehlereintrag
  mehr bei jedem Schließen · offene Senderliste wird beim Schließen sauber beendet · nach der stummen Film-Vorschau
  wartet der Start kurz (Zugänge mit nur einer Verbindung).
- **Android-TV-Player:** kein Absturz mehr beim Öffnen großer Senderlisten · hängender Sender versucht es nicht endlos,
  sondern wechselt nach 3 Versuchen auf das andere Format bzw. zeigt „Wiedergabe nicht möglich“ · endet ein .ts-Sender,
  wird neu verbunden statt zum nächsten Sender zu springen · Stream wird beim Schließen sofort beendet · Media3-Version
  wird auch bei „android:aktualisieren“ angeglichen.
- **Weitere Korrekturen:** Status-Hinweis bleibt nicht mehr stehen · Zurück schließt das Sortier-Menü (auch Android) und
  aufgeklappte Einstellungen · „Ähnliche Titel“ auch bei arabischen/kyrillischen/griechischen Titeln · abgelaufener
  Zugang heißt „Playlist abgelaufen“ statt „gesperrt“ · abgelehnte Bewertung wird angezeigt statt „geändert“ ·
  Wetter: kein veraltetes oder falsches Wetter nach Ortswechsel, Ort nicht mehr in der Online-Sicherung.
- **Datenbank:** `server/bewertung-2026-11.sql` erneut ausführen – höchstens 10 Änderungen je 24 Stunden (vorher für immer
  gezählt), `app_get_rating` funktioniert. Neuer Test `tests/sql/bewertung.test.sql`.
- **Downloads heißen jetzt Telvo:** `telvo-player.apk`, `telvo-player-setup.exe` und `telvo-player-mac.dmg` statt
  „lumio-player…“ – auf der Webseite, der Downloader-Seite (Code 5619512) und bei „Neue Version laden“ in der App.
  Jeder Bau legt dieselbe Datei zusätzlich unter dem alten Namen ab, damit ältere App-Versionen und alte Links
  weiterhin die neueste Version bekommen. Bis die erste Telvo-Datei auf GitHub liegt, verlinkt die Webseite die alte.

## 1.13.0 – 2026-11-10 · Live-Vorschau, neue Film-/Serienseite, ruhigerer Live-Player, Wetter neben der Uhr

- **Hinweis beim ersten Start** jetzt klein unten statt als Fenster: „Gut zu wissen – Telvo ist nur ein Player ohne eigene
  Sender …“ mit Link zu den Nutzungsbedingungen (auf dem Fernseher die Adresse). Verschwindet nach 9 Sekunden von selbst
  (Balken zeigt die Zeit) oder per Klick, blockiert nichts und erscheint nur einmal je Fassung der Bedingungen.
- **Sprachauswahl** oben rechts kompakt in zwei Spalten – alle 14 Sprachen auf einen Blick, ohne Scrollen; gewählte Sprache
  lavendelfarben. Auf dem Handy als Karte statt Vollbild. (Drei Varianten verglichen: Liste, 2 und 3 Spalten.)
- **Playlist von Hand einrichten:** Knopf „Zurück“ oben in der Karte.
- **Einstellungen neu als Liste:** alles untereinander, Auswahl klappt direkt am Punkt auf, Erklärtext klein daneben;
  An/Aus und Zwei-Wege-Auswahlen (z. B. 24 h / 12 h) schalten direkt in der Zeile. „Verlauf löschen“ als ein Knopf –
  wählbar je Bereich, voreingestellt alles. Kindersicherung am PC ohne überlappende Schrift.
- **Benutzer statt „Personen“**, mit Profilbildern (12 Symbole); Buchstabe im Profilkreis mittig. Sprache oben nur noch
  als Flagge, sobald eine gewählt ist.
- **Startbildschirm & Menü:** Reiter oben mit fester Größe und ohne Zahlen, Hover nur auf dem berührten Reiter (auch
  Home und Favoriten). Kein Knopf-Hinweis mehr beim ersten Abspielen. „Zuletzt angesehen“-Bilder zeigen die Gesichter.
- **Suche** mit „Suchen in: Alle · Filme · Serien · Live TV“, verdeckt den Home-Knopf nicht mehr. Sortieren bei Filmen
  und Serien klappt am Knopf auf. „Daten neu laden“ im neuen Stil.
- **Live TV:** Beim Öffnen läuft der zuletzt gesehene Sender sofort klein im Vorschaufenster (abschaltbar). Im breiten
  PC-Fenster teilen sich Senderliste und Vorschau den Platz. „Radio“ zeigt nur echte Radiosender (TV-Sender in
  gemischten Kategorien fallen raus; Kennzeichnung des Anbieters wird genutzt). „Letzten Sender beim Start“ ist
  voreingestellt an – startet aber nicht nach einem Neustart aus der App heraus (z. B. Sprache gewechselt).
- **Film-/Serienseite:** runder X-Knopf · Jahreszahl nicht mehr im Titel (steht darunter) · Folgen ohne Serienname und
  „S01E02“ davor · Platzhalter-Dauer (überall „01:00:00“) wird ausgeblendet, echte Dauer als „45 Min.“ · Staffeln als
  Glas-Leiste mit Folgenzahl, Folgen mit Nummer, Play-Symbol, „Als Nächstes“ / „Noch 12 Min.“ · „Ähnliche Titel“ ohne
  doppelte 4K/HD-Versionen, mit Kategorie · Vorschau im Kopfbild: nach 2,5 s läuft stumm ein Ausschnitt (MP4/WebM,
  höchstens 1 Minute, stoppt sofort beim Abspielen; abschaltbar).
- **Player:** Zahnrad, Ton & Untertitel und Schlaf-Timer schließen beim zweiten Druck. Stumm schiebt den Regler auf 0,
  Ton an springt zurück auf die eingestellte Lautstärke. Senderwechsel ohne Karte in der Mitte – oben links Logo,
  Nummer, Name und laufende Sendung. Live ohne „Aufholen“ (vorher lief es kurz zu schnell und hakte dann, z. B. bei
  RAW-Sendern); stockt ein Sender öfter, nimmt der Player mehr Puffer. Android-TV-Player: Live nie beschleunigt,
  rohe TV-Signale (.ts) robuster, nach Hängern mehr Vorrat.
- **Status oben/unten** zeigt Probleme (Internet langsam, Wiedergabe gestört, Playlist läuft bald ab / abgelaufen /
  gesperrt). Beim Drüberfahren Grund und Zahlen (Geschwindigkeit, Fehler, Puffer, verlorene Bilder, Laufzeit,
  Verbindungen …); auf dem Fernseher per OK.
- **Bewertung** einmal pro Gerät, später änderbar (Sterne sind vorausgewählt). Neue Datei
  `server/bewertung-2026-11.sql` (einmal im Supabase SQL-Editor ausführen) – bis dahin gehen die Sterne wie bisher als
  Feedback-Nachricht ein.
- **Keine Texte mit „IPTV“ oder „Anbieter“** mehr – weder in der App (14 Texte, alle Sprachen) noch auf der Webseite
  (Startseite, Hilfe, Datenschutz, Nutzungsbedingungen, alle 14 Sprachen) und in den Store-Texten.
- **Neben der Uhr:** Symbol für die Tageszeit (Sonnenaufgang, Sonne, Sonnenuntergang, Mond) – auf Wunsch echtes Wetter
  mit Temperatur (Ort unter Einstellungen → Darstellung wählen; Open-Meteo, ohne Konto). Datenschutzerklärung ergänzt.
- **Bildschirmschoner** mit „Wusstest du schon?“-Tipps.
- Neue Tests (Titel ohne Jahr, Folgennamen, Dauer, Radio-Erkennung).

## 1.12.0 – 2026-11-10 · Neuer Startbildschirm, Profi-Player, Personen und neue Webseite

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

**Filme & Serien:**
- **Als gesehen markieren:** jede Folge mit eigenem Häkchen, ganze Staffel mit einem Knopf, Filme in der Detailansicht.
- **Staffel-Fortschritt** direkt auf den Staffel-Knöpfen („Staffel 1 · 5/8“, Häkchen wenn fertig).
- **Nächste Folge unter „Weiterschauen“:** ist eine Folge zu Ende, steht die nächste dort bereit (auch auf dem Startbildschirm).
- **„Neue Folgen“** auf dem Poster, wenn der Anbieter seit dem letzten Schauen Folgen ergänzt hat.
- **Sortieren:** wie beim Anbieter, Neueste, A–Z, Beste Bewertung, Jahr – für Filme und Serien getrennt gemerkt.
- **„Gesehene ausblenden“** im selben Menü.

Die neuen Daten gehören zum Profil, werden mitgesichert und von „Verlauf löschen“ entfernt.

**Webseite im Stil der App** (alle Seiten):
- **Menü als Glas-Leiste** in der Mitte wie die Reiter der App; der gewählte Bereich ist farbig hinterlegt
  (Start Lavendel, Playlists Himmelblau, Download Sand, Hilfe Rosé). Sprachknopf, Knöpfe und Felder im gleichen Glas.
- **Startseite:** Abbild des neuen Startbildschirms (Glas-Kacheln, Radio, Favoriten, „Zuletzt angesehen“) mit dem Player im
  Bild-in-Bild davor; neuer Abschnitt **„Der neue Player“** mit Abbild des Players (Glas-Dock, Auswahl „Bild &
  Wiedergabe“) und den Funktionen als Chips; „Was die App kann“ in Pastellfarben mit neuen Punkten (Verpasste Sendungen,
  Erinnerungen, Personen & Kinderprofil, Sichern & Wiederherstellen). Auf dem Handy kompakt (Symbol neben dem Text).
- **Playlists, Download, Hilfe:** Glas-Karten, Symbole in Pastell, Downloader-Code als lavendelfarbene Tasten, Mini-Fernseher
  mit dem neuen Startbildschirm, Umschalter M3U/Xtream wie in der App.
- **Impressum, Datenschutz, Nutzungsbedingungen:** Inhalt auf einer Glas-Karte, Zurück als Glas-Knopf, Überschriften mit
  Lavendel-Akzent. **404-Seite**, **Download-Seite für Fernseher** und **Verwaltung** im gleichen Stil.
- 29 neue Texte in allen 13 Sprachen (Wörter aus der App übernommen, damit beides gleich heißt); Arabisch gespiegelt geprüft.

**Player – drei neue Feinheiten:**
- **Knopf-Hinweis beim ersten Mal:** Eine Glas-Karte zeigt einmal alle Symbole mit ihrem Namen (nur die Knöpfe, die
  gerade da sind). „Verstanden“, Zurück oder Tippen aufs Bild schließt sie; danach erscheint sie auf dem Gerät nicht mehr.
- **Großes Senderlogo beim Umschalten:** Logo groß in der Mitte, darunter Nummer, Name und laufende Sendung – drei
  Sekunden lang; ohne Logo die Anfangsbuchstaben. Der Lade-Kreis rückt so lange darunter.
- **Pause-Bildschirm:** Steht das Bild 6 Sekunden auf Pause, erscheinen über dem abgedunkelten Bild Titel, Jahr,
  Bewertung, Genre, Restzeit und Beschreibung (Filme laden fehlende Angaben nach; Folgen mit Serie und Folgenname; Live
  mit Sendung, Uhrzeit und Beschreibung aus dem Programm). Jede Taste, Maus oder Tippen blendet ihn aus, Abspielen spielt
  gleich weiter.

**Player im Glas-Stil** (wie Menüleiste, Einstellungen und Live TV), mit deutlich weniger Text:
- **Oben:** rundes Zurück, Senderlogo, Titel (bei Serien: Serie groß, darunter „S1 E1 · Folgenname“), kleine Chips für
  LIVE (mit pulsierendem Punkt) und Bildqualität (720p, 1080p, 4K), rechts die Uhrzeit.
- **Unten:** Sendung mit Uhrzeit-Chip, „Danach“ als Pfeil statt Wort, schmaler lila Balken; die Knöpfe sitzen in zwei
  Glas-Kapseln und zeigen nur Symbole – der Name erscheint beim Auswählen mit der Fernbedienung oder mit der Maus.
  Aktive Knöpfe sind getönt (Schlaf-Timer lila, Favorit rosé).
- **Auswahl** (Bild & Wiedergabe, Ton & Untertitel, Schlaf-Timer) als Glas-Karte mit Chips statt langer Listen:
  kurze Namen (Strecken, Zoom, Auto, +300 ms), eine Wahl wirkt sofort und die Karte bleibt offen; ohne Bedienung blendet
  sie sich nach ein paar Sekunden aus. Tippen aufs Bild schließt sie.
- **Spurnamen kürzer:** steht im Stream nur die Sprache („English“), zeigt die App nur „Englisch“; Zusätze bleiben.
- Senderwechsel-Hinweis, „Nächste Folge“, Senderliste und „Verpasste Sendungen“ im gleichen Glas.

**Player – Profi-Steuerung:** Das Zahnrad im Player („Bild & Wiedergabe“) zeigt nur, was der Stream wirklich kann:
- **Bildformat:** Original, 16:9, 4:3, Vollbild (strecken), Zoom (Bild füllen).
- **Geschwindigkeit** 0,5× bis 2× bei Filmen und Folgen (bei Live TV nicht angeboten).
- **Qualität** (Automatisch, 1080p, 720p …), wenn ein HLS-Stream mehrere Stufen hat.
- **Ton verzögern** (100–800 ms), wenn der Ton dem Bild vorauseilt – nur bei Streams, die die App selbst puffert
  (HLS, MPEG-TS); bleibt beim Umschalten erhalten, „Aus“ stellt den normalen Ton wieder her.
- **Nächste Folge automatisch** an/aus (auch unter Einstellungen → Wiedergabe). Aus: Am Ende fragt die App nur.
- **Tonspur und Untertitel** wie bisher über den eigenen Knopf, der nur bei mehreren Spuren erscheint.
Neu im Player: Knopf **„Nächste Folge“** bei Serien und **Bild-in-Bild** – Film oder Sender läuft klein in der Ecke
weiter, während man durch Telvo geht (auch beim Wechsel der Reiter). Die Knopfleiste passt sich dem Platz an: bei
vielen Knöpfen nur Symbole (Name erscheint beim Auswählen), auf dem Handy hochkant zweizeilig. „Letzter Sender“ hat ein
eigenes Symbol. Android-TV-Player: „Nächste Folge automatisch“ gilt auch dort (aus: am Ende der Folge zurück zur Serie, die nächste
Folge ist markiert). Neuer Test.

**Neue Menüleiste:** in der Mitte eine Glas-Leiste mit Herz (Favoriten) · Live TV · Filme · Serien · Haus (Start).
Der gewählte Reiter ist farbig hinterlegt (Lila, Sand, Himmelblau, Rosé) und zeigt die Anzahl; Einstellungen und Profil
oben rechts im gleichen ruhigen Lila. Auf dem Handy dieselben Farben in der Leiste unten bzw. links.

**Profil neu** (wie die Einstellungen): Bereiche Mein Zugang, Personen (mit einem Druck wechseln), Dieses Gerät
(MAC/KEY, neuer KEY, QR-Code zur Webseite) und bei M3U Programmführer.

**Ruhigere Farben** in Einstellungen und Profil (Lavendel, Rosé, Himmelblau, Sand, Salbei), dezenteres Leuchten.

**Einstellungen neu aufgebaut** (wie Filme, Serien und Live TV): links fünf Bereiche – Playlist, Personen & Kindersicherung,
Wiedergabe, Darstellung, Gerät & Hilfe – jeder mit eigener Farbe; rechts die Kacheln des Bereichs im Glas-Look.
Mit der Fernbedienung genügt es, auf einem Bereich stehen zu bleiben; die App merkt sich den zuletzt offenen Bereich.

**Neu: Personen (Familienprofile):** bis zu 6 Personen pro Gerät, jede mit eigenen Favoriten, Verlauf, „Weiterschauen“,
„Später ansehen“ und Erinnerungen. Beim Start „Wer schaut?“, oben auf dem Startbildschirm der Personen-Knopf, verwalten
unter Einstellungen → Personen. **Kinderprofil:** gesperrte Kategorien (Erwachsene und selbst gesperrte) sind ganz ausgeblendet
und lassen sich nicht entsperren; Wechseln in ein anderes Profil, Einstellungen und Playlists nur mit der PIN der
Kindersicherung. Personen werden mitgesichert (Datenschutzerklärung ergänzt), beim Löschen verschwinden ihre Daten.

**Neu:**
- **Schlaf-Timer** (15 Min. bis 2 Std.) im Player und unter Einstellungen → Wiedergabe – beendet auch den Android-TV-Player.
- **Senderliste im Player:** Pfeil links (oder Knopf „Senderliste“) blendet die Sender mit laufender Sendung ein.
- **„Später ansehen“:** eigene Merkliste für Filme und Serien (Knopf auf der Detailseite, Liste links bei Filme/Serien);
  fertig geschaute Filme verschwinden von selbst.
- **Verbindungstest** (Einstellungen → Darstellung & Gerät): Antwortzeit des Anbieters und Geschwindigkeit mit Einschätzung
  SD/HD/Full HD/4K. Das letzte Ergebnis steht in „Problem melden“.
- **Bildschirmschoner** (Aus/5/10/15/30 Min., voreingestellt 10): Uhr und wechselnde Poster, die Uhr wandert (OLED).
  Die erste Taste beendet ihn nur.
- Sprachauswahl: Überschrift nur noch in der eingestellten Sprache („Sprache“ statt „Sprache / Language / Dil“).
- Filme/Serien: „Sortieren“ steht in der Zeile „Weiterschauen“ – keine leere Zeile mehr über den Covern.
- Serien: Knopf „Trailer“ steht jetzt direkt hinter „Weiter“ (vor „Merken“).
- **„Trailer suchen“:** Liefert der Anbieter keinen Trailer, öffnet der Knopf die YouTube-Suche „Titel Jahr Trailer“
  (Android: YouTube-App, PC: Browser; Anbieter-Zusätze wie „DE -“ oder „4K“ fallen weg). Auf Samsung/LG nicht verfügbar.
- „Alle …“ zählt nur noch sichtbare Kategorien (ausgeblendete und im Kinderprofil gesperrte nicht mehr).

**Live TV:**
- **Lila statt Rot** wie auf dem Startbildschirm, Vorschau und Programm im Glas-Look (die LIVE-Abzeichen bleiben rot).
- **Laufende Sendung bei jedem Sender** mit kleinem Fortschrittsbalken. Bei Xtream wird sie nur für die Sender geholt, die gerade
  zu sehen sind (höchstens 3 Anfragen gleichzeitig).
- **Sendernummer eintippen:** Ziffern auf der Fernbedienung (oder Tastatur) – der passende Sender erscheint sofort oben rechts,
  nach kurzer Pause oder mit OK wird umgeschaltet. Auch im Android-TV-Player.
- **Letzter Sender:** Knopf im Player, Taste „Vorheriger Sender“ (Samsung, Android TV) oder L auf der Tastatur.
- **TV-Programm:** neues Raster (Sender untereinander, Uhrzeit nebeneinander, 12 Stunden, lila Linie = jetzt) für die gerade
  gewählte Liste – oben in der Kategorienliste. OK auf laufender Sendung schaut den Sender, auf kommender Sendung „Erinnern“.
- **Erinnerungen:** auch rechts bei den kommenden Sendungen (Glocke). Eine Minute vor Beginn kommt ein Hinweis mit „Umschalten“.

**Neuer Startbildschirm** (nach Vorlage): oben Logo, Status (Internet, Player, „Playlist aktiv“) und Knöpfe für Suche,
Aktualisieren, Einstellungen, Hilfe und Sprache. Live TV (lila), Filme (orange) und Serien (blau) als große Glas-Kacheln mit
Leuchtwelle, rechts **Radio** (neu) und Favoriten. Unten „Zuletzt angesehen“ als breite Bildkarten mit Restzeit bzw. Staffel/Folge
und Fortschritt, dazu „Alle anzeigen“ – ist nichts angefangen, fehlt der Bereich und die Kacheln werden etwas größer und stehen mittig. Laufzeit der Playlist steht unten in der Fußleiste.
**Neu: Radio** – sammelt alle Sender aus Radio-Kategorien (Radio, Radyo …) in einer eigenen Liste unter Live TV.
Folgen bekommen das Hintergrundbild ihrer Serie (für die breiten Karten).

**Status immer sichtbar:** Internet, Player und Playlist stehen nach dem Einrichten klein unten in der Fußleiste neben
MAC und KEY (grün = in Ordnung, rot = kein Internet) – vorher nur auf der Willkommensseite.

**Sprachauswahl mit Flaggen:** Der Knopf oben rechts zeigt Flagge und gewählte Sprache. Die Liste klappt direkt darunter auf,
Englisch und Deutsch stehen ganz oben, danach die übrigen Sprachen. Gleiche Reihenfolge in den Einstellungen.

**Behoben:** Quadratische Senderlogos wurden in der Senderliste und bei den Favoriten unten abgeschnitten.

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
