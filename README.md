# Twizen DE

Twitch-App für Samsung-Fernseher als [TizenBrew](https://github.com/reisxd/TizenBrew)-Modul, mit Werbeblocker und
deutscher Oberfläche im Twitch-Stil. Fork von [@jjg0/twizen](https://www.npmjs.com/package/@jjg0/twizen) 0.3.3, MIT-Lizenz (siehe [LICENSE](LICENSE)).

## Unterschiede zum Original

- **Läuft auf älteren Fernsehern (Tizen 3.0):** Streams und Videos im fMP4-Format („Enhanced Broadcasting“) werden vor
  der Wiedergabe in MPEG-TS umgepackt. Ohne das bleibt das Bild bei solchen Kanälen schwarz.
- **Oberfläche auf Deutsch im Twitch-Stil:**
  - Startseite mit empfohlenem Stream und Reihen (gefolgte Live-Kanäle, zuletzt gesehen, Empfehlungen, Kategorien)
  - Seite „Live-Kanäle“ mit allen Live-Kanälen nach Zuschauern, 100 Kategorien
  - Seitenleiste mit gefolgten Kanälen, empfohlenen deutschen und beliebten englischsprachigen Kanälen
  - Kanalseiten mit Zeitplan und vergangenen Übertragungen, Suche mit Bildschirmtastatur
- **Player:** Raids werden automatisch mitgemacht, Qualität umschaltbar, geringe Verzögerung, Chat mit Abzeichen und
  Emotes von 7TV, BTTV und FFZ, Lautstärke-Ausgleich.
- **Mit Twitch-Konto:** Kanälen folgen und entfolgen, gefolgte Kanäle immer aktuell, Hinweis wenn einer live geht.
- **Einstellungen:** Sprache der Streams (Standard: Deutsch), Bildqualität, Verzögerung, Chat, Emotes.
- **Flüssiger auf langsamen Fernsehern:** Bilder werden erst geladen, wenn sie ins Bild kommen, und in passender Größe.

## Installation

1. [TizenBrew](https://github.com/reisxd/TizenBrew) auf dem Fernseher installieren.
2. In TizenBrew den Module Manager öffnen, **Add GitHub module** wählen und `Dicti93/twizen-fix@v0.4.4` eingeben.
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
- Ohne Anmeldung zeigt „Live-Kanäle“ nur die Top 30, und Folgen ist nicht möglich. Angemeldet wird über einen Code
  unter *Einstellungen → Twitch-Konto*.
- `app/twizen.js` ist die einzige Quelldatei. Der Code ist ES5 ohne CSS-Variablen, damit er auf Tizen 3.0
  (Chromium 47) läuft.
