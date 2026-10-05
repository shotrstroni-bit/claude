window.BB = window.BB || {};

BB.BootScene = class extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const { W, H } = BB;
    const barBg = this.add.rectangle(W / 2, H / 2, 420, 14, 0x2a2140).setOrigin(0.5);
    const bar = this.add.rectangle(W / 2 - 210, H / 2, 0, 14, 0x39c6ff).setOrigin(0, 0.5);
    this.add.text(W / 2, H / 2 - 34, 'LOADING', {
      fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#9d90ff', fontStyle: 'bold'
    }).setOrigin(0.5).setLetterSpacing(6);

    const jobs = [
      ['sky', BB.Art.sky(W, H)],
      ['mesaFar', BB.Art.mesas('far')],
      ['mesaNear', BB.Art.mesas('near')],
      ['ground', BB.Art.ground()],
      ['cloud0', BB.Art.cloud(0)],
      ['cloud1', BB.Art.cloud(1)],
      ['cloud2', BB.Art.cloud(2)],
      ['bush', BB.Art.bush()],
      ['glow', BB.Art.glow()],
      ['a18_full', BB.Art.android18({ width: 560, height: 1260 })],
      ['a18_face', BB.Art.android18({ viewBox: '146 30 112 112', width: 240, height: 240 })]
    ];

    const fonts = document.fonts
      ? Promise.race([
          Promise.all([
            document.fonts.load('64px "Bangers"'),
            document.fonts.load('700 32px "Rajdhani"'),
            document.fonts.load('600 20px "Rajdhani"')
          ]),
          new Promise((r) => setTimeout(r, 2500))
        ]).catch(() => {})
      : Promise.resolve();

    let done = 0;
    const total = jobs.length + 1;
    const tick = () => { done++; bar.width = 420 * (done / total); };
    fonts.then(tick);

    Promise.all([fonts, ...jobs.map(([k, svg]) => BB.addSvgTexture(this, k, svg).then(tick))]).then(() => {
      this.makeUtilityTextures();
      this.time.delayedCall(150, () => this.scene.start('Title'));
      barBg.destroy();
    });
  }

  makeUtilityTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    for (let i = -64; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 64); g.lineTo(i + 6, 64); g.lineTo(i + 70, 0); g.lineTo(i + 64, 0);
      g.closePath(); g.fillPath();
    }
    g.generateTexture('diag', 64, 64);
    g.destroy();
  }
};
