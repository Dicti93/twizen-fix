# Twizen DE

Twitch-App für Samsung-Fernseher als [TizenBrew](https://github.com/reisxd/TizenBrew)-Modul, mit Werbeblocker und
deutscher Oberfläche im Twitch-Stil. Fork von [@jjg0/twizen](https://www.npmjs.com/package/@jjg0/twizen) 0.3.3, MIT-Lizenz (siehe [LICENSE](LICENSE)).

## Unterschiede zum Original

- **Läuft auf älteren Fernsehern (Tizen 3.0):** Streams und Videos im fMP4-Format („Enhanced Broadcasting“) werden vor
  der Wiedergabe in MPEG-TS umgepackt. Ohne das bleibt das Bild bei solchen Kanälen schwarz.
- **Oberfläche auf Deutsch im Twitch-Stil:**
  - Startseite mit empfohlenem Stream und Reihen (gefolgte Live-Kanäle, Weiterschauen, „Was habe ich verpasst?“ mit
    den besten Clips der letzten 24 Stunden, zuletzt gesehen, Empfehlungen, Kategorien, ganz unten deine gefolgten
    Kategorien); sie lädt sich neu, wenn man nach ein paar Minuten zurückkommt
  - Seite „Live-Kanäle“ mit Filtern (Sprache, Kategorie, Größe, 18+) und Sortierung (Empfohlen, Zuschauer ↓/↑,
    neu gestartet), die Auswahl bleibt gespeichert; 100 Kategorien mit Clips der Woche
  - TV-Programm: geplante Streams der Kanäle, denen du folgst, als Wochenübersicht
  - Seitenleiste mit Favoriten, gefolgten Kanälen und Twitchs Empfehlungen auf Deutsch und international (Englisch);
    ein Kanal aus der Leiste läuft neben ihr, mit ▲/▼ und OK wird durchgezappt
  - Kanalseiten mit Zeitplan, beliebten Clips und vergangenen Übertragungen, Suche mit Bildschirmtastatur
- **Player:** Raids werden automatisch mitgemacht, Livestreams von Anfang an schauen, Aufzeichnung nach Streamende,
  Qualität umschaltbar, etwa 6 s hinter live, Knopf „Neu laden“, Lautstärke-Ausgleich, Statistik auf der INFO-Taste.
  Titel, Kategorie und Zuschauer werden jede Minute aktualisiert. Werbepausen laufen über eine werbefreie Quelle in
  voller Qualität weiter. Die Steuerleiste ist eine Reihe mit den wichtigsten Knöpfen (Pause, Chat, Schreiben,
  Folgen; bei Videos ±1 Min., Kapitel, Hype-Moment), der Rest steckt im Menü „Mehr“.
- **Chat:** Abzeichen und Emotes von 7TV, BTTV und FFZ, passend zum Bild verzögert (keine Spoiler), Abos, Raids und
  Ankündigungen, Hervorhebung von Erwähnungen und eigenen Nachrichten, einstellbare Schriftgröße, QR-Code zum
  Mitschreiben am Handy.
- **Stabil bei Aussetzern:** Fällt das Internet aus, wartet die App und spielt danach von selbst weiter (Videos an
  derselben Stelle). Hakt ein Stream immer wieder oder friert das Bild ein, lädt sie neu und geht nötigenfalls eine
  Qualitätsstufe runter. Gesperrte Inhalte
  (nur für Abonnenten, im Land nicht verfügbar) werden verständlich gemeldet.
- **Videos und Clips:** Weiterschauen an der letzten Stelle, Chat-Wiedergabe, Kapitel, Vorschaubilder beim Spulen,
  Hype-Momente (Stellen mit viel Chat-Aktivität), Wiedergabetempo bis 2×, Clips laufen nacheinander durch.
- **Favoriten** (ohne Konto): stehen oben in der Seitenleiste, nur für sie kommt der Hinweis „ist jetzt live“.
- **Mit Twitch-Konto** (Anmeldung per Code oder QR-Code): im Chat schreiben (Bildschirmtastatur mit Schnellantworten
  und Kanal-Emotes), Kanälen und Kategorien folgen, gefolgte Kanäle immer aktuell, Hinweis wenn einer live geht.
- **Einstellungen:** Sprache der Streams (Standard: Deutsch), Bildqualität, Verzögerung, Chat, Schriftgröße,
  Spoilerschutz, QR-Code, Emotes.
- **Flüssiger auf langsamen Fernsehern:** Bilder werden erst geladen, wenn sie ins Bild kommen, und in passender Größe.

## Installation

1. [TizenBrew](https://github.com/reisxd/TizenBrew) auf dem Fernseher installieren.
2. In TizenBrew den Module Manager öffnen, **Add GitHub module** wählen und `Dicti93/twizen-fix@0` eingeben.
3. **Twizen DE** starten.

Mit `@0` lädt TizenBrew immer die neueste Version 0.x, Updates kommen also von selbst (beim nächsten Start).
Eine bestimmte Version lässt sich mit z. B. `@v0.5.4` festhalten.

### Eigene App mit Symbol (optional)

Die kleine App **Twizen** (Ordner [`launcher/`](launcher)) erscheint mit eigenem Symbol in der App-Leiste des Fernsehers
und startet TizenBrew direkt mit Twizen, ohne Umweg über das TizenBrew-Menü.

1. Fernseher im Entwicklermodus, TizenBrew mit dem Modul `Dicti93/twizen-fix@0` eingerichtet (siehe oben).
2. [TizenBrew Installer](https://github.com/reisxd/TizenBrewInstaller) auf dem PC starten, **Connect to TV** mit der IP
   des Fernsehers.
3. **Install from GitHub** wählen und `Dicti93/twizen-fix` eingeben.

Die App lädt immer die aktuelle Twizen-Version, sie muss für Updates nicht neu installiert werden. Sie wird bei einem
Tag `launcher-v*` von GitHub Actions gebaut, signiert und als Release veröffentlicht.

## Fernbedienung

| Taste | Übersicht | Player |
| --- | --- | --- |
| OK | Öffnen | Steuerleiste zeigen / Knopf drücken |
| ◄ / ► | | In der Steuerleiste wechseln (Videos ohne Leiste: spulen) |
| ▲ / ▼ | | Im Menü „Mehr“ wählen (Videos: ▲ zur Zeitleiste, ▼ zurück zu den Knöpfen) |
| Zurück | Ins Menü, dann beenden | „Mehr“ schließen, Seitenleiste einklappen, Steuerleiste ausblenden, dann schließen |
| Gelb | Kanalseite der Kachel | Kanalseite |
| Rot | | Chat: Seite / überlagert / aus |
| Grün | | Lautstärke-Ausgleich |
| CH ▲ / ▼ | | Stream wechseln (Videos: ± 5 Min., Clips: nächster Clip) |
| INFO | | Statistik ein/aus |

## Hinweise

- Die App nutzt inoffizielle Twitch-Schnittstellen und blockt Werbung. Das verstößt gegen die Nutzungsbedingungen
  von Twitch.
- Abo-Videos lassen sich nicht abspielen.
- Ohne Anmeldung zeigt „Live-Kanäle“ höchstens 30 Kanäle (in einer Kategorie 100), und Folgen ist nicht möglich.
  Angemeldet wird über einen Code unter *Einstellungen → Twitch-Konto*.
- `app/twizen.js` ist die einzige Quelldatei. Der Code ist ES5 ohne CSS-Variablen, damit er auf Tizen 3.0
  (Chromium 47) läuft. `scripts/check.js` prüft das bei jedem Push (GitHub Actions) und vor jeder Veröffentlichung.
- QR-Codes: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) von Kazuhiko Arase (MIT).
