import * as THREE from 'three';

// A product configurator: the same renderer and the same frame loop as a game, and not
// a game. Two signals, which is why the threshold is three.
const scene = new THREE.Scene();

function render() {
  requestAnimationFrame(render);
}

render();
