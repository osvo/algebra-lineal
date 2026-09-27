// Home page: navigation, live hero animation, learning path with progress.

import { h, storage } from './ui/dom.js';
import { tr, setText, onLangChange, getLang } from './ui/i18n.js';
import { siteNav, siteFooter, solvedChallenges } from './ui/shell.js';
import { MODULES, CHAPTERS, moduleNumber } from './modules/registry.js';
import { Plane2D } from './ui/plane2d.js';
import { renderTex } from './ui/tex.js';
import * as L from './core/linalg.js';
import { texMatrix } from './core/format.js';
import { registerServiceWorker } from './ui/pwa.js';

// Static texts carry both languages in data-es / data-en.
function applyStatic() {
  for (const el of document.querySelectorAll('[data-es][data-en]')) {
    const text = el.dataset[getLang()];
    if (el.tagName === 'META') el.setAttribute('content', text);
    else if (el.hasAttribute('data-html')) el.innerHTML = text;
    else el.textContent = text;
  }
  document.title = tr({ es: 'Laboratorio de Álgebra Lineal · Las matrices también se mueven', en: 'Linear Algebra Laboratory · Matrices move, too' });
}

document.body.prepend(siteNav());
document.body.append(siteFooter());
applyStatic();
onLangChange(applyStatic);

// Learning path ------------------------------------------------------------------
const list = document.getElementById('module-list');
function renderModules() {
  const solved = solvedChallenges();
  list.replaceChildren();
  for (const ch of CHAPTERS) {
    const mods = MODULES.filter((m) => m.chapter === ch.id);
    const first = MODULES.indexOf(mods[0]) + 1;
    const last = MODULES.indexOf(mods[mods.length - 1]) + 1;
    const range = first === last ? String(first).padStart(2, '0') : `${String(first).padStart(2, '0')}–${String(last).padStart(2, '0')}`;
    const label = h('div', { class: 'chapter__label' }, tr({ es: `Capítulo · ${range}`, en: `Chapter · ${range}` }), h('strong', null, tr(ch.title)));
    const items = h('div', { class: 'module-list' });
    for (const m of mods) {
      const done = (solved[m.id] || []).length;
      const title = h('h3', null, tr(m.title));
      if (m.isNew) title.append(h('span', { class: 'tag' }, tr({ es: 'Nuevo', en: 'New' })));
      const blurb = h('div', null, h('p', null, tr(m.blurb)),
        done ? h('span', { class: 'module__done' }, tr({ es: `✓ ${done} de ${m.challenges} retos`, en: `✓ ${done} of ${m.challenges} challenges` })) : null);
      items.append(h('a', { class: 'module', href: m.file },
        h('span', { class: 'module__number' }, `${moduleNumber(m.id)} / ${tr(m.tag).toUpperCase()}`),
        title, blurb, h('span', { class: 'module__arrow', 'aria-hidden': 'true' }, '→')));
    }
    list.append(h('section', { class: 'chapter' }, label, items));
  }
}
renderModules();
onLangChange(renderModules);

// Hero animation -------------------------------------------------------------------
const art = document.getElementById('hero-art');
const caption = document.getElementById('hero-caption');
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SEQ = [
  { m: [[1, 1], [0, 1]], name: { es: 'cizalla', en: 'shear' } },
  { m: [[0, -1], [1, 0]], name: { es: 'rotación de 90°', en: '90° rotation' } },
  { m: [[2, 1], [1, 1]], name: { es: 'gato de Arnold', en: 'Arnold’s cat map' } },
  { m: [[1, 0], [0, -1]], name: { es: 'reflexión', en: 'reflection' } },
  { m: [[1.5, 0], [0, 0.5]], name: { es: 'escalamiento', en: 'scaling' } },
  { m: [[1, 2], [0.5, 1]], name: { es: 'colapso (det = 0)', en: 'collapse (det = 0)' } },
];
if (art) {
  const plane = new Plane2D(art, { range: 2.6, pan: false, zoom: false, ariaLabel: { es: 'Animación: una matriz transforma el plano', en: 'Animation: a matrix transforms the plane' } });
  plane.container.tabIndex = -1;
  let idx = 0, phase = 0, last = null, visible = true;
  let current = [[1, 0], [0, 1]];
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  plane.setDraw((g) => {
    g.backgroundGrid({ ticks: false });
    g.transformedGrid(current, { color: g.c.tgrid });
    const sq = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => L.mv2(current, x, y));
    const d = L.det2(current);
    const col = d < -1e-9 ? g.c.detNeg : g.c.det;
    g.polygon(sq, { fill: col, stroke: col, width: 1.5, fillAlpha: 0.2 });
    const ti = L.mv2(current, 1, 0), tj = L.mv2(current, 0, 1);
    g.arrow([0, 0], ti, { color: g.c.i, width: 3.5 });
    g.arrow([0, 0], tj, { color: g.c.j, width: 3.5 });
  });
  const setCaption = () => {
    const s = SEQ[idx];
    caption.innerHTML = '';
    const t = document.createElement('span');
    renderTex(t, `A = ${texMatrix(s.m.map((r) => r.map((x) => x)))}`);
    caption.append(t, document.createTextNode(`  ${tr(s.name)}`));
  };
  setCaption();
  onLangChange(setCaption);
  const tick = (now) => {
    if (last === null) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      phase += dt / 3.2;
      if (phase >= 1) { phase = 0; idx = (idx + 1) % SEQ.length; setCaption(); }
      // Grow from the identity to the matrix, hold, and come back.
      const x = phase < 0.4 ? ease(phase / 0.4) : phase < 0.75 ? 1 : 1 - ease((phase - 0.75) / 0.25);
      current = L.lerpMatrix(L.identityFloat(2), SEQ[idx].m, x);
      plane.render();
    }
    requestAnimationFrame(tick);
  };
  if (reduce) { current = SEQ[0].m; plane.requestRender(); }
  else {
    new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(art);
    requestAnimationFrame(tick);
  }
}

document.documentElement.removeAttribute('data-loading');
registerServiceWorker();
