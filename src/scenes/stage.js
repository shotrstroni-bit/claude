window.BB = window.BB || {};

// Placeholder until the side-scrolling combat build lands.
BB.StageScene = class extends Phaser.Scene {
  constructor() { super('Stage'); }

  create() {
    const { W, H } = BB;
    this.cameras.main.fadeIn(350, 10, 8, 20);
    const f = BB.ROSTER.find((r) => r.id === this.registry.get('fighter')) || BB.ROSTER[0];

    this.add.image(0, 0, 'sky').setOrigin(0);
    this.add.tileSprite(0, 300, W, 260, 'mesaFar').setOrigin(0);
    this.add.tileSprite(0, 330, W, 330, 'mesaNear').setOrigin(0);
    this.add.image(0, 640, 'ground').setOrigin(0);
    this.add.ellipse(320, 700, 200, 22, 0x000000, 0.3);
    this.add.image(320, 706, f.portrait).setOrigin(0.5, 1).setScale(0.42);

    const banner = this.add.rectangle(W / 2, 84, W, 120, 0x0d0a1c, 0.75);
    this.add.text(W / 2, 66, 'STAGE 1  ·  ROCKY WASTELAND', {
      fontFamily: BB.FONT_DISPLAY, fontSize: '64px', color: '#ffd84a', stroke: '#0d0a1c', strokeThickness: 8
    }).setOrigin(0.5).setLetterSpacing(3);
    this.add.text(W / 2, 120, f.name + ' ENTERS THE FIGHT', {
      fontFamily: BB.FONT_UI, fontSize: '24px', fontStyle: '700', color: f.css
    }).setOrigin(0.5).setLetterSpacing(5);
    this.tweens.add({ targets: banner, scaleY: { from: 0, to: 1 }, duration: 250, ease: 'Quad.easeOut' });

    this.add.text(W / 2 + 160, 440, 'Combat build coming next:\nmovement · combos · grabs · enemy waves', {
      fontFamily: BB.FONT_UI, fontSize: '26px', fontStyle: '700', color: '#ffffff',
      stroke: '#0d0a1c', strokeThickness: 6, align: 'center'
    }).setOrigin(0.5);
    this.add.text(W / 2 + 160, 520, 'ESC  BACK TO SELECT', {
      fontFamily: BB.FONT_UI, fontSize: '22px', fontStyle: '700', color: '#ffffff',
      stroke: '#0d0a1c', strokeThickness: 5
    }).setOrigin(0.5).setLetterSpacing(3);

    this.input.keyboard.once('keydown-ESC', () => {
      BB.Sfx.back();
      this.scene.start('Select');
    });
  }
};
