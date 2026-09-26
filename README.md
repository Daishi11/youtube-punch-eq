# YouTube Punch EQ

A small Firefox-only local equalizer for **YouTube** and **YouTube Music**.

Version: **0.1.0**

## Features

- Global EQ enable/bypass switch.
- Preamp: `-18 dB` to `+6 dB`.
- Bass low-shelf at `80 Hz`: `-12 dB` to `+12 dB`.
- 8 peaking bands: `125 / 250 / 500 / 1k / 2k / 4k / 8k / 16k Hz`.
- Built-in presets: Flat, Heavy / Punch, Rock, Deep Bass.
- Save and delete custom presets.
- Double-click any slider to reset it to `0 dB`.
- Mouse wheel over a slider for `0.5 dB` steps.
- Settings are persisted locally with `browser.storage.local`.
- No telemetry, no network requests, no data collection.

## Fast media detection

The EQ does **not** rely on a polling timer to notice a new song.

It uses several layers:

1. The content script starts at `document_start`.
2. A `MutationObserver` immediately hooks newly inserted `<audio>` / `<video>` elements.
3. Capture listeners for `play`, `playing`, `loadedmetadata`, `canplay`, and `emptied` provide a second immediate path.
4. YouTube SPA navigation events trigger an extra scan.
5. A 1-second interval is only a fallback safety scan.
6. A pointer/key/touch gesture on the page pre-arms/resumes Web Audio before YouTube starts playback when possible.

That is specifically meant to avoid the annoying "first seconds are flat and then the EQ wakes up" behavior.

### Audio output device changes

The extension does not need to re-hook Windows output devices. The DSP graph is upstream of Firefox's final audio output. If Windows/Firefox routes the tab to another speaker or headset, the EQ remains in the signal path.

The thing that *does* need re-hooking is a new/replaced YouTube media element, which is what the detection logic above handles.

## Temporary installation in Firefox

Requires **Firefox 128+**.

1. Extract this folder somewhere permanent enough for testing.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select `manifest.json` from this folder.
5. Reload already-open YouTube / YouTube Music tabs once after installing or reloading the add-on.

A temporary add-on is removed when Firefox restarts. Once the extension is proven stable, it can be signed through Mozilla as an **unlisted/self-distributed** add-on for permanent installation.

## Recommended first test

1. Open the YouTube homepage.
2. Keep the default **Heavy / Punch** preset.
3. Click a music mix from the homepage.
4. Listen specifically to the first kick/bass hit after navigation.
5. Let YouTube advance to the next track without touching the extension.
6. Repeat on YouTube Music.
7. Toggle EQ bypass while audio is playing.
8. Change the Windows/Firefox output device while audio is playing; EQ should remain active.

## Audio graph

When enabled:

`HTMLMediaElement -> Preamp -> 80 Hz Low Shelf -> 8 EQ bands -> Output`

The implementation also maintains a parallel dry path so the **bypass** switch is a real unfiltered route rather than merely setting every filter to zero.

## Firefox / Web Audio caveat

Firefox can suspend a new `AudioContext` until the page receives a user gesture. The extension listens in the capture phase for pointer, keyboard, and touch interaction so normal YouTube navigation can resume the context before playback starts. A direct URL that Firefox autoplays without any user interaction can still be constrained by the browser's Web Audio autoplay policy.

## Files

- `shared/config.js` — frequencies, presets, validation, storage/event constants.
- `content/engine.js` — MAIN-world Web Audio engine and media detection.
- `content/bridge.js` — isolated WebExtension bridge for storage and popup messaging.
- `popup/*` — toolbar UI.
- `tests/config.test.js` — dependency-free configuration sanity tests.

## Support the project

YouTube Punch EQ is free and open source.

If you enjoy the extension and want to support future development, you can leave a small tip on Ko-fi:

**Ko-fi:** [Support me on Ko-fi](https://ko-fi.com/daishi11)

Support is always appreciated, but never expected.


## Bugs, feature requests and new ideas

Found a bug or have an idea specifically for YouTube Punch EQ?

Please open an issue here:

**Issues:** https://github.com/Daishi11/youtube-punch-eq/issues

I'm also open to ideas for completely new Firefox extensions and small tools.

If there's something you wish existed, you can suggest it here:

**New extension ideas:** [Suggest an idea](https://github.com/Daishi11/small-tool-ideas/discussions/1)

I won't promise that every suggestion will become a project, but I do read them and I'm always interested in useful, unusual or annoyingly-specific ideas.
