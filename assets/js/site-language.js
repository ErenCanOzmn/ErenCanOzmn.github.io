---
layout: null
---
(() => {
  'use strict';
  const storageKey = 'dizmana-language';
  const pairs = Object.entries({{ site.data.ui_translations | jsonify }});
  {% for post in site.posts %}{% assign key = post.path | split: '/' | last | remove: '.md' %}{% assign translation = site.data.post_translations[key] %}{% if translation %}
  pairs.push({% if post.lang == 'tr' %}[{{ post.title | jsonify }}, {{ translation.title | jsonify }}], [{{ post.description | jsonify }}, {{ translation.description | jsonify }}]{% else %}[{{ translation.title | jsonify }}, {{ post.title | jsonify }}], [{{ translation.description | jsonify }}, {{ post.description | jsonify }}]{% endif %});
  {% endif %}{% endfor %}
  const dictionaries = { tr: new Map(), en: new Map() };
  pairs.forEach(([tr, en]) => {
    dictionaries.tr.set(tr, tr); dictionaries.tr.set(en, tr);
    dictionaries.en.set(tr, en); dictionaries.en.set(en, en);
  });
  let language = 'tr';
  try { if (localStorage.getItem(storageKey) === 'en') language = 'en'; } catch {}
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
  if (requestedLanguage === 'tr' || requestedLanguage === 'en') {
    language = requestedLanguage;
    try { localStorage.setItem(storageKey, language); } catch {}
  }
  const textStates = new WeakMap();
  const attributeStates = new WeakMap();
  const article = document.querySelector('#article-content');
  const ignored = 'script, style, template, noscript, pre, code, [data-no-translate], .mascot-terminal, .mascot-event, .keyboard-grid';
  function translate(text) {
    const value = text.trim();
    let result = dictionaries[language].get(value);
    if (result === undefined) {
      const plural = count => Number(count) === 1 ? 'article' : 'articles';
      const patterns = [
        [/^(\d+) yazı gösteriliyor\.$/, n => `${n} ${plural(n)} shown.`],
        [/^(\d+) yazı bulundu\.$/, n => `${n} ${plural(n)} found.`],
        [/^(\d+) YAZI$/, n => `${n} ${plural(n).toUpperCase()}`],
        [/^(\d+) yazı ↗$/, n => `${n} ${plural(n)} ↗`],
        [/^(\d+) ETİKET$/, n => `${n} TAGS`],
        [/^(\d+) KONU \/ (\d+) YAZI$/, (a, b) => `${a} TOPICS / ${b} ARTICLES`],
        [/^Bu başlık altında (\d+) yazı\.$/, n => `${n} ${plural(n)} under this topic.`],
        [/^(\d+) yayımlanmış$/, n => `${n} published`],
        [/^(\d+) bekleyen$/, n => `${n} pending`],
        [/^(\d+) dakika$/, n => `${n} min`],
        [/^(\d+) dk okuma$/, n => `${n} min read`],
        [/^(\d+) bölüm$/, n => `${n} sections`],
        [/^Yazı dili: (.+)$/, name => `Article language: ${name === 'Türkçe' ? 'Turkish' : name}`],
        [/^Görseli büyüt: (.+)$/, name => `Enlarge image: ${name}`]
      ];
      if (language === 'en') {
        for (const [pattern, render] of patterns) {
          const match = value.match(pattern);
          if (match) { result = render(...match.slice(1)); break; }
        }
      }
      // SEO titles keep the site's suffix and translate only their page title.
      if (result === undefined && value.includes(' | ')) {
        const parts = value.split(' | ');
        result = parts.map(part => dictionaries[language].get(part) || part).join(' | ');
      }
    }
    return result === undefined ? text : text.replace(value, () => result);
  }
  function eligible(element) {
    if (!element || element.closest(ignored)) return false;
    return !element.closest('#article-content') || !!element.closest('.code-toolbar, .image-zoom');
  }
  function updateText(node) {
    if (!node.nodeValue.trim() || !eligible(node.parentElement)) return;
    let state = textStates.get(node);
    if (!state || node.nodeValue !== state.rendered) state = { source: node.nodeValue };
    state.rendered = translate(state.source);
    textStates.set(node, state);
    if (node.nodeValue !== state.rendered) node.nodeValue = state.rendered;
  }
  function updateAttributes(element) {
    if (!eligible(element)) return;
    let states = attributeStates.get(element);
    if (!states) { states = {}; attributeStates.set(element, states); }
    const names = ['aria-label', 'placeholder', 'title'];
    if (element.matches('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]')) names.push('content');
    names.forEach(name => {
      if (!element.hasAttribute(name)) return;
      const current = element.getAttribute(name);
      let state = states[name];
      if (!state || current !== state.rendered) state = { source: current };
      state.rendered = translate(state.source); states[name] = state;
      if (current !== state.rendered) element.setAttribute(name, state.rendered);
    });
  }
  function render(root = document.documentElement) {
    if (root.nodeType === Node.TEXT_NODE) { updateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    updateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches(ignored)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) updateText(walker.currentNode);
      else updateAttributes(walker.currentNode);
    }
  }
  // Select the translated Markdown before reading tools bind to its headings.
  if (article) {
    const alternate = document.querySelector('template[data-article-translation]');
    const contentLanguage = alternate?.dataset.lang === language ? language : article.lang;
    if (alternate?.dataset.lang === language) article.replaceChildren(alternate.content.cloneNode(true));
    article.lang = contentLanguage;
    const label = document.querySelector('[data-article-language]');
    if (label) label.textContent = contentLanguage === 'tr' ? 'Türkçe' : 'English';
    const readingTime = document.querySelector('[data-reading-minutes]');
    if (readingTime) readingTime.textContent = `${Math.floor(article.textContent.trim().split(/\s+/).length / 200) + 1} dakika`;
  }
  const controls = [...document.querySelectorAll('[data-site-language]')];
  function apply() {
    document.documentElement.lang = language;
    controls.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.siteLanguage === language)));
    render();
  }
  controls.forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.siteLanguage;
    if (next === language) return;
    language = next;
    try { localStorage.setItem(storageKey, language); } catch {}
    if (article) {
      const address = new URL(window.location.href);
      address.searchParams.set('lang', language);
      address.hash = '';
      window.location.assign(address.href);
      return;
    }
    const address = new URL(window.location.href);
    if (address.searchParams.has('lang')) {
      address.searchParams.set('lang', language);
      window.history.replaceState(null, '', address);
    }
    apply();
    document.dispatchEvent(new CustomEvent('site:languagechange', { detail: { language } }));
  }));
  window.siteLanguage = { get language() { return language; }, translate, refresh: render };
  apply();
  document.querySelector('.language-switch')?.removeAttribute('hidden');
  // Localize status messages and controls that other scripts create later.
  const observer = new MutationObserver(records => {
    const roots = new Set();
    records.forEach(record => {
      if (record.type === 'childList') record.addedNodes.forEach(node => roots.add(node));
      else roots.add(record.target);
    });
    roots.forEach(root => {
      if (root.isConnected) render(root);
    });
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'placeholder', 'title'] });
})();
