// Jordan decomposition A = P J P⁻¹ of 2×2 and 3×3 real matrices.
//
// Exact over ℚ or ℚ(√m) whenever the eigenvalues are. A repeated eigenvalue of a
// rational 2×2 or 3×3 matrix is always rational (it is a root of gcd(p, p′), which
// has rational coefficients), so every non-trivial Jordan block of a rational matrix
// is exact. With a complex pair a ± bi the real Jordan form is used, with the
// rotation-scaling block [[a, −b], [b, a]] (floating point).

import { RationalField, SurdField, FloatField } from './fields.js';
import { Rational } from './rational.js';
import * as L from './linalg.js';
import { eigenAnalysis, approxVector } from './eigen.js';

const col = (M, j) => M.map((row) => row[j]);
const fromCols = (cols) => cols[0].map((_, i) => cols.map((c) => c[i]));

function lift(x, G) {
  if (G === RationalField || G.exact === false) return x;
  return x instanceof Rational ? G.fromRational(x) : x;
}

/** Chains of generalized eigenvectors for one eigenvalue: columns and block sizes. */
function chainsFor(A, lambda, alg, geo, eigvecs, G) {
  const n = A.length;
  const N = L.matSub(A, L.matScale(L.identity(n, G), lambda, G), G);
  if (geo === alg) return { cols: eigvecs, sizes: eigvecs.map(() => 1) };
  const isZero = (v) => v.every((x) => G.isZero(x));
  const indep = (vs) => L.rank(fromCols(vs), G) === vs.length;
  if (alg === 3 && geo === 1) {
    const N2 = L.matMul(N, N, G);
    const basis = L.identity(n, G).map((_, j) => col(L.identity(n, G), j));
    const w = basis.find((v) => !isZero(L.matVec(N2, v, G)));
    if (!w) return null;
    return { cols: [L.matVec(N2, w, G), L.matVec(N, w, G), w], sizes: [3] };
  }
  // Blocks 2 (alg 2, geo 1) or 2 + 1 (alg 3, geo 2).
  const N2 = L.matMul(N, N, G);
  const ker2 = L.nullspace(N2, G, { primitive: true });
  const w = ker2.find((v) => !isZero(L.matVec(N, v, G)));
  if (!w) return null;
  const top = L.matVec(N, w, G);
  if (alg === 2) return { cols: [top, w], sizes: [2] };
  const extra = eigvecs.find((v) => indep([top, v]));
  if (!extra) return null;
  return { cols: [top, w, extra], sizes: [2, 1] };
}

function blockMatrix(values, sizes, G) {
  const n = sizes.reduce((s, k) => s + k, 0);
  const J = Array.from({ length: n }, () => Array(n).fill(G.zero));
  let k = 0;
  sizes.forEach((s, b) => {
    for (let i = 0; i < s; i++) {
      J[k + i][k + i] = values[b];
      if (i < s - 1) J[k + i][k + i + 1] = G.one;
    }
    k += s;
  });
  return J;
}

/**
 * @param {{exact: Rational[][]|null, float: number[][]}} A
 * @returns {null | {
 *   kind: 'diag' | 'jordan' | 'complex', exact: boolean, F, P, J, Pinv,
 *   blocks: Array<{ lambda, size }>
 * }}
 */
export function jordanForm({ exact, float }) {
  const n = float.length;
  const eig = eigenAnalysis({ exact, float });
  const complex = eig.eigen.filter((e) => !e.real);

  if (complex.length) {
    // Real Jordan form: [real eigenvector | Im w, Re w] with w an eigenvector of a + bi.
    const e = complex.find((x) => x.approx.im > 0) || complex[0];
    if (!e.vectors.length) return null;
    const w = approxVector(e.vectors[0]);
    const { re: a, im: b } = e.approx;
    const F = FloatField(1e-9);
    const cols = [], values = [], sizes = [];
    for (const r of eig.eigen.filter((x) => x.real)) {
      cols.push(approxVector(r.vectors[0]).map((z) => z.re));
      values.push(r.approx.re); sizes.push(1);
    }
    const bImag = Math.abs(b);
    cols.push(w.map((z) => z.im), w.map((z) => z.re));
    const J = Array.from({ length: n }, () => Array(n).fill(0));
    values.forEach((v, i) => { J[i][i] = v; });
    const k = values.length;
    J[k][k] = a; J[k][k + 1] = -bImag; J[k + 1][k] = bImag; J[k + 1][k + 1] = a;
    const P = fromCols(cols);
    const Pinv = L.inverse(P, F);
    return { kind: 'complex', exact: false, F, P, J, Pinv, blocks: [...values.map((v) => ({ lambda: v, size: 1 })), { lambda: { re: a, im: bImag }, size: 2 }] };
  }

  // Real eigenvalues: work in ℚ, in ℚ(√m) or in floating point.
  let G = RationalField;
  if (!eig.exact) {
    let scale = 1;
    for (const row of float) for (const v of row) scale = Math.max(scale, Math.abs(v));
    G = FloatField(1e-7 * scale);
  } else {
    const surd = eig.eigen.find((e) => e.field !== RationalField);
    if (surd) G = surd.field;
  }
  const A = eig.exact ? exact.map((row) => row.map((x) => lift(x, G))) : float;
  const cols = [], values = [], sizes = [], blocks = [];
  for (const e of eig.eigen) {
    const lambda = eig.exact ? lift(e.value, G) : e.approx.re;
    const vecs = e.vectors.map((v) => v.map((x) => (eig.exact ? lift(x, G) : (typeof x === 'number' ? x : x.re))));
    const ch = chainsFor(A, lambda, e.alg, e.geo, vecs, G);
    if (!ch) return null;
    cols.push(...ch.cols);
    for (const s of ch.sizes) { values.push(lambda); sizes.push(s); blocks.push({ lambda, size: s }); }
  }
  if (cols.length !== n) return null;
  const P = fromCols(cols);
  const Pinv = L.inverse(P, G);
  if (!Pinv) return null;
  const J = blockMatrix(values, sizes, G);
  // Sanity check: A P = P J.
  const lhs = L.matMul(A, P, G), rhs = L.matMul(P, J, G);
  if (!lhs.every((row, i) => row.every((x, j) => G.isZero(G.sub(x, rhs[i][j]))))) return null;
  return { kind: sizes.every((s) => s === 1) ? 'diag' : 'jordan', exact: G.exact, F: G, P, J, Pinv, blocks };
}

export { SurdField };
