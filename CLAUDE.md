# Telvo Player – Regeln für KI-Agenten

Gedächtnis ist **brain** (MCP-Server `brain`, Bereich `telvo`). Keine eigenen Notizdateien als Ersatz.

## Beim Start
1. `recall` im Bereich `telvo`: Eintrag „Telvo – aktueller Stand“ lesen.
2. Für Gerätetests zusätzlich: `recall` mit `tags: ["gerätetest"]` – letzter Lauf auf demselben Gerät.
3. Eray nichts fragen, was dort steht.

## Beim Ende jeder Aufgabe / jedes Testlaufs
- **Gerätetest:** neuer Eintrag nach „Telvo – Vorlage Gerätetest“ (in brain).
  Tags: `gerätetest`, `testlauf`, `gerät:<kurzname>` (z. B. `gerät:firetv-stick`, `gerät:androidtv-box`), `version:<x.y.z>`.
  Gerätedaten per `adb shell getprop ro.product.model`, `ro.build.version.release`, Speicher, Auflösung.
  Nur gemessene Werte mit Einheit und Anzahl Messungen.
- **Fehler gefunden/gelöst:** Ursache und Lösung mit Tag `fehler` bzw. `lösung`; hilft es anderen Projekten, zusätzlich `übertragbar`.
- **Neue Version:** Eintrag „Telvo – aktueller Stand“ mit `update_memory` ändern (vorher neu lesen), nie einen zweiten anlegen.
- `source`: Sitzung/Agent und Gerät, z. B. „Telvo-Testagent Fire TV, 12.11.2026“.

## Feste Regeln
- `main` = sofort live für alle Kunden. Push/Merge auf `main` nur mit Erays ausdrücklichem OK.
- Test-Versionen auf eigenen Zweigen `rel-<version ohne punkte>` (z. B. `rel-1154`).
- APKs baut nur GitHub Actions („Android-APK bauen“).
- Fire TV / Box: `adb install -r`, nie deinstallieren, nur wenn Eray gerade nichts schaut.
- Fire-TV-Test und Box-Test laufen parallel: nie das Gerät des anderen Agenten anfassen.
- Nie speichern: Passwörter, Schlüssel, Token, Playlist-Zugangsdaten, MAC-Adressen von Kunden.
- Antworten an Eray: Deutsch, kurz, ohne Fachbegriffe, Ampel gut/schlecht.
