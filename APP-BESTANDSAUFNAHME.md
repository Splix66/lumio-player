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

## Offen – Entscheidung nötig

**E1. Automatisches Hochladen von Zugangsdaten (Datenschutz, wichtigster Punkt).**
Trägt jemand eine Playlist direkt in der App ein, lädt die App sie samt Passwort in die Online-Datenbank hoch
(damit sie auf der Webseite erscheint) – ohne Hinweis und ohne Abschaltmöglichkeit. Die Datenschutzerklärung sagt
das Gegenteil („nur lokal auf deinem Gerät“). Optionen:
- **(a) Empfohlen:** Hochladen nur nach Zustimmung – Schalter „Auch auf der Webseite verwalten“ beim Anlegen (aus).
- (b) Weiter automatisch, aber deutlicher Hinweis + Abschaltmöglichkeit, Datenschutzerklärung anpassen.
- (c) Gar nicht mehr hochladen – Webseite zeigt nur Playlists, die dort angelegt wurden.

## Offen – braucht Änderung in der Datenbank (Supabase, SQL vom Inhaber ausführen)

- **D1. Schutz gegen Durchprobieren von Schlüsseln lückenhaft:** gleichzeitige Fehlversuche zählen nur einfach,
  und jeder erfolgreiche Abgleich der App setzt den Zähler zurück. Wer eine MAC kennt, kann den 6-stelligen KEY in
  absehbarer Zeit erraten. Lösung: Zähler atomar, Zeitfenster statt Zurücksetzen, Begrenzung pro IP.
- **D2. Fremde können ein Gerät dauerhaft aussperren** (eine falsche Eingabe pro Stunde genügt). Lösung: eigener,
  langer Geräteschlüssel nur für die App; der 6-stellige KEY bleibt für die Webseite.
- **D3. KEY nicht erneuerbar, Online-Daten nicht aus der App löschbar** („Alles zurücksetzen“ löscht nur lokal).
- **D4. Aufbewahrung:** Datenschutz verspricht Löschen erledigter Support-Nachrichten – technisch nicht umgesetzt;
  inaktive Geräte bleiben für immer. Lösung: automatische Löschung (pg_cron) oder Text anpassen.
- D5. Unterschiedliche Meldung für „Gerät unbekannt“ und „KEY falsch“; unbegrenzt viele Geräte anlegbar.
- D6. Zugangsdaten liegen lesbar in der Datenbank (bekannt, siehe README); Verschlüsselung mit Supabase Vault möglich.

## Offen – nur App, ohne Entscheidung machbar

- A1. M3U-Einträge sind über ihre Position nummeriert: kommt ein Sender oben dazu, rutschen Favoriten/„Weiterschauen“
  auf falsche Titel. Lösung: Kennung aus Adresse/Name (mit Übernahme bestehender Favoriten).
- A2. TV-Player auf Android-Boxen bekommt bis zu 1.500 Einträge auf einmal übergeben – nahe an der Android-Grenze
  von 1 MB (Absturz möglich). Lösung: nur die Nachbarn (± 100) übergeben.
- A3. Video-Bibliotheken werden notfalls aus dem Internet (jsDelivr) nachgeladen, ohne Versionsbindung und Prüfsumme;
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
