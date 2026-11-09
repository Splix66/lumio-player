# Telvo Player (App) – Bestandsaufnahme (09.11.2026)

Geprüft: `www/` (App für alle Geräte), `platforms/android/java/` (TV-Player), `desktop/` (Windows/Mac),
`server/*.sql` (Online-Dienst). Methode: zwei unabhängige Code-Prüfungen (Fehler/Robustheit, Sicherheit/Datenschutz),
Fehler im Testbrowser nachgestellt, Bedienung und Leistung selbst getestet (Fernseher 1920×1080, Handy, 60.000 Einträge).

## Gesamturteil

Technisch solide und deutlich über dem Durchschnitt vergleichbarer IPTV-Player:
- **Kein Einfallstor für eingeschleusten Code (XSS):** Sendernamen, Programmführer und Anbieterdaten werden nie als HTML eingesetzt.
- **Läuft auf alten Fernsehern:** reines ES5 (geprüft mit acorn), neuere Funktionen nur mit Prüfung.
- **Sehr schnell mit großen Playlists:** 60.000 Einträge (7,3 MB) in 2,3 s eingelesen (Prozessor 4-fach gedrosselt),
  „Alle 30.000 Sender“ in 0,6 s, 25 MB Arbeitsspeicher – die Listen bauen nur sichtbare Zeilen.
- **Datenbank gut abgesichert:** Tabellen gesperrt, nur geprüfte Funktionen, keine SQL-Einschleusung möglich.
- **Design:** hochwertig und einheitlich auf Fernseher, Handy und PC.

## Behoben (09.11.2026) – mit automatischen Tests (`tests/robust.test.js`)

| # | Fehler | Folge vorher |
|---|---|---|
| 1 | Download ohne Zeitlimit für die Übertragung | App hing endlos auf „Playlist wird aktualisiert …“, Zurück ging nicht |
| 2 | Kindersicherung umgehbar | Gesperrte Sender über Favoriten / Zuletzt gesehen / Weiterschauen ohne PIN abspielbar |
| 3 | Löschen offline | Gelöschte Playlist kam beim nächsten Abgleich zurück |
| 4 | Langsame Upload-Antwort | Jede Synchronisierung legte eine weitere Kopie an |
| 5 | Abgelaufener Xtream-Zugang | Erschien als leere Playlist, „Alles aktuell!“, Zahlen auf 0 überschrieben |
| 6 | Playlist-Wechsel während des Ladens | Zahlen der einen Playlist bei der anderen gespeichert |
| 7 | Playlists in Latin-1 | Umlaute als „�“ |
| 8 | Schnelles Umschalten / Windows-Mac-Links | Zwei Videoplayer gleichzeitig; Links öffneten doppelt |
| – | Hintergrund-Logo | Querbalken des neuen „T“ sah wie ein grauer Fehlerbalken aus |

## Erledigt nach Entscheidung (09.11.2026)

- **E1 → (a) umgesetzt:** Playlists aus der App gehen nur noch online, wenn „Auch auf der Webseite verwalten“
  eingeschaltet ist (beim Anlegen, Voreinstellung aus; je Playlist „Webseite: an/aus“ in der Übersicht).
  Datenschutzerklärung entsprechend korrigiert.
- **Datenbank – `server/sicherheit-2026-11.sql`** (vom Inhaber in Supabase auszuführen), getestet gegen PostgreSQL 16:
  - D1: Fehlversuche lückenlos gezählt (40 gleichzeitige Angriffe: vorher 1 gezählt, jetzt Sperre),
    richtiger KEY setzt nicht mehr zurück – höchstens 20 Versuche pro Stunde.
  - D2: App gleicht über eigenen 128-Bit-Token ab → kein Aussperren der App durch Fremde mehr.
    Ohne eingespieltes Update arbeitet die App automatisch wie bisher.
  - D3: „Neuen KEY erzeugen“ auf der Profilseite der App; Funktion zum Löschen eines Geräts vorhanden.
  - D4: tägliches Aufräumen (pg_cron): erledigte Support-Nachrichten nach 30 Tagen, Geräte nach 12 Monaten,
    Admin-Protokoll nach 12 Monaten. Datenschutzerklärung angepasst.
  - Automatischer Test `tests/sql/run.sh` (GitHub „Datenbank testen“) – schlägt gegen die alte Datenbank nachweislich fehl.
- Bewusst nicht geändert: D5 (gleiche Meldung für „Gerät unbekannt“ und „KEY falsch“) – die hilfreiche Meldung für
  Kunden wiegt schwerer; MAC-Adressen sind zufällig und nicht durchprobierbar. D6 (Verschlüsselung in der DB) bleibt offen.

## Offen – nur App, ohne Entscheidung machbar

- ✅ A1 (erledigt: stabile Kennung aus Adresse + Name, einmalige Umstellung gespeicherter Favoriten/Verlauf/Häkchen über die Adresse; Einlesen von 60.000 Einträgen auf langsamer Box +0,2 s). M3U-Einträge waren über ihre Position nummeriert: kommt ein Sender oben dazu, rutschen Favoriten/„Weiterschauen“
  auf falsche Titel. Lösung: Kennung aus Adresse/Name (mit Übernahme bestehender Favoriten).
- ✅ A2 (erledigt). TV-Player auf Android-Boxen bekam bis zu 1.500 Einträge auf einmal übergeben – nahe an der Android-Grenze
  von 1 MB (Absturz möglich). Lösung: nur die Nachbarn (± 100) übergeben.
- ✅ A3 (erledigt: fest eingebaut, Versionen festgelegt, Prüfsumme gegen Manipulation – getestet). Video-Bibliotheken wurden notfalls aus dem Internet (jsDelivr) nachgeladen, ohne Versionsbindung und Prüfsumme;
  mpegts.js immer. Lösung: alle Bibliotheken fest einbauen, Versionen festlegen.
- A4. QR-Code: KEY steht im Adressteil, den Server protokollieren. Lösung: hinter „#“ (Webseite anpassen).
- A5. Datenschutz: tägliche Update-Prüfung über api.github.com und YouTube-Trailer nicht erwähnt.
- A6. Windows/Mac: `webSecurity: false` (abgeschaltete Browser-Schutzregel) – nötig für manche Anbieter, aber riskant;
  besser gezielt freigeben.
- A7. App ohne Sicherheitsregel (CSP) wie die Webseite.
- A8. Ungenutzter Code „Weiter wo du warst“ (`Last`) – anschließen oder entfernen.

## Bewusst unverändert

- Der aktive Reiter (Live TV / Filme / Serien) sitzt absichtlich tiefer und größer (Gestaltungsentscheidung im Code).
- Unverschlüsselte Verbindungen (http) zu Anbietern sind bei IPTV üblich und nötig.
