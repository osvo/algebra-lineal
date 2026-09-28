// Theme preference: 'auto' (follows the OS), 'dark' or 'light'.

import { storage, icon } from './dom.js';
import { setAttr } from './i18n.js';

const KEY = 'linear-lab-theme';
const listeners = new Set();
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

// The app is designed dark first; 'auto' remains available from the theme button.
let pref = ['auto', 'dark', 'light'].includes(storage.get(KEY)) ? storage.get(KEY) : 'dark';

export const getThemePref = () => pref;
export const getTheme = () => (pref === 'auto' ? (media && media.matches ? 'light' : 'dark') : pref);

function apply() {
  document.documentElement.dataset.theme = getTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getTheme() === 'light' ? '#f3f3f3' : '#181a1f');
  for (const fn of listeners) fn(getTheme());
}

export function setThemePref(next) {
  pref = next;
  storage.set(KEY, pref);
  apply();
}

export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

if (media && media.addEventListener) media.addEventListener('change', () => { if (pref === 'auto') apply(); });
apply();

const LABELS = {
  auto: { es: 'Tema: automático', en: 'Theme: automatic' },
  dark: { es: 'Tema: oscuro', en: 'Theme: dark' },
  light: { es: 'Tema: claro', en: 'Theme: light' },
};

export function themeButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn btn--ghost';
  const render = () => {
    btn.replaceChildren(icon(pref === 'auto' ? 'auto' : pref === 'dark' ? 'moon' : 'sun'));
    setAttr(btn, 'aria-label', LABELS[pref]);
    setAttr(btn, 'title', LABELS[pref]);
  };
  btn.addEventListener('click', () => {
    const order = ['dark', 'light', 'auto'];
    setThemePref(order[(order.indexOf(pref) + 1) % order.length]);
    render();
  });
  render();
  return btn;
}

/** Reads a CSS custom property (resolved for the current theme). */
export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
