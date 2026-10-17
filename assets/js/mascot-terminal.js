(() => {
  'use strict';
  const stage = document.querySelector('.mascot-stage');
  if (!stage) return;
  const command = stage.querySelector('[data-terminal-command]');
  const output = stage.querySelector('[data-terminal-output]');
  const badge = stage.querySelector('.mascot-event');
  const control = stage.querySelector('.mascot-pause');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const keyboard = stage.querySelector('.mascot-keyboard');
  const keyGrid = stage.querySelector('.keyboard-grid');
  const keys = [];
  const rows = [
    ['ESC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', 'ENTER'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'SPACE']
  ];
  rows.forEach((row, y) => {
    let column = 0;
    row.forEach(label => {
      const span = label === 'SPACE' || label === 'ENTER' ? 2 : 1;
      const key = document.createElement('span');
      key.className = 'keycap' + (span === 6 ? ' key-space' : span === 2 ? ' key-wide' : '');
      key.dataset.key = label;
      key.textContent = label === 'SPACE' ? '—' : label === 'ENTER' ? '↵' : label;
      keyGrid.append(key);
      keys.push({ element: key, label, x: (column + span / 2) / 12, y: (y + .5) / 4 });
      column += span;
    });
  });
  let activeKey = null;
  const clearStrike = () => {
    keys.forEach(key => { key.element.classList.remove('is-down'); key.element.removeAttribute('data-active-key'); });
    keyboard.classList.remove('key-impact');
  };
  function lightKey(value) {
    clearStrike();
    const label = value === ' ' ? 'SPACE' : value.toUpperCase();
    activeKey = keys.find(key => key.label === label);
    if (!activeKey) return;
    activeKey.element.classList.add('is-down');
    keyboard.style.setProperty('--hit-x', (activeKey.x * 100) + '%');
    keyboard.style.setProperty('--hit-y', (activeKey.y * 100) + '%');
    keyboard.classList.add('key-impact');
  }
  // Scripted decorative scenes only. Strings are rendered as text, never executed.
  const token = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const scenes = [
    () => ({ command: 'whoami', lines: ['safiye', 'curiosity=100%'], badge: 'SAFIYE ONLINE' }),
    () => ({ command: 'cat demo-session.txt', lines: ['cookie=demo_' + token(), 'session: fictional / local'], badge: 'COOKIE FOUND' }),
    () => ({ command: 'cat root.txt', lines: ['[lab] challenge complete', 'flag{curiosity_pwns_boredom}', 'pwned!'], badge: 'pwned!' }),
    () => ({ command: 'printf "\\x6d\\x65\\x6f\\x77"', lines: ['meow', 'hex decoded. snack required.'], badge: 'DECODED' }),
    () => ({ command: 'cat research.log', lines: ['[ok] notes indexed', '[ok] coffee warm', '[!!] treats running low'], badge: 'SNACK OVERFLOW' }),
    () => ({ command: 'pwd', lines: ['/home/dizmana/lab', 'next stop: another rabbit hole.'], badge: 'LAB ONLINE' })
  ];
  let timer = null;
  let visible = true;
  let paused = false;
  let previous = -1;
  let current = null;
  let character = 0;
  let line = 0;
  let phase = 'start';
  const runnable = () => visible && !paused && !document.hidden && !motion.matches;
  const schedule = (delay) => {
    clearTimeout(timer);
    timer = null;
    if (runnable()) timer = setTimeout(step, delay);
  };
  function step() {
    timer = null;
    if (!runnable()) return;
    if (phase === 'start') {
      let index = previous < 0 ? 0 : Math.floor(Math.random() * (scenes.length - 1));
      if (previous >= 0 && index >= previous) index++;
      previous = index;
      current = scenes[index]();
      character = 0;
      line = 0;
      command.textContent = '';
      output.replaceChildren();
      badge.textContent = '';
      stage.classList.remove('event-complete');
      stage.classList.add('is-typing');
      phase = 'typing';
      schedule(400);
    } else if (phase === 'typing') {
      lightKey(current.command[character]);
      command.textContent = current.command.slice(0, ++character);
      phase = 'release';
      schedule(90);
    } else if (phase === 'release') {
      clearStrike();
      if (character >= current.command.length) {
        stage.classList.remove('is-typing');
        phase = 'output';
        schedule(500);
      } else {
        phase = 'typing';
        schedule(45 + Math.random() * 85);
      }
    } else if (phase === 'output') {
      const paragraph = document.createElement('p');
      paragraph.className = 'terminal-answer';
      paragraph.textContent = current.lines[line++];
      output.append(paragraph);
      if (line >= current.lines.length) {
        badge.textContent = current.badge;
        stage.classList.add('event-complete');
        phase = 'start';
        schedule(3200 + Math.random() * 2000);
      } else schedule(500);
    }
  }
  function sync() {
    clearTimeout(timer);
    timer = null;
    stage.classList.toggle('terminal-paused', !runnable());
    if (!runnable()) clearStrike();
    control.hidden = motion.matches;
    if (motion.matches) {
      clearStrike();
      phase = 'start';
      stage.classList.remove('is-typing', 'event-complete');
      command.textContent = 'whoami';
      output.replaceChildren();
      const paragraph = document.createElement('p');
      paragraph.className = 'terminal-answer';
      paragraph.textContent = 'safiye';
      output.append(paragraph);
      badge.textContent = '';
    }
    if (runnable()) schedule(600);
  }
  control.addEventListener('click', () => {
    paused = !paused;
    control.setAttribute('aria-pressed', String(paused));
    control.textContent = paused ? 'Terminali devam ettir' : 'Terminali duraklat';
    sync();
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.15 });
    observer.observe(stage);
  }
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  sync();
})();
