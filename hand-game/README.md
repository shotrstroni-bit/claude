# Hexslinger

A webcam wizard game. Your camera tracks both hands, and spectral 3D hands copy
every finger. Hexlings pour out of a portal at the far end of a moonlit tower
courtyard; you hold them off with two powers:

- **Telekinesis.** Aim with an open hand: whatever's under your hand lights up.
  Close your hand (fist or pinch) to lift it. Move your hand to steer it, pull
  back to bring it closer, then **push your hand toward the screen** to hurl it.
  Opening your hand drops it, or throws it if it's moving. Thrown things smash
  hexlings and score half again as much as gun kills.
- **The revolver.** Make a **finger gun** (index out, other fingers curled) and
  a Colt Python appears in your hand. **Raise your thumb** to cock the hammer,
  **drop it** to fire. **Flick your hand up** to reload; an empty gun reloads
  itself.

Grab the glowing stone to start. Waves get bigger and faster; brutes take three
bullets or two hits. Three hexlings reaching you ends the run.

## The Colt Python

Modelled from scratch in code at real size (11.5 in long, 6 in barrel): vent
rib, full-length underlug, red ramp front sight, adjustable rear sight, a fluted
six-shot cylinder with stop notches, walnut target grips with checkering and the
Colt medallion, and the PYTHON .357 roll mark. Every mechanism works:

- the hammer cocks back and the cylinder turns one chamber clockwise, as Colts do
- single action (cock, then fire) and double action (the trigger does it all)
- firing strikes the primer of the chamber under the hammer, with muzzle flash,
  cylinder-gap flash, smoke, recoil and a tracer
- reload: the latch pulls back, the crane swings the cylinder out to the left,
  the gun tips up, the ejector star pushes the cases out (they fall and ring on
  the stones), six fresh rounds slide in, and the cylinder snaps shut
- every sound is synthesised: hammer clicks, the shot and its echo, casings,
  the ratchet of a spinning cylinder

**Inspect the revolver** on the title screen to turn it over and work it with
buttons or keys (C cock, Space fire, O open, S spin, R reload), no camera needed.

## Run it

The camera only works on `https://` pages or on `localhost`, so opening
`index.html` straight from disk won't work.

**GitHub Pages:** in the repository's **Settings → Pages**, deploy this branch
from `/ (root)`; the game is then at `https://<user>.github.io/<repo>/hand-game/`.

**Local server**, from the repository root:

```sh
npx serve hand-game
python -m http.server 8000 --directory hand-game
```

## Getting smooth tracking

- Light your hands from the front, keep them 30–60 cm from the camera and fully in frame.
- The corner readout shows the tracking rate and render rate. If tracking stays
  low, open **Settings → Hand tracker** and try the other engine (GPU or CPU).
- **Graphics → Auto** lowers the render resolution when frames run slow; **Fast**
  also turns shadows off.
- **Hand distance calibration** makes telekinesis depth exact for your camera:
  hold an open hand at a measured distance, enter it, press Calibrate.

## How it works

1. **Tracking off the main thread** (`src/trackerWorker.js`): MediaPipe Hand
   Landmarker runs in a web worker, fed downscaled camera frames, so it never
   stalls rendering. It falls back to the CPU, then to the main thread, where
   needed.
2. **Hands in 3D** (`src/tracker.js`): a least-squares solve places MediaPipe's
   metric hand at the right distance from the camera, then each joint goes on
   the camera ray through its pixel so the 3D hand lines up with your real one.
   One Euro filters remove jitter.
3. **Prediction:** joint velocities extrapolate every hand to the moment the
   frame reaches the screen, hiding the camera and tracking delay. A hand
   that's briefly lost (turned edge-on, motion blur) coasts for half a second
   instead of vanishing.
4. **Gestures** are measured on the 3D hand, so they work whichever way it
   faces: how straight each finger is, and the thumb and pinch distances
   relative to palm size.
5. **Rigging** (`src/handRig.js`): 21 tracked joints drive a 25-bone skinned
   hand mesh by comparing frames built the same way on the tracked pose and on
   the mesh's rest pose.

| File | Purpose |
| --- | --- |
| `src/main.js` | Start-up, title screen, armory, settings, main loop |
| `src/tracker.js`, `src/trackerWorker.js` | Camera, MediaPipe, depth, smoothing, prediction, gestures |
| `src/handRig.js` | Skinned hands, skeleton look, hand materials |
| `src/revolver/model.js` | The Colt Python geometry and textures |
| `src/revolver/revolver.js` | Hammer, trigger, cylinder, crane, ejector, recoil |
| `src/game/hexslinger.js` | Telekinesis, revolver handling, waves, scoring |
| `src/world/arena.js` | The courtyard, sky, braziers and portal |
| `src/world/props.js`, `src/world/enemies.js` | Throwable props and hexlings |
| `src/scene.js` | Renderer, camera, adaptive resolution |
| `src/fx.js`, `src/audio.js` | Particles, smoke, tracers, synthesised sound |

## Credits

- Hand meshes: `generic-hand` from [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles),
  MIT licence (`assets/hands/LICENSE.md`).
- [three.js](https://threejs.org) (MIT) and MediaPipe Tasks Vision (Apache 2.0),
  loaded from the jsDelivr CDN; the hand model file loads from Google's
  MediaPipe model storage.
- Colt and Python are trademarks of Colt's Manufacturing Company; this is a fan
  model in a game, not an affiliated product.
