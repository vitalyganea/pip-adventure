# 🦊 Pip's Adventure

A platformer for kids, written in plain HTML + CSS + JavaScript, built to pass
YouTube Playables certification. No libraries, no build step, no image or audio
files — everything is drawn on a `<canvas>` and every sound is synthesised at
runtime with WebAudio.

See [PLAYABLES.md](PLAYABLES.md) for how each certification requirement is met.

## Running it

Double-click `index.html`. That's it.

To serve it over a local web server instead:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Opened this way the game runs standalone: the Playables SDK is not present, so
progress goes to `localStorage` instead of the cloud save and the platform
pause and audio hooks are simply inactive. Everything else behaves the same.

## Controls

| Input | Action |
|---|---|
| on-screen `◀` `▶` `▲` | walk and jump — works with mouse, touch or pen |
| `←` `→` or `A` `D` | walk |
| `Space`, `↑`, `W` | jump (hold it to jump higher) |
| `P` or `Esc` | pause; `Esc` also closes any menu |
| `R` | restart the level |

## What's in it

- **10 levels** of rising difficulty across 5 visual themes
  (forest, desert, candy, ice, night)
- Mechanics: stars, gems, stompable bugs, flying bees, spikes, water,
  springs, moving platforms (horizontal and vertical), keys and locked
  flags, checkpoints
- A level map with progressive unlocking and **1–3 stars** per level
- Progress saved through the Playables cloud save (`localStorage` only when run as a plain page)
- Music and sound effects, each with its own on/off toggle
- Responsive from 9:32 to 32:9: the world stays 540 units tall and the visible
  width follows the screen, so nothing is ever stretched or cut off

## Layout

```
index.html        the screens (title, help, level map, pause, endings)
css/font.css      Baloo 2, embedded as a data URI (no external requests)
css/style.css     all interface styling
js/audio.js       sounds and music synthesised with WebAudio
js/levels.js      the level maps, drawn as ASCII art
js/game.js        the engine: physics, collisions, rendering
js/ui.js          menus, saving, controls, Playables lifecycle
PLAYABLES.md      certification requirements and how each one is met
```

`README.md` and `PLAYABLES.md` are documentation — leave them out of the
uploaded bundle.

### Adding a level

Add an entry to `js/levels.js`. Each row is a plain string:

```
' '  empty            '#'  ground            '-'  platform (jump up through it)
'*'  star             'C'  gem (worth 3)     '^'  spikes
'~'  water            'e'  bug               'b'  bee
's'  spring           'k'  key               'G'  flag
'P'  spawn point      'c'  checkpoint
'M'  horizontal moving platform              'V'  vertical moving platform
```

Rows may have different lengths — they get padded automatically.
To keep every jump possible: gaps of at most **3 tiles** and vertical steps of
at most **3 tiles** (a jump clears 3.4 tiles of height and 4.9 tiles of
distance).
