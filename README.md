> **Fork of [@jjg0/twizen](https://www.npmjs.com/package/@jjg0/twizen) 0.3.3 (MIT).**
> Only change: the player skips stream qualities above 1080p and codecs the TV reports as
> unsupported (`isPlayable()` in `app/twizen.js`). This fixes the black screen on channels
> with a 1440p source.
> fix2: keep `#EXT-X-MAP` (fMP4 init segment) when the ad blocker rewrites media playlists,
> and show diagnostics on screen if nothing plays after 15 s.
> fix5: repackage fMP4 segments (Enhanced Broadcasting) as MPEG-TS before hls.js sees them
> (`app/js` section `fmp4ts.js`). Tizen 3.0 TVs can't decode Twitch's muxed fMP4 with 1 MHz
> 64-bit timestamps, but play the same H.264/AAC fine as TS.
> fix6: diagnostics overlay removed again.

# Twizen

An ad-free Twitch player for Samsung Tizen TVs, packaged as a [TizenBrew](https://github.com/reisxd/TizenBrew) app module.

- Browse top live streams and categories, search channels and categories
- Followed live channels: sign in on your phone with a code (Twitch device login)
- Ad blocking at the stream level (see below)
- Channel pages with past broadcasts and videos (VODs), which resume where you left off
- Read-only chat with 7TV emotes, shown beside the video, over the video, or off
- Audio compressor with Off / Light / Night presets
- Settings: 7TV emotes can be turned off on slower TVs
- Built for the remote: D-pad navigation, Back, media keys, channel up/down to switch streams

## Install

1. Install [TizenBrew](https://github.com/reisxd/TizenBrew) on your Samsung TV.
2. Open TizenBrew and press the **green** button to open the module manager.
3. Add `@jjg0/twizen` as an npm module, then launch **Twizen**.

To update, restart TizenBrew. The version is shown in the sidebar.

## Remote controls

The player has an on-screen control bar, so the coloured buttons are optional shortcuts:

- **Live:** OK or any arrow shows the controls. ◀ ▶ picks a button, OK presses it. Buttons: Play/Pause, Chat mode, Compressor, Previous/Next stream, Channel & past broadcasts.
- **Videos (VODs):** the progress bar is selected first. ◀ ▶ seeks, and **holding** speeds up from 10 s steps to about 2% of the video per step, so an 8-hour VOD crosses end to end in a few seconds. The jump happens when you let go. ▼ moves to the buttons (Play/Pause, ±1 min, Compressor, Channel & videos) and ▲ returns to the progress bar.
- **Back** hides the controls first, then closes the player.

| Shortcut | Browsing | Live | Video |
| --- | --- | --- | --- |
| Yellow | Open the focused stream's channel page | | |
| Red | | Chat: beside → over video → off | |
| Green | | Compressor: Off → Light → Night | Compressor |
| Play/Pause | | Pause / resume (jumps back to live after a long pause) | Pause / resume |
| CH ▲ / ▼ | | Previous / next stream | Seek ±5 min |
| Rewind / FF | | | Seek (hold to speed up) |

Selecting a channel in Search opens its channel page, with **Watch live** (when it's live) and its past broadcasts.

VOD video comes from a CDN that only accepts twitch.tv pages, so VOD segments are fetched through the Twizen service. Subscriber-only VODs won't play.

## How ad blocking works

Twitch inserts ads into the live HLS playlist on its servers. `app/js/adblock.js` checks each playlist before hls.js sees it:

1. Ad segments are detected by their `#EXTINF` title, which is something other than `live` during an ad.
2. During an ad, it fetches the same quality with other player types (`embed`, `popout`, `autoplay`). These often carry no ads, and their playlist is used instead.
3. If every backup has ads too, the ad segments are dropped. The picture holds until the break ends, but no ad is shown.

Segments are renumbered by their timestamps, so switching between the main and backup playlists plays smoothly. Twitch changes its ad system now and then. When it does, `adblock.js` is the file to update.

## Develop on a PC

The app has two parts:
- **`app/`** is the UI. TizenBrew serves it at `http://127.0.0.1:8081/module/...`.
- **`service/service.js`** runs in TizenBrew's Node service. It is a small proxy on `127.0.0.1:8732`. Twitch rejects requests from a `127.0.0.1` page for some of its services, so these go through the proxy: live playlists, sign-in, and VOD playlists and segments. Live video segments, the Twitch APIs and 7TV are fetched directly.

The source is in `app/js/`. The app loads one bundled file, `app/twizen.js`, because TizenBrew fetches each file separately and many small files made startup slow on the TV. Rebuild it after editing (publishing rebuilds it automatically):

```bash
npm run build
```

Then start the dev server (needs Python 3):

```bash
py dev/devserver.py
```

Then open http://127.0.0.1:8732/app/index.html in Chrome. The dev server serves the files and works like the TV service. On a PC keyboard:
- Arrow keys and Enter navigate.
- Esc goes back.
- R and G toggle chat and the compressor.
- Page Up / Page Down switch streams.

Ad-blocker unit tests run at http://127.0.0.1:8732/test/adblock.test.html. Player key-handling tests run without a browser: `node test/player.test.js`.

The app code is plain ES5 with no CSS variables, so it runs on older Tizen browsers (Tizen 3.0 / Chromium 47). hls.js is bundled in `app/vendor/` and loaded in the background after the menus appear. **Settings** shows how long startup and each file took on the TV.

## Notes

- This uses Twitch's internal web and Android TV client IDs, as streamlink and other third-party players do. That is unofficial and against Twitch's terms of service.
- On some older TVs, video audio can't be routed through Web Audio. If the compressor hears nothing during about 10 s of playback, the app turns it off until the next restart and reloads the stream.
