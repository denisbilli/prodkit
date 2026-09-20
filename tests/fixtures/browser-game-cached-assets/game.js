import Phaser from 'phaser';

new Phaser.Game({
  type: Phaser.AUTO,
  canvas: document.getElementById('stage'),
  scene: {
    preload() {
      this.load.atlas('sprites', '/assets/sprites.png', '/assets/sprites.json');
    },
    create() {
      this.add.sprite(160, 120, 'sprites', 'runner');
    },
  },
});
