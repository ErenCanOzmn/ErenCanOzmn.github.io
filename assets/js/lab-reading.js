(() => {
  'use strict';
  const article = document.querySelector('#article-content');
  if (!article) return;
  const compact = window.matchMedia('(max-width: 1050px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Keep controls above the code so they never obscure a line.
  article.querySelectorAll('div.highlight').forEach(block => {
    if (!block.querySelector('pre')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    const label = document.createElement('span');
    const language = [...block.parentElement.classList].find(name => name.startsWith('language-'))?.slice(9);
    label.textContent = !language || language === 'text' ? 'Kod' : language;
    toolbar.append(label);
    if (navigator.clipboard?.writeText) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'code-copy'; button.textContent = 'Kopyala';
      button.setAttribute('aria-label', 'Kod bloğunu kopyala');
      const feedback = document.createElement('span');
      feedback.className = 'sr-only'; feedback.setAttribute('role', 'status');
      let reset;
      button.addEventListener('click', async () => {
        const source = block.querySelector('.rouge-code pre') || block.querySelector('pre code') || block.querySelector('pre');
        clearTimeout(reset);
        try {
          await navigator.clipboard.writeText(source.textContent);
          button.textContent = 'Kopyalandı'; feedback.textContent = 'Kod kopyalandı.';
        } catch {
          button.textContent = 'Kopyalanamadı'; feedback.textContent = 'Kodu seçip elle kopyalayabilirsin.';
        }
        reset = setTimeout(() => { button.textContent = 'Kopyala'; }, 2200);
      });
      toolbar.append(button, feedback);
    }
    block.classList.add('code-block'); block.prepend(toolbar);
  });

  const toc = document.querySelector('.toc');
  const headings = [...article.querySelectorAll('h2, h3')];
  const links = new Map();
  if (toc && headings.length) {
    const list = toc.querySelector('ol');
    headings.forEach((heading, index) => {
      if (!heading.id) heading.id = `section-${index + 1}`;
      const item = document.createElement('li');
      if (heading.tagName === 'H3') item.className = 'toc-nested';
      const link = document.createElement('a');
      link.href = `#${encodeURIComponent(heading.id)}`; link.textContent = heading.textContent;
      link.addEventListener('click', () => {
        if (compact.matches) toc.open = false;
        heading.tabIndex = -1; heading.focus({ preventScroll: true });
      });
      item.append(link); list.append(item); links.set(heading, link);
    });
    toc.querySelector('.toc-count').textContent = `${headings.length} bölüm`;
    const syncToc = () => { toc.open = !compact.matches; };
    syncToc(); compact.addEventListener('change', syncToc);
    document.querySelector('.reading-aside').hidden = false;
  }

  const copyLink = document.querySelector('.copy-link');
  if (copyLink && navigator.clipboard?.writeText) {
    copyLink.hidden = false;
    copyLink.addEventListener('click', async () => {
      const status = document.querySelector('.copy-feedback');
      try { await navigator.clipboard.writeText(window.location.href); status.textContent = 'Bağlantı kopyalandı.'; }
      catch { status.textContent = 'Adres çubuğundaki bağlantıyı kopyalayabilirsin.'; }
    });
  }

  // A compact navigation bar appears when the reader scrolls back up.
  const readerNav = document.querySelector('.reader-nav');
  const tocButton = readerNav?.querySelector('[data-reader-toc]');
  if (tocButton) {
    tocButton.hidden = !headings.length;
    tocButton.addEventListener('click', () => {
      toc.open = true;
      toc.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
      toc.querySelector('summary').focus({ preventScroll: true });
      readerNav.hidden = true;
    });
  }
  let lastY = window.scrollY, up = 0, down = 0, scheduled = false;
  function updateReading() {
    const y = window.scrollY;
    const delta = y - lastY;
    if (delta < 0) { up -= delta; down = 0; }
    else if (delta > 0) { down += delta; up = 0; }
    if (readerNav && !readerNav.contains(document.activeElement)) {
      if (y < 250 || down > 12) readerNav.hidden = true;
      else if (up > 20) readerNav.hidden = false;
    }
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > 130) break;
      current = heading;
    }
    links.forEach((link, heading) => {
      const active = heading === current;
      link.classList.toggle('is-current', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
    lastY = y; scheduled = false;
  }
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateReading); }
  }, { passive: true });
  window.addEventListener('resize', updateReading, { passive: true });
  updateReading();

  // Native dialog supplies focus trapping, Escape, and an inert background.
  if (!('HTMLDialogElement' in window)) return;
  let viewer, viewerImage, viewport, caption, zoomButton, origin;
  function createViewer() {
    viewer = document.createElement('dialog'); viewer.className = 'image-dialog';
    viewer.setAttribute('aria-labelledby', 'image-dialog-title');
    const toolbar = document.createElement('div'); toolbar.className = 'image-dialog-toolbar';
    const title = document.createElement('h2'); title.id = 'image-dialog-title'; title.textContent = 'Görsel';
    zoomButton = document.createElement('button'); zoomButton.type = 'button'; zoomButton.textContent = 'Gerçek boyut';
    zoomButton.setAttribute('aria-pressed', 'false');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Kapat ×'; close.autofocus = true;
    toolbar.append(title, zoomButton, close);
    viewport = document.createElement('div'); viewport.className = 'image-dialog-viewport'; viewport.tabIndex = 0;
    viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', 'Büyütülmüş görsel; gerçek boyutta kaydırılabilir');
    viewerImage = document.createElement('img'); viewport.append(viewerImage);
    caption = document.createElement('p'); caption.className = 'image-dialog-caption'; caption.id = 'image-dialog-caption';
    viewer.setAttribute('aria-describedby', caption.id);
    viewer.append(toolbar, viewport, caption); document.body.append(viewer);
    close.addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
    viewer.addEventListener('close', () => {
      document.documentElement.classList.remove('image-viewer-open');
      origin?.focus({ preventScroll: true });
    });
    zoomButton.addEventListener('click', () => {
      const zoomed = viewport.classList.toggle('is-zoomed');
      zoomButton.setAttribute('aria-pressed', String(zoomed));
      zoomButton.textContent = zoomed ? 'Ekrana sığdır' : 'Gerçek boyut';
      viewport.scrollTo(0, 0);
    });
  }
  article.querySelectorAll('img').forEach(img => {
    if (img.closest('a, button')) return;
    const description = img.nextElementSibling?.tagName === 'EM' ? img.nextElementSibling.textContent : img.alt;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'image-zoom';
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-label', `Görseli büyüt: ${img.alt || 'Yazı görseli'}`);
    const hint = document.createElement('span'); hint.className = 'image-zoom-hint'; hint.textContent = 'Büyüt ⤢'; hint.setAttribute('aria-hidden', 'true');
    img.before(button); button.append(img, hint);
    button.addEventListener('click', () => {
      if (!viewer) createViewer();
      origin = button; viewerImage.src = img.currentSrc || img.src; viewerImage.alt = img.alt;
      caption.textContent = description || 'Yazı görseli';
      viewport.classList.remove('is-zoomed'); zoomButton.textContent = 'Gerçek boyut'; zoomButton.setAttribute('aria-pressed', 'false');
      viewer.showModal(); viewport.scrollTo(0, 0);
      document.documentElement.classList.add('image-viewer-open');
    });
  });
})();
