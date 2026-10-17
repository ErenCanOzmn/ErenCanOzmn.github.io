(() => {
  'use strict';
  const prose = document.querySelector('.prose');
  const progress = document.querySelector('.reading-progress');
  let scheduled = false;
  const updateProgress = () => {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0})`;
    scheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateProgress); }
  }, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  if (prose) {
    prose.querySelectorAll('table:not(.rouge-table)').forEach(table => {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', 'Tablo; yatay kaydırılabilir');
      table.before(wrapper);
      wrapper.append(table);
    });
    prose.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.decoding = 'async'; });
  }

  const archive = document.querySelector('.archive-browser');
  if (archive) {
    const controls = archive.querySelector('.archive-controls');
    const input = archive.querySelector('input[type="search"]');
    const buttons = [...archive.querySelectorAll('[data-archive-filter]')];
    const cards = [...archive.querySelectorAll('.note-card')];
    const years = [...archive.querySelectorAll('.archive-year')];
    const status = archive.querySelector('[data-archive-status]');
    const empty = archive.querySelector('.archive-empty');
    const normalize = text => text.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
    let category = 'all';
    function filterNotes() {
      const terms = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
      let count = 0;
      cards.forEach(card => {
        const matchesCategory = category === 'all' || card.dataset.categories.split('|').includes(category);
        const matchesQuery = terms.every(term => normalize(card.dataset.search + ' ' + card.textContent).includes(term));
        card.hidden = !(matchesCategory && matchesQuery);
        if (!card.hidden) count++;
      });
      years.forEach(year => {
        const countInYear = [...year.querySelectorAll('.note-card')].filter(card => !card.hidden).length;
        year.hidden = countInYear === 0;
        year.querySelector('.year-label>span').textContent = `${countInYear} YAZI`;
      });
      status.textContent = `${count} yazı gösteriliyor.`;
      empty.hidden = count > 0;
    }
    buttons.forEach(button => button.addEventListener('click', () => {
      category = button.dataset.archiveFilter;
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      filterNotes();
    }));
    input.addEventListener('input', filterNotes);
    controls.hidden = false;
    filterNotes();
  }

  const form = document.querySelector('.search-form');
  if (form) {
    const input = form.querySelector('input');
    const results = document.querySelector('.search-results');
    const status = document.querySelector('.search-status');
    let indexPromise;
    let revision = 0;
    let debounce;
    const normalize = text => text.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
    const fetchIndex = () => {
      if (!indexPromise) indexPromise = fetch(form.dataset.indexUrl).then(response => {
        if (!response.ok) throw new Error('Index unavailable');
        return response.json();
      }).catch(error => { indexPromise = null; throw error; });
      return indexPromise;
    };
    async function search() {
      const version = ++revision;
      const query = input.value.trim().slice(0, 200);
      const address = new URL(window.location.href);
      if (query) address.searchParams.set('q', query); else address.searchParams.delete('q');
      window.history.replaceState(null, '', address);
      results.replaceChildren();
      if (!query) { status.textContent = 'Aramak için bir kelime yaz.'; return; }
      status.textContent = 'Aranıyor…';
      try {
        const entries = await fetchIndex();
        if (version !== revision) return;
        const terms = normalize(query).split(/\s+/);
        const matches = entries.filter(entry => terms.every(term => normalize([entry.title, entry.categories, entry.tags, entry.text, entry.translation?.title, entry.translation?.description, entry.translation?.text].join(' ')).includes(term)));
        status.textContent = matches.length ? `${matches.length} yazı bulundu.` : 'Sonuç bulunamadı. Daha kısa veya farklı bir kelime dene.';
        matches.forEach(entry => {
          const article = document.createElement('article'); article.className = 'entry';
          const meta = document.createElement('div'); meta.className = 'entry-meta'; meta.textContent = `${entry.date} / ${entry.categories}`;
          const language = document.createElement('span'); language.className = 'post-language'; language.textContent = entry.translation ? 'TR / EN' : (entry.lang || 'en').toUpperCase(); language.setAttribute('aria-label', entry.translation ? 'Yazı dilleri: Türkçe ve İngilizce' : entry.lang === 'tr' ? 'Yazı dili: Türkçe' : 'Yazı dili: English'); meta.append(language);
          const heading = document.createElement('h2'); const link = document.createElement('a');
          link.href = entry.url; link.textContent = entry.title; heading.append(link);
          const description = document.createElement('p'); description.textContent = entry.description;
          const arrow = document.createElement('span'); arrow.className = 'entry-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗';
          article.append(meta, heading, description, arrow); results.append(article);
        });
      } catch {
        if (version === revision) status.textContent = 'Arama yüklenemedi. Biraz sonra tekrar dene veya Yazılar menüsünü aç.';
      }
    }
    form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(debounce); search(); });
    input.addEventListener('input', () => { ++revision; clearTimeout(debounce); debounce = setTimeout(search, 180); });
    document.addEventListener('site:languagechange', () => { clearTimeout(debounce); search(); });
    input.value = (new URLSearchParams(window.location.search).get('q') || '').slice(0, 200);
    if (input.value) search();
  }
})();
