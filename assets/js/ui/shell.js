// Page shell shared by every module: navigation, header, stage + panel layout,
// learning tabs (explanation, formal statements, challenges), pager and footer.

import { h, icon, toast, copyText, downloadBlob, storage } from './dom.js';
import { tr, trf, setText, setAttr, onLangChange, languageSwitch, getLang } from './i18n.js';
import { themeButton } from './theme.js';
import { richHTML } from './tex.js';
import { MODULES, CHAPTERS, moduleNumber, chapterOf } from '../modules/registry.js';
import { createStore } from './store.js';
import { registerServiceWorker } from './pwa.js';

const T = {
  modules: { es: 'Módulos', en: 'Modules' },
  home: { es: 'Inicio', en: 'Home' },
  module: { es: 'Módulo', en: 'Module' },
  share: { es: 'Compartir', en: 'Share' },
  shareTitle: { es: 'Copiar un enlace a esta configuración exacta', en: 'Copy a link to this exact configuration' },
  png: { es: 'PNG', en: 'PNG' },
  pngTitle: { es: 'Descargar la vista como imagen', en: 'Download the view as an image' },
  present: { es: 'Presentar', en: 'Present' },
  presentTitle: { es: 'Modo presentación (tecla P)', en: 'Presentation mode (P key)' },
  exitPresent: { es: 'Salir', en: 'Exit' },
  togglePanel: { es: 'Panel', en: 'Panel' },
  reset: { es: 'Restablecer', en: 'Reset' },
  resetTitle: { es: 'Volver a la configuración inicial', en: 'Back to the initial configuration' },
  copied: { es: 'Enlace copiado: reproduce exactamente esta configuración', en: 'Link copied: it reproduces this exact configuration' },
  copyFail: { es: 'No se pudo copiar; el enlace está en la barra de direcciones', en: 'Could not copy; the link is in the address bar' },
  resetDone: { es: 'Configuración restablecida', en: 'Configuration reset' },
  tabExplain: { es: 'Explicación', en: 'Explanation' },
  tabFormal: { es: 'Formalmente', en: 'Formally' },
  tabChallenges: { es: 'Retos', en: 'Challenges' },
  whatYouSee: { es: 'Qué estás viendo', en: 'What you are seeing' },
  tryThis: { es: 'Experimenta', en: 'Try this' },
  start: { es: 'Intentar', en: 'Try it' },
  active: { es: 'En curso…', en: 'In progress…' },
  solved: { es: 'Resuelto', en: 'Solved' },
  retry: { es: 'Repetir', en: 'Retry' },
  hint: { es: 'Pista', en: 'Hint' },
  challengeActive: { es: 'Reto activo', en: 'Active challenge' },
  abandon: { es: 'Abandonar', en: 'Leave' },
  solvedToast: { es: '¡Reto resuelto! ', en: 'Challenge solved! ' },
  progress: { es: '{done} de {total} retos resueltos', en: '{done} of {total} challenges solved' },
  prev: { es: 'Anterior', en: 'Previous' },
  next: { es: 'Siguiente', en: 'Next' },
  footerBy: { es: 'Proyecto independiente de Juan Camilo Osorio Oviedo', en: 'Independent project by Juan Camilo Osorio Oviedo' },
  footerInspired: { es: 'Inspirado en las matemáticas visuales de 3Blue1Brown ↗', en: 'Inspired by the visual mathematics of 3Blue1Brown ↗' },
  code: { es: 'Código ↗', en: 'Code ↗' },
  skip: { es: 'Saltar al laboratorio', en: 'Skip to the lab' },
  siteName: { es: 'Laboratorio de Álgebra Lineal', en: 'Linear Algebra Laboratory' },
  brand: { es: 'Laboratorio lineal', en: 'Linear algebra lab' },
  kinds: {
    definition: { es: 'Definición', en: 'Definition' },
    theorem: { es: 'Teorema', en: 'Theorem' },
    proposition: { es: 'Proposición', en: 'Proposition' },
    remark: { es: 'Observación', en: 'Remark' },
    example: { es: 'Ejemplo', en: 'Example' },
    corollary: { es: 'Corolario', en: 'Corollary' },
    algorithm: { es: 'Algoritmo', en: 'Algorithm' },
  },
};

export const CHALLENGE_KEY = 'linear-lab-challenges';

export function solvedChallenges() { return storage.getJSON(CHALLENGE_KEY, {}); }

// ---------------------------------------------------------------------------
// Navigation (shared with the home page)
// ---------------------------------------------------------------------------

export function siteNav({ current = null, subtitle = null } = {}) {
  const small = h('small');
  if (subtitle) setText(small, subtitle); else setText(small, { es: 'Álgebra en movimiento', en: 'Algebra in motion' });
  const brandLabel = h('span');
  setText(brandLabel, T.brand);
  const brand = h('a', { class: 'brand', href: 'index.html' },
    h('span', { class: 'brand__mark', 'aria-hidden': 'true' }, 'λ'),
    h('span', { class: 'brand__label' }, brandLabel, small));
  setAttr(brand, 'aria-label', T.home);

  const panel = h('div', { class: 'menu__panel', hidden: true, id: 'modules-menu' });
  const renderMenu = () => {
    panel.replaceChildren();
    for (const ch of CHAPTERS) {
      panel.append(h('div', { class: 'menu__group' }, tr(ch.title)));
      for (const m of MODULES.filter((x) => x.chapter === ch.id)) {
        panel.append(h('a', { class: 'menu__item', href: m.file, 'aria-current': m.id === current ? 'page' : null },
          h('span', null, moduleNumber(m.id)), h('span', null, tr(m.title))));
      }
    }
  };
  renderMenu();
  onLangChange(renderMenu);
  const menuBtn = h('button', { type: 'button', class: 'btn btn--ghost', 'aria-expanded': 'false', 'aria-controls': 'modules-menu' }, icon('menu'));
  const menuLabel = h('span', { class: 'nav-link--text' });
  setText(menuLabel, T.modules);
  menuBtn.append(menuLabel);
  const menu = h('div', { class: 'menu' }, menuBtn, panel);
  const close = () => { panel.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    menuBtn.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { close(); menuBtn.focus(); } });

  const code = h('a', { class: 'nav-link nav-link--text', href: 'https://github.com/osvo/algebra-lineal', rel: 'noopener' });
  setText(code, T.code);

  return h('nav', { class: 'site-nav' },
    h('div', { class: 'site-nav__inner' }, brand,
      h('div', { class: 'nav-actions' }, menu, code, themeButton(), languageSwitch())));
}

export function siteFooter() {
  const by = h('span'); setText(by, T.footerBy);
  const insp = h('a', { href: 'https://www.3blue1brown.com/', target: '_blank', rel: 'noopener noreferrer' }); setText(insp, T.footerInspired);
  return h('footer', { class: 'site-footer' }, h('div', { class: 'site-footer__inner' }, by, insp));
}

// ---------------------------------------------------------------------------
// Lab page
// ---------------------------------------------------------------------------

/**
 * config = {
 *   id, lead: {es,en}, state: schema, wide?: bool,
 *   build(ctx) → { render(state, changed) → derived, snapshot?() → canvas, togglePlay?(), onReset?() },
 *   learn: { what: {es,en} (HTML with TeX), prompts: {es: [], en: []}, formal: [{ kind, title, body }] },
 *   challenges: [{ id, title, text, hint, setup?(store), check(state, derived) → bool }],
 * }
 */
export function createLab(config) {
  const meta = MODULES.find((m) => m.id === config.id);
  const idx = MODULES.indexOf(meta);
  const store = createStore(config.state);
  const titleText = meta.title;

  // Header -------------------------------------------------------------------
  const eyebrow = h('p', { class: 'eyebrow' });
  const renderEyebrow = () => { eyebrow.textContent = `${tr(T.module)} ${moduleNumber(meta.id)} · ${tr(chapterOf(meta).title)}`; };
  renderEyebrow(); onLangChange(renderEyebrow);
  const h1 = h('h1'); setText(h1, titleText);
  const lead = h('p', { class: 'lead' }); setText(lead, config.lead);

  const mkAction = (iconName, label, title, onClick, kind = '') => {
    const b = h('button', { type: 'button', class: `btn${kind ? ` btn--${kind}` : ''}` }, icon(iconName));
    const s = h('span'); setText(s, label); b.append(s);
    setAttr(b, 'title', title);
    b.addEventListener('click', onClick);
    return b;
  };
  const actions = h('div', { class: 'lab-head__actions' },
    mkAction('share', T.share, T.shareTitle, share),
    mkAction('image', T.png, T.pngTitle, exportPng),
    mkAction('present', T.present, T.presentTitle, () => setPresenting(true)),
    mkAction('reset', T.reset, T.resetTitle, reset));
  const head = h('header', { class: 'lab-head' }, h('div', null, eyebrow, h1, lead), actions);

  // Stage + panel --------------------------------------------------------------
  const views = h('div', { class: 'stage__views' });
  const bar = h('div', { class: 'stage__bar' });
  const legend = h('div', { class: 'legend', 'aria-label': 'legend' });
  const presentTools = h('div', { class: 'row', style: { position: 'absolute', top: '10px', right: '10px', zIndex: 8 } });
  const exitBtn = mkAction('exit', T.exitPresent, T.exitPresent, () => setPresenting(false));
  exitBtn.classList.add('present-exit');
  const panelBtn = mkAction('panel', T.togglePanel, T.togglePanel, () => document.body.classList.toggle('panel-hidden'));
  panelBtn.classList.add('present-exit');
  presentTools.append(panelBtn, exitBtn);
  const stage = h('section', { class: 'stage' }, views, presentTools, bar, legend);
  setAttr(stage, 'aria-label', { es: 'Visualización', en: 'Visualization' });
  const activeBanner = h('div', { class: 'active-challenge', hidden: true });
  const panel = h('aside', { class: 'panel' }, activeBanner);
  setAttr(panel, 'aria-label', { es: 'Controles y resultados', en: 'Controls and results' });
  const main = h('main', { id: 'lab', class: `lab-main${config.wide ? ' lab-main--wide-panel' : ''}` }, stage, panel);

  // Learning section -------------------------------------------------------------
  const learn = buildLearn(config, meta);

  // Pager ------------------------------------------------------------------------
  const pager = h('nav', { class: 'pager' });
  const renderPager = () => {
    pager.replaceChildren();
    const prev = MODULES[idx - 1], next = MODULES[idx + 1];
    pager.append(prev
      ? h('a', { href: prev.file }, h('small', null, `← ${tr(T.prev)} · ${moduleNumber(prev.id)}`), h('strong', null, tr(prev.title)))
      : h('a', { href: 'index.html' }, h('small', null, `← ${tr(T.home)}`), h('strong', null, tr(T.siteName))));
    pager.append(next
      ? h('a', { href: next.file }, h('small', null, `${tr(T.next)} · ${moduleNumber(next.id)} →`), h('strong', null, tr(next.title)))
      : h('a', { href: 'index.html#modulos' }, h('small', null, `${tr(T.modules)} →`), h('strong', null, tr(T.siteName))));
  };
  renderPager(); onLangChange(renderPager);

  const skip = h('a', { class: 'skip-link', href: '#lab' }); setText(skip, T.skip);
  document.body.append(skip, siteNav({ current: meta.id, subtitle: titleText }), head, main, learn.el, pager, siteFooter());

  const updateTitle = () => {
    document.title = `${tr(meta.title)} · ${tr(T.siteName)}`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', tr(config.lead));
  };
  updateTitle(); onLangChange(updateTitle);

  // Module ---------------------------------------------------------------------
  const shortcuts = new Map();
  const legendItems = { current: [] };
  const ctx = {
    store, meta, views, bar, legend, panel, stage,
    addView({ className = '' } = {}) {
      const v = h('div', { class: `view ${className}` });
      views.append(v);
      views.classList.toggle('stage__views--2', views.children.length === 2);
      return v;
    },
    clearViews() {
      views.replaceChildren();
      views.classList.remove('stage__views--2');
    },
    setLegend(items) {
      legendItems.current = items;
      renderLegend();
    },
    addShortcut(key, fn) { shortcuts.set(key, fn); },
    rerender: () => renderNow(new Set(['__rerender'])),
  };
  function renderLegend() {
    legend.replaceChildren();
    for (const it of legendItems.current) {
      if (!it) continue;
      const sw = h('span', { class: `legend__swatch${it.kind === 'area' ? ' legend__swatch--area' : it.kind === 'dash' ? ' legend__swatch--dash' : ''}`, style: { color: it.color } });
      const label = h('span', { html: it.tex ? richHTML(`$${it.tex}$ ${it.label ? tr(it.label) : ''}`) : tr(it.label) });
      legend.append(h('span', { class: 'legend__item' }, sw, label));
    }
  }
  onLangChange(renderLegend);

  const mod = config.build(ctx);
  let derived = null;
  function renderNow(changed) {
    derived = mod.render(store.state, changed) || {};
    challenges.check(derived);
  }

  const challenges = setupChallenges(config, meta, store, learn, activeBanner, () => derived);
  store.subscribe((state, changed) => renderNow(changed));
  onLangChange(() => renderNow(new Set(['__lang'])));
  renderNow(new Set(Object.keys(store.state).concat('__init')));

  // Actions ---------------------------------------------------------------------
  async function share() {
    const url = new URL(store.shareUrl());
    url.searchParams.set('lang', getLang());
    const ok = await copyText(url.toString());
    toast(tr(ok ? T.copied : T.copyFail), { kind: ok ? 'success' : 'info' });
  }

  function exportPng() {
    const canvas = mod.snapshot ? mod.snapshot() : null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `algebra-lineal-${meta.id}-${date}.png`);
    }, 'image/png');
  }

  function reset() {
    store.reset();
    if (mod.onReset) mod.onReset();
    toast(tr(T.resetDone));
  }

  function setPresenting(on) {
    document.body.classList.toggle('presenting', on);
    if (!on) document.body.classList.remove('panel-hidden');
    const el = document.documentElement;
    if (on && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    window.dispatchEvent(new Event('resize'));
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('presenting')) setPresenting(false);
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && document.body.classList.contains('presenting')) { setPresenting(false); return; }
    if (e.target && e.target.classList && e.target.classList.contains('view')) {
      // Canvas keys (arrows, +/−) are handled by the view itself.
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '=', '0', '[', ']'].includes(e.key)) return;
    }
    if (e.key === 'p' || e.key === 'P') { setPresenting(!document.body.classList.contains('presenting')); e.preventDefault(); return; }
    if (e.key === ' ' && mod.togglePlay && tag !== 'BUTTON' && tag !== 'A') { mod.togglePlay(); e.preventDefault(); return; }
    const fn = shortcuts.get(e.key);
    if (fn) { fn(e); e.preventDefault(); }
  });

  document.documentElement.removeAttribute('data-loading');
  registerServiceWorker();
  return { store, ctx, mod };
}

// ---------------------------------------------------------------------------
// Learning tabs
// ---------------------------------------------------------------------------

function buildLearn(config, meta) {
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const panels = h('div');
  const defs = [
    { id: 'explain', label: T.tabExplain },
    { id: 'formal', label: T.tabFormal },
    { id: 'challenges', label: T.tabChallenges },
  ];
  const buttons = {}, panes = {};
  for (const d of defs) {
    const b = h('button', { type: 'button', role: 'tab', id: `tab-${d.id}`, 'aria-controls': `pane-${d.id}` });
    const lbl = h('span'); setText(lbl, d.label); b.append(lbl);
    if (d.id === 'challenges') { const count = h('span', { class: 'mono', style: { marginLeft: '8px', color: 'var(--faint)' } }); b.append(count); b.count = count; }
    b.addEventListener('click', () => select(d.id));
    b.addEventListener('keydown', (e) => {
      const i = defs.findIndex((x) => x.id === d.id);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const n = defs[(i + (e.key === 'ArrowRight' ? 1 : defs.length - 1)) % defs.length];
        select(n.id); buttons[n.id].focus(); e.preventDefault();
      }
    });
    tabs.append(b); buttons[d.id] = b;
    const p = h('div', { class: 'tabpanel', role: 'tabpanel', id: `pane-${d.id}`, 'aria-labelledby': `tab-${d.id}` });
    panels.append(p); panes[d.id] = p;
  }
  function select(id) {
    for (const d of defs) {
      buttons[d.id].setAttribute('aria-selected', String(d.id === id));
      buttons[d.id].tabIndex = d.id === id ? 0 : -1;
      panes[d.id].hidden = d.id !== id;
    }
  }
  select('explain');

  const render = () => {
    const L = config.learn || {};
    // Explanation
    const what = h('div', { class: 'prose' });
    what.innerHTML = `<h2>${tr(T.whatYouSee)}</h2>${richHTML(tr(L.what || ''))}`;
    const prompts = h('ol', { class: 'prompts' });
    for (const p of tr(L.prompts || { es: [], en: [] })) prompts.append(h('li', null, h('div', { html: richHTML(p) })));
    const aside = h('div', null, h('h2', { class: 'aside-title' }, tr(T.tryThis)), prompts);
    panes.explain.replaceChildren(h('div', { class: 'learn-grid' }, what, aside));
    // Formal
    const formal = h('div', { style: { maxWidth: '900px' } });
    (L.formal || []).forEach((f, i) => {
      const d = h('details', { class: 'formal', open: i === 0 ? true : null },
        h('summary', null, h('span', null, h('span', { class: 'formal__kind' }, tr(T.kinds[f.kind] || f.kind)), tr(f.title))),
        h('div', { class: 'formal__body prose', html: richHTML(tr(f.body)) }));
      formal.append(d);
    });
    panes.formal.replaceChildren(formal);
  };
  render();
  onLangChange(render);
  const el = h('section', { class: 'learn' }, tabs, panels);
  setAttr(el, 'aria-label', { es: 'Aprender', en: 'Learn' });
  return { el, panes, buttons, select };
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

function setupChallenges(config, meta, store, learn, banner, getDerived) {
  const list = config.challenges || [];
  let activeId = null;
  let activeSnapshot = null;
  const done = () => new Set((solvedChallenges()[meta.id]) || []);

  function markDone(id) {
    const all = solvedChallenges();
    const set = new Set(all[meta.id] || []);
    set.add(id);
    all[meta.id] = [...set];
    storage.setJSON(CHALLENGE_KEY, all);
  }

  function render() {
    const solved = done();
    const total = list.length;
    learn.buttons.challenges.count.textContent = total ? `${[...solved].filter((id) => list.some((c) => c.id === id)).length}/${total}` : '';
    const pane = learn.panes.challenges;
    pane.replaceChildren();
    if (!total) return;
    const nDone = list.filter((c) => solved.has(c.id)).length;
    const progress = h('div', { class: 'progress' }, h('span', { style: { width: `${(100 * nDone) / total}%` } }));
    pane.append(h('div', { class: 'challenge-bar' }, h('span', null, trf(T.progress, { done: nDone, total })), progress));
    const grid = h('div', { class: 'challenges' });
    list.forEach((c, i) => {
      const isDone = solved.has(c.id);
      const isActive = activeId === c.id;
      const btn = h('button', { type: 'button', class: `btn${isActive ? '' : ' btn--primary'}`, disabled: isActive ? true : null });
      btn.textContent = tr(isActive ? T.active : isDone ? T.retry : T.start);
      btn.addEventListener('click', () => activate(c.id));
      const status = isDone ? h('span', { class: 'badge badge--ok' }, icon('check'), tr(T.solved)) : null;
      const hint = c.hint ? h('details', null, h('summary', null, tr(T.hint)), h('div', { html: richHTML(tr(c.hint)), style: { marginTop: '6px' } })) : null;
      grid.append(h('article', { class: 'challenge', 'data-active': String(isActive), 'data-done': String(isDone) },
        h('div', null,
          h('div', { class: 'challenge__head' }, h('span', { class: 'challenge__num' }, String(i + 1).padStart(2, '0')), status),
          h('h3', { class: 'challenge__title', html: richHTML(tr(c.title)) })),
        h('p', { class: 'challenge__text', html: richHTML(tr(c.text)) }),
        h('div', { class: 'challenge__foot' }, btn, hint)));
    });
    pane.append(grid);
    renderBanner();
  }

  function renderBanner() {
    const c = list.find((x) => x.id === activeId);
    if (!c) { banner.hidden = true; banner.replaceChildren(); return; }
    banner.hidden = false;
    const leave = h('button', { type: 'button', class: 'btn btn--sm btn--ghost' });
    leave.textContent = tr(T.abandon);
    leave.addEventListener('click', () => { activeId = null; render(); });
    banner.replaceChildren(h('div', { style: { flex: '1' } },
      h('strong', null, tr(T.challengeActive)),
      h('div', { html: `<b>${richHTML(tr(c.title))}</b> — ${richHTML(tr(c.text))}` })), leave);
  }

  function activate(id) {
    const c = list.find((x) => x.id === id);
    activeId = id;
    if (c.setup) c.setup(store);
    activeSnapshot = store.snapshot();
    render();
    document.getElementById('lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function check(derived) {
    if (!activeId) return;
    const c = list.find((x) => x.id === activeId);
    if (!c) return;
    if (store.snapshot() === activeSnapshot) return;
    let ok = false;
    try { ok = !!c.check(store.state, derived || getDerived() || {}); } catch { ok = false; }
    if (ok) {
      markDone(c.id);
      activeId = null;
      toast(tr(T.solvedToast) + stripTags(tr(c.title)), { kind: 'success', ms: 3600 });
      render();
    }
  }

  render();
  onLangChange(render);
  return { check, render };
}

function stripTags(s) { return String(s).replace(/<[^>]+>/g, '').replace(/\$/g, ''); }

/** Places several canvases side by side (for PNG export of multi-view modules). */
export function composeCanvases(canvases, gap = 2, bg = '#000') {
  const hMax = Math.max(...canvases.map((c) => c.height));
  const w = canvases.reduce((s, c) => s + c.width, 0) + gap * (canvases.length - 1);
  const out = document.createElement('canvas');
  out.width = w; out.height = hMax;
  const ctx = out.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, hMax);
  let x = 0;
  for (const c of canvases) { ctx.drawImage(c, x, 0); x += c.width + gap; }
  return out;
}
