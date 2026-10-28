# Twizen DE

Twitch-App für Samsung-Fernseher als [TizenBrew](https://github.com/reisxd/TizenBrew)-Modul, mit Werbeblocker und
deutscher Oberfläche im Twitch-Stil. Fork von [@jjg0/twizen](https://www.npmjs.com/package/@jjg0/twizen) 0.3.3, MIT-Lizenz (siehe [LICENSE](LICENSE)).

## Unterschiede zum Original

- **Läuft auf älteren Fernsehern (Tizen 3.0):** Streams und Videos im fMP4-Format („Enhanced Broadcasting“) werden vor
  der Wiedergabe in MPEG-TS umgepackt. Ohne das bleibt das Bild bei solchen Kanälen schwarz.
- **Neue Oberfläche auf Deutsch:** Startseite mit Reihen, Seite „Live-Kanäle“, gefolgte und empfohlene Kanäle in der
  Seitenleiste, Kanalseiten, Suche mit Bildschirmtastatur.
- **Einstellungen:** Sprache der Streams (Standard: Deutsch), Bildqualität, Chat, Lautstärke-Ausgleich.
- **Vergangene Übertragungen** im fMP4-Format lassen sich abspielen.

## Installation

1. [TizenBrew](https://github.com/reisxd/TizenBrew) auf dem Fernseher installieren.
2. In TizenBrew den Module Manager öffnen, **Add GitHub module** wählen und `Dicti93/twizen-fix@v0.4.2` eingeben.
3. **Twizen DE** starten.

Für ein Update das Modul entfernen und mit der neuen Version erneut hinzufügen.

## Fernbedienung

| Taste | Übersicht | Player |
| --- | --- | --- |
| OK | Öffnen | Steuerleiste zeigen / Knopf drücken |
| Zurück | Ins Menü, dann beenden | Steuerleiste ausblenden, dann schließen |
| Gelb | Kanalseite der Kachel | Kanalseite |
| Rot | | Chat: Seite / überlagert / aus |
| Grün | | Lautstärke-Ausgleich |
| CH ▲ / ▼ | | Stream wechseln (bei Videos: ± 5 Min.) |

## Hinweise

- Die App nutzt inoffizielle Twitch-Schnittstellen und blockt Werbung. Das verstößt gegen die Nutzungsbedingungen
  von Twitch.
- Abo-Videos lassen sich nicht abspielen.
- `app/twizen.js` ist die einzige Quelldatei. Der Code ist ES5 ohne CSS-Variablen, damit er auf Tizen 3.0
  (Chromium 47) läuft.
