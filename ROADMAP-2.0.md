# Telvo Player – Weg zu Version 2.0

Stand 09.11.2026. Grundlage: Feedback von ChatGPT und Gemini, mit dem echten Stand der App abgeglichen.
Bis zum offiziellen Start bleiben alle Versionen unter 2.0 (1.11.x, 1.12 …).

## Schon vorhanden (in den KI-Antworten als „fehlt“ genannt)

- Mehrere Playlists und schneller Wechsel zwischen ihnen
- Tonspur und Untertitel wählen, Bildformat (Original, Zoom, Strecken, 16:9, 4:3)
- Externer Player auf Android (VLC, MX Player, Just Player)
- Kategorien ausblenden oder mit PIN sperren, Kindersicherung
- Programmführer (XMLTV) aus der Playlist
- Große Listen: 60.000 Einträge getestet (Prozessor 4-fach gedrosselt)
- Playlist direkt am Gerät eingeben (ohne Webseite)
- Online-Abgleich nur nach Zustimmung (Voreinstellung aus)
- Demo nur mit frei lizenzierten Filmen (Blender Foundation, mit Nennung)

## Trifft nicht zu

- **SSRF:** Der Server ruft nie Playlist-Adressen auf; nur das Gerät selbst lädt.
- **MAC-Fälschung / Kollision:** Die MAC ist eine zufällige Geräte-Kennung, nicht die echte Hardware-Adresse.
- **Streams über eigene Server:** Es laufen keine Videos über Telvo-Server.
- **Apple-Regeln:** Es gibt (noch) keine iPhone-/Apple-TV-App.

## Vor 2.0 – Pflicht

1. **Kopplung per QR sicherer:** KEY nicht mehr im Adressteil des QR-Codes (hinter „#“) oder kurzlebiger Einmal-Code.
2. **Media3 (ExoPlayer) aktualisieren:** von 1.4.1 auf die aktuelle Version, danach auf echten Boxen testen.
3. **Fehlerberichte:** freiwillig (Zustimmung), ohne Playlist-Adressen und Passwörter, z. B. in die eigene Datenbank.
4. **Rechtliches und Store-Paket:** Impressum vollständig, Nutzungsbedingungen beim ersten Start, Seite mit
   Open-Source-Lizenzen, Store-Texte und Bilder ohne fremde Senderlogos und ohne Begriffe, die nach Piraterie klingen.
5. **Tests auf echten Geräten:** schwacher Fire TV Stick (Lite), Android-TV-Box, Samsung, LG, Handy, Windows, Mac –
   Live (HLS, TS), Filme, Serien, große Listen, kaputte Streams, Fernbedienung.
6. **Wartbarkeit:** `app.js` (rund 5.900 Zeilen) in mehrere Dateien aufteilen – weiterhin ohne Build-Schritt.

## Vor 2.0 – wichtig für den Wettbewerb

- **Catch-up / Zurückspulen** (Xtream „tv_archive“) – größte Lücke gegenüber TiviMate & Co.
- **Programmführer:** Zeitverschiebung einstellbar, eigene EPG-Adresse
- **Sichern und Wiederherstellen** von Einstellungen und Favoriten (Export/Import)
- **Kategorien umbenennen und sortieren**, einzelne Sender ausblenden

## Nach 2.0

- Aufnahmen, Multiview (mehrere Sender gleichzeitig)

## Bezahlen (Idee, noch nicht umsetzen)

- 30 Tage kostenlos testen, danach **einmalig „Pro“** freischalten (Vorschlag 5–10 €), kein Abo für den Player selbst.
- Ein Abo höchstens für echte laufende Kosten (z. B. Abgleich über mehrere Geräte).
- Kauf nur über die Stores (Google Play Billing, Amazon, Samsung, LG); Lizenz am Store-Konto, nicht an MAC/KEY.
- Ablaufdatum und Kosten vorher klar anzeigen; vor dem Start rechtlich prüfen lassen (Widerruf, Verbraucherrecht).
