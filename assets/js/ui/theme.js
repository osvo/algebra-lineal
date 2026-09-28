// Theme preference: 'auto' (follows the OS), 'dark' or 'light'.

import { storage, icon } from './dom.js';
import { setAttr } from './i18n.js';

const KEY = 'linear-lab-theme';
const listeners = new Set();
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

let pref = ['auto', 'dark', 'light'].includes(storage.get(KEY)) ? storage.get(KEY) : 'auto';

export const getThemePref = () => pref;
export const getTheme = () => (pref === 'auto' ? (media && media.matches ? 'light' : 'dark') : pref);

function apply() {
  document.documentElement.dataset.theme = getTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getTheme() === 'light' ? '#f6f5ef' : '#0c0f0d');
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
    const order = ['auto', 'dark', 'light'];
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
