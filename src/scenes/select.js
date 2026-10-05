window.BB = window.BB || {};

BB.SelectScene = class extends Phaser.Scene {
  constructor() { super('Select'); }

  create() {
    const { W, H } = BB;
    this.cameras.main.fadeIn(350, 10, 8, 20);
    this.leaving = false;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d1024, 0x1c1240, 0x120c2c, 0x2a1238, 1);
    bg.fillRect(0, 0, W, H);

    this.slab = this.add.graphics();
    const slabShape = this.make.graphics({ add: false });
    slabShape.fillStyle(0xffffff).fillPoints([{ x: 0, y: 0 }, { x: 610, y: 0 }, { x: 480, y: H }, { x: 0, y: H }], true);
    const slabMask = slabShape.createGeometryMask();
    this.lines = this.add.tileSprite(0, 0, 640, H, 'diag').setOrigin(0).setAlpha(0.09).setMask(slabMask);
    this.edge = this.add.graphics();

    this.bigName = this.add.text(70, H / 2, '', {
      fontFamily: BB.FONT_DISPLAY, fontSize: '210px', color: '#ffffff'
    }).setOrigin(0.5).setRotation(-Math.PI / 2).setAlpha(0.13).setMask(slabMask);

    this.shadow = this.add.ellipse(300, 706, 260, 26, 0x000000, 0.35);
    this.portrait = this.add.image(300, 712, 'a18_full').setOrigin(0.5, 1).setScale(690 / 1260);
    this.mystery = this.add.text(290, 380, '?', {
      fontFamily: BB.FONT_DISPLAY, fontSize: '360px', color: '#ffffff', stroke: '#0d0a1c', strokeThickness: 16,
      padding: { x: 40, y: 20 }
    }).setOrigin(0.5).setVisible(false);
    this.breathe = this.tweens.add({
      targets: this.portrait, scaleY: (690 / 1260) * 1.008, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    this.buildPanel();
    this.buildRoster();

    this.cursor = 0;
    this.showFighter(0, true);

    this.input.keyboard.on('keydown', (e) => this.onKey(e));
  }

  buildPanel() {
    const X = 640;
    this.add.text(X, 26, 'SELECT YOUR FIGHTER', {
      fontFamily: BB.FONT_UI, fontSize: '22px', fontStyle: '700', color: '#9d90ff'
    }).setLetterSpacing(6);
    this.add.rectangle(X, 58, 600, 2, 0x9d90ff, 0.4).setOrigin(0, 0.5);

    this.nameText = this.add.text(X - 4, 58, '', {
      fontFamily: BB.FONT_DISPLAY, fontSize: '88px', color: '#ffffff',
      stroke: '#0d0a1c', strokeThickness: 10,
      shadow: { offsetX: 6, offsetY: 6, color: '#000000', blur: 0, fill: true, stroke: true },
      padding: { x: 6, y: 6 }
    }).setLetterSpacing(3);
    this.titleText = this.add.text(X, 176, '', {
      fontFamily: BB.FONT_UI, fontSize: '26px', fontStyle: '700', color: '#39c6ff'
    }).setLetterSpacing(5);

    this.chips = this.add.container(X, 222);
    this.bioText = this.add.text(X, 248, '', {
      fontFamily: BB.FONT_UI, fontSize: '21px', fontStyle: '600', color: '#d9d4f0',
      wordWrap: { width: 590 }, lineSpacing: 2
    });

    this.statRows = ['POWER', 'SPEED', 'GRAPPLE', 'DEFENSE', 'ALLURE'].map((label, i) => {
      const y = 340 + i * 28;
      this.add.text(X, y, label, {
        fontFamily: BB.FONT_UI, fontSize: '20px', fontStyle: '700', color: '#ffffff'
      }).setOrigin(0, 0.5).setLetterSpacing(3);
      const segs = [];
      for (let s = 0; s < 5; s++) {
        this.add.rectangle(X + 130 + s * 62, y, 56, 14, 0x2a2348).setOrigin(0, 0.5);
        segs.push(this.add.rectangle(X + 130 + s * 62, y, 56, 14, 0x39c6ff).setOrigin(0, 0.5).setScale(0, 1));
      }
      return { label, segs };
    });

    this.add.text(X, 478, 'SIGNATURE MOVES', {
      fontFamily: BB.FONT_UI, fontSize: '20px', fontStyle: '700', color: '#9d90ff'
    }).setLetterSpacing(5);
    this.moveTexts = [0, 1, 2, 3].map((i) => {
      const x = X + (i % 2) * 300;
      const y = 506 + Math.floor(i / 2) * 52;
      const n = this.add.text(x, y, '', { fontFamily: BB.FONT_UI, fontSize: '21px', fontStyle: '700', color: '#ffffff' });
      const d = this.add.text(x, y + 23, '', { fontFamily: BB.FONT_UI, fontSize: '16px', fontStyle: '600', color: '#a9a2cc' });
      return [n, d];
    });

    const hint = { fontFamily: BB.FONT_UI, fontSize: '18px', fontStyle: '700', color: '#a9a2cc' };
    this.add.text(1240, 640, '◀ ▶  CHOOSE', hint).setOrigin(1, 0.5).setLetterSpacing(2);
    this.add.text(1240, 668, 'ENTER  CONFIRM', hint).setOrigin(1, 0.5).setLetterSpacing(2);
    this.add.text(1240, 696, 'ESC  BACK', hint).setOrigin(1, 0.5).setLetterSpacing(2);
  }

  buildRoster() {
    this.cards = BB.ROSTER.map((f, i) => {
      const x = 640 + 48 + i * 110;
      const y = 664;
      const frame = this.add.graphics();
      const parts = [frame];
      if (f.locked) {
        parts.push(this.add.text(0, 2, '?', {
          fontFamily: BB.FONT_DISPLAY, fontSize: '62px', color: f.css, stroke: '#0d0a1c', strokeThickness: 6
        }).setOrigin(0.5));
      } else {
        parts.push(this.add.image(0, 0, f.icon).setScale(86 / 240));
      }
      const card = this.add.container(x, y, parts).setSize(96, 96);
      card.frame = frame;
      card.fighter = f;
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => { if (this.cursor !== i) this.showFighter(i); });
      card.on('pointerdown', () => { if (this.cursor === i) this.confirm(); else this.showFighter(i); });
      return card;
    });
    this.p1 = this.add.text(0, 0, 'P1', {
      fontFamily: BB.FONT_DISPLAY, fontSize: '24px', color: '#ffd84a', stroke: '#0d0a1c', strokeThickness: 6
    }).setOrigin(0.5);
    this.tweens.add({ targets: this.p1, scale: 1.15, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  drawCards() {
    this.cards.forEach((c, i) => {
      const on = i === this.cursor;
      const f = c.fighter;
      c.frame.clear();
      c.frame.fillStyle(f.locked ? 0x1a1530 : f.colorDark, 1).fillRoundedRect(-48, -48, 96, 96, 10);
      c.frame.lineStyle(on ? 5 : 3, on ? 0xffd84a : f.color, on ? 1 : 0.6).strokeRoundedRect(-48, -48, 96, 96, 10);
      c.setScale(on ? 1.08 : 1).setAlpha(on || !f.locked ? 1 : 0.7);
    });
    const sel = this.cards[this.cursor];
    this.p1.setPosition(sel.x - 36, sel.y - 48).setDepth(1);
  }

  showFighter(i, instant) {
    this.cursor = i;
    const f = BB.ROSTER[i];
    if (!instant) BB.Sfx.move();
    this.drawCards();

    const { H } = BB;
    this.slab.clear();
    this.slab.fillGradientStyle(f.color, f.color, f.colorDark, f.colorDark, 1);
    this.slab.fillPoints([{ x: 0, y: 0 }, { x: 610, y: 0 }, { x: 480, y: H }, { x: 0, y: H }], true);
    this.edge.clear();
    this.edge.lineStyle(6, 0xffffff, 0.85).lineBetween(610, 0, 480, H);
    this.edge.lineStyle(2, f.color, 1).lineBetween(626, 0, 496, H);

    this.bigName.setText(f.locked ? 'LOCKED' : f.name);
    this.nameText.setText(f.name);
    this.titleText.setText(f.title).setColor(f.css);
    this.tweens.killTweensOf([this.nameText, this.mystery]);
    if (this.slideTween) this.slideTween.stop();
    this.nameText.setScale(1.15).setAlpha(0);
    this.tweens.add({ targets: this.nameText, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });

    this.chips.removeAll(true);
    let cx = 0;
    (f.locked ? ['LOCKED'] : f.tags).forEach((tag) => {
      const t = this.add.text(cx + 12, 0, tag, {
        fontFamily: BB.FONT_UI, fontSize: '16px', fontStyle: '700', color: '#0d0a1c'
      }).setOrigin(0, 0.5).setLetterSpacing(2);
      const r = this.add.rectangle(cx, 0, t.width + 24, 28, f.color).setOrigin(0, 0.5);
      this.chips.add([r, t]);
      cx += t.width + 34;
    });

    this.bioText.setText(f.locked
      ? "This fighter hasn't been revealed yet. New bombshells join the roster in future updates."
      : f.bio);

    this.statRows.forEach((row, r) => {
      const val = f.locked ? 0 : f.stats[row.label];
      row.segs.forEach((seg, s) => {
        this.tweens.killTweensOf(seg);
        seg.setFillStyle(f.color).setScale(0, 1);
        if (s < val) this.tweens.add({ targets: seg, scaleX: 1, duration: 140, delay: r * 45 + s * 35, ease: 'Quad.easeOut' });
      });
    });

    this.moveTexts.forEach(([n, d], m) => {
      const mv = f.locked ? ['???', ''] : f.moves[m];
      n.setText(mv[0]).setColor(m === 3 ? '#ffd84a' : '#ffffff');
      d.setText(mv[1]);
    });

    if (f.locked) {
      this.portrait.setVisible(false);
      this.shadow.setVisible(false);
      this.mystery.setVisible(true).setColor(f.css).setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: this.mystery, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    } else {
      this.mystery.setVisible(false);
      this.shadow.setVisible(true);
      this.portrait.setVisible(true).setTexture(f.portrait).clearTint().setAlpha(0).setX(240);
      this.slideTween = this.tweens.add({ targets: this.portrait, x: 300, alpha: 1, duration: 280, ease: 'Cubic.easeOut' });
    }
  }

  confirm() {
    if (this.leaving) return;
    const f = BB.ROSTER[this.cursor];
    if (f.locked) {
      BB.Sfx.locked();
      this.cameras.main.shake(140, 0.005);
      return;
    }
    this.leaving = true;
    this.registry.set('fighter', f.id);
    BB.Sfx.ready();
    this.cameras.main.flash(220, 255, 255, 255);
    this.portrait.setTintFill(0xffffff);
    this.time.delayedCall(120, () => this.portrait.clearTint());
    this.tweens.add({ targets: this.portrait, y: 700, duration: 90, yoyo: true, ease: 'Quad.easeOut' });

    const ready = this.add.text(BB.W / 2, BB.H / 2, 'READY!', {
      fontFamily: BB.FONT_DISPLAY, fontSize: '180px', color: '#ffd84a',
      stroke: '#0d0a1c', strokeThickness: 16,
      shadow: { offsetX: 8, offsetY: 8, color: '#000000', blur: 0, fill: true, stroke: true },
      padding: { x: 10, y: 10 }
    }).setOrigin(0.5).setScale(3).setAlpha(0).setRotation(-0.08);
    this.tweens.add({ targets: ready, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });

    this.time.delayedCall(1100, () => {
      this.cameras.main.fadeOut(350, 10, 8, 20);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Stage'));
    });
  }

  onKey(e) {
    if (this.leaving) return;
    const n = BB.ROSTER.length;
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') this.showFighter((this.cursor + n - 1) % n);
    else if (k === 'ArrowRight' || k === 'KeyD') this.showFighter((this.cursor + 1) % n);
    else if (k === 'Enter' || k === 'Space' || k === 'KeyJ' || k === 'KeyZ') this.confirm();
    else if (k === 'Escape' || k === 'Backspace') {
      this.leaving = true;
      BB.Sfx.back();
      this.cameras.main.fadeOut(300, 10, 8, 20);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
    }
  }

  update(time, delta) {
    this.lines.tilePositionX -= delta * 0.04;
    this.lines.tilePositionY += delta * 0.04;
  }
};
