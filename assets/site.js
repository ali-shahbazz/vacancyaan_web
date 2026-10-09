document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');
function closeMenu() { nav?.classList.remove('is-open'); menu?.setAttribute('aria-expanded', 'false'); }
menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
document.addEventListener('click', event => { if (menu && !menu.contains(event.target) && !nav.contains(event.target)) closeMenu(); });
nav?.querySelectorAll('a').forEach(link => { if (link.pathname === location.pathname && !link.hash) link.setAttribute('aria-current', 'page'); link.addEventListener('click', closeMenu); });
async function checkHealth() {
  const controls = [...document.querySelectorAll('[data-health]')];
  controls.forEach(el => { el.disabled = true; el.querySelector('[data-health-label]').textContent = 'Checking service status'; });
  try {
    const response = await fetch('/health/ready', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error('unavailable');
    controls.forEach(el => { el.querySelector('[data-health-label]').textContent = 'All systems operational'; el.querySelector('.status-dot').className = 'status-dot ok'; el.setAttribute('aria-label', 'All systems operational. Check again'); });
  } catch {
    controls.forEach(el => { el.querySelector('[data-health-label]').textContent = 'Service unavailable · Retry'; el.querySelector('.status-dot').className = 'status-dot down'; el.setAttribute('aria-label', 'Service unavailable. Retry status check'); });
  } finally { controls.forEach(el => { el.disabled = false; }); }
}
document.querySelectorAll('[data-health]').forEach(el => el.addEventListener('click', checkHealth));
checkHealth();
