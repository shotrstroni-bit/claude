# Bombshell Brawl

A browser beat 'em up built with Phaser 3. All character and scenery art is vector (SVG) drawn in code and rasterized at load time, so there are no image files to manage.

## Run it

Open `index.html` in a browser. No build step or server needed; Phaser and the fonts are bundled in `vendor/`.

## Controls

| Screen | Keys |
|---|---|
| Title | Any key / click to open the menu, ↑ ↓ to move, Enter to choose |
| Character select | ← → (or A / D) to choose, Enter to confirm, Esc to go back |
| Stage | Esc to return to character select |

## Layout

```
index.html            entry point
src/bb.js             shared constants, SVG→texture helper, synthesized SFX
src/art/              vector art: android18.js (fighter), scenery.js (backgrounds)
src/data/roster.js    fighter stats, moves, colors
src/scenes/           boot → title → select → stage
vendor/               phaser.min.js, embedded OFL fonts
```

## Status

- [x] Title screen with animated parallax scenery and menu
- [x] Character select with stats, moves, roster (1 playable, 3 locked slots)
- [ ] Stage 1 combat: movement, combos, grabs, enemy waves
