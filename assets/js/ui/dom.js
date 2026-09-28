// Tiny DOM helpers shared by every page.

/**
 * h('div', { class: 'x', onclick: fn, dataset: {a: 1}, style: {...} }, child, [children…])
 * Strings become text nodes; null/false are skipped.
 */
export function h(tag, props = null, ...children) {
  const el = tag.includes(':') || tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'line' || tag === 'polyline' || tag === 'rect' || tag === 'g'
    ? document.createElementNS('http://www.w3.org/2000/svg', tag.replace(/^svg:/, ''))
    : document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function debounce(fn, ms) {
  let id = null;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
}

/** localStorage that never throws (private mode, blocked storage…). */
export const storage = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  getJSON(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  setJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};

// ---------------------------------------------------------------------------
// Icons (inline SVG, stroke = currentColor)
// ---------------------------------------------------------------------------

const ICONS = {
  play: '<path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>',
  loop: '<path d="M17 2l4 4-4 4"/><path d="M3 12V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 12v3a3 3 0 0 1-3 3H3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>',
  share: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  present: '<rect x="2" y="4" width="20" height="13" rx="1"/><path d="M8 21h8M12 17v4"/>',
  exit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  target: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  step: '<path d="M6 5v14l9-7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
  back: '<path d="M18 5v14l-9-7z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M15 4v16"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  return span.firstChild;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastEl = null;
let toastTimer = null;
export function toast(message, { kind = 'info', ms = 2600 } = {}) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  toastEl.className = `toast${kind === 'success' ? ' toast--success' : ''}`;
  toastEl.textContent = message;
  toastEl.dataset.show = 'true';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.dataset.show = 'false'; }, ms);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
