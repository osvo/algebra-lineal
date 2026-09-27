// Bilingual text (Spanish / English).
//
// Texts are written inline as { es, en } objects. `tr(obj)` picks the active
// language. Elements whose text depends on the language are registered with
// `setText` / `setAttr`, so switching language updates them without a reload.

import { storage } from './dom.js';

const STORAGE_KEY = 'linear-lab-language';
const LANGS = ['es', 'en'];

function detect() {
  const param = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(param)) return param;
  const saved = storage.get(STORAGE_KEY);
  if (LANGS.includes(saved)) return saved;
  return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

let lang = detect();
document.documentElement.lang = lang;
const listeners = new Set();
const bound = new Set(); // { el, attr, obj }

export const getLang = () => lang;

/** Picks the text for the active language. Accepts strings, {es, en} or functions returning those. */
export function tr(obj, ...args) {
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'function') return tr(obj(...args));
  if (typeof obj === 'string' || typeof obj === 'number') return String(obj);
  if (Array.isArray(obj)) return obj.map((o) => tr(o));
  return obj[lang] ?? obj.es ?? obj.en ?? '';
}

/** tr + {placeholders}. */
export function trf(obj, params = {}) {
  return tr(obj).replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
}

export function setText(el, obj, { html = false } = {}) {
  const entry = { el, attr: html ? '__html' : '__text', obj };
  bound.add(entry);
  applyEntry(entry);
  return el;
}

export function setAttr(el, attr, obj) {
  const entry = { el, attr, obj };
  bound.add(entry);
  applyEntry(entry);
  return el;
}

function applyEntry({ el, attr, obj }) {
  const value = tr(obj);
  if (attr === '__text') el.textContent = value;
  else if (attr === '__html') el.innerHTML = value;
  else el.setAttribute(attr, value);
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  storage.set(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(history.state, '', url);
  for (const entry of bound) {
    // Elements removed from the page (e.g. rebuilt editors) are forgotten.
    if (!entry.el.isConnected) { bound.delete(entry); continue; }
    applyEntry(entry);
  }
  for (const fn of listeners) fn(lang);
}

/** Small EN/ES switch. */
export function languageSwitch() {
  const wrap = document.createElement('div');
  wrap.className = 'lang-switch';
  wrap.setAttribute('role', 'group');
  setAttr(wrap, 'aria-label', { es: 'Idioma', en: 'Language' });
  const make = (code) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = code.toUpperCase();
    b.lang = code;
    b.setAttribute('aria-pressed', String(lang === code));
    b.addEventListener('click', () => setLang(code));
    return b;
  };
  const es = make('es'), en = make('en');
  const sep = document.createElement('span');
  sep.textContent = '/';
  sep.setAttribute('aria-hidden', 'true');
  wrap.append(en, sep, es);
  onLangChange(() => {
    es.setAttribute('aria-pressed', String(lang === 'es'));
    en.setAttribute('aria-pressed', String(lang === 'en'));
  });
  return wrap;
}
