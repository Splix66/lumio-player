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

1. ✅ **Kopplung per QR sicherer:** MAC und KEY stehen jetzt hinter „#“ – dieser Teil wird nie an einen Server geschickt.
   (Später möglich: kurzlebiger Einmal-Code statt KEY.)
2. ✅ **Media3 (ExoPlayer) aktualisiert:** von 1.4.1 auf 1.9.4 (neueste Version für unser Android-Bausystem;
   ab 1.10 erst mit Capacitor 8). Noch offen: Test auf echten Boxen.
3. ✅ **Fehlerberichte:** „Problem melden“ in den Einstellungen – Thema, Nachricht, freiwillige E-Mail und (abschaltbar)
   technische Angaben: App-Version, Gerät, letzte Fehler – ohne Links, Benutzernamen und Passwörter. Geht über den
   vorhandenen Support-Weg und erscheint im Verwaltungsbereich (keine Änderung an der Datenbank nötig).
4. **Rechtliches und Store-Paket:** ✅ Open-Source-Lizenzen in der App (Einstellungen → Über & Updates).
   ✅ Nutzungsbedingungen: Seite auf der Webseite (ENTWURF – vor dem Start anwaltlich prüfen lassen) und
   einmaliger Hinweis beim ersten Start der App.
   ✅ Store-Texte (Deutsch, Englisch) und Angaben zur Datensicherheit: `STORE-TEXTE.md` (Entwurf).
   Offen: Impressum vollständig (Name, Adresse); Bildschirmfotos im Demo-Modus.
5. **Tests auf echten Geräten:** schwacher Fire TV Stick (Lite), Android-TV-Box, Samsung, LG, Handy, Windows, Mac –
   Live (HLS, TS), Filme, Serien, große Listen, kaputte Streams, Fernbedienung.
6. **Wartbarkeit:** `app.js` (rund 5.900 Zeilen) in mehrere Dateien aufteilen – weiterhin ohne Build-Schritt.

## Vor 2.0 – wichtig für den Wettbewerb

- ✅ **Catch-up – „Verpasste Sendungen“** für Xtream-Zugänge (Sender mit „tv_archive“): Liste nach Tagen, laufende
  Sendung von Anfang an, Abspielen über /timeshift/ in Serverzeit. Auf Fernseher und PC rechts neben der Senderliste,
  überall auch im Player. Im Demo-Modus zum Ausprobieren. ✅ Auch für M3U-Playlists (catchup/catchup-days/catchup-source: default, append, shift, flussonic, xc; alte Form
  timeshift/tvg-rec) – Programmführer behält für diese Sender die vergangenen Tage, ohne Programmdaten Stundenblöcke.
- ✅ **Programmführer:** Zeitverschiebung je Playlist (−5 bis +5 Std., Einstellungen → Programmführer-Zeit);
  eigene EPG-Adresse gab es schon (M3U, Profil → Programmführer)
- **Sichern und Wiederherstellen** von Einstellungen und Favoriten (Export/Import)
- ✅ **Kategorien verwalten:** ausblenden, oben anheften (Stern), umbenennen (Stift) – Kindersicherung prüft immer den
  Originalnamen. ✅ **Einzelne Sender ausblenden** (rechte Spalte bei Live TV, im Player; Einstellungen → Ausgeblendete Sender)

## Nach 2.0

- Aufnahmen, Multiview (mehrere Sender gleichzeitig)

## Bezahlen (Idee, noch nicht umsetzen)

- 30 Tage kostenlos testen, danach **einmalig „Pro“** freischalten (Vorschlag 5–10 €), kein Abo für den Player selbst.
- Ein Abo höchstens für echte laufende Kosten (z. B. Abgleich über mehrere Geräte).
- Kauf nur über die Stores (Google Play Billing, Amazon, Samsung, LG); Lizenz am Store-Konto, nicht an MAC/KEY.
- Ablaufdatum und Kosten vorher klar anzeigen; vor dem Start rechtlich prüfen lassen (Widerruf, Verbraucherrecht).
