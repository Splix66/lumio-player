# Telvo-Webseite – Bestandsaufnahme (09.11.2026)

Ausgangsstand: Commit `da2e142` (Version 1.10.0, `main`). Dieses Dokument liegt bewusst **nicht** in `docs/`,
damit es nicht über GitHub Pages veröffentlicht wird.

## 1. Was gehört zur Webseite?

Die Webseite ist der Ordner `docs/` und wird über GitHub Pages unter `https://splix66.github.io/lumio-player/`
ausgeliefert – **automatisch aus `main`**. Alles, was nur auf einem Arbeits-Zweig liegt, ist nicht öffentlich.

| Datei | Inhalt |
|---|---|
| `docs/index.html` (123 KB) | Die ganze Webseite in einer Datei: Startseite, Kundenportal („Playlist hochladen“), Download, Hilfe & Support – inkl. CSS, Übersetzungen (DE/EN/TR) und Programmlogik |
| `docs/app/index.html` | Kurzseite für die Downloader-App (Fire TV): startet den APK-Download nach 2 Sekunden |
| `docs/admin.html`, `admin.css`, `admin.js` | Verwaltungsbereich (Support-Postfach, Geräte, Kennzahlen, Protokoll), Anmeldung über Supabase |
| `docs/impressum.html`, `datenschutz.html`, `legal.css` | Rechtstexte |
| `server/supabase.sql`, `server/admin.sql` | Datenbank (Supabase): Tabellen gesperrt, Zugriff nur über geprüfte Funktionen |

Es gibt kein separates Webseiten-Repository – alles liegt in `Splix66/lumio-player`.

## 2. Wie hängt alles zusammen?

```
App (TV/Handy/PC) ──register_device / list_playlists──▶ Supabase ◀──add/update/delete_playlist, send_support── Webseite (Kundenportal)
        │  zeigt MAC + KEY + QR-Code                       ▲
        └──────── QR-Code öffnet Webseite mit ?mac=&key= ──┘                Verwaltungsbereich ──admin_*──▶ Supabase
```

- **„Anmeldung“ im Kundenportal = Gerät verbinden** mit MAC-Adresse + KEY (kein Benutzerkonto, kein Passwort).
- **Verwaltungsbereich:** echtes Konto mit E-Mail + Passwort (Supabase Auth), nur für eingetragene Admins.
- **Sicherheit der Schnittstellen: gut gelöst.** Tabellen sind per Row-Level-Security gesperrt, alle Zugriffe laufen über
  Funktionen, die MAC + KEY prüfen; der KEY wird nur als Hash gespeichert; nach 20 Fehlversuchen 1 Stunde Sperre.
  Der Schlüssel im Quelltext ist ein öffentlicher „publishable key“ – das ist so vorgesehen.

## 3. Was funktioniert bereits (geprüft)

- Startseite mit Hero, Geräteübersicht, „So funktioniert’s“, Funktionen, Rechtshinweis
- Gerät verbinden (MAC + KEY, auch automatisch per QR-Code), Playlists hinzufügen/bearbeiten/löschen (M3U + Xtream,
  Xtream-Links werden erkannt), Löschen mit Sicherheitsabfrage
- Download-Bereich: erkennt das eigene Gerät, zeigt Version/Datum/Größe live von GitHub, Downloader-Code 5619512,
  Systemanforderungen, Installationshilfe
- Hilfe: 9 häufige Fragen, Support-Formular (nur mit verbundenem Gerät)
- Drei Sprachen (DE/EN/TR), keine Cookies, kein Tracking, keine Fremd-Schriften
- Handy-Darstellung ohne seitliches Verrutschen; keine JavaScript-Fehler

## 4. Gefundene Probleme – priorisiert

### Kritisch (rechtlich / Vertrauen)

1. **Impressum und Datenschutz enthalten Platzhalter** (`[VORNAME NACHNAME]`, `[E-MAIL-ADRESSE]` …) – und das ist
   bereits öffentlich. In Deutschland ist ein unvollständiges Impressum abmahnfähig. → **Braucht deine Angaben.**
2. **Keine Kontaktmöglichkeit ohne Gerät.** Wer die App noch nicht installiert hat (Interessenten, Probleme bei der
   Installation), kann niemanden erreichen: Das Support-Formular verlangt ein verbundenes Gerät, die E-Mail im
   Impressum ist ein Platzhalter.

### Hoch (Bedienung, Fehler)

3. ✅ **Zurück-Knopf warf Besucher aus der Seite** (Handy-Zurück nach Wechsel zwischen Bereichen → Seite verlassen).
4. ✅ **Handy-Menü abgeschnitten**: „Hilfe & Support“ war auf Handys nur halb sichtbar.
5. ✅ **Zu schwacher Kontrast** (Barrierefreiheit, WCAG AA): grauer Hinweistext 4,0 : 1 (nötig 4,5), weiße Schrift auf
   lila Knöpfen 4,2 : 1.
6. ✅ **Kein Favicon, kein Vorschaubild**: Im Browser-Tab und beim Teilen in WhatsApp & Co. erschien kein Telvo-Logo.
7. ✅ **Keine eigene Fehlerseite (404)** – falsche Adressen zeigten die englische Standardseite von GitHub.
8. **Seite ist für Google gesperrt** (`noindex`) und hat keinen Beschreibungstext → wird nicht gefunden.
   Absichtlich gelassen, bis das Impressum vollständig ist (siehe offene Fragen).

### Mittel (Professionalität, Wartbarkeit)

9. ✅ **Alles in einer 123-KB-Datei** (Design, 3 Sprachen, Logik). Schwer zu pflegen; jede Textänderung riskiert Fehler.
   → Aufteilen in `site.css`, `site.js`, Sprachdateien (ohne Build-Schritt, ohne neue Abhängigkeiten).
10. ✅ **Design solide, aber austauschbar.** Sauber und einheitlich, aber Systemschrift, wenig Bewegung, Startseite
    endet abrupt. Die App selbst nutzt bereits die Schrift *Inter* – die Webseite nicht.
11. ✅ **Webseite nur in 3 Sprachen**, die App in 11 (u. a. AR, RU, UK, PL) – Kunden aus der App landen auf Deutsch.
12. **Startseite und Kundenportal sind dieselbe Seite.** Für eine Produktseite ist das ungewöhnlich; Menüpunkt
    „Playlist hochladen“ ist für Neukunden unklar.
13. ✅ Rote „Wichtig“-Box auf der Startseite wirkt wie eine Fehlermeldung (Inhalt ist rechtlich sinnvoll und bleibt).
14. ✅ Verwaltungsbereich hat eigenes CSS mit leicht abweichenden Farben.

### Niedrig

15. ✅ Datenschutzerklärung erwähnt nicht, dass der Download-Bereich Versionsinfos von `api.github.com` lädt.
16. QR-Code-Adresse enthält den KEY (`?key=…`); er wird sofort aus der Adresszeile entfernt, kann aber im
    Browser-Verlauf landen. Akzeptabel, weil der KEY nur Playlists dieses Geräts freigibt.

## 5. Was fehlt gegenüber deiner Zielvorstellung

| Wunsch | Stand |
|---|---|
| Angebote / Preise / Leistungsübersicht | **Fehlt.** Die Seite sagt ausdrücklich „Wir verkaufen keine Sender, Abos oder Pakete“. |
| Login & Registrierung für Kunden | **Fehlt.** Es gibt nur „Gerät verbinden“ (MAC + KEY). Kein Kundenkonto. |
| Kundenportal mit mehreren Geräten | **Fehlt.** Man verwaltet immer genau ein Gerät. |
| Kunden- und Zugangsverwaltung im Admin | Teilweise: Geräte, Support, Kennzahlen vorhanden; keine Kunden, keine Zahlungen. |
| Kontakt ohne App | **Fehlt** (siehe Punkt 2). |

## 6. Erledigt in diesem Schritt

- Navigation als echte Links: Zurück-Knopf funktioniert, Bereiche sind direkt verlinkbar, Screenreader erkennen ein Menü
- Handy-Menü mit Kurzbezeichnungen (Start · Playlists · Download · Hilfe), passt bis 320 px Breite in allen Sprachen
- Kontraste auf WCAG AA angehoben (Webseite, Rechtsseiten, Download-Kurzseite)
- Favicon (`favicon.svg`), App-Symbol fürs iPhone (`apple-touch-icon.png`), Vorschaubild (`og-image.png`)
- Beschreibung, Canonical und Open-Graph-Angaben für Suchmaschinen und Link-Vorschauen
- Eigene Fehlerseite `docs/404.html`

Getestet in Chromium: Desktop 1440 px, Handy 390/360/320 px, DE/EN/TR, Zurück-Knopf, Direktlinks (`#download`),
keine JavaScript-Fehler.

## 7. Erledigt im zweiten Schritt

- `docs/index.html` aufgeteilt: `assets/site.css` (Gestaltung), `assets/i18n.js` (Übersetzungen), `assets/site.js` (Logik)
- Schrift **Inter** (variabel, inkl. türkischer Sonderzeichen) lokal ausgeliefert – keine Verbindung zu Google (DSGVO)
- Neues Erscheinungsbild: Lichtschein im Hintergrund, Überschrift mit Farbverlauf, schwebendes TV-Bild,
  Knöpfe mit Tiefe, Karten mit Hover-Effekt, sanftes Einblenden beim Scrollen (aus bei „Bewegung reduzieren“)
- „Wichtig“-Box sachlich statt alarmrot, neuer Abschluss-Aufruf „Bereit loszulegen?“, neue Fußzeile mit Menü
- Getestet: Desktop + Handy, DE/EN/TR, Zurück-Knopf, Direktlinks, keine JavaScript-Fehler, kein seitliches Verrutschen

## 8. Entscheidungen (09.11.2026)

- **Impressum/Datenschutz:** Platzhalter bleiben vorerst. ⚠️ Vor einer echten Veröffentlichung nötig.
- **Google-Sperre (`noindex`):** wird aufgehoben, sobald das Impressum vollständig ist.
- **Bezahlmodell:** Idee für später – App 30 Tage kostenlos, danach kostenpflichtig. Jetzt **nichts** umsetzen.
  Für später vormerken: Kundenkonto (E-Mail-Anmeldung über Supabase Auth, das für Admins schon läuft),
  Geräte einem Konto zuordnen, Testzeitraum pro Gerät/Konto serverseitig prüfen (nicht nur in der App),
  Zahlungsanbieter (z. B. Stripe), Preisseite, AGB/Widerrufsbelehrung.

## 9. Erledigt im dritten Schritt

- **14 Sprachen wie in der App** (DE, EN, TR, PL, RU, AR, UK, RO, IT, EL, KU, BS/HR/SR, ES, FR) mit Sprachauswahl
  wie in der App: Knopf mit aktueller Sprache → Liste. Bedienbar mit Maus, Touch und Tastatur.
- Sprachdateien liegen einzeln in `docs/assets/i18n/<code>.js` und werden nur bei Bedarf geladen.
  Reihenfolge der Spracherkennung: `?lang=` aus der App → zuletzt gewählt → Browsersprache → Deutsch.
- **Arabisch** von rechts nach links; MAC, KEY, Code und Links bleiben links-nach-rechts.
- Fire-TV-Downloadseite (`docs/app/`) nutzt dieselben Sprachdateien und den neuen Stil.
- Admin-Bereich, Impressum und Datenschutz in Schrift, Farben und Knöpfen an die Webseite angeglichen.
- Geprüft: alle Sprachdateien vollständig (216 Texte, Platzhalter und Formatierung erhalten), alle 14 Sprachen in allen
  Bereichen auf Desktop und Handy ohne deutsche Reste und ohne seitliches Verrutschen.
- Bekannte Kleinigkeit: Auf sehr kleinen Handys (320 px) ist das ukrainische Menü leicht wischbar statt fest.

**Hinweis zu den Übersetzungen:** maschinell erstellt nach den Begriffen der App. Bezeichnungen aus Systemdialogen
(Windows, macOS, Fire TV) sind nach bestem Wissen übernommen – vor einer großen Werbeaktion in einer Sprache lohnt sich
ein kurzer Blick durch Muttersprachler.

## 10. Erledigt im vierten Schritt

- **Sicherheitsregel (Content-Security-Policy)** für Startseite/Kundenportal und Rechtsseiten: Der Browser führt nur
  Code von der eigenen Seite aus und verbindet sich nur mit Supabase und GitHub. Eingeschleuster Code wird blockiert
  (mit absichtlich eingebautem Verstoß gegengeprüft). Fire-TV-Seite und 404-Seite haben keine Eingabefelder und
  bleiben ohne strenge Regel, weil sie Code direkt im HTML enthalten.
- **Automatischer Webseiten-Test** `tests/site.e2e.js` (54 Prüfungen) läuft bei jeder Änderung an `docs/` auf GitHub
  („Actions“ → „Webseite testen“): Seiten, Sicherheitsregel, Navigation, alle 14 Sprachen auf Desktop und Handy,
  Sprachauswahl, Kundenportal mit erfundenem Online-Dienst, Kontakt-Kasten.
- **Kontakt per E-Mail** für Besucher ohne App vorbereitet: erscheint automatisch, sobald `CONTACT_EMAIL` in
  `docs/assets/site.js` eingetragen ist. Bewusst **kein** öffentliches Formular ohne Gerät: Das wäre ohne
  IP-Speicherung nicht gegen Spam zu schützen.

## 11. Umbenennung in „Telvo“ (09.11.2026)

„Lumio Player“ gibt es bereits (Android-Videoplayer, „Lumio“ von SMART Technologies, lumio-app.com). Nach Namenssuche
(20+ Kandidaten geprüft) gewählt: **Telvo**. Recherche: keine App/kein Player „Telvo“ gefunden; US-Marke TELVO seit
2018 erloschen; ein Glasfaser-Anbieter „Telvo“ existiert (Land unklar). **Vor Veröffentlichung: TMview prüfen.**
Neues Logo: „T“ mit Play-Zeichen und goldenem Lichtpunkt. Technische Namen (Adressen, Dateinamen, App-Kennung,
Datenbank) bleiben „lumio“ – siehe CHANGELOG.

## 12. Nächste sinnvolle Schritte

1. **Domain + E-Mail-Adresse** (Empfehlung: eigene Domain + Zoho Mail Free, später mailbox.org) → Impressum,
   Datenschutz und `CONTACT_EMAIL` ausfüllen.
2. Webseite auf die eigene Domain umstellen (GitHub Pages „Custom domain“, Datei `docs/CNAME`), dann
   Adressen in App, QR-Code, Canonical/Vorschaubild und CSP anpassen.
3. Google-Sperre aufheben und veröffentlichen (Merge nach `main`).
