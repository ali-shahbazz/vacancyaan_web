// Work Pakistan public site: navigation, service status, and the page's one authored motion — the
// example job turning over when the worker says yes, and the hiring steps lighting in order.
document.documentElement.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

// Menu (narrow screens)
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');
function closeMenu() { nav?.classList.remove('is-open'); menu?.setAttribute('aria-expanded', 'false'); }
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
  if (open) nav.querySelector('a')?.focus();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
document.addEventListener('click', event => { if (menu && !menu.contains(event.target) && !nav.contains(event.target)) closeMenu(); });
nav?.querySelectorAll('a').forEach(link => {
  if (link.pathname === location.pathname && !link.hash) link.setAttribute('aria-current', 'page');
  link.addEventListener('click', closeMenu);
});

// Header gains its rule once the page moves
const header = document.querySelector('.site-header');
const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// The header keeps everything on one row or steps down: first it drops the secondary "Find work"
// link and tightens the links, then it switches to the menu. Longer labels (Roman Urdu) or a narrow
// window step it down instead of wrapping or squeezing the links.
const headerRow = header?.querySelector('.header-inner');
function fitHeader() {
  if (!headerRow) return;
  header.classList.remove('is-tight', 'is-compact');
  if (matchMedia('(max-width:900px)').matches) return; // the stylesheet already uses the menu here
  const overflows = () => headerRow.scrollWidth > headerRow.clientWidth + 1;
  if (overflows()) header.classList.add('is-tight');
  if (overflows()) header.classList.add('is-compact');
  if (!header.classList.contains('is-compact')) closeMenu();
}
let fitQueued = false;
const queueFit = () => { if (!fitQueued) { fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitHeader(); }); } };
if (headerRow) {
  fitHeader();
  new ResizeObserver(queueFit).observe(headerRow);
  // a language change rewrites the labels in place
  new MutationObserver(queueFit).observe(headerRow, { childList: true, characterData: true, subtree: true });
  document.fonts?.ready.then(queueFit);
}

// Service status from the real health endpoint
async function checkHealth() {
  const controls = [...document.querySelectorAll('[data-health]')];
  const say = (label, state, aria) => controls.forEach(el => {
    el.querySelector('[data-health-label]').textContent = label;
    el.querySelector('.status-dot').className = `status-dot ${state}`;
    el.setAttribute('aria-label', aria);
  });
  controls.forEach(el => { el.disabled = true; });
  say('Checking service status', '', 'Checking service status');
  try {
    const response = await fetch('/health/ready', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error('unavailable');
    say('All systems working', 'ok', 'All systems working. Check again');
  } catch {
    say('Service unavailable · Retry', 'down', 'Service unavailable. Retry status check');
  } finally { controls.forEach(el => { el.disabled = false; }); }
}
document.querySelectorAll('[data-health]').forEach(el => el.addEventListener('click', checkHealth));
if (document.querySelector('[data-health]')) checkHealth();

// Sections settle in as they arrive; content is visible by default without JS or with reduced motion
const reveals = document.querySelectorAll('.reveal');
if (!reduced && 'IntersectionObserver' in window) {
  const seen = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-in'); seen.unobserve(entry.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  reveals.forEach(el => seen.observe(el));
} else reveals.forEach(el => el.classList.add('is-in'));

// The procession: each station lights in turn, like a crank turning
document.querySelectorAll('[data-procession]').forEach(row => {
  const stations = [...row.querySelectorAll('.station')];
  if (reduced || !('IntersectionObserver' in window)) { stations.forEach(s => s.classList.add('is-lit')); return; }
  row.classList.add('is-ready');
  const watch = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    watch.disconnect();
    stations.forEach((station, i) => setTimeout(() => station.classList.add('is-lit'), 180 + i * 420));
  }, { threshold: .35 });
  watch.observe(row);
});

// The example job turns over when the worker says yes; it shows itself once, then waits for the visitor
document.querySelectorAll('[data-medallion]').forEach(card => {
  const faces = card.querySelectorAll('.medallion-face');
  let touched = false;
  const set = yes => {
    card.classList.toggle('is-yes', yes);
    faces[0].setAttribute('aria-hidden', String(yes));
    faces[1].setAttribute('aria-hidden', String(!yes));
    faces[0].querySelector('[data-flip]').tabIndex = yes ? -1 : 0;
    faces[1].querySelector('[data-flip]').tabIndex = yes ? 0 : -1;
    card.querySelectorAll('[data-flip]').forEach(button => button.setAttribute('aria-pressed', String(yes)));
  };
  card.querySelectorAll('[data-flip]').forEach(button => button.addEventListener('click', () => {
    touched = true;
    const yes = !card.classList.contains('is-yes');
    set(yes);
    (yes ? faces[1] : faces[0]).querySelector('[data-flip]').focus({ preventScroll: true });
  }));
  if (reduced || !('IntersectionObserver' in window)) return;
  const once = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    once.disconnect();
    setTimeout(() => { if (!touched) set(true); }, 2600);
    setTimeout(() => { if (!touched) set(false); }, 7200);
  }, { threshold: .6 });
  once.observe(card);
});
