import Phaser from 'phaser';

// Progress lives only in the browser: cleared cache, private window or a new device
// and it is gone, with nothing telling the player the save was never real.
function saveGame(state) {
  localStorage.setItem('save', JSON.stringify(state));
}

new Phaser.Game({
  type: Phaser.AUTO,
  scene: {
    create() {
      saveGame({ level: 1 });
    },
  },
});
