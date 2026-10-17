/* Articulated mascot. Everything uses the same 100 x 100 stage space. */
(() => {
  'use strict';
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const ease = t => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
  const mix = (a, b, t) => a + (b - a) * t;
  const lerpPoint = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
  const pivot = { x: 68, y: 72 };
  const anchors = [{ x: 62, y: 58 }, { x: 78, y: 57 }];
  const homes = [{ x: 65, y: 81 }, { x: 82, y: 81 }];
  const transform = (point, pose) => {
    const angle = pose.angle * Math.PI / 180;
    const x = point.x - pivot.x, y = point.y - pivot.y;
    return { x: pivot.x + x * Math.cos(angle) - y * Math.sin(angle) + pose.x,
      y: pivot.y + x * Math.sin(angle) + y * Math.cos(angle) + pose.y };
  };
  // A two-bone chain: the elbow always remains connected to shoulder and wrist.
  function solveArm(shoulder, wrist, side) {
    const dx = wrist.x - shoulder.x, dy = wrist.y - shoulder.y;
    const distance = Math.hypot(dx, dy);
    const upper = 15, lower = 15;
    const d = clamp(distance, .001, upper + lower - .01);
    const ux = dx / (distance || 1), uy = dy / (distance || 1);
    const along = (upper * upper - lower * lower + d * d) / (2 * d);
    const altitude = Math.sqrt(Math.max(0, upper * upper - along * along));
    const direction = side === 0 ? 1 : -1;
    return { shoulder, elbow: { x: shoulder.x + ux * along - uy * altitude * direction,
      y: shoulder.y + uy * along + ux * altitude * direction }, wrist,
      reachable: distance <= upper + lower };
  }
  function sample(start, target, side, progress) {
    const p = clamp(progress, 0, 1);
    const reach = ease((p - .12) / .44);
    const recover = ease((p - .76) / .24);
    const leanAmount = ease(p / .3) * (1 - recover);
    const displacement = target.x - homes[side].x;
    const pose = { x: mix(start.pose.x, clamp(displacement * .4, -8, 8), leanAmount),
      y: mix(start.pose.y, clamp((target.y - 76) * .4, 0, 6), leanAmount),
      angle: mix(start.pose.angle, clamp(displacement * .5, -10, 10), leanAmount) };
    // The body returns continuously, never snaps to neutral between keystrokes.
    if (p > .76) { pose.x *= 1 - recover; pose.y *= 1 - recover; pose.angle *= 1 - recover; }
    const paws = start.paws.map(point => ({ ...point }));
    const contact = { x: target.x, y: target.y - 1.9 };
    if (p < .56) {
      paws[side] = lerpPoint(start.paws[side], contact, reach);
      paws[side].y -= Math.sin(reach * Math.PI) * 5;
    } else if (p < .66) {
      paws[side] = { ...contact };
      paws[side].y += Math.sin((p - .56) / .1 * Math.PI) * .35;
    } else {
      const retreat = ease((p - .66) / .34);
      paws[side] = lerpPoint(contact, homes[side], retreat);
      paws[side].y -= Math.sin(retreat * Math.PI) * 2.5;
    }
    paws[1 - side] = lerpPoint(start.paws[1 - side], homes[1 - side], ease(p));
    return { pose, paws, arms: paws.map((wrist, index) => solveArm(transform(anchors[index], pose), wrist, index)) };
  }
  function create(stage) {
    const cat = stage.querySelector('#calico-cat');
    const body = stage.querySelector('.mascot-pose');
    const groups = [...stage.querySelectorAll('.rig-arm')];
    const nodes = groups.map(group => ({ group, outline: group.querySelector('.sleeve-outline'),
      fill: group.querySelector('.sleeve-fill'), seam: group.querySelector('.sleeve-seam'), paw: group.querySelector('.rig-paw') }));
    let current = { pose: { x: 0, y: 0, angle: 0 }, paws: homes.map(point => ({ ...point })) };
    let action = null, frame = 0, previous = null, suspended = false;
    let stageSize = stage.getBoundingClientRect();
    const paint = state => {
      body.style.transform = `translate(${state.pose.x * stageSize.width / 100}px, ${state.pose.y * stageSize.height / 100}px) rotate(${state.pose.angle}deg)`;
      state.paws.forEach((wrist, side) => {
        const arm = solveArm(transform(anchors[side], state.pose), wrist, side);
        const { shoulder: s, elbow: e, wrist: w } = arm;
        const nearElbow = lerpPoint(s, e, .83), afterElbow = lerpPoint(e, w, .17);
        const path = `M ${s.x} ${s.y} L ${nearElbow.x} ${nearElbow.y} Q ${e.x} ${e.y} ${afterElbow.x} ${afterElbow.y} L ${w.x} ${w.y - 2.6}`;
        nodes[side].outline.setAttribute('d', path);
        nodes[side].fill.setAttribute('d', path);
        nodes[side].seam.setAttribute('d', path);
        const angle = clamp((w.x - e.x) * -.55, -11, 11);
        nodes[side].paw.setAttribute('transform', `translate(${w.x} ${w.y}) rotate(${angle})`);
      });
    };
    function gaze(target) {
      cat.dispatchEvent(new CustomEvent('mascot-work-gaze', { detail: target ? { x: clamp((target.x - 70) / 35, -.8, .8), y: .7 } : null }));
    }
    function tick(now) {
      frame = 0;
      if (!action || suspended) return;
      const delta = previous === null ? 0 : Math.min(now - previous, 40);
      previous = now;
      action.elapsed += delta;
      const progress = Math.min(1, action.elapsed / action.duration);
      current = sample(action.start, action.target, action.side, progress);
      paint(current);
      if (progress >= .56 && !action.contacted) {
        action.contacted = true;
        nodes[action.side].group.classList.add('is-contact');
        action.onContact();
      }
      if (progress >= .66 && !action.released) {
        action.released = true;
        nodes[action.side].group.classList.remove('is-contact');
        action.onRelease();
      }
      if (progress >= 1) {
        const finished = action.onComplete;
        action = null;
        previous = null;
        finished();
      } else frame = requestAnimationFrame(tick);
    }
    const api = {
      strike(element, callbacks) {
        const area = stage.getBoundingClientRect(), key = element.getBoundingClientRect();
        stageSize = area;
        const target = { x: (key.left + key.width / 2 - area.left) / area.width * 100,
          y: (key.top + key.height / 2 - area.top) / area.height * 100 };
        const side = target.x < 73 ? 0 : 1;
        action = { start: structuredClone(current), target, side, elapsed: 0,
          duration: 720 + Math.min(320, Math.hypot(target.x - current.paws[side].x, target.y - current.paws[side].y) * 13),
          contacted: false, released: false, ...callbacks };
        previous = null;
        gaze(target);
        if (!suspended && !frame) frame = requestAnimationFrame(tick);
      },
      pause() { suspended = true; cancelAnimationFrame(frame); frame = 0; previous = null; },
      resume() { suspended = false; previous = null; if (action && !frame) frame = requestAnimationFrame(tick); },
      idle() { gaze(null); },
      reset() {
        cancelAnimationFrame(frame); frame = 0; action = null; previous = null;
        current = { pose: { x: 0, y: 0, angle: 0 }, paws: homes.map(point => ({ ...point })) };
        nodes.forEach(node => node.group.classList.remove('is-contact'));
        paint(current); gaze(null);
      },
      get busy() { return action !== null; }
    };
    window.addEventListener('resize', () => {
      stageSize = stage.getBoundingClientRect();
      // Remeasure the key after responsive layout changes without restarting the stroke.
      if (action) {
        const area = stage.getBoundingClientRect();
        const key = stage.querySelector('[data-active-key]');
        if (key) { const box = key.getBoundingClientRect(); action.target = { x: (box.left + box.width / 2 - area.left) / area.width * 100, y: (box.top + box.height / 2 - area.top) / area.height * 100 }; }
      }
      paint(current);
    }, { passive: true });
    paint(current);
    return api;
  }
  // Math is exposed alongside the renderer for deterministic continuity tests.
  window.DizmanaMascotMotion = { create, sample, solveArm, homes };
})();
