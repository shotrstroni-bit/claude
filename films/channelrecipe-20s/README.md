# ChannelRecipe: 20s 3D cut with avatar

- `VO_SCRIPT.md`: the voiceover script to record.
- **To swap in the real voice:** drop the file in as `vo/vo.wav` (or `.mp3`, `.m4a`, `.flac`), then run `node render.mjs films/channelrecipe-20s`.
  `build.mjs` re-analyses the read: it splits it into lines, times the words, extracts lip-sync, re-snaps every cut and hit to the beat grid, and ducks the score under the voice. The film follows automatically.
- Until a real VO is supplied, `vo/scratch.wav` (espeak placeholder) is used. `cues.json` will say `"vo": "scratch"`.

Pipeline: `vo/*` → `vo.json` (lines, words, mouth) → `cues.json` → synthesized score → `beats.json` (measured) → `out/audio.wav` → frames via `window.seek(t)` → H.264, -14 LUFS.
