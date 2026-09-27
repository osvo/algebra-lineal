// Helpers shared by several modules: exact analysis of square matrices and TeX snippets.

import { RationalField } from '../core/fields.js';
import * as L from '../core/linalg.js';
import { eigenAnalysis } from '../core/eigen.js';
import { texValue, texMatrix, texVector, texPoly, texSurdPair, cls } from '../core/format.js';
import { Surd } from '../core/fields.js';
import { tr, getLang } from '../ui/i18n.js';
import { makeEntry } from '../core/parse.js';
import { selectBox } from '../ui/controls.js';

export const COLS = ['c-i', 'c-j', 'c-k'];
export const COL_VARS = ['var(--c-i)', 'var(--c-j)', 'var(--c-k)'];

export const spanOp = () => (getLang() === 'es' ? '\\operatorname{gen}' : '\\operatorname{span}');
export const rankOp = () => (getLang() === 'es' ? '\\operatorname{rango}' : '\\operatorname{rank}');
export const nullityOp = () => (getLang() === 'es' ? '\\operatorname{nulidad}' : '\\operatorname{nullity}');

/** Full analysis of a square matrix of entries (2×2 or 3×3). Results are exact when possible. */
export function analyzeSquare(entries) {
  const n = entries.length;
  const { F, M } = L.fieldMatrix(entries);
  const Af = entries.map((row) => row.map((e) => e.x));
  const det = L.det(M, F);
  const { R, pivots, rank } = L.rref(M, F);
  const ker = L.nullspace(M, F);
  const img = L.columnSpace(M, F);
  const inv = rank === n ? L.inverse(M, F) : null;
  const eig = eigenAnalysis({ exact: F === RationalField ? M : null, float: Af });
  const tr_ = L.trace(M, F);
  return { n, F, M, Af, det, rank, nullity: n - rank, ker, img, inv, eig, trace: tr_, R, pivots, exact: F === RationalField };
}

export const texVec = (v, opts = {}) => texVector(v, opts);

/** gen{v₁, …} with column vectors; {0} for the zero space; ℝⁿ for the whole space. */
export function texSpan(basis, n, { klass = null } = {}) {
  if (!basis.length) return `\\{\\mathbf{0}\\}`;
  if (basis.length === n) return `\\mathbb{R}^{${n}}`;
  const vecs = basis.map((v) => texVector(v)).join(',\\;');
  const inner = `${spanOp()}\\left\\{${vecs}\\right\\}`;
  return klass ? cls(klass, inner) : inner;
}

export function texDetNote(det, F, n = 2) {
  const x = F.toNumber(det);
  const what = n === 2 ? { es: 'las áreas', en: 'areas' } : { es: 'los volúmenes', en: 'volumes' };
  if (F.isZero(det)) {
    return n === 2
      ? { es: 'det = 0: el plano se aplasta en una recta o un punto; no hay inversa.', en: 'det = 0: the plane is squashed onto a line or a point; there is no inverse.' }
      : { es: 'det = 0: el espacio se aplasta en un plano, una recta o un punto; no hay inversa.', en: 'det = 0: space is squashed onto a plane, a line or a point; there is no inverse.' };
  }
  const k = Math.abs(x);
  const factor = Number.isInteger(k) ? String(k) : k.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  if (x < 0) return {
    es: `Multiplica ${what.es} por |det| = ${factor} e invierte la orientación.`,
    en: `Multiplies ${what.en} by |det| = ${factor} and reverses orientation.`,
  };
  return {
    es: `Multiplica ${what.es} por ${factor} y conserva la orientación.`,
    en: `Multiplies ${what.en} by ${factor} and preserves orientation.`,
  };
}

/** TeX lines describing eigenvalues (with multiplicities) and eigenvectors. */
export function eigenTex(eig) {
  const lines = [];
  const complexPair = eig.eigen.filter((e) => !e.real);
  const reals = eig.eigen.filter((e) => e.real);
  let k = 1;
  const valueLines = [];
  for (const e of reals) {
    const mult = e.alg > 1 ? `\\;(\\times ${e.alg})` : '';
    valueLines.push(`\\lambda_{${k}} = ${texValue(e.value)}${mult}`);
    k += e.alg;
  }
  if (complexPair.length) {
    const e = complexPair[0];
    if (e.value instanceof Surd) valueLines.push(`\\lambda = ${texSurdPair(e.value)}`);
    else valueLines.push(`\\lambda = ${texValue({ re: e.approx.re, im: 0 })} \\pm ${texValue(Math.abs(e.approx.im))}\\,i`);
  }
  lines.push(valueLines.join(',\\quad '));
  return { values: valueLines.join(',\\quad '), reals, complex: complexPair };
}

export function eigenvectorTex(eig, { max = 3 } = {}) {
  const parts = [];
  let k = 1;
  for (const e of eig.eigen.filter((x) => x.real)) {
    const vs = e.vectors.slice(0, max).map((v) => texVector(v)).join(',\\;');
    const label = e.alg > 1 ? `E_{${texValue(e.value)}}` : `\\mathbf{v}_{${k}}`;
    parts.push(e.vectors.length > 1 || e.alg > 1
      ? `${label} = ${spanOp()}\\left\\{${vs}\\right\\}`
      : `${label} = ${vs}`);
    k += e.alg;
  }
  return parts.join(',\\quad ');
}

export function defectiveNote(eig) {
  const d = eig.eigen.find((e) => e.real && e.geo < e.alg);
  if (!d) return null;
  return {
    es: `λ = ${plainNum(d.approx.re)} tiene multiplicidad algebraica ${d.alg} pero solo ${d.geo} dirección${d.geo > 1 ? 'es' : ''} propia${d.geo > 1 ? 's' : ''} independiente${d.geo > 1 ? 's' : ''}: la matriz no es diagonalizable.`,
    en: `λ = ${plainNum(d.approx.re)} has algebraic multiplicity ${d.alg} but only ${d.geo} independent eigen-direction${d.geo > 1 ? 's' : ''}: the matrix is not diagonalizable.`,
  };
}

const plainNum = (x) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(3).replace(/0+$/, ''));

export function charPolyTex(eig) {
  return `p(\\lambda) = \\det(\\lambda I - A) = ${texPoly(eig.poly)}`;
}

export function matrixTex(M, { colClasses = COLS } = {}) {
  return texMatrix(M, { colClasses });
}

/** Preset selector: presets = [{ id, label, value: [[text]] }] (grouped with `group`). */
export function presetSelect({ store, key, presets, groups = null, onPick = null }) {
  const placeholder = { value: '', label: { es: 'Ejemplos…', en: 'Examples…' } };
  const opts = { get: () => '', set: (id) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    if (onPick) onPick(p);
    else store.set({ [key]: p.value.map((row) => row.map((t) => makeEntry(String(t)))) });
    sel.el.value = '';
  } };
  let sel;
  if (groups) {
    sel = selectBox({ ...opts, groups: [{ label: { es: 'Elige', en: 'Pick' }, options: [placeholder] }, ...groups.map((g) => ({ label: g.label, options: presets.filter((p) => p.group === g.id).map((p) => ({ value: p.id, label: p.label })) }))], label: { es: 'Ejemplos', en: 'Examples' } });
  } else {
    sel = selectBox({ ...opts, options: [placeholder, ...presets.map((p) => ({ value: p.id, label: p.label }))], label: { es: 'Ejemplos', en: 'Examples' } });
  }
  return sel;
}

/** Keeps expensive analyses cached by a key string. */
export function memo(fn) {
  let lastKey = null, lastVal = null;
  return (key, ...args) => {
    if (key === lastKey) return lastVal;
    lastKey = key;
    lastVal = fn(...args);
    return lastVal;
  };
}

export const entriesKey = (m) => m.map((row) => row.map((e) => e.text).join(',')).join(';');

export const hint = (obj) => ({ html: tr(obj) });
