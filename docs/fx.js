// fx: the motion layer shared by every demo (see fx.css). It adds to a page and changes none of
// its behaviour: a 3D hero from fx3d.js, aurora and progress, glass navigation with scroll spy,
// blur-in reveals, spotlight and tilt on cards, number tickers and shimmer on the main action.
const doc = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const legacyMotion = !!document.querySelector('script[src*="/motion@"]');   // older pages reveal with Motion already
const CARDS = '.card, .kpi, .q, .cards > li, .tile, .panel, .stat, .metric';

function layer(cls, html = '') {
  const el = document.createElement('div');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html;
  document.body.prepend(el);
  return el;
}

function progress() {
  const bar = layer('fx-progress');
  let queued = false;
  const update = () => { queued = false; const h = doc.scrollHeight - innerHeight; bar.style.setProperty('--p', h > 0 ? Math.min(1, scrollY / h).toFixed(4) : '0'); };
  const soon = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', soon, { passive: true });
  addEventListener('resize', soon);
  update();
}

function cursor() {
  if (!fine || reduce) return;
  const glow = layer('fx-cursor');
  addEventListener('pointermove', (e) => { glow.style.setProperty('--x', `${e.clientX}px`); glow.style.setProperty('--y', `${e.clientY}px`); glow.classList.add('on'); }, { passive: true });
  document.addEventListener('pointerleave', () => glow.classList.remove('on'));
}

function hero() {
  const h = document.querySelector('header.fx-hero, header.top, .wrap > header, main > header, body > header');
  if (!h) return;
  h.classList.add('fx-hero');
  const title = h.querySelector('h1');
  if (title) title.classList.add('fx-title');
  h.querySelectorAll('.fx-stats b').forEach(ticker);
  h.querySelectorAll('.btn.primary, a.primary, button.primary').forEach((b) => b.classList.add('fx-shimmer'));
  const kind = doc.dataset.scene;
  if (kind === 'none') return;
  let current = null;
  const load = () => import('./fx3d.js').then((m) => { current?.stop(); current = m.mount(h, kind || 'ml'); }).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 900 }); else setTimeout(load, 200);
  addEventListener('fx:theme', load);          // the scene picks its colours and blending from the theme
}

// light and dark on demand: the page's own prefers-color-scheme rules are switched on or off, so
// every page (whatever its stylesheet) follows the choice; the choice is remembered per browser
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
};
let schemeRules = null;
function schemeMedia() {
  if (schemeRules) return schemeRules;
  schemeRules = [];
  const walk = (list) => {
    for (const r of list) {
      const m = r.media && r.media.mediaText.match(/prefers-color-scheme:\s*(dark|light)/);
      if (m) schemeRules.push({ rule: r, media: r.media.mediaText, scheme: m[1], text: [...r.cssRules].map((x) => x.cssText).join('\n') });
      else if (r.cssRules && r.type !== 1) walk(r.cssRules);
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { /* another origin's sheet */ } }
  return schemeRules;
}
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const isDark = () => (doc.dataset.theme ? doc.dataset.theme === 'dark' : systemDark());
function applyTheme(mode, announce = true) {       // 'light', 'dark', or null to follow the system
  const rules = schemeMedia();
  let forced = document.getElementById('fx-scheme');
  if (!forced) { forced = document.createElement('style'); forced.id = 'fx-scheme'; document.head.appendChild(forced); }
  rules.forEach((x) => { try { x.rule.media.mediaText = mode ? 'not all' : x.media; } catch { /* read-only */ } });
  forced.textContent = mode ? rules.filter((x) => x.scheme === mode).map((x) => `@media ${x.media.replace(/\(\s*prefers-color-scheme:\s*(dark|light)\s*\)/, 'all')} {\n${x.text}\n}`).join('\n') : '';
  if (mode) doc.dataset.theme = mode; else delete doc.dataset.theme;
  doc.style.colorScheme = mode || '';
  if (announce) dispatchEvent(new Event('fx:theme'));
}

function setStill(on) {
  doc.classList.toggle('fx-still', on);
  store.set('fx-still', on ? '1' : null);
  dispatchEvent(new Event('fx:motion'));
}

// a small dock: theme, motion, share and back to top
const ICON = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 3.8v5.1h5.1"/></svg>',
};
let say = () => {};

// ── Reset ────────────────────────────────────────────────────────
// Every form control is remembered as it was just before the first time anyone
// touched the page (controls added later, as they appear). The dock's reset
// button, and a Reset button beside any group of two or more controls that has
// no reset of its own, put them back and fire the same input and change events
// a person would, so the page redraws. A page with more state than its controls
// can listen for `fx:reset` on window.
const CONTROL = 'input:not([type=hidden]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]), select, textarea';
const RESETISH = /\b(reset|clear|restore|defaults?|start over|new game|restart)\b/i;
const originals = new Map();
const resetButtons = [];
let armed = false;
const isControl = (el) => el instanceof Element && el.matches(CONTROL) && !el.closest('.fx-dock, [data-fx-noreset]');
const shown = (el) => el.getClientRects().length > 0;
function snap(el) {
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
  if (el.tagName === 'SELECT' && el.multiple) return [...el.options].map((o) => o.selected).join();
  return el.value;
}
function remember(root) {
  if (!root || root.nodeType !== 1) return;
  for (const el of [root, ...root.querySelectorAll(CONTROL)]) if (isControl(el) && !originals.has(el)) originals.set(el, snap(el));
}
function arm() {
  if (armed) return;
  armed = true;
  remember(document.body);
}
const dirty = (el) => el.isConnected && snap(el) !== originals.get(el);
function syncResets() {
  const changed = [...originals.keys()].filter(dirty);
  for (const { btn, scope } of resetButtons) btn.disabled = !changed.some((el) => scope.contains(el));
  const dockBtn = document.querySelector('.fx-dock [data-fx="reset"]');
  if (dockBtn) {
    dockBtn.classList.toggle('off', !document.querySelector(CONTROL));
    dockBtn.setAttribute('aria-disabled', String(!changed.length));
  }
}
let syncTimer = 0;
const syncSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(syncResets, 30); };
function restore(scope) {
  arm();
  const pool = [...originals.keys()].filter((el) => {
    if (!el.isConnected) { originals.delete(el); return false; }
    return !scope || scope.contains(el);
  });
  // choices first, typed text last: a select's handler may rewrite a text box (a preset query, say),
  // and the text box should end where it started too
  const typed = (el) => (el.tagName === 'SELECT' || /^(checkbox|radio|range)$/.test(el.type) ? 0 : 1);
  pool.sort((a, b) => typed(a) - typed(b));
  let count = 0;
  for (const el of pool) {
    if (!dirty(el)) continue;
    const value = originals.get(el);
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = value;
    else if (el.tagName === 'SELECT' && el.multiple) { const on = value.split(','); [...el.options].forEach((o, i) => { o.selected = on[i] === 'true'; }); }
    else if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === value)) continue; // its options were replaced
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    count++;
  }
  dispatchEvent(new CustomEvent('fx:reset', { detail: { scope: scope || null, count } }));
  syncSoon();
  return count;
}
// Previous and Next beside a select that browses items (opt in with data-fx-step), with the position.
function steppers() {
  for (const sel of document.querySelectorAll('select[data-fx-step]:not([data-fx-stepped])')) {
    sel.dataset.fxStepped = '1';
    const name = (document.querySelector(`label[for="${sel.id}"]`)?.textContent.trim() || 'option').toLowerCase();
    const wrap = document.createElement('span');
    wrap.className = 'fx-step';
    wrap.innerHTML = `<button type="button" data-d="-1" aria-label="Previous ${name}" title="Previous ${name}">‹</button><span class="fx-step-pos" aria-live="polite"></span><button type="button" data-d="1" aria-label="Next ${name}" title="Next ${name}">›</button>`;
    sel.after(wrap);
    const pos = wrap.querySelector('.fx-step-pos');
    const show = () => { pos.textContent = sel.options.length ? `${sel.selectedIndex + 1} / ${sel.options.length}` : ''; };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !sel.options.length) return;
      arm();
      sel.selectedIndex = (sel.selectedIndex + Number(b.dataset.d) + sel.options.length) % sel.options.length;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    sel.addEventListener('change', show);
    new MutationObserver(show).observe(sel, { childList: true, subtree: true });
    show();
  }
}
const resetMessage = (n) => (n ? `Reset ${n} control${n === 1 ? '' : 's'}` : 'Nothing to reset yet');
function inlineResets() {
  for (const scope of document.querySelectorAll('main section, main form, main .card, main .panel, body > section')) {
    if (scope.dataset.fxReset || scope.closest('[data-fx-noreset], .fx-hero, header, nav, footer')) continue;
    const controls = [...scope.querySelectorAll(CONTROL)].filter((el) => isControl(el) && shown(el));
    if (controls.length < 2) continue;
    // the innermost block with the controls gets the button, not every block around it
    if ([...scope.querySelectorAll('section, form, .card, .panel')].some((inner) => [...inner.querySelectorAll(CONTROL)].filter(shown).length >= 2)) continue;
    scope.dataset.fxReset = 'own';
    const labels = [...scope.querySelectorAll('button, input[type=reset], [role=button]')].map((b) => b.textContent || b.value || b.getAttribute('aria-label') || '');
    if (labels.some((t) => RESETISH.test(t))) continue;
    scope.dataset.fxReset = 'added';
    let common = controls[0].parentElement;
    while (common && !controls.every((c) => common.contains(c))) common = common.parentElement;
    let anchor = controls[controls.length - 1];
    while (anchor.parentElement && anchor.parentElement !== common) anchor = anchor.parentElement;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fx-reset';
    btn.disabled = true;
    const heading = scope.querySelector('h2, h3')?.textContent.trim();
    btn.title = 'Put these controls back to how the page started';
    if (heading) btn.setAttribute('aria-label', `Reset the controls in ${heading.slice(0, 60)}`);
    btn.innerHTML = `${ICON.reset}<span>Reset</span>`;
    btn.addEventListener('click', () => say(resetMessage(restore(scope))));
    anchor.after(btn);
    resetButtons.push({ btn, scope });
  }
  syncResets();
}
function dock() {
  const bar = document.createElement('div');
  bar.className = 'fx-dock';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Page controls');
  const button = (name, label, key) => `<button type="button" data-fx="${name}" aria-label="${label}" title="${label}${key ? ` (${key})` : ''}"></button>`;
  bar.innerHTML = button('reset', 'Reset the controls on this page') + button('theme', 'Switch theme', 'T') + button('motion', 'Pause motion', 'M') + button('share', 'Copy link to this page') + button('top', 'Back to top');
  const toast = document.createElement('div');
  toast.className = 'fx-toast';
  toast.setAttribute('role', 'status');
  document.body.append(bar, toast);
  const q = (n) => bar.querySelector(`[data-fx="${n}"]`);
  const paint = () => {
    const dark = isDark(), still = doc.classList.contains('fx-still');
    q('theme').innerHTML = dark ? ICON.sun : ICON.moon;
    q('theme').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    q('theme').title = `${dark ? 'Light' : 'Dark'} theme (T)`;
    q('motion').innerHTML = still ? ICON.play : ICON.pause;
    q('motion').setAttribute('aria-pressed', String(still));
    q('motion').title = `${still ? 'Play' : 'Pause'} motion (M)`;
    q('share').innerHTML = ICON.link;
    q('reset').innerHTML = ICON.reset;
    q('top').innerHTML = ICON.up;
  };
  let hide = 0;
  say = (text) => { toast.textContent = text; toast.classList.add('on'); clearTimeout(hide); hide = setTimeout(() => toast.classList.remove('on'), 1800); };
  const act = {
    theme() { const next = isDark() ? 'light' : 'dark'; applyTheme(next === (systemDark() ? 'dark' : 'light') ? null : next); store.set('fx-theme', doc.dataset.theme || null); paint(); say(`${isDark() ? 'Dark' : 'Light'} theme`); },
    motion() { setStill(!doc.classList.contains('fx-still')); paint(); say(doc.classList.contains('fx-still') ? 'Motion paused' : 'Motion on'); },
    async share() {
      const url = location.href.split('#')[0];
      try { if (navigator.share && !fine) { await navigator.share({ title: document.title, url }); return; } await navigator.clipboard.writeText(url); say('Link copied'); } catch { say(url); }
    },
    top() { scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); },
    reset() { say(resetMessage(restore())); },
  };
  bar.addEventListener('click', (e) => { const b = e.target.closest('button[data-fx]'); if (b) act[b.dataset.fx](); });
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === 't' || e.key === 'T') act.theme();
    else if (e.key === 'm' || e.key === 'M') act.motion();
  });
  const showTop = () => q('top').classList.toggle('off', scrollY < 500);
  addEventListener('scroll', showTop, { passive: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!doc.dataset.theme) { dispatchEvent(new Event('fx:theme')); paint(); } });
  showTop();
  paint();
}

function nav() {
  const bar = document.querySelector('nav.fx-nav');
  if (!bar) return;
  const sections = [...document.querySelectorAll('main section.card, main .card[id]')].filter((s) => s.querySelector('h2'));
  const picks = [];
  sections.forEach((s, i) => {
    if (!s.id) s.id = `s${i + 1}-${s.querySelector('h2').textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)}`;
    if (picks.length < 6) picks.push(s);
  });
  const home = bar.querySelector('.fx-home'), gh = bar.querySelector('.fx-gh');
  const short = (t) => { const w = t.replace(/[,:.].*$/, '').split(/\s+/); return w.length > 4 ? `${w.slice(0, 4).join(' ')}…` : w.join(' '); };
  const links = picks.map((s) => { const a = document.createElement('a'); a.href = `#${s.id}`; a.textContent = short(s.querySelector('h2').textContent); return a; });
  bar.replaceChildren(...[home, ...links, gh].filter(Boolean));
  if (!links.length) return;
  const seen = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
    let best = null, top = 0;
    for (const [id, r] of seen) if (r > top) { top = r; best = id; }
    links.forEach((a) => a.setAttribute('aria-current', String(a.hash === `#${best}`)));
  }, { threshold: [0, 0.2, 0.5, 0.8], rootMargin: '-15% 0px -45% 0px' });
  picks.forEach((s) => io.observe(s));
}

// count numbers up from zero, keeping their format (sign, commas, decimals, units around them)
function ticker(el) {
  if (reduce || el.dataset.fxTicked) return;
  const text = el.textContent, nums = [...text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g)];
  if (!nums.length || text.length > 40) return;
  el.dataset.fxTicked = '1';
  const parts = [], targets = [];
  let at = 0;
  for (const m of nums) {
    parts.push(text.slice(at, m.index));
    targets.push({ value: parseFloat(m[0].replace(/,/g, '')), decimals: m[2] ? m[2].length - 1 : 0, commas: m[1].includes(',') });
    parts.push(null);
    at = m.index + m[0].length;
  }
  parts.push(text.slice(at));
  const fmt = (v, t) => { const s = v.toFixed(t.decimals); if (!t.commas) return s; const [i, d] = s.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? `.${d}` : ''); };
  const start = performance.now(), dur = 1300;
  el.style.fontVariantNumeric = 'tabular-nums';
  const step = (now) => {
    const u = Math.min(1, (now - start) / dur), k = 1 - Math.pow(2, -10 * u);
    let n = 0;
    el.textContent = parts.map((p) => (p === null ? fmt(targets[n].value * (u < 1 ? k : 1), targets[n++]) : p)).join('');
    if (u < 1) requestAnimationFrame(step); else el.textContent = text;
  };
  requestAnimationFrame(step);
}

const revealer = !reduce && 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('fx-in');
    e.target.querySelectorAll('.kpi .big, .fx-stats b').forEach(ticker);
    if (e.target.matches('.kpi')) e.target.querySelectorAll('.big').forEach(ticker);
    revealer.unobserve(e.target);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

function enhance(root = document) {
  root.querySelectorAll(CARDS).forEach((c) => {
    if (c.dataset.fx) return;
    c.dataset.fx = '1';
    c.classList.add('fx-spot');
    if (fine && !reduce && c.matches('.kpi')) c.classList.add('fx-tilt');
  });
  if (!revealer || legacyMotion) return;
  const groups = new Map();
  root.querySelectorAll('main > section, main > .grid2 > section, .kpis > .kpi, main > .card, .qlist > .q').forEach((el) => {
    if (el.dataset.fxr) return;
    el.dataset.fxr = '1';
    const i = groups.get(el.parentElement) || 0;
    groups.set(el.parentElement, i + 1);
    el.style.setProperty('--d', `${Math.min(i, 8) * 70}ms`);
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.92 && r.bottom > 0 && document.readyState === 'complete' && performance.now() > 2500) { el.classList.add('fx-reveal', 'fx-in'); return; }
    el.classList.add('fx-reveal');
    revealer.observe(el);
  });
}

// pointer effects, delegated: one listener for every card on the page
function pointer() {
  if (!fine) return;
  let tilted = null;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.fx-spot');
    if (card) {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
    const t = e.target.closest?.('.fx-tilt');
    if (tilted && tilted !== t) { tilted.style.setProperty('--rx', '0deg'); tilted.style.setProperty('--ry', '0deg'); }
    tilted = t;
    if (t && !reduce) {
      const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      t.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`);
      t.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`);
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (tilted) { tilted.style.setProperty('--rx', '0deg'); tilted.style.setProperty('--ry', '0deg'); } });
}

function start() {
  if (doc.dataset.fxDone) return;
  doc.dataset.fxDone = '1';
  const saved = store.get('fx-theme');
  if (saved === 'light' || saved === 'dark') applyTheme(saved, false);
  if (store.get('fx-still')) doc.classList.add('fx-still');
  layer('fx-bg', '<i></i><i></i><i></i><b></b>');
  dock();
  cursor();
  progress();
  hero();
  nav();
  enhance();
  pointer();
  // the page's starting state is whatever it shows the moment someone first reaches for it
  for (const type of ['pointerdown', 'keydown', 'focusin']) document.addEventListener(type, arm, true);
  for (const type of ['input', 'change', 'click']) document.addEventListener(type, syncSoon, true);
  steppers();
  inlineResets();
  addEventListener('load', () => setTimeout(inlineResets, 400));
  let t = 0;
  new MutationObserver((muts) => {
    if (armed) for (const m of muts) m.addedNodes.forEach(remember);
    clearTimeout(t);
    t = setTimeout(() => { enhance(); steppers(); inlineResets(); }, 60);
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
