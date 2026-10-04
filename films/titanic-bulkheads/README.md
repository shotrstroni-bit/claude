# Titanic: "the walls weren't the problem" (16:9 explainer)

1920×1080, 30 fps. The narration is the supplied YouTube script, verbatim, one sentence per line in `vo/script.json`.

## Swap in the real narration
1. Drop the read in as `vo/vo.wav` (or `.mp3`, `.m4a`, `.flac`): dry voice, no music.
2. Run `node render.mjs films/titanic-bulkheads --workers 4`

`build.mjs` then does the following:
- aligns the read to the 16 sentences
- times every word
- re-snaps every cue (door drop, lever, "No.", stamps, 2×) to the 96 BPM grid
- re-scores the music around the read and ducks it under the voice
- sets the film length to the read plus 3.2s
- writes `captions.srt` for YouTube

Until then, `vo/scratch.wav` (an espeak placeholder) drives the timing.

## Files
- `film.js`: every shot is a pure function of time (`window.seek(t)`).
- `build.mjs`: VO analysis → cues → synthesized score → measured `beats.json` → `out/audio.wav`.
- `captions.srt`: sentence-level captions timed to the current read.

## Diagram note
The ship drawings are schematic. Bulkhead spacing and deck heights are approximations for explanation, not plan-accurate measurements.
