# YouTube Playables compliance

How this game meets each certification requirement, and what is still left for
you to do in the Developer Portal.

## Integration

| Requirement | How it is met |
|---|---|
| SDK loaded before any game code | `index.html` — `<script src="https://www.youtube.com/game_api/v1">` is the first element in `<head>` |
| `firstFrameReady()` then `gameReady()` | `js/ui.js` — `firstFrameReady` fires in the first `requestAnimationFrame`; `gameReady` only after `loadData()` settles and the title menu is interactive |
| Progress saved only via `saveData` | `js/ui.js` `store()` — inside Playables the SDK is the sole mechanism |
| `loadData()` awaited before `saveData()` | `canSave` stays `false` until the load promise settles; `store()` returns early before that |
| Old saves must still load | `adopt()` parses defensively and falls back to defaults on anything unexpected |
| Save at milestones | on level completion and on `onPause` |
| Audio follows YouTube | `isAudioEnabled()` seeds the state, `onAudioEnabledChange` updates it; `Sfx.platformAudio()` gates the master bus, so nothing can be output while YouTube is muted |
| No overall in-game mute | only granular Music / Sounds toggles, both subordinate to the platform setting |
| `onPause` halts everything | `Game.suspend()` cancels the animation frame, so the loop, physics, audio scheduling and **rendering** all stop |
| `onResume` is the only resume | `Game.unsuspend()` |
| Page Visibility API not used | removed entirely |
| `sendScore` matches the save | score = total stars, sent from the save-success path |

## Design

| Requirement | How it is met |
|---|---|
| Playable at every aspect ratio | the world is always 540 units tall, the visible width follows the viewport (clamped 640–1400); leftovers become pillar/letterbox. Verified 9:32 → 32:9 |
| Fills the viewport | fills both axes between ratios 1.19 and 2.59; outside that it is centred with bars |
| No orientation lock | none requested |
| State survives resize | `Game.resize()` reframes the live level; position, stars and hearts are untouched |
| Touch **and mouse** for everything | on-screen ◀ ▶ ▲ are always present and driven by Pointer Events |
| No input dropped | pointer capture plus a window-level `pointerup` net so a control never sticks |
| Esc closes modals | help, level map and the confirm dialog all close on Esc |
| No `preventDefault()` on Esc | the Esc branch returns before any other handling |
| Crisp at every resolution | the canvas backing store is sized in device pixels and the context scaled to match; re-runs on resize and on density change |
| Communicates end of content | the victory screen states there is no more game left |
| No sharing prompts / external links / extra agreements / quit button | none present |
| No icon clashing with platform controls | the in-game button is a ☰ menu glyph, not a pause symbol |

## Privacy and data

No external calls other than the SDK itself. The webfont is embedded as a
data URI in `css/font.css` (Baloo 2, SIL OFL 1.1) precisely so nothing is
fetched at runtime. No clipboard access, no personal data, no login-like
screens, no QR-like graphics, no obfuscation, single page application, and no
`eval`, WebAssembly or Web Workers.

## Stability and performance

| Limit | This game |
|---|---|
| Initial bundle < 30 MiB (< 15 recommended) | 156 KB |
| Individual file < 30 MiB (< 512 KiB recommended) | largest is `js/game.js`, 57 KB |
| Saved game < 3 MiB (< 500 KiB recommended) | ~60 bytes |
| Load and interactive < 5 s | no assets to fetch; interactive on the first frame |
| At most 8000 files | 8 |
| Only relative paths | yes, the SDK URL aside |
| File names `[A-Za-z0-9_.-]` | yes |
| Standards-compliant Web APIs | Canvas 2D, WebAudio, Pointer Events |

## Internationalisation

English throughout, as required. `navigator.language` is not used anywhere;
if you later localise, read the locale from `ytgame.system.getLanguage()`.

## Still yours to do

1. Fill in the Developer Portal metadata: title, description, genre, publisher
   and thumbnails — with **no branding or logos** in any of them.
2. Run the official Playables test suite against the bundle before submitting.
3. Optionally add Accessible Gaming Initiative tags to the listing (a SHOULD,
   and they must honestly describe the game).
4. Upload only the game files. `README.md` and `PLAYABLES.md` are documentation
   and do not need to ship.

## Running it outside Playables

Opening `index.html` directly still works: the SDK script simply fails to load,
`ytgame` is undefined, and the game falls back to `localStorage` for progress.
That fallback is gated behind `IN_PLAYABLES_ENV` so it is never used inside
YouTube. Remove it if a reviewer would rather not see `localStorage` at all.
