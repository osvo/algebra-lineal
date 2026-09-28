// Application shell shared by every app: sidebar with all the apps, toolbar,
// full-height stage, inspector (controls, theory, challenges) and status bar.

import { h, icon, toast, copyText, downloadBlob, storage, clamp } from './dom.js';
import { tr, trf, setText, setAttr, onLangChange, languageSwitch, getLang } from './i18n.js';
import { themeButton } from './theme.js';
import { richHTML } from './tex.js';
import { MODULES, CHAPTERS, moduleNumber, chapterOf } from '../modules/registry.js';
import { createStore } from './store.js';
import { registerServiceWorker } from './pwa.js';
import { moduleIcon } from './moduleIcons.js';

const T = {
  apps: { es: 'Aplicativos', en: 'Apps' },
  menu: { es: 'Menú', en: 'Menu' },
  allApps: { es: 'Todos los aplicativos', en: 'All apps' },
  collapse: { es: 'Plegar o desplegar la barra lateral (B)', en: 'Collapse or expand the sidebar (B)' },
  share: { es: 'Compartir', en: 'Share' },
  shareTitle: { es: 'Copiar un enlace a esta configuración exacta', en: 'Copy a link to this exact configuration' },
  png: { es: 'PNG', en: 'PNG' },
  pngTitle: { es: 'Descargar la vista como imagen PNG', en: 'Download the view as a PNG image' },
  present: { es: 'Presentar', en: 'Present' },
  presentTitle: { es: 'Modo presentación (P)', en: 'Presentation mode (P)' },
  exitPresent: { es: 'Salir', en: 'Exit' },
  togglePanel: { es: 'Panel', en: 'Panel' },
  reset: { es: 'Restablecer', en: 'Reset' },
  resetTitle: { es: 'Volver a la configuración inicial', en: 'Back to the initial configuration' },
  copied: { es: 'Enlace copiado: reproduce exactamente esta configuración', en: 'Link copied: it reproduces this exact configuration' },
  copyFail: { es: 'No se pudo copiar; el enlace está en la barra de direcciones', en: 'Could not copy; the link is in the address bar' },
  resetDone: { es: 'Configuración restablecida', en: 'Configuration reset' },
  tabControls: { es: 'Controles', en: 'Controls' },
  tabTheory: { es: 'Teoría', en: 'Theory' },
  tabChallenges: { es: 'Retos', en: 'Challenges' },
  whatYouSee: { es: 'Qué estás viendo', en: 'What you are seeing' },
  tryThis: { es: 'Experimenta', en: 'Try this' },
  formally: { es: 'Formalmente', en: 'Formally' },
  start: { es: 'Intentar', en: 'Try it' },
  active: { es: 'En curso…', en: 'In progress…' },
  solved: { es: 'Resuelto', en: 'Solved' },
  retry: { es: 'Repetir', en: 'Retry' },
  hint: { es: 'Pista', en: 'Hint' },
  challengeActive: { es: 'Reto activo', en: 'Active challenge' },
  abandon: { es: 'Abandonar', en: 'Leave' },
  solvedToast: { es: '¡Reto resuelto! ', en: 'Challenge solved! ' },
  progress: { es: '{done} de {total} retos resueltos', en: '{done} of {total} challenges solved' },
  code: { es: 'Código fuente', en: 'Source code' },
  credit: { es: 'Juan Camilo Osorio Oviedo · inspirado en 3Blue1Brown', en: 'Juan Camilo Osorio Oviedo · inspired by 3Blue1Brown' },
  skip: { es: 'Saltar al aplicativo', en: 'Skip to the app' },
  siteName: { es: 'Laboratorio de Álgebra Lineal', en: 'Linear Algebra Laboratory' },
  brand: { es: 'Álgebra lineal', en: 'Linear algebra' },
  shortcuts: { es: 'P presentar · Espacio animar · B barra lateral', en: 'P present · Space animate · B sidebar' },
  resize: { es: 'Arrastra para cambiar el ancho del panel', en: 'Drag to resize the panel' },
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
export const LAST_KEY = 'linear-lab-last';
const SIDEBAR_KEY = 'linear-lab-sidebar';
const INSPECTOR_KEY = 'linear-lab-inspector-width';

export function solvedChallenges() { return storage.getJSON(CHALLENGE_KEY, {}); }

// ---------------------------------------------------------------------------
// Sidebar: every app, grouped by chapter
// ---------------------------------------------------------------------------

function buildSidebar(current) {
  const brandLabel = h('span', { class: 'sidebar__brand-label' });
  setText(brandLabel, T.brand);
  const brand = h('a', { class: 'sidebar__brand', href: 'index.html' },
    h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'λ'), brandLabel);
  setAttr(brand, 'title', T.allApps);
  setAttr(brand, 'aria-label', T.allApps);
  const collapse = h('button', { type: 'button', class: 'icon-btn icon-btn--ghost sidebar__collapse' }, icon('sidebar'));
  setAttr(collapse, 'aria-label', T.collapse);
  setAttr(collapse, 'title', T.collapse);
  collapse.addEventListener('click', () => toggleSidebar());

  const nav = h('nav', { class: 'sidebar__nav' });
  setAttr(nav, 'aria-label', T.apps);
  const render = () => {
    const solved = solvedChallenges();
    nav.replaceChildren();
    for (const ch of CHAPTERS) {
      nav.append(h('div', { class: 'sidebar__group' }, tr(ch.title)));
      for (const m of MODULES.filter((x) => x.chapter === ch.id)) {
        const done = (solved[m.id] || []).length;
        const item = h('a', { class: 'navitem', href: m.file, 'aria-current': m.id === current ? 'page' : null, title: `${moduleNumber(m.id)} · ${tr(m.title)}` },
          moduleIcon(m.id, { size: 20 }),
          h('span', { class: 'navitem__num' }, moduleNumber(m.id)),
          h('span', { class: 'navitem__label' }, tr(m.short || m.title)),
          done >= m.challenges ? h('span', { class: 'navitem__done', title: tr(T.solved) }, '✓') : null);
        nav.append(item);
      }
    }
  };
  render();
  onLangChange(render);

  const code = h('a', { class: 'sidebar__link', href: 'https://github.com/osvo/algebra-lineal', rel: 'noopener' }, icon('code'));
  const codeLabel = h('span'); setText(codeLabel, T.code); code.append(codeLabel);
  const credit = h('p', { class: 'sidebar__credit' }); setText(credit, T.credit);

  const el = h('aside', { class: 'sidebar' },
    h('div', { class: 'sidebar__head' }, brand, collapse),
    nav,
    h('div', { class: 'sidebar__foot' }, code, credit));
  setAttr(el, 'aria-label', T.apps);
  return { el, render };
}

const isNarrow = () => window.matchMedia('(max-width: 899px)').matches;

function toggleSidebar(force) {
  const b = document.body;
  if (isNarrow()) {
    b.classList.toggle('sidebar-open', force);
    return;
  }
  const collapsed = force === undefined ? !b.classList.contains('sidebar-collapsed') : !force;
  b.classList.toggle('sidebar-collapsed', collapsed);
  storage.set(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
  window.dispatchEvent(new Event('resize'));
}

// ---------------------------------------------------------------------------
// App page
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
  const store = createStore(config.state);
  storage.set(LAST_KEY, meta.id);
  const body = document.body;
  body.classList.add('app');
  body.dataset.module = meta.id;
  if (storage.get(SIDEBAR_KEY) === 'collapsed') body.classList.add('sidebar-collapsed');
  if (config.wide) body.classList.add('wide-inspector');
  const savedWidth = +storage.get(INSPECTOR_KEY, 0);
  if (savedWidth) body.style.setProperty('--insp-w', `${clamp(savedWidth, 300, 720)}px`);

  const sidebar = buildSidebar(meta.id);
  const backdrop = h('div', { class: 'sidebar-backdrop' });
  backdrop.addEventListener('click', () => toggleSidebar(false));

  // Toolbar -------------------------------------------------------------------
  const menuBtn = h('button', { type: 'button', class: 'icon-btn icon-btn--ghost toolbar__menu' }, icon('menu'));
  setAttr(menuBtn, 'aria-label', T.menu);
  menuBtn.addEventListener('click', () => toggleSidebar(true));
  const title = h('h1', { class: 'toolbar__title' });
  const renderTitle = () => {
    title.replaceChildren(h('span', { class: 'toolbar__num' }, moduleNumber(meta.id)), h('span', null, tr(meta.title)),
      h('span', { class: 'toolbar__chapter' }, tr(chapterOf(meta).title)));
  };
  renderTitle(); onLangChange(renderTitle);

  const mkAction = (iconName, label, tip, onClick) => {
    const b = h('button', { type: 'button', class: 'icon-btn icon-btn--ghost' }, icon(iconName));
    setAttr(b, 'aria-label', label);
    setAttr(b, 'title', tip);
    b.addEventListener('click', onClick);
    return b;
  };
  const toolbar = h('header', { class: 'toolbar' },
    menuBtn, title, h('div', { class: 'toolbar__spacer' }),
    h('div', { class: 'toolbar__group' },
      mkAction('share', T.share, T.shareTitle, share),
      mkAction('image', T.png, T.pngTitle, exportPng),
      mkAction('present', T.present, T.presentTitle, () => setPresenting(true)),
      mkAction('reset', T.reset, T.resetTitle, reset)),
    h('div', { class: 'toolbar__sep', 'aria-hidden': 'true' }),
    h('div', { class: 'toolbar__group' }, themeButton(), languageSwitch()));

  // Stage ---------------------------------------------------------------------
  const views = h('div', { class: 'stage__views' });
  const bar = h('div', { class: 'stage__bar' });
  const legend = h('div', { class: 'legend' });
  setAttr(legend, 'aria-label', { es: 'Leyenda', en: 'Legend' });
  const mkPresent = (iconName, label, onClick) => {
    const b = h('button', { type: 'button', class: 'btn btn--sm present-exit' }, icon(iconName));
    const s = h('span'); setText(s, label); b.append(s);
    b.addEventListener('click', onClick);
    return b;
  };
  const presentTools = h('div', { class: 'present-tools' },
    mkPresent('panel', T.togglePanel, () => { body.classList.toggle('panel-hidden'); window.dispatchEvent(new Event('resize')); }),
    mkPresent('exit', T.exitPresent, () => setPresenting(false)));
  const stage = h('section', { class: 'stage' }, views, presentTools, bar, legend);
  setAttr(stage, 'aria-label', { es: 'Visualización', en: 'Visualization' });
  const workspace = h('main', { id: 'lab', class: 'workspace' }, toolbar, stage);

  // Inspector -----------------------------------------------------------------
  const activeBanner = h('div', { class: 'active-challenge', hidden: true });
  const panel = h('div', { class: 'panel' }, activeBanner);
  const inspector = buildInspector(config, meta, panel);
  const resizer = h('div', { class: 'inspector__resizer', role: 'separator', 'aria-orientation': 'vertical' });
  setAttr(resizer, 'title', T.resize);
  inspector.el.prepend(resizer);
  bindResizer(resizer);

  // Status bar ----------------------------------------------------------------
  const statusProgress = h('span', { class: 'statusbar__item' });
  const statusHint = h('span', { class: 'statusbar__item statusbar__hint' }); setText(statusHint, T.shortcuts);
  const statusApp = h('span', { class: 'statusbar__item' });
  const renderStatus = () => { statusApp.textContent = `${tr(T.siteName)} · ${moduleNumber(meta.id)} ${tr(meta.title)}`; };
  renderStatus(); onLangChange(renderStatus);
  const statusbar = h('footer', { class: 'statusbar' },
    h('span', { class: 'statusbar__mode' }, 'λ'), statusApp, h('span', { class: 'toolbar__spacer' }), statusProgress, statusHint);

  const skip = h('a', { class: 'skip-link', href: '#lab' }); setText(skip, T.skip);
  body.append(skip, sidebar.el, backdrop, workspace, inspector.el, statusbar);

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

  const challenges = setupChallenges(config, meta, store, inspector, activeBanner, () => derived, (done, total) => {
    statusProgress.textContent = total ? `${tr(T.tabChallenges)} ${done}/${total}` : '';
    sidebar.render();
  });
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
    body.classList.toggle('presenting', on);
    if (!on) body.classList.remove('panel-hidden');
    const el = document.documentElement;
    if (on && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    window.dispatchEvent(new Event('resize'));
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && body.classList.contains('presenting')) setPresenting(false);
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (body.classList.contains('presenting')) { setPresenting(false); return; }
      if (body.classList.contains('sidebar-open')) { toggleSidebar(false); return; }
    }
    if (e.target && e.target.classList && e.target.classList.contains('view')) {
      // Canvas keys (arrows, +/−) are handled by the view itself.
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '=', '0', '[', ']'].includes(e.key)) return;
    }
    if (e.key === 'p' || e.key === 'P') { setPresenting(!body.classList.contains('presenting')); e.preventDefault(); return; }
    if (e.key === 'b' || e.key === 'B') { toggleSidebar(); e.preventDefault(); return; }
    if (e.key === ' ' && mod.togglePlay && tag !== 'BUTTON' && tag !== 'A') { mod.togglePlay(); e.preventDefault(); return; }
    const fn = shortcuts.get(e.key);
    if (fn) { fn(e); e.preventDefault(); }
  });

  document.documentElement.removeAttribute('data-loading');
  registerServiceWorker();
  return { store, ctx, mod };
}

/** The inspector's left edge can be dragged to change its width (saved per browser). */
function bindResizer(handle) {
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    if (isNarrow()) return;
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const w = clamp(window.innerWidth - e.clientX, 300, Math.min(720, window.innerWidth * 0.6));
    document.body.style.setProperty('--insp-w', `${Math.round(w)}px`);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    const w = parseInt(getComputedStyle(document.body).getPropertyValue('--insp-w'), 10);
    if (w) storage.set(INSPECTOR_KEY, String(w));
    window.dispatchEvent(new Event('resize'));
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => {
    document.body.style.removeProperty('--insp-w');
    storage.set(INSPECTOR_KEY, '');
    window.dispatchEvent(new Event('resize'));
  });
}

// ---------------------------------------------------------------------------
// Inspector: Controls | Theory | Challenges
// ---------------------------------------------------------------------------

function buildInspector(config, meta, controls) {
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const panes = h('div', { class: 'inspector__panes' });
  const defs = [
    { id: 'controls', label: T.tabControls },
    { id: 'theory', label: T.tabTheory },
    { id: 'challenges', label: T.tabChallenges },
  ];
  const buttons = {}, paneEls = {};
  for (const d of defs) {
    const b = h('button', { type: 'button', role: 'tab', id: `tab-${d.id}`, 'aria-controls': `pane-${d.id}` });
    const lbl = h('span'); setText(lbl, d.label); b.append(lbl);
    if (d.id === 'challenges') { const count = h('span', { class: 'tabs__count' }); b.append(count); b.count = count; }
    b.addEventListener('click', () => select(d.id));
    b.addEventListener('keydown', (e) => {
      const i = defs.findIndex((x) => x.id === d.id);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const n = defs[(i + (e.key === 'ArrowRight' ? 1 : defs.length - 1)) % defs.length];
        select(n.id); buttons[n.id].focus(); e.preventDefault();
      }
    });
    tabs.append(b); buttons[d.id] = b;
    const p = d.id === 'controls' ? controls : h('div');
    p.classList.add('tabpanel');
    p.setAttribute('role', 'tabpanel');
    p.id = `pane-${d.id}`;
    p.setAttribute('aria-labelledby', `tab-${d.id}`);
    panes.append(p); paneEls[d.id] = p;
  }
  function select(id) {
    for (const d of defs) {
      buttons[d.id].setAttribute('aria-selected', String(d.id === id));
      buttons[d.id].tabIndex = d.id === id ? 0 : -1;
      paneEls[d.id].hidden = d.id !== id;
    }
    panes.scrollTop = 0;
  }
  select('controls');

  const renderTheory = () => {
    const L = config.learn || {};
    const out = [];
    if (config.lead) out.push(h('p', { class: 'theory__lead' }, tr(config.lead)));
    out.push(h('section', { class: 'theory__section' }, h('h2', { class: 'section-title' }, tr(T.whatYouSee)), h('div', { class: 'prose', html: richHTML(tr(L.what || '')) })));
    const prompts = h('ol', { class: 'prompts' });
    for (const p of tr(L.prompts || { es: [], en: [] })) prompts.append(h('li', null, h('div', { html: richHTML(p) })));
    out.push(h('section', { class: 'theory__section' }, h('h2', { class: 'section-title' }, tr(T.tryThis)), prompts));
    const formal = h('div', { class: 'formal-list' });
    (L.formal || []).forEach((f, i) => {
      formal.append(h('details', { class: 'formal', open: i === 0 ? true : null },
        h('summary', null, h('span', null, h('span', { class: 'formal__kind' }, tr(T.kinds[f.kind] || f.kind)), tr(f.title))),
        h('div', { class: 'formal__body prose', html: richHTML(tr(f.body)) })));
    });
    out.push(h('section', { class: 'theory__section' }, h('h2', { class: 'section-title' }, tr(T.formally)), formal));
    paneEls.theory.replaceChildren(...out);
  };
  renderTheory();
  onLangChange(renderTheory);

  const el = h('aside', { class: `inspector${config.wide ? ' inspector--wide' : ''}` }, tabs, panes);
  setAttr(el, 'aria-label', { es: 'Controles y resultados', en: 'Controls and results' });
  return { el, panes: paneEls, buttons, select, scroller: panes };
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

function setupChallenges(config, meta, store, inspector, banner, getDerived, onProgress) {
  const list = config.challenges || [];
  let activeId = null;
  let activeSnapshot = null;
  let activating = false;
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
    const nDone = list.filter((c) => solved.has(c.id)).length;
    inspector.buttons.challenges.count.textContent = total ? `${nDone}/${total}` : '';
    onProgress(nDone, total);
    const pane = inspector.panes.challenges;
    pane.replaceChildren();
    if (!total) return;
    const progress = h('div', { class: 'progress' }, h('span', { style: { width: `${(100 * nDone) / total}%` } }));
    pane.append(h('div', { class: 'challenge-bar' }, h('span', null, trf(T.progress, { done: nDone, total })), progress));
    const grid = h('div', { class: 'challenges' });
    list.forEach((c, i) => {
      const isDone = solved.has(c.id);
      const isActive = activeId === c.id;
      const btn = h('button', { type: 'button', class: `btn btn--sm${isActive ? '' : ' btn--primary'}`, disabled: isActive ? true : null });
      btn.textContent = tr(isActive ? T.active : isDone ? T.retry : T.start);
      btn.addEventListener('click', () => activate(c.id));
      const status = isDone ? h('span', { class: 'badge badge--ok' }, icon('check'), tr(T.solved)) : null;
      const hint = c.hint ? h('details', null, h('summary', null, tr(T.hint)), h('div', { html: richHTML(tr(c.hint)), style: { marginTop: '6px' } })) : null;
      grid.append(h('article', { class: 'challenge', 'data-active': String(isActive), 'data-done': String(isDone) },
        h('div', { class: 'challenge__head' }, h('span', { class: 'challenge__num' }, String(i + 1).padStart(2, '0')), h('h3', { class: 'challenge__title', html: richHTML(tr(c.title)) }), status),
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
    // The setup state must not count as a solution: checks are suspended until the
    // snapshot that later changes are compared against has been taken.
    activating = true;
    try { if (c.setup) c.setup(store); } finally { activating = false; }
    activeId = id;
    activeSnapshot = store.snapshot();
    render();
    inspector.select('controls');
  }

  function check(derived) {
    if (!activeId || activating) return;
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
export function composeCanvases(canvases, gap = 4, bg = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#303a32') {
  if (canvases.length === 1) return canvases[0];
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

