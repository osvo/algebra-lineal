// Reactive state with URL synchronisation, so every configuration can be shared as a link.

import { makeEntry, numberToInput } from '../core/parse.js';

/**
 * schema: { key: { def, codec, url = true } }
 * codec: { parse(string) → value | undefined, format(value) → string }
 */
export function createStore(schema, { urlSync = true } = {}) {
  const keys = Object.keys(schema);
  const defaults = {};
  for (const k of keys) defaults[k] = cloneValue(schema[k].def);

  const state = { ...defaults };
  if (urlSync) {
    const params = new URLSearchParams(location.search);
    for (const k of keys) {
      if (schema[k].url === false || !params.has(k)) continue;
      const v = schema[k].codec.parse(params.get(k));
      if (v !== undefined) state[k] = v;
    }
  }

  const subs = new Set();
  let pending = null;
  let batchDepth = 0;
  let batchedChanges = new Set();

  function notify(changed) {
    for (const fn of subs) fn(state, changed);
    if (urlSync) scheduleUrl();
  }

  function scheduleUrl() {
    clearTimeout(pending);
    pending = setTimeout(writeUrl, 250);
  }

  function writeUrl() {
    const url = new URL(location.href);
    for (const k of keys) {
      const s = schema[k];
      if (s.url === false) continue;
      const cur = s.codec.format(state[k]);
      const def = s.codec.format(defaults[k]);
      if (cur === def) url.searchParams.delete(k);
      else url.searchParams.set(k, cur);
    }
    history.replaceState(history.state, '', url);
  }

  const store = {
    state,
    get: (k) => state[k],
    set(patch) {
      const changed = new Set();
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in schema)) continue;
        if (state[k] === v) continue;
        state[k] = v;
        changed.add(k);
      }
      if (!changed.size) return;
      if (batchDepth > 0) { changed.forEach((k) => batchedChanges.add(k)); return; }
      notify(changed);
    },
    /** Groups several set() calls into a single notification. */
    batch(fn) {
      batchDepth++;
      try { fn(); } finally {
        batchDepth--;
        if (batchDepth === 0 && batchedChanges.size) {
          const changed = batchedChanges;
          batchedChanges = new Set();
          notify(changed);
        }
      }
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    reset(except = []) {
      const patch = {};
      for (const k of keys) if (!except.includes(k)) patch[k] = cloneValue(defaults[k]);
      store.set(patch);
    },
    defaults,
    /** A stable string of the whole state (used to detect changes). */
    snapshot() { return keys.map((k) => `${k}=${schema[k].codec.format(state[k])}`).join('&'); },
    flushUrl: () => { if (urlSync) { clearTimeout(pending); writeUrl(); } },
    shareUrl() {
      writeUrl();
      return location.href;
    },
  };
  return store;
}

function cloneValue(v) {
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v && typeof v === 'object' && !(v.constructor && v.constructor.name === 'Rational')) return { ...v };
  return v;
}

// ---------------------------------------------------------------------------
// Codecs
// ---------------------------------------------------------------------------

export const codec = {
  num: (min = -Infinity, max = Infinity) => ({
    parse: (s) => { const x = parseFloat(s); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : undefined; },
    format: (x) => String(Math.round(x * 1e4) / 1e4),
  }),
  int: (min = -Infinity, max = Infinity) => ({
    parse: (s) => { const x = parseInt(s, 10); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : undefined; },
    format: (x) => String(x),
  }),
  bool: () => ({ parse: (s) => s === '1' || s === 'true', format: (b) => (b ? '1' : '0') }),
  enum: (values) => ({ parse: (s) => (values.includes(s) ? s : undefined), format: (s) => s }),
  str: (max = 200) => ({ parse: (s) => s.slice(0, max), format: (s) => s }),
  /** Set of flags, e.g. "det.eig.ker". */
  flags: (allowed) => ({
    parse: (s) => (s === '-' ? [] : s.split('.').filter((f) => allowed.includes(f))),
    format: (arr) => (arr.length ? [...arr].sort().join('.') : '-'),
  }),
  /** Matrix of entries {text, x, q}. Rows separated by ";" and entries by ",". */
  matrix: (rows, cols) => ({
    parse(s) {
      const r = s.split(';').map((row) => row.split(','));
      if (rows && r.length !== rows) return undefined;
      if (cols && r.some((row) => row.length !== cols)) return undefined;
      const m = r.map((row) => row.map((t) => makeEntry(t)));
      return m.every((row) => row.every((e) => e.ok)) ? m : undefined;
    },
    format: (m) => m.map((row) => row.map((e) => e.text.replace(/,/g, '.').replace(/\s+/g, '')).join(',')).join(';'),
  }),
  /** Variable-size matrix (dimension encoded by the shape). */
  anyMatrix: () => codec.matrix(null, null),
  vector: (n) => ({
    parse(s) {
      const parts = s.split(',');
      if (n && parts.length !== n) return undefined;
      const v = parts.map((t) => makeEntry(t));
      return v.every((e) => e.ok) ? v : undefined;
    },
    format: (v) => v.map((e) => e.text.replace(/,/g, '.').replace(/\s+/g, '')).join(','),
  }),
  /** A single 2D point "x:y". */
  point: () => ({
    parse(s) {
      const p = s.split(':').map(Number);
      return p.length === 2 && p.every(Number.isFinite) ? p : undefined;
    },
    format: (p) => p.map((x) => numberToInput(x)).join(':'),
  }),
  /** List of 2D points "x:y|x:y". */
  points: () => ({
    parse(s) {
      const pts = s.split('|').map((p) => p.split(':').map(Number));
      return pts.every((p) => p.length === 2 && p.every(Number.isFinite)) ? pts : undefined;
    },
    format: (pts) => pts.map((p) => p.map((x) => numberToInput(x)).join(':')).join('|'),
  }),
};

// ---------------------------------------------------------------------------
// Entry helpers
// ---------------------------------------------------------------------------

export const M = (rows) => rows.map((row) => row.map((t) => makeEntry(String(t))));
export const V = (vals) => vals.map((t) => makeEntry(String(t)));
export const floats = (m) => m.map((row) => row.map((e) => e.x));
export const floatsV = (v) => v.map((e) => e.x);
