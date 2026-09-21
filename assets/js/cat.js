(function () {
  'use strict';

  var cat = document.getElementById('calico-cat');
  if (!cat) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var target = { x: 0, y: 0 };
  var gaze = { x: 0, y: 0 };
  var head = { x: 0, y: 0 };
  var center = { x: 0, y: 0 };
  var frame = 0;
  var previousTime = 0;
  var returnTimer = 0;
  var blinkTimer = 0;
  var blinkStart = null;
  var lastPointer = null;

  function canAnimate() {
    return !reducedMotion.matches && !document.hidden;
  }

  function measure() {
    var bounds = cat.getBoundingClientRect();
    // Use the resting face position, so head motion cannot feed back into tracking.
    center.x = bounds.left + bounds.width * 0.61;
    center.y = bounds.top + bounds.width * 0.4;
  }

  function wake() {
    if (!frame && canAnimate()) {
      previousTime = 0;
      frame = requestAnimationFrame(render);
    }
  }

  function faceViewer() {
    lastPointer = null;
    target.x = 0;
    target.y = 0;
    clearTimeout(returnTimer);
    wake();
  }

  function aim(x, y) {
    var dx = x - center.x;
    var dy = y - center.y;
    // The soft distance limit keeps nearby pointer movements small and continuous.
    var distance = Math.hypot(dx, dy, 190);
    target.x = dx / distance;
    target.y = dy / distance;
    wake();
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (!canAnimate()) return;
    blinkTimer = setTimeout(function () {
      blinkStart = performance.now();
      wake();
    }, 3600 + Math.random() * 3500);
  }

  function paint() {
    cat.style.setProperty('--cat-eye-x', (gaze.x * 11).toFixed(3) + '%');
    cat.style.setProperty('--cat-eye-y', (gaze.y * 8).toFixed(3) + '%');
    cat.style.setProperty('--cat-head-x', (head.x * 0.9).toFixed(3) + 'px');
    cat.style.setProperty('--cat-head-y', (head.y * 0.65).toFixed(3) + 'px');
    cat.style.setProperty('--cat-yaw', (head.x * 4).toFixed(3) + 'deg');
    cat.style.setProperty('--cat-pitch', (-head.y * 2.5).toFixed(3) + 'deg');
    cat.style.setProperty('--cat-tilt', (head.x * 4.5).toFixed(3) + 'deg');
  }

  function render(now) {
    frame = 0;
    if (!canAnimate()) return;
    var elapsed = previousTime ? Math.min(now - previousTime, 50) : 16;
    previousTime = now;
    var eyeEase = 1 - Math.exp(-elapsed / 75);
    var headEase = 1 - Math.exp(-elapsed / 320);

    // Eyes settle first. The head follows slowly, without overshoot or full rotation.
    gaze.x += (target.x - gaze.x) * eyeEase;
    gaze.y += (target.y - gaze.y) * eyeEase;
    head.x += (target.x - head.x) * headEase;
    head.y += (target.y - head.y) * headEase;
    paint();

    if (blinkStart !== null) {
      var age = now - blinkStart;
      // A quick close, a short pause, and a softer reopening.
      var closure = age < 85 ? age / 85 : age < 115 ? 1 : Math.max(0, 1 - (age - 115) / 155);
      cat.style.setProperty('--cat-lid-y', (-110 * (1 - closure)).toFixed(2) + '%');
      if (age >= 270) {
        blinkStart = null;
        cat.style.setProperty('--cat-lid-y', '-110%');
        scheduleBlink();
      }
    }

    var remaining = Math.abs(target.x - gaze.x) + Math.abs(target.y - gaze.y) +
      Math.abs(target.x - head.x) + Math.abs(target.y - head.y);
    if (remaining > 0.001 || blinkStart !== null) {
      frame = requestAnimationFrame(render);
    } else {
      previousTime = 0;
    }
  }

  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(returnTimer);
    clearTimeout(blinkTimer);
    blinkStart = null;
    lastPointer = null;
    target.x = target.y = gaze.x = gaze.y = head.x = head.y = 0;
    cat.style.setProperty('--cat-lid-y', '-110%');
    paint();
  }

  function refreshMotion() {
    pause();
    if (canAnimate()) {
      measure();
      scheduleBlink();
    }
  }

  window.addEventListener('pointermove', function (event) {
    if (event.pointerType === 'touch' || !canAnimate()) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    aim(lastPointer.x, lastPointer.y);
    clearTimeout(returnTimer);
    returnTimer = setTimeout(faceViewer, 4200);
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', faceViewer);
  window.addEventListener('blur', faceViewer);
  window.addEventListener('resize', function () {
    measure();
    if (lastPointer) aim(lastPointer.x, lastPointer.y);
  }, { passive: true });
  document.addEventListener('visibilitychange', refreshMotion);
  reducedMotion.addEventListener('change', refreshMotion);

  measure();
  scheduleBlink();
})();
