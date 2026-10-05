/* global importScripts, Vision */
// Runs MediaPipe Hand Landmarker off the main thread, so hand tracking never
// stalls rendering. A classic (non-module) worker, because MediaPipe loads its
// WebAssembly glue with importScripts().

let landmarker = null;

function pack(result) {
  const handedness = result.handedness ?? result.handednesses ?? [];
  return result.landmarks.map((lm, i) => {
    const image = new Float32Array(63);
    const world = new Float32Array(63);
    const wl = result.worldLandmarks[i];
    for (let j = 0; j < 21; j++) {
      image[j * 3] = lm[j].x;
      image[j * 3 + 1] = lm[j].y;
      image[j * 3 + 2] = lm[j].z;
      world[j * 3] = wl[j].x;
      world[j * 3 + 1] = wl[j].y;
      world[j * 3 + 2] = wl[j].z;
    }
    const cat = handedness[i]?.[0];
    return { image, world, right: cat ? cat.categoryName === 'Right' : true, score: cat?.score ?? 0.5 };
  });
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      importScripts(msg.bundleUrl);
      const { FilesetResolver, HandLandmarker } = Vision;
      const fileset = await FilesetResolver.forVisionTasks(msg.wasmRoot);
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: msg.modelUrl, delegate: msg.delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        ...msg.thresholds,
      });
      self.postMessage({ type: 'ready', delegate: msg.delegate });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
    return;
  }
  if (msg.type === 'frame') {
    let hands = [];
    try {
      if (landmarker) hands = pack(landmarker.detectForVideo(msg.bitmap, msg.ts));
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    } finally {
      msg.bitmap.close();
    }
    self.postMessage({ type: 'result', id: msg.id, hands }, hands.flatMap((h) => [h.image.buffer, h.world.buffer]));
  }
};
