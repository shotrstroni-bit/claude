window.BB = window.BB || {};

BB.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: BB.W,
  height: BB.H,
  backgroundColor: '#0b0a12',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  scene: [BB.BootScene, BB.TitleScene, BB.SelectScene, BB.StageScene]
});
