// Launcher: every app as a tile, grouped by chapter, with challenge progress.

import { h, icon, storage } from './ui/dom.js';
import { tr, setText, setAttr, onLangChange, languageSwitch } from './ui/i18n.js';
import { themeButton } from './ui/theme.js';
import { solvedChallenges, LAST_KEY } from './ui/shell.js';
import { MODULES, CHAPTERS, moduleNumber } from './modules/registry.js';
import { moduleIcon } from './ui/moduleIcons.js';
import { registerServiceWorker } from './ui/pwa.js';

const T = {
  title: { es: 'Laboratorio de Álgebra Lineal', en: 'Linear Algebra Laboratory' },
  resume: { es: 'Continuar', en: 'Continue' },
  code: { es: 'Código fuente', en: 'Source code' },
  newTag: { es: 'Nuevo', en: 'New' },
  apps: { es: 'Aplicativos', en: 'Apps' },
};

const body = document.body;
body.classList.add('launcher-page');

const titleEl = h('h1', { class: 'launcher-bar__title' });
setText(titleEl, T.title);
const code = h('a', { class: 'icon-btn icon-btn--ghost', href: 'https://github.com/osvo/algebra-lineal', rel: 'noopener' }, icon('code'));
setAttr(code, 'aria-label', T.code);
setAttr(code, 'title', T.code);
const bar = h('header', { class: 'launcher-bar' },
  h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'λ'), titleEl, h('span', { class: 'toolbar__spacer' }),
  code, themeButton(), languageSwitch());

const inner = h('div', { class: 'launcher__inner' });
const main = h('main', { id: 'apps', class: 'launcher' }, inner);
setAttr(main, 'aria-label', T.apps);

const statusTotals = h('span', { class: 'statusbar__item' });
const statusCredit = h('span', { class: 'statusbar__item' });
const status = h('footer', { class: 'statusbar' }, h('span', { class: 'statusbar__mode' }, 'λ'), statusTotals, h('span', { class: 'toolbar__spacer' }), statusCredit);

function render() {
  document.title = tr(T.title);
  const solved = solvedChallenges();
  const totalChallenges = MODULES.reduce((s, m) => s + m.challenges, 0);
  const totalDone = MODULES.reduce((s, m) => s + Math.min(m.challenges, (solved[m.id] || []).length), 0);
  inner.replaceChildren();

  const last = MODULES.find((m) => m.id === storage.get(LAST_KEY));
  if (last) {
    inner.append(h('div', { class: 'launcher__resume' }, tr(T.resume),
      h('a', { href: last.file }, moduleIcon(last.id, { size: 22 }), h('span', { class: 'tile__num' }, moduleNumber(last.id)), tr(last.title))));
  }

  for (const ch of CHAPTERS) {
    const mods = MODULES.filter((m) => m.chapter === ch.id);
    const first = moduleNumber(mods[0].id), lastN = moduleNumber(mods[mods.length - 1].id);
    const tiles = h('div', { class: 'tiles' });
    for (const m of mods) {
      const done = Math.min(m.challenges, (solved[m.id] || []).length);
      const progress = h('div', { class: 'tile__progress', 'data-done': String(done === m.challenges) },
        h('div', { class: 'progress' }, h('span', { style: { width: `${(100 * done) / m.challenges}%` } })),
        `${done}/${m.challenges}`);
      tiles.append(h('a', { class: 'tile', href: m.file },
        h('span', { class: 'tile__thumb' }, moduleIcon(m.id, { size: 48 })),
        h('span', { class: 'tile__meta' },
          h('span', { class: 'tile__top' }, h('span', { class: 'tile__num' }, moduleNumber(m.id)), m.isNew ? h('span', { class: 'tile__tag' }, tr(T.newTag)) : null),
          h('h2', { class: 'tile__title' }, tr(m.title)),
          h('p', { class: 'tile__blurb' }, tr(m.blurb)),
          progress)));
    }
    inner.append(h('section', { class: 'chapter-block' },
      h('h2', { class: 'chapter-block__title' }, tr(ch.title), h('span', null, first === lastN ? first : `${first}–${lastN}`)),
      tiles));
  }

  statusTotals.textContent = tr({
    es: `${MODULES.length} aplicativos · ${totalDone}/${totalChallenges} retos resueltos`,
    en: `${MODULES.length} apps · ${totalDone}/${totalChallenges} challenges solved`,
  });
  statusCredit.textContent = tr({ es: 'Juan Camilo Osorio Oviedo · inspirado en 3Blue1Brown', en: 'Juan Camilo Osorio Oviedo · inspired by 3Blue1Brown' });
}

// Replace the static fallback with the app.
body.replaceChildren(bar, main, status);
render();
onLangChange(render);
document.documentElement.removeAttribute('data-loading');
registerServiceWorker();
