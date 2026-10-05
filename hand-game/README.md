# Handspace

Webcam hand tracking that drives a true-scale 3D hand. Hold your hands up to the
camera and a rigged 3D hand copies every finger, at your hand's real size and
real distance from the camera. Two modes use it:

- **Orb Pop**: 60 seconds to touch as many floating orbs as you can. Quick pops
  in a row build a streak multiplier (up to ×5). Gold orbs only pop when you
  pinch them (thumb and index together). Start and restart by touching an orb,
  so you never need the mouse.
- **Sandbox**: a tray of balls with physics. Every joint of your hands is solid,
  so you can push and juggle them. Pinch a ball to pick it up; open your
  fingers mid-swing to throw it.

Everything runs in the browser. Video never leaves your device.

## Run it

The camera only works on `https://` pages or on `localhost`, so opening
`index.html` straight from disk won't work. Pick one:

**GitHub Pages (works on your phone too).** In the repository on GitHub, go to
**Settings → Pages**. Under *Build and deployment*, set *Source* to **Deploy from
a branch**, pick this branch and the `/ (root)` folder, then save. After a minute
the game is at `https://<your-username>.github.io/<repo>/hand-game/`.

**Local server.** From the repository root, run one of:

```sh
npx serve hand-game          # Node.js
python -m http.server 8000 --directory hand-game   # Python 3
```

Then open the address it prints (for example `http://localhost:8000`) in Chrome,
Edge, Firefox or Safari and allow the camera.

## Getting the best tracking

- Light your hands from the front; a bright window behind you makes them hard to see.
- Keep your hands 30–60 cm from the camera, fully in frame.
- **Settings → Background → My camera** draws the 3D hands over your video so you
  can see them line up.
- **True scale:** distance is worked out from your camera's field of view, which
  varies by camera. For an exact match, open **Settings**, hold one open hand
  facing the camera at a measured distance (40 cm is easy with a ruler), enter
  the distance and press **Calibrate**. The setting is saved.

## How it works

1. **Tracking**: [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
   finds up to two hands per frame. For each hand it returns 21 joints twice:
   as pixel positions in the image, and as a 3D hand in metres.
2. **Placing the hand in space** (`src/tracker.js`): a least-squares solve finds
   how far the metric 3D hand must be from a pinhole camera to project onto the
   pixel positions. Each joint is then put on the camera ray through its pixel,
   at that depth, so the 3D hand lands exactly on the real one. A One Euro
   filter (`src/oneEuro.js`) removes jitter without adding lag.
3. **Rigging** (`src/handRig.js`): the 21 joints drive a 25-bone skinned hand
   mesh. Each bone's rotation is the difference between a frame built from the
   tracked joints and the same frame built from the mesh's rest pose, so the
   mesh's own axis conventions don't matter. The four finger metacarpals that
   MediaPipe doesn't track are placed from the palm.
4. **Mirror view**: the selfie view flips left and right, which turns your right
   hand into a left-handed shape on screen, so the left mesh is used for it (and
   the other way round).

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Page, HUD, settings |
| `src/main.js` | Start-up, settings, main loop, camera thumbnail |
| `src/tracker.js` | Camera, MediaPipe, depth solve, smoothing, pinch detection |
| `src/handRig.js` | Skinned hand, skeleton look, hand materials |
| `src/demoHand.js` | Animated hand on the title screen |
| `src/scene.js` | Renderer, lights, the ruled studio (1 cm grid) |
| `src/game/pop.js` | Orb Pop |
| `src/game/sandbox.js` | Ball physics sandbox |
| `src/fx.js`, `src/audio.js` | Spark bursts, score labels, synthesised sound |

## Credits

- Hand meshes: `generic-hand` from [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles),
  MIT licence (`assets/hands/LICENSE.md`).
- [three.js](https://threejs.org) (MIT) and MediaPipe Tasks Vision (Apache 2.0),
  both loaded from the jsDelivr CDN. The hand model file loads from Google's
  MediaPipe model storage.
