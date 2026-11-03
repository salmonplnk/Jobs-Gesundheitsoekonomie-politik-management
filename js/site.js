/* Site shell: theme, view routing, header search and global shortcuts.
 *
 * Routing contract (hash based, works on any static host):
 *   #stellen (default)            → view "stellen"
 *   #stelle-<org>-<hash>          → view "stellen", param = job id "<org>:<hash>"
 *   #meine-suche                  → view "meine-suche"
 *   #jobalarme                    → view "meine-suche", sub "jobalarme"
 *   #abmelden-<token>             → view "meine-suche", sub "abmelden", param token
 *   #arbeitgeber                  → view "arbeitgeber"
 *   #arbeitgeber-<orgId>          → view "arbeitgeber", param orgId
 *   #markt                        → view "markt"
 *   #quellen                      → view "quellen"
 * Every change dispatches `site:route` on window with detail {view, sub, param, hash}.
 * Header search dispatches `site:search` with detail {q}.
 * The feed dispatches `publicfeed:loaded` with detail {count, generatedAt}.
 */
(function () {
  'use strict';
  const VIEWS = ['stellen', 'meine-suche', 'arbeitgeber', 'markt', 'quellen'];
  const TITLES = { stellen: 'Stellen', 'meine-suche': 'Meine Suche', arbeitgeber: 'Arbeitgeber', markt: 'Arbeitsmarkt', quellen: 'Quellen & Transparenz' };
  const BASE_TITLE = 'Burgener Gesundheitsjobs';
  let current = null;

  /* ---------- Theme ---------- */
  const media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const stored = () => { try { return localStorage.getItem('darkMode'); } catch { return null; } };
  function applyTheme(dark) {
    document.body.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.setAttribute('aria-label', dark ? 'Helles Farbschema einschalten' : 'Dunkles Farbschema einschalten');
      btn.setAttribute('aria-pressed', String(dark));
    }
  }
  function systemDark() { return !!media?.matches; }
  applyTheme(stored() === '1' || (stored() === null && systemDark()));
  media?.addEventListener?.('change', event => { if (stored() === null) applyTheme(event.matches); });
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const dark = !document.body.classList.contains('dark');
    applyTheme(dark);
    try { localStorage.setItem('darkMode', dark ? '1' : '0'); } catch {}
  });

  /* ---------- Router ---------- */
  function parse(hash) {
    const h = decodeURIComponent(String(hash || '').replace(/^#/, ''));
    if (!h || h === 'stellen') return { view: 'stellen', sub: '', param: '' };
    let m;
    if ((m = h.match(/^stelle-([a-z0-9][a-z0-9_-]*)-([a-z0-9]+)$/))) return { view: 'stellen', sub: 'stelle', param: `${m[1]}:${m[2]}` };
    if (h === 'meine-suche') return { view: 'meine-suche', sub: '', param: '' };
    if (h === 'jobalarme') return { view: 'meine-suche', sub: 'jobalarme', param: '' };
    if ((m = h.match(/^abmelden-([0-9a-f-]{36})$/i))) return { view: 'meine-suche', sub: 'abmelden', param: m[1] };
    if (h === 'arbeitgeber') return { view: 'arbeitgeber', sub: '', param: '' };
    if ((m = h.match(/^arbeitgeber-([a-z0-9][a-z0-9_-]{0,79})$/))) return { view: 'arbeitgeber', sub: 'profil', param: m[1] };
    if (VIEWS.includes(h)) return { view: h, sub: '', param: '' };
    return null; // in-page anchors (e.g. #main) are left alone
  }
  function jobHash(id) { const [org, key] = String(id).split(':'); return `#stelle-${org}-${key}`; }

  function show(route, { focus = false } = {}) {
    const changedView = !current || current.view !== route.view;
    current = route;
    document.querySelectorAll('.site-view').forEach(el => { el.hidden = el.dataset.view !== route.view; });
    document.querySelectorAll('[data-nav]').forEach(el => {
      if (el.dataset.nav === route.view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    document.body.dataset.view = route.view;
    const hero = document.getElementById('siteHero');
    if (hero) hero.hidden = route.view !== 'stellen';
    if (route.sub !== 'stelle') document.title = route.view === 'stellen' ? `Gesundheitsjobs Schweiz – Ökonomie, Politik & Management | ${BASE_TITLE}` : `${TITLES[route.view]} | ${BASE_TITLE}`;
    if (changedView && route.sub !== 'stelle') {
      window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
      if (focus) document.getElementById('main')?.focus({ preventScroll: true });
    }
    window.dispatchEvent(new CustomEvent('site:route', { detail: { ...route, hash: location.hash } }));
  }
  function onHash(event) {
    const route = parse(location.hash);
    if (route) show(route, { focus: !!event });
  }
  window.addEventListener('hashchange', onHash);

  window.SiteRouter = {
    current: () => current ? { ...current } : parse(location.hash) || { view: 'stellen', sub: '', param: '' },
    go(hash) { if (location.hash === hash) onHash({}); else location.hash = hash; },
    jobHash,
    /** Replace the hash without adding a history entry or re-rendering the view. */
    replace(hash) { history.replaceState(history.state, '', hash + '' === '' ? location.pathname + location.search : location.pathname + location.search + hash); const r = parse(hash); if (r) { current = r; } }
  };

  /* ---------- Header search ---------- */
  const heroForm = document.getElementById('heroSearch'), heroInput = document.getElementById('heroSearchInput');
  heroForm?.addEventListener('submit', event => {
    event.preventDefault();
    const q = heroInput.value.trim().slice(0, 300);
    window.dispatchEvent(new CustomEvent('site:search', { detail: { q } }));
    if (current?.view !== 'stellen') location.hash = '#stellen';
    requestAnimationFrame(() => document.getElementById('publicJobFeed')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
  });
  window.addEventListener('publicfeed:query', event => { if (heroInput && document.activeElement !== heroInput) heroInput.value = event.detail?.q || ''; });
  window.addEventListener('publicfeed:loaded', event => {
    const meta = document.getElementById('heroMeta'); if (!meta) return;
    const { count, generatedAt } = event.detail || {};
    if (!Number.isFinite(count)) { meta.textContent = 'Der aktuelle Stand ist gerade nicht erreichbar.'; return; }
    const when = generatedAt ? new Date(generatedAt) : null;
    const label = when ? when.toLocaleString('de-CH', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    meta.innerHTML = `<strong>${count}</strong> fachlich geprüfte ${count === 1 ? 'Stelle' : 'Stellen'} in der Schweiz${label ? ` · aktualisiert ${label}` : ''} · <a href="#quellen">Quellen</a>`;
  });

  /* ---------- Global shortcut: "/" focuses the search of the current view ---------- */
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target, editing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (editing || document.querySelector('dialog[open], .profile-modal.open, .auth-modal.open')) return;
    const view = current?.view || 'stellen';
    const target = view === 'stellen' ? heroInput : view === 'arbeitgeber' ? document.getElementById('searchInput') : document.querySelector(`.site-view[data-view="${view}"] input[type="search"]`);
    if (target) { event.preventDefault(); target.focus(); }
  }, true);

  /* Initial route after all scripts have registered their listeners. */
  const start = () => { const route = parse(location.hash) || { view: 'stellen', sub: '', param: '' }; show(route); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else setTimeout(start, 0);
})();
