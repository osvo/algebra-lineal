// Polynomial spaces 𝒫ₙ over a field: bases, operators and products.
// Polynomials are arrays of ascending coefficients [a₀, a₁, …, aₙ].

import { transpose } from './linalg.js';

export const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); };

/** Product of polynomials over the field F. */
export function polyMul(p, q, F) {
  const out = Array(p.length + q.length - 1).fill(F.zero);
  p.forEach((a, i) => q.forEach((b, j) => { out[i + j] = F.add(out[i + j], F.mul(a, b)); }));
  return out;
}
const pad = (p, n, F) => [...p, ...Array(Math.max(0, n - p.length)).fill(F.zero)].slice(0, n);

/**
 * Basis of 𝒫ₙ: 'mono' (1, x, …), 'taylor' ((x − c)ᵏ), 'lagrange' (on the nodes) or
 * 'legendre' (n ≤ 3). Each polynomial has length n + 1. null when the nodes repeat.
 */
export function basisPolys(kind, n, F, { c = F.zero, nodes = [] } = {}) {
  const N = n + 1;
  const fi = (k) => F.fromInt(k);
  if (kind === 'mono') return Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? F.one : F.zero)));
  if (kind === 'taylor') {
    return Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => {
      if (j > i) return F.zero;
      let pw = F.one;
      for (let t = 0; t < i - j; t++) pw = F.mul(pw, F.neg(c));
      return F.mul(fi(binom(i, j)), pw);
    }));
  }
  if (kind === 'legendre') {
    const half = F.div(F.one, fi(2));
    const P = [
      [F.one], [F.zero, F.one],
      [F.neg(half), F.zero, F.mul(fi(3), half)],
      [F.zero, F.neg(F.mul(fi(3), half)), F.zero, F.mul(fi(5), half)],
    ];
    return P.slice(0, N).map((p) => pad(p, N, F));
  }
  const xs = nodes.slice(0, N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (F.isZero(F.sub(xs[i], xs[j]))) return null;
  return xs.map((xi, i) => {
    let p = [F.one];
    xs.forEach((xj, j) => {
      if (j === i) return;
      const d = F.sub(xi, xj);
      p = polyMul(p, [F.div(F.neg(xj), d), F.div(F.one, d)], F);
    });
    return pad(p, N, F);
  });
}

/** Change-of-basis matrix P_{E←B}: its columns are the basis polynomials in monomial coordinates. */
export const basisMatrix = (B) => transpose(B);

/** Matrix in the monomial basis of D (derivative), S (p ↦ p(x + 1)) or xD (p ↦ x p′) on 𝒫ₙ. */
export function operatorMatrix(op, n, F) {
  const N = n + 1;
  const T = Array.from({ length: N }, () => Array(N).fill(F.zero));
  for (let j = 0; j < N; j++) {
    if (op === 'D' && j > 0) T[j - 1][j] = F.fromInt(j);
    if (op === 'xD') T[j][j] = F.fromInt(j);
    if (op === 'S') for (let i = 0; i <= j; i++) T[i][j] = F.fromInt(binom(j, i));
  }
  return T;
}

/** Vandermonde matrix Vᵢⱼ = xᵢʲ (n + 1 nodes). */
export function vandermonde(nodes, F) {
  return nodes.map((x) => { const row = [F.one]; for (let j = 1; j < nodes.length; j++) row.push(F.mul(row[j - 1], x)); return row; });
}

/** Float evaluation of an ascending-coefficient polynomial (Horner). */
export const evalAsc = (asc, x) => asc.reduceRight((s, a) => s * x + a, 0);
