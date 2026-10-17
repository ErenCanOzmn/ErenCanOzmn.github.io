(() => {
  'use strict';
  if (typeof window !== 'undefined') {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!motion.matches && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08 });
      document.querySelectorAll('.section-heading, .post-row, .closing').forEach((item) => {
        item.classList.add('reveal');
        observer.observe(item);
      });
      motion.addEventListener('change', () => {
        if (motion.matches) {
          observer.disconnect();
          document.querySelectorAll('.reveal').forEach(item => item.classList.add('is-visible'));
        }
      });
    }
    const progress = document.querySelector('.reading-progress');
    let pending = false;
    const updateProgress = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      if (progress) progress.style.transform = `scaleX(${height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0})`;
      pending = false;
    };
    window.addEventListener('scroll', () => {
      if (!pending) { pending = true; window.requestAnimationFrame(updateProgress); }
    }, { passive: true });
    window.addEventListener('resize', updateProgress, { passive: true });
    updateProgress();
  }
  const filters = document.querySelector('.filters');
  if (!filters) return;
  const buttons = [...filters.querySelectorAll('button[data-filter]')];
  const posts = [...document.querySelectorAll('.post-row')];
  const status = document.querySelector('#filter-status');
  filters.hidden = false;
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    const category = button.dataset.filter;
    buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    let count = 0;
    posts.forEach((post) => {
      const visible = category === 'all' || post.dataset.category.split('|').includes(category);
      post.hidden = !visible;
      if (visible) count++;
    });
    status.textContent = `${count} yazı gösteriliyor.`;
  });
})();
