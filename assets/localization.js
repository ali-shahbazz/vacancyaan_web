(() => {
  const ids = ['en', 'ur', 'ur-Latn'];
  const query = new URLSearchParams(location.search).get('lang');
  let language = 'en', catalog = {}, patterns = [];
  try { language = ids.includes(query) ? query : localStorage.getItem('kaam-ui-language') || 'en'; } catch { language = ids.includes(query) ? query : 'en'; }
  if (!ids.includes(language)) language = 'en';
  const originals = new WeakMap(), attributes = new WeakMap();
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function translate(source) {
    const index = ids.indexOf(language), exact = catalog[source];
    if (exact) return exact[index];
    for (const {regexp, values, slots} of patterns) {
      const match = regexp.exec(source);
      if (match) return values[index].replace(/\{(\d+)\}/g, (_, slot) => match[slots.indexOf(slot) + 1] || '');
    }
    return source;
  }
  const ignored = element => element.closest('script,style,textarea,code,pre,[data-no-translate],[data-localized-date]');
  function update(root, force = false) {
    for (const element of root.querySelectorAll?.('[data-localized-date]') || []) {
      const date = new Date(element.dataset.localizedDate);
      if (Number.isNaN(date.getTime())) continue;
      const formatter = new Intl.DateTimeFormat(language === 'ur' ? 'ur-PK' : 'en-GB', {day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Karachi'});
      const value = formatter.formatToParts(date).map(part => language === 'ur-Latn' && part.type === 'month' ? translate(part.value) : part.value).join('');
      if (element.textContent !== value) element.textContent = value;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement || ignored(node.parentElement)) continue;
      const previous = originals.get(node);
      if (!force && previous?.target === node.textContent) continue;
      const source = previous?.target === node.textContent ? previous.source : node.textContent;
      const target = source.replace(source.trim(), translate(source.trim()));
      originals.set(node, {source, target});
      if (node.textContent !== target) node.textContent = target;
    }
    for (const element of root.querySelectorAll?.('[placeholder],[aria-label],[title]') || []) {
      if (ignored(element)) continue;
      const saved = attributes.get(element) || {};
      for (const name of ['placeholder', 'aria-label', 'title']) {
        const value = element.getAttribute(name);
        if (value === null) continue;
        const previous = saved[name];
        const source = previous?.target === value ? previous.source : value;
        const target = translate(source); saved[name] = {source, target};
        if (value !== target) element.setAttribute(name, target);
      }
      attributes.set(element, saved);
    }
  }
  const chooser = document.createElement('label'); chooser.className = 'language-control'; chooser.dataset.noTranslate = '';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('class', 'icon'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '/assets/icons.svg#language'); icon.append(use);
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Language');
  for (const [id, name] of [['en','English'], ['ur','اردو'], ['ur-Latn','Roman Urdu']]) {
    const option = document.createElement('option'); option.value = id; option.textContent = name; select.append(option);
  }
  select.value = language; select.disabled = true; chooser.append(icon, select);
  const header = document.querySelector('.site-header .header-inner') || document.querySelector('.checkout-header')
    || document.querySelector('.workspace-topbar');
  (header || document.body).append(chooser);
  let titleSource = document.title, translatedTitle = '';
  function updateTitle() {
    if (document.title !== translatedTitle) titleSource = document.title;
    translatedTitle = translate(titleSource);
    if (document.title !== translatedTitle) document.title = translatedTitle;
  }
  function apply() {
    document.documentElement.lang = language; document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
    select.value = language; select.setAttribute('aria-label', translate('Language'));
    update(document.body, true); updateTitle();
    try { localStorage.setItem('kaam-ui-language', language); } catch {}
    window.dispatchEvent(new CustomEvent('kaam-language', {detail:language}));
  }
  // Marketing pages are written in English: an English visitor never downloads the catalog, and it loads
  // the first time someone picks another language. Other pages translate server text, so they load it at once.
  let loading = null;
  const lazy = document.documentElement.hasAttribute('data-lazy-locales');
  select.addEventListener('change', () => {
    language = select.value;
    if (lazy && !loading && language !== 'en') { select.disabled = true; load(); } else apply();
  });
  window.kaamI18n = {translate, get language() { return language; }};
  if (lazy && language === 'en') {
    select.disabled = false;
    document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr';
    return;
  }
  load();
  function load() { if (loading) return loading; return loading = fetch('/assets/locales.json', {cache:'no-cache'}).then(response => {
    if (!response.ok) throw Error('Translations unavailable'); return response.json();
  }).then(data => {
    catalog = data.strings;
    patterns = Object.entries(data.templates).map(([source, values]) => {
      const slots = []; let cursor = 0, expression = '^';
      for (const match of source.matchAll(/\{(\d+)\}/g)) {
        expression += escape(source.slice(cursor, match.index)) + '(.+?)'; slots.push(match[1]); cursor = match.index + match[0].length;
      }
      return {values, slots, regexp:new RegExp(expression + escape(source.slice(cursor)) + '$', 's')};
    });
    select.disabled = false; apply();
    new MutationObserver(() => update(document.body)).observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['placeholder','aria-label','title']});
    new MutationObserver(updateTitle).observe(document.querySelector('title'), {subtree:true, childList:true, characterData:true});
  }).catch(() => { loading = null; language='en'; apply(); select.disabled=false; }); }
})();
