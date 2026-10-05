window.BB = window.BB || {};

BB.TitleScene = class extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const { W, H } = BB;
    this.cameras.main.fadeIn(400, 255, 255, 255);

    this.add.image(0, 0, 'sky').setOrigin(0);
    this.clouds = [
      [140, 70, 'cloud0', 1.1, 9], [560, 140, 'cloud1', 0.8, 6], [880, 60, 'cloud2', 1.0, 12],
      [1180, 170, 'cloud0', 0.7, 5], [320, 230, 'cloud2', 0.6, 4]
    ].map(([x, y, k, s, v]) => {
      const c = this.add.image(x, y, k).setScale(s).setAlpha(0.95);
      c.speed = v;
      return c;
    });
    this.far = this.add.tileSprite(0, 300, W, 260, 'mesaFar').setOrigin(0);
    this.near = this.add.tileSprite(0, 330, W, 330, 'mesaNear').setOrigin(0);
    this.add.image(0, 640, 'ground').setOrigin(0);

    const glow = this.add.image(960, 380, 'glow').setTint(0x39c6ff).setAlpha(0.45).setScale(2.6);
    this.tweens.add({ targets: glow, alpha: 0.65, scale: 2.8, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.hero = this.add.image(1380, 40, 'a18_full').setOrigin(0.5, 0).setScale(0.88);
    this.tweens.add({
      targets: this.hero, x: 960, duration: 700, ease: 'Cubic.easeOut', delay: 250,
      onComplete: () => {
        this.tweens.add({ targets: this.hero, scaleY: 0.888, y: 36, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });

    this.add.image(-30, 720, 'bush').setOrigin(0, 1).setScale(1.1);
    this.add.image(1310, 730, 'bush').setOrigin(1, 1).setScale(-1.2, 1.2);

    this.buildLogo();

    this.prompt = this.add.text(400, 560, 'PRESS ENTER OR CLICK', {
      fontFamily: BB.FONT_UI, fontSize: '32px', fontStyle: '700', color: '#ffffff',
      stroke: '#1a1030', strokeThickness: 7
    }).setOrigin(0.5).setLetterSpacing(4).setAlpha(0);
    this.tweens.add({ targets: this.prompt, alpha: 1, delay: 1100, duration: 300 });
    this.blink = this.tweens.add({ targets: this.prompt, alpha: 0.25, duration: 600, yoyo: true, repeat: -1, delay: 1400 });

    this.add.text(16, H - 12, 'v0.1 prototype', {
      fontFamily: BB.FONT_UI, fontSize: '16px', color: '#ffffff', stroke: '#1a1030', strokeThickness: 4
    }).setOrigin(0, 1).setAlpha(0.8);

    this.menuOpen = false;
    this.leaving = false;
    this.input.keyboard.on('keydown', (e) => this.onKey(e));
    this.input.on('pointerdown', () => { if (!this.menuOpen) this.openMenu(); });
  }

  buildLogo() {
    const style = (size) => ({
      fontFamily: BB.FONT_DISPLAY, fontSize: size + 'px', color: '#ffffff',
      stroke: '#1a1030', strokeThickness: 14,
      shadow: { offsetX: 0, offsetY: 10, color: '#1a1030', blur: 0, fill: true, stroke: true },
      padding: { x: 12, y: 12 }
    });
    const top = this.add.text(0, -70, 'BOMBSHELL', style(118)).setOrigin(0.5).setLetterSpacing(4);
    const bottom = this.add.text(18, 46, 'BRAWL', style(178)).setOrigin(0.5).setLetterSpacing(8);
    [[top, ['#ffffff', '#fff1a0', '#ffb347']], [bottom, ['#fff6c2', '#ff8a3d', '#ff3d7f']]].forEach(([t, stops]) => {
      const g = t.context.createLinearGradient(0, 0, 0, t.height);
      g.addColorStop(0.2, stops[0]); g.addColorStop(0.55, stops[1]); g.addColorStop(0.85, stops[2]);
      t.setFill(g);
    });
    const tag = this.add.text(0, 150, "A  CURVY  BEAT 'EM UP", {
      fontFamily: BB.FONT_UI, fontSize: '28px', fontStyle: '700', color: '#ffffff',
      stroke: '#1a1030', strokeThickness: 7
    }).setOrigin(0.5).setLetterSpacing(6);

    this.logo = this.add.container(400, -260, [top, bottom, tag]).setRotation(-0.06);
    this.tweens.add({ targets: this.logo, y: 250, duration: 750, ease: 'Back.easeOut', delay: 150 });
    this.tweens.add({ targets: this.logo, scale: 1.025, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1000 });
  }

  openMenu() {
    if (this.menuOpen || this.leaving) return;
    this.menuOpen = true;
    BB.Sfx.start();
    this.blink.stop();
    this.prompt.destroy();
    this.cameras.main.flash(180, 255, 255, 255);

    this.items = [
      { label: 'START GAME', action: () => this.startGame() },
      { label: 'GALLERY', locked: true },
      { label: 'OPTIONS', locked: true }
    ];
    this.cursor = 0;
    this.itemTexts = this.items.map((it, i) => {
      const t = BB.makeButtonText(this, 400, 500 + i * 58, it.label, 36).setLetterSpacing(4).setAlpha(0);
      if (it.locked) t.setColor('#c9c3e6');
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => this.setCursor(i));
      t.on('pointerdown', (p, x, y, ev) => { ev.stopPropagation(); this.setCursor(i); this.choose(); });
      this.tweens.add({ targets: t, alpha: 1, x: { from: 340, to: 400 }, duration: 250, delay: i * 60 });
      return t;
    });
    this.arrowL = this.add.text(0, 0, '▶', { fontFamily: 'Arial', fontSize: '26px', color: '#ffd84a', stroke: '#1a1030', strokeThickness: 5 }).setOrigin(0.5);
    this.arrowR = this.add.text(0, 0, '◀', { fontFamily: 'Arial', fontSize: '26px', color: '#ffd84a', stroke: '#1a1030', strokeThickness: 5 }).setOrigin(0.5);
    this.tweens.add({ targets: [this.arrowL], x: '+=6', duration: 350, yoyo: true, repeat: -1 });
    this.toast = this.add.text(400, 680, '', {
      fontFamily: BB.FONT_UI, fontSize: '22px', fontStyle: '700', color: '#ffe8f2', stroke: '#1a1030', strokeThickness: 5
    }).setOrigin(0.5);
    this.setCursor(0, true);
  }

  setCursor(i, silent) {
    if (i === this.cursor && !silent) return;
    this.cursor = i;
    if (!silent) BB.Sfx.move();
    this.itemTexts.forEach((t, j) => {
      const on = j === i;
      t.setScale(on ? 1.12 : 1);
      t.setColor(on ? '#ffd84a' : (this.items[j].locked ? '#c9c3e6' : '#ffffff'));
    });
    const t = this.itemTexts[i];
    this.arrowL.setPosition(400 - t.width * 0.62 - 18, t.y);
    this.arrowR.setPosition(400 + t.width * 0.62 + 18, t.y);
  }

  choose() {
    const it = this.items[this.cursor];
    if (it.locked) {
      BB.Sfx.locked();
      this.toast.setText(it.label + ' — COMING SOON').setAlpha(1);
      this.tweens.killTweensOf(this.toast);
      this.tweens.add({ targets: this.toast, alpha: 0, delay: 1200, duration: 400 });
      this.cameras.main.shake(120, 0.004);
      return;
    }
    it.action();
  }

  onKey(e) {
    if (!this.menuOpen) { this.openMenu(); return; }
    const k = e.code;
    if (k === 'ArrowUp' || k === 'KeyW') this.setCursor((this.cursor + this.items.length - 1) % this.items.length);
    else if (k === 'ArrowDown' || k === 'KeyS') this.setCursor((this.cursor + 1) % this.items.length);
    else if (k === 'Enter' || k === 'Space' || k === 'KeyJ' || k === 'KeyZ') this.choose();
  }

  startGame() {
    if (this.leaving) return;
    this.leaving = true;
    BB.Sfx.confirm();
    this.cameras.main.fadeOut(350, 10, 8, 20);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Select'));
  }

  update(time, delta) {
    const dt = delta / 1000;
    this.far.tilePositionX += 6 * dt;
    this.near.tilePositionX += 14 * dt;
    this.clouds.forEach((c) => {
      c.x -= c.speed * dt;
      if (c.x < -140) c.x = BB.W + 140;
    });
  }
};
