// Formatting of exact and approximate values as TeX (for KaTeX) or plain text (for canvases).
//
// Policy:
//  • Exact rationals are shown as fractions while they stay readable; otherwise as "≈ decimal".
//  • Quadratic surds a + b√m are shown exactly, e.g. (1 + √5)/2 or 1 ± 2i.
//  • Floats are "recognized" as a small-denominator rational or r·√m only when they
//    match to 1e-9 relative precision; otherwise they are shown as decimals.

import { Rational, bigGcd, sqrtRational } from './rational.js';
import { Surd } from './fields.js';

const MINUS = '−';
const RECOGNIZE_RADICANDS = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17];

export function isReadable(r) {
  const n = r.n < 0n ? -r.n : r.n;
  return n <= 99999n && r.d <= 9999n;
}

/** Decimal string with at most `digits` decimals, trailing zeros removed. */
export function fmtDecimal(x, digits = 3, { unicodeMinus = true } = {}) {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? `${MINUS}∞` : '—';
  const ax = Math.abs(x);
  let s;
  if (ax < 1e-12) return '0';
  if (ax >= 1e7 || ax < 10 ** -digits / 2) {
    s = x.toExponential(1);
  } else {
    s = x.toFixed(digits);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  if (s === '-0') s = '0';
  return unicodeMinus ? s.replaceAll('-', MINUS) : s;
}

/** Tries to express a float as p/q (q ≤ 1000) or (p/q)·√m. */
export function recognize(x, tol = 1e-9) {
  if (!Number.isFinite(x)) return null;
  if (Math.abs(x) < 1e-12) return { q: Rational.of(0) };
  const r = Rational.approximate(x, 1000, tol);
  if (r) return { q: r };
  for (const m of RECOGNIZE_RADICANDS) {
    const c = Rational.approximate(x / Math.sqrt(m), 60, tol);
    if (c && c.d <= 60n) return { q: c, m };
  }
  return null;
}

// ---------------------------------------------------------------------------
// TeX
// ---------------------------------------------------------------------------

export function texRational(r, { frac = '\\frac' } = {}) {
  if (!isReadable(r)) return `\\approx ${fmtDecimal(r.toNumber(), 4, { unicodeMinus: false })}`;
  if (r.d === 1n) return r.n.toString();
  const n = r.n < 0n ? -r.n : r.n;
  return `${r.n < 0n ? '-' : ''}${frac}{${n}}{${r.d}}`;
}

function sqrtTex(m) { return m === 1n ? '' : `\\sqrt{${m}}`; }

/** a + b√m with m square-free (m < 0 → complex, √m = i√|m|). */
export function texSurd(s, { frac = '\\frac' } = {}) {
  const { a, b } = s;
  if (b.isZero()) return texRational(a, { frac });
  const m = s.m;
  const complex = m < 0n;
  const absM = complex ? -m : m;
  const unit = complex ? (absM === 1n ? 'i' : `\\sqrt{${absM}}\\,i`) : sqrtTex(absM);
  // Common denominator: (A + B·unit)/D
  const D = (a.d * b.d) / (bigGcd(a.d, b.d) || 1n);
  const A = (a.n * D) / a.d;
  const B = (b.n * D) / b.d;
  if (!isReadable(a) || !isReadable(b)) {
    return `\\approx ${fmtDecimal(s.re(), 4, { unicodeMinus: false })}${complex ? ` ${s.im() < 0 ? '-' : '+'} ${fmtDecimal(Math.abs(s.im()), 4, { unicodeMinus: false })}i` : ''}`;
  }
  const bAbs = B < 0n ? -B : B;
  const bPart = bAbs === 1n ? unit : `${bAbs}${unit}`;
  let numer;
  if (A === 0n) numer = `${B < 0n ? '-' : ''}${bPart}`;
  else numer = `${A} ${B < 0n ? '-' : '+'} ${bPart}`;
  if (D === 1n) return numer;
  if (A === 0n) {
    const neg = B < 0n;
    return `${neg ? '-' : ''}${frac}{${bPart}}{${D}}`;
  }
  return `${frac}{${numer}}{${D}}`;
}

/** Conjugate pair a ± b√m as a single expression. */
export function texSurdPair(s, { frac = '\\frac' } = {}) {
  const { a, b } = s;
  const m = s.m;
  const complex = m < 0n;
  const absM = complex ? -m : m;
  const unit = complex ? (absM === 1n ? 'i' : `\\sqrt{${absM}}\\,i`) : sqrtTex(absM);
  const bb = b.abs();
  const D = (a.d * bb.d) / (bigGcd(a.d, bb.d) || 1n);
  const A = (a.n * D) / a.d;
  const B = (bb.n * D) / bb.d;
  const bPart = B === 1n ? unit : `${B}${unit}`;
  const numer = A === 0n ? `\\pm ${bPart}` : `${A} \\pm ${bPart}`;
  return D === 1n ? numer : `${frac}{${numer}}{${D}}`;
}

export function texFloat(x, { digits = 3, recog = true } = {}) {
  if (recog) {
    const r = recognize(x);
    if (r) {
      if (!r.m) return texRational(r.q);
      const c = r.q;
      const neg = c.sign() < 0;
      const n = c.n < 0n ? -c.n : c.n;
      const coef = n === 1n ? '' : `${n}`;
      const body = `${coef}\\sqrt{${r.m}}`;
      return `${neg ? '-' : ''}${c.d === 1n ? body : `\\frac{${body}}{${c.d}}`}`;
    }
  }
  return fmtDecimal(x, digits, { unicodeMinus: false });
}

export function texComplexFloat({ re, im }, opts = {}) {
  if (Math.abs(im) < 1e-12) return texFloat(re, opts);
  const imAbs = Math.abs(im);
  const imTex = Math.abs(imAbs - 1) < 1e-12 ? 'i' : `${texFloat(imAbs, opts)}\\,i`;
  if (Math.abs(re) < 1e-12) return `${im < 0 ? '-' : ''}${imTex}`;
  return `${texFloat(re, opts)} ${im < 0 ? '-' : '+'} ${imTex}`;
}

/** Any scalar: Rational, Surd, number or {re, im}. */
export function texValue(v, opts = {}) {
  if (v instanceof Rational) return texRational(v, opts);
  if (v instanceof Surd) return texSurd(v, opts);
  if (typeof v === 'number') return texFloat(v, opts);
  if (v && typeof v.re === 'number') return texComplexFloat(v, opts);
  return String(v);
}

/** Wraps TeX in a colour class (rendered by KaTeX's \htmlClass, styled in CSS). */
export const cls = (name, tex) => `\\htmlClass{${name}}{${tex}}`;

/**
 * Matrix as TeX. `entries` is an array of rows of scalars (or TeX strings when raw = true).
 * colClasses: optional CSS classes per column.
 */
export function texMatrix(entries, { colClasses = null, raw = false, env = 'bmatrix', ...opts } = {}) {
  const rows = entries.map((row) => row.map((v, j) => {
    const tex = raw ? v : texValue(v, opts);
    return colClasses && colClasses[j] ? cls(colClasses[j], tex) : tex;
  }).join(' & '));
  return `\\begin{${env}} ${rows.join(' \\\\ ')} \\end{${env}}`;
}

export function texVector(values, { cls: klass = null, raw = false, ...opts } = {}) {
  const tex = texMatrix(values.map((v) => [v]), { raw, ...opts });
  return klass ? cls(klass, tex) : tex;
}

/** Augmented matrix [A | b] with a vertical bar. */

/** Monic-leading polynomial with coefficients [c_n, …, c_0] in variable `x`. */
export function texPoly(coefs, x = '\\lambda', opts = {}) {
  const deg = coefs.length - 1;
  const parts = [];
  coefs.forEach((c, k) => {
    const p = deg - k;
    const num = scalarNumber(c);
    if (Math.abs(num) < 1e-14 && isExactZero(c)) return;
    let tex = texValue(c, opts);
    let neg = tex.startsWith('-');
    if (neg) tex = tex.slice(1);
    const isOne = tex === '1';
    const needParens = /[+-]/.test(tex.replace(/^\\approx\s*/, '')) || tex.startsWith('\\approx');
    const coef = p > 0 && isOne ? '' : needParens && p > 0 ? `(${tex})` : tex;
    const power = p === 0 ? '' : p === 1 ? x : `${x}^{${p}}`;
    parts.push({ neg, body: `${coef}${power}` || '1' });
  });
  if (!parts.length) return '0';
  return parts.map((t, i) => (i === 0 ? `${t.neg ? '-' : ''}${t.body}` : `${t.neg ? '-' : '+'} ${t.body}`)).join(' ');
}

function isExactZero(c) {
  if (c instanceof Rational) return c.isZero();
  if (c instanceof Surd) return c.isZero();
  if (typeof c === 'number') return Math.abs(c) < 1e-12;
  return Math.hypot(c.re, c.im) < 1e-12;
}

export function scalarNumber(v) {
  if (v instanceof Rational) return v.toNumber();
  if (v instanceof Surd) return v.re();
  if (typeof v === 'number') return v;
  return v.re;
}

// ---------------------------------------------------------------------------
// Plain text (canvas labels, inputs)
// ---------------------------------------------------------------------------

export function plainValue(v, digits = 2) {
  if (v instanceof Rational) {
    if (v.d === 1n) return v.n.toString().replace('-', MINUS);
    if (isReadable(v) && v.d <= 99n) return v.toString().replace('-', MINUS);
    return fmtDecimal(v.toNumber(), digits);
  }
  if (typeof v === 'number') {
    const r = recognize(v);
    if (r && !r.m && r.q.d <= 12n) return plainValue(r.q, digits);
    return fmtDecimal(v, digits);
  }
  if (v instanceof Surd) return fmtDecimal(v.re(), digits);
  return fmtDecimal(v.re, digits);
}


/** (q)·√m as TeX, for a rational q and a square-free positive integer m (BigInt). */
export function texRationalSqrt(q, m) {
  if (q.isZero()) return '0';
  if (m === 1n) return texRational(q);
  const neg = q.sign() < 0;
  const n = neg ? -q.n : q.n;
  const num = n === 1n ? `\\sqrt{${m}}` : `${n}\\sqrt{${m}}`;
  const body = q.d === 1n ? num : `\\frac{${num}}{${q.d}}`;
  return `${neg ? '-' : ''}${body}`;
}

/** √r for a non-negative rational r, simplified (e.g. √8 = 2√2, √(1/2) = √2/2). */
export function texSqrt(r) {
  const s = sqrtRational(r);
  if (!s) return `\\sqrt{${texRational(r)}}`;
  return texRationalSqrt(s.coef, s.m);
}
