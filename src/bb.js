window.BB = window.BB || {};

BB.W = 1280;
BB.H = 720;

BB.FONT_DISPLAY = '"Bangers", "Impact", sans-serif';
BB.FONT_UI = '"Rajdhani", "Arial Narrow", sans-serif';

// Rasterizes an SVG string into a Phaser texture. Works from file:// because it never uses XHR.
BB.addSvgTexture = function (scene, key, svg) {
  return new Promise((resolve) => {
    if (scene.textures.exists(key)) return resolve();
    const img = new Image();
    img.onload = () => {
      scene.textures.addImage(key, img);
      resolve();
    };
    img.onerror = () => {
      console.error('Failed to rasterize SVG texture:', key);
      resolve();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
};

BB.Sfx = (function () {
  let ctx = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (delay || 0);
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  return {
    move() { tone(880, 0.05, 'square', 0.035); },
    confirm() { tone(523, 0.08, 'square', 0.05); tone(784, 0.14, 'square', 0.05, null, 0.07); },
    back() { tone(392, 0.1, 'triangle', 0.06, 220); },
    locked() { tone(160, 0.18, 'sawtooth', 0.04, 90); },
    start() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.045, null, i * 0.07)); },
    whoosh() { tone(1200, 0.25, 'sawtooth', 0.025, 120); },
    ready() { tone(196, 0.3, 'sawtooth', 0.05, 392); tone(784, 0.25, 'square', 0.04, 1568, 0.12); }
  };
})();

BB.makeButtonText = function (scene, x, y, label, size) {
  return scene.add.text(x, y, label, {
    fontFamily: BB.FONT_UI,
    fontSize: (size || 34) + 'px',
    fontStyle: '700',
    color: '#ffffff',
    stroke: '#1a1030',
    strokeThickness: 6
  }).setOrigin(0.5);
};
