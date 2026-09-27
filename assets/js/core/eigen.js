// Eigenvalues and eigenvectors of 2×2 and 3×3 matrices.
//
// For rational input the computation is exact whenever the characteristic
// polynomial splits into factors of degree ≤ 2 over ℚ: eigenvalues are then
// rationals or quadratic surds a ± b√m (m < 0 gives complex conjugates), and
// eigenvectors are computed exactly over ℚ or ℚ(√m). Otherwise (irrational
// entries, or an irreducible cubic) a numerical method is used.

import { Rational, Q, sqrtRational, bigGcd } from './rational.js';
import { RationalField, SurdField, FloatField, ComplexField, Surd } from './fields.js';
import { det, trace, nullspace, identity, matSub, matScale } from './linalg.js';

/** Coefficients [1, c_{n-1}, …, c_0] of det(λI − A) for n = 2, 3 (any field). */
export function charPoly(A, F) {
  const n = A.length;
  const tr = trace(A, F);
  if (n === 2) return [F.one, F.neg(tr), det(A, F)];
  if (n === 3) {
    const minor = (i, j) => F.sub(F.mul(A[i][i], A[j][j]), F.mul(A[i][j], A[j][i]));
    const m2 = F.add(F.add(minor(0, 1), minor(0, 2)), minor(1, 2));
    return [F.one, F.neg(tr), m2, F.neg(det(A, F))];
  }
  throw new RangeError('charPoly: only n = 2, 3');
}

function evalPoly(coefs, x, F) {
  return coefs.reduce((acc, c) => F.add(F.mul(acc, x), c), F.zero);
}

// ---------------------------------------------------------------------------
// Exact roots
// ---------------------------------------------------------------------------

/** Exact roots of the monic quadratic λ² + pλ + q (rational p, q). */
function quadraticRootsExact(p, q) {
  const half = p.div(Rational.of(2)).neg(); // −p/2
  const D = p.mul(p).div(Rational.of(4)).sub(q); // p²/4 − q
  if (D.isZero()) return [{ value: half, field: RationalField, mult: 2 }];
  const s = sqrtRational(D.abs());
  if (!s) return null;
  if (D.sign() > 0 && s.m === 1n) {
    return [
      { value: half.add(s.coef), field: RationalField, mult: 1 },
      { value: half.sub(s.coef), field: RationalField, mult: 1 },
    ];
  }
  const m = D.sign() > 0 ? s.m : -s.m;
  const F = SurdField(m);
  return [
    { value: F.make(half, s.coef), field: F, mult: 1 },
    { value: F.make(half, s.coef.neg()), field: F, mult: 1 },
  ];
}

function divisors(n) {
  n = n < 0n ? -n : n;
  if (n === 0n) return [];
  if (n > 10n ** 10n) return null;
  const out = [];
  for (let d = 1n; d * d <= n; d++) {
    if (n % d === 0n) { out.push(d); if (d * d !== n) out.push(n / d); }
  }
  return out;
}

/** A rational root of a monic cubic with rational coefficients, or null (none / too big). */
function rationalRootOfCubic(c) {
  // Clear denominators.
  let L = 1n;
  for (const r of c) L = (L * r.d) / (bigGcd(L, r.d) || 1n);
  const ints = c.map((r) => (r.n * L) / r.d); // a3 λ³ + a2 λ² + a1 λ + a0
  const a3 = ints[0], a0 = ints[3];
  if (a0 === 0n) return Q.ZERO;
  const P = divisors(a0), D = divisors(a3);
  if (!P || !D) return undefined; // too large to search
  for (const p of P) {
    for (const d of D) {
      for (const s of [1n, -1n]) {
        const x = new Rational(s * p, d);
        if (evalPoly(c, x, RationalField).isZero()) return x;
      }
    }
  }
  return null;
}

function exactRoots(A) {
  const n = A.length;
  const c = charPoly(A, RationalField);
  if (n === 2) return { poly: c, roots: quadraticRootsExact(c[1], c[2]) };
  const r = rationalRootOfCubic(c);
  if (!r) return { poly: c, roots: null };
  // Synthetic division by (λ − r): λ³ + c1 λ² + c2 λ + c3 = (λ − r)(λ² + p λ + q)
  const p = c[1].add(r);
  const q = c[2].add(r.mul(p));
  const quad = quadraticRootsExact(p, q);
  if (!quad) return { poly: c, roots: null };
  // Merge r with equal roots of the quadratic.
  const roots = quad.map((x) => ({ ...x }));
  const same = roots.find((x) => x.field === RationalField && x.value.equals(r));
  if (same) same.mult += 1;
  else roots.unshift({ value: r, field: RationalField, mult: 1 });
  return { poly: c, roots };
}

function liftMatrix(A, F) {
  if (F === RationalField) return A;
  return A.map((row) => row.map((a) => F.fromRational(a)));
}

function eigenExact(A) {
  const { poly, roots } = exactRoots(A);
  if (!roots) return { poly, eigen: null };
  const n = A.length;
  const eigen = roots.map(({ value, field: F, mult }) => {
    const M = liftMatrix(A, F);
    const shifted = matSub(M, matScale(identity(n, F), value, F), F);
    const vectors = nullspace(shifted, F);
    return { value, field: F, alg: mult, geo: vectors.length, vectors };
  });
  return { poly, eigen };
}

// ---------------------------------------------------------------------------
// Numerical roots
// ---------------------------------------------------------------------------

function quadraticRootsFloat(p, q) {
  // λ² + pλ + q
  const D = (p * p) / 4 - q;
  const h = -p / 2;
  if (D >= 0) {
    const s = Math.sqrt(D);
    // Stable variant: compute the larger-magnitude root first.
    const r1 = h + (h >= 0 ? s : -s);
    const r2 = Math.abs(r1) > 1e-300 ? q / r1 : h - (h >= 0 ? s : -s);
    return [{ re: r1, im: 0 }, { re: r2, im: 0 }];
  }
  const s = Math.sqrt(-D);
  return [{ re: h, im: s }, { re: h, im: -s }];
}

function realRootOfCubic(b, c, d) {
  // λ³ + bλ² + cλ + d, returns one real root (polished by Newton).
  const f = (x) => ((x + b) * x + c) * x + d;
  const df = (x) => (3 * x + 2 * b) * x + c;
  const p = c - (b * b) / 3;
  const q = (2 * b * b * b) / 27 - (b * c) / 3 + d;
  const disc = (q * q) / 4 + (p * p * p) / 27;
  let t;
  if (disc > 0) {
    const s = Math.sqrt(disc);
    t = Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s);
  } else if (p < 0) {
    const r = Math.sqrt(-p / 3);
    const arg = Math.max(-1, Math.min(1, (3 * q) / (2 * p * r)));
    t = 2 * r * Math.cos(Math.acos(arg) / 3);
  } else {
    t = Math.cbrt(-q);
  }
  let x = t - b / 3;
  for (let i = 0; i < 30; i++) {
    const d1 = df(x);
    if (Math.abs(d1) < 1e-14) break;
    const step = f(x) / d1;
    x -= step;
    if (Math.abs(step) < 1e-15 * Math.max(1, Math.abs(x))) break;
  }
  return x;
}

function clusterRoots(roots, tol) {
  const out = [];
  for (const r of roots) {
    const hit = out.find((o) => Math.hypot(o.re - r.re, o.im - r.im) <= tol * Math.max(1, Math.hypot(r.re, r.im)));
    if (hit) {
      hit.re = (hit.re * hit.mult + r.re) / (hit.mult + 1);
      hit.im = (hit.im * hit.mult + r.im) / (hit.mult + 1);
      hit.mult++;
    } else out.push({ ...r, mult: 1 });
  }
  // Snap tiny imaginary parts (they come from rounding of real double roots).
  for (const o of out) if (Math.abs(o.im) <= tol * Math.max(1, Math.abs(o.re))) o.im = 0;
  return out;
}

function eigenNumeric(Af) {
  const n = Af.length;
  const F = FloatField(0);
  const c = charPoly(Af, F);
  let roots;
  if (n === 2) roots = quadraticRootsFloat(c[1], c[2]);
  else {
    const r = realRootOfCubic(c[1], c[2], c[3]);
    const p = c[1] + r;
    const q = c[2] + r * p;
    roots = [{ re: r, im: 0 }, ...quadraticRootsFloat(p, q)];
  }
  let scale = 1;
  for (const row of Af) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const clustered = clusterRoots(roots, 1e-7);
  const eigen = clustered.map(({ re, im, mult }) => {
    if (im === 0) {
      const Fr = FloatField(1e-6 * scale);
      const shifted = Af.map((row, i) => row.map((a, j) => a - (i === j ? re : 0)));
      const vectors = nullspace(shifted, Fr).map(normalizeFloat);
      return { value: { re, im: 0 }, field: Fr, alg: mult, geo: Math.max(1, vectors.length), vectors: vectors.length ? vectors : [] };
    }
    const Fc = ComplexField(1e-6 * scale);
    const shifted = Af.map((row, i) => row.map((a, j) => ({ re: a - (i === j ? re : 0), im: i === j ? -im : 0 })));
    const vectors = nullspace(shifted, Fc);
    return { value: { re, im }, field: Fc, alg: mult, geo: Math.max(1, vectors.length), vectors };
  });
  // Order: real eigenvalues by decreasing value, complex ones afterwards with positive imaginary part first.
  eigen.sort((a, b) => (a.value.im === 0) - (b.value.im === 0) || 0);
  return { poly: c, eigen };
}

function normalizeFloat(v) {
  const n = Math.hypot(...v);
  if (n < 1e-15) return v;
  let w = v.map((x) => x / n);
  const first = w.find((x) => Math.abs(x) > 1e-9);
  if (first < 0) w = w.map((x) => -x);
  return w.map((x) => (Math.abs(x) < 1e-13 ? 0 : x));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Eigen-analysis of a 2×2 or 3×3 matrix.
 * @param {object} args
 * @param {Rational[][]|null} args.exact  exact rational matrix, if available
 * @param {number[][]} args.float  floating-point matrix (always given)
 * @returns {{exact: boolean, poly: any[], polyField: object, eigen: Array}}
 *   eigen[k] = { value, field, alg, geo, vectors, real: boolean, approx: {re, im} }
 */
export function eigenAnalysis({ exact, float }) {
  let res = null;
  let isExact = false;
  if (exact) {
    const r = eigenExact(exact);
    if (r.eigen) { res = r; isExact = true; }
  }
  if (!res) res = eigenNumeric(float);
  const eigen = res.eigen.map((e) => {
    const approx = approxValue(e.value);
    return { ...e, approx, real: Math.abs(approx.im) === 0 };
  });
  // Real eigenvalues first (descending), then complex ones (positive imaginary part first).
  eigen.sort((a, b) => {
    if (a.real !== b.real) return a.real ? -1 : 1;
    if (a.real) return b.approx.re - a.approx.re;
    return b.approx.im - a.approx.im;
  });
  return { exact: isExact, poly: res.poly, polyField: isExact ? RationalField : FloatField(0), eigen };
}

export function approxValue(v) {
  if (v instanceof Rational) return { re: v.toNumber(), im: 0 };
  if (v instanceof Surd) return { re: v.re(), im: v.im() };
  return { re: v.re, im: v.im };
}

export function approxVector(vec, F) {
  return vec.map((x) => {
    if (x instanceof Rational) return { re: x.toNumber(), im: 0 };
    if (x instanceof Surd) return { re: x.re(), im: x.im() };
    if (typeof x === 'number') return { re: x, im: 0 };
    return { re: x.re, im: x.im };
  });
}

/** Real eigen-directions (float, unit length) for drawing. */
export function realEigenDirections(analysis) {
  const out = [];
  for (const e of analysis.eigen) {
    if (!e.real) continue;
    const dirs = e.vectors.map((v) => normalizeFloat(approxVector(v).map((z) => z.re)));
    out.push({ lambda: e.approx.re, dirs, alg: e.alg, geo: e.geo });
  }
  return out;
}

/**
 * Real canonical form for a 2×2 matrix with complex eigenvalues a ± bi (b > 0):
 * A = P C P⁻¹ with C = [[a, −b], [b, a]] and P = [Im w, Re w] for an eigenvector w of a + bi.
 */
export function rotationScalingForm(analysis) {
  const e = analysis.eigen.find((x) => !x.real && x.approx.im > 0);
  if (!e || !e.vectors.length) return null;
  const w = approxVector(e.vectors[0]);
  const P = [[w[0].im, w[0].re], [w[1].im, w[1].re]];
  const { re: a, im: b } = e.approx;
  return { a, b, r: Math.hypot(a, b), theta: Math.atan2(b, a), P, C: [[a, -b], [b, a]] };
}
