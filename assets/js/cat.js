/**
 * Calico cat eye-tracking.
 * Moves each pupil toward the mouse cursor, clamped inside the eye.
 */
(function () {
  'use strict';

  var cat = document.getElementById('calico-cat');
  if (!cat) {
    return;
  }

  var MAX_X = 5; // max horizontal pupil travel (SVG units)
  var MAX_Y = 4; // max vertical pupil travel (SVG units)

  var eyes = [];
  cat.querySelectorAll('.cat-eye').forEach(function (socket) {
    var pupil = socket.querySelector('.cat-pupil');
    if (pupil) {
      eyes.push({ socket: socket, pupil: pupil, tx: 0, ty: 0, cx: 0, cy: 0 });
    }
  });

  var mouseX = window.innerWidth / 2;
  var mouseY = window.innerHeight / 2;

  function aim() {
    eyes.forEach(function (eye) {
      var rect = eye.socket.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;
      var dx = mouseX - centerX;
      var dy = mouseY - centerY;
      var dist = Math.hypot(dx, dy) || 1;
      eye.cx = (dx / dist) * MAX_X;
      eye.cy = (dy / dist) * MAX_Y;
    });
  }

  // Smoothly ease the pupils toward their target each frame.
  function render() {
    eyes.forEach(function (eye) {
      eye.tx += (eye.cx - eye.tx) * 0.2;
      eye.ty += (eye.cy - eye.ty) * 0.2;
      eye.pupil.setAttribute(
        'transform',
        'translate(' + eye.tx.toFixed(2) + ' ' + eye.ty.toFixed(2) + ')'
      );
    });
    requestAnimationFrame(render);
  }

  window.addEventListener(
    'mousemove',
    function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      aim();
    },
    { passive: true }
  );

  window.addEventListener('scroll', aim, { passive: true });
  window.addEventListener('resize', aim);

  aim();
  requestAnimationFrame(render);
})();
