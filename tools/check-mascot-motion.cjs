// Run with node tools/check-mascot-motion.cjs. No third-party packages required.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/js/mascot-motion.js'), 'utf8'), { window });
const model = window.DizmanaMascotMotion;
const start = { pose: { x: 0, y: 0, angle: 0 }, paws: [{ x: 65, y: 81 }, { x: 82, y: 81 }] };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let samples = 0;
for (const x of [49, 55, 65, 72, 79, 89, 98]) for (const y of [79, 83, 88, 92]) {
  const side = x < 73 ? 0 : 1;
  let previous = model.sample(start, { x, y }, side, 0);
  for (let frame = 1; frame <= 1000; frame++) {
    const state = model.sample(start, { x, y }, side, frame / 1000);
    state.arms.forEach((arm, index) => {
      assert(arm.reachable, `Key ${x},${y} is out of reach`);
      assert(Math.abs(distance(arm.shoulder, arm.elbow) - 15) < .0001, 'Upper arm length changed');
      assert(Math.abs(distance(arm.elbow, arm.wrist) - 15) < .0001, 'Forearm length changed');
      assert(distance(state.paws[index], previous.paws[index]) < .3, 'Paw jumped between frames');
    });
    previous = state;
    samples++;
  }
  const contact = model.sample(start, { x, y }, side, .56);
  assert(Math.abs(contact.paws[side].x - x) < .001 && Math.abs(contact.paws[side].y + 1.9 - y) < .001, 'Contact missed key');
  assert(distance(previous.paws[side], start.paws[side]) < .001, 'Paw did not return home');
  assert(Math.abs(previous.pose.x) < .001 && Math.abs(previous.pose.angle) < .001, 'Torso did not settle');
}
console.log(`PASS: ${samples} poses, connected limbs, fixed bone lengths, continuous reach/return, accurate key contact.`);
