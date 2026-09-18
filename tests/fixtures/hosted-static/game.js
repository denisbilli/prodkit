const ctx = document.getElementById('c').getContext('2d');
function draw() { ctx.clearRect(0, 0, 400, 400); requestAnimationFrame(draw); }
draw();
