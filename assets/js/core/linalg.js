// Generic linear algebra over a field (see fields.js). Matrices are arrays of rows.

import { RationalField, floatFieldFor } from './fields.js';
import { Rational, bigGcd } from './rational.js';

export const clone = (M) => M.map((row) => row.slice());
export const shape = (M) => [M.length, M.length ? M[0].length : 0];

export function identity(n, F) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? F.one : F.zero)));
}

export function zeros(m, n, F) {
  return Array.from({ length: m }, () => Array.from({ length: n }, () => F.zero));
}

export function transpose(M) {
  const [m, n] = shape(M);
  return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => M[i][j]));
}

export function matMul(A, B, F) {
  const [m, k] = shape(A);
  const n = B[0].length;
  const C = zeros(m, n, F);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = F.zero;
      for (let r = 0; r < k; r++) s = F.add(s, F.mul(A[i][r], B[r][j]));
      C[i][j] = s;
    }
  }
  return C;
}

export function matVec(A, v, F) {
  return A.map((row) => row.reduce((s, a, j) => F.add(s, F.mul(a, v[j])), F.zero));
}

export function matAdd(A, B, F) { return A.map((row, i) => row.map((a, j) => F.add(a, B[i][j]))); }
export function matSub(A, B, F) { return A.map((row, i) => row.map((a, j) => F.sub(a, B[i][j]))); }
export function matScale(A, c, F) { return A.map((row) => row.map((a) => F.mul(c, a))); }
export function matEq(A, B, F) { return A.every((row, i) => row.every((a, j) => F.eq(a, B[i][j]))); }
export function isZeroMatrix(A, F) { return A.every((row) => row.every((a) => F.isZero(a))); }

export function dot(u, v, F) { return u.reduce((s, a, i) => F.add(s, F.mul(a, v[i])), F.zero); }

export function det(M, F) {
  const n = M.length;
  if (n === 0) return F.one;
  if (n === 1) return M[0][0];
  if (n === 2) return F.sub(F.mul(M[0][0], M[1][1]), F.mul(M[0][1], M[1][0]));
  if (n === 3) {
    const [[a, b, c], [d, e, f], [g, h, i]] = M;
    const t1 = F.mul(a, F.sub(F.mul(e, i), F.mul(f, h)));
    const t2 = F.mul(b, F.sub(F.mul(d, i), F.mul(f, g)));
    const t3 = F.mul(c, F.sub(F.mul(d, h), F.mul(e, g)));
    return F.add(F.sub(t1, t2), t3);
  }
  // Elimination for larger matrices.
  const A = clone(M);
  let result = F.one;
  for (let col = 0; col < n; col++) {
    let p = -1, best = -Infinity;
    for (let r = col; r < n; r++) { const s = F.pivotScore(A[r][col]); if (s > best) { best = s; p = r; } }
    if (p < 0 || best === -Infinity) return F.zero;
    if (p !== col) { [A[p], A[col]] = [A[col], A[p]]; result = F.neg(result); }
    result = F.mul(result, A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const f = F.div(A[r][col], A[col][col]);
      for (let c = col; c < n; c++) A[r][c] = F.sub(A[r][c], F.mul(f, A[col][c]));
    }
  }
  return result;
}

export function trace(M, F) { return M.reduce((s, row, i) => F.add(s, row[i]), F.zero); }

// ---------------------------------------------------------------------------
// Elementary row operations
// ---------------------------------------------------------------------------
// op = { type: 'swap', i, j } | { type: 'scale', i, c } | { type: 'add', i, j, c }  (Rᵢ ← Rᵢ + c·Rⱼ)

export function applyRowOp(M, op, F) {
  const A = clone(M);
  if (op.type === 'swap') { [A[op.i], A[op.j]] = [A[op.j], A[op.i]]; }
  else if (op.type === 'scale') { A[op.i] = A[op.i].map((a) => F.mul(op.c, a)); }
  else if (op.type === 'add') { A[op.i] = A[op.i].map((a, k) => F.add(a, F.mul(op.c, A[op.j][k]))); }
  return A;
}

/** The elementary matrix E such that E·M performs op. */
export function elementaryMatrix(n, op, F) {
  return applyRowOp(identity(n, F), op, F);
}

/** Inverse of an elementary operation. */
export function inverseRowOp(op, F) {
  if (op.type === 'swap') return { ...op };
  if (op.type === 'scale') return { ...op, c: F.div(F.one, op.c) };
  return { ...op, c: F.neg(op.c) };
}

function pivotRowFor(A, col, fromRow, F) {
  // Exact fields: the first non-zero entry (the textbook choice). Floats: partial pivoting.
  let p = -1, best = -Infinity;
  for (let r = fromRow; r < A.length; r++) {
    if (F.isZero(A[r][col])) continue;
    if (F.exact) return r;
    const s = F.pivotScore(A[r][col]);
    if (s > best) { best = s; p = r; }
  }
  return p;
}

/**
 * Next Gaussian-elimination step for the current matrix, computed statelessly:
 * first forward elimination to row-echelon form, then scaling and backward
 * elimination to reduced row-echelon form. Only the first `cols` columns are
 * used as pivot columns (so an augmented column is never chosen as a pivot).
 * Returns { op, phase } or null when the matrix is already in RREF.
 */
export function nextEliminationStep(M, F, cols = M[0].length) {
  const rows = M.length;
  let r = 0;
  const pivots = [];
  for (let c = 0; c < cols && r < rows; c++) {
    const p = pivotRowFor(M, c, r, F);
    if (p < 0) continue;
    if (p !== r) return { op: { type: 'swap', i: r, j: p }, phase: 'forward' };
    for (let i = r + 1; i < rows; i++) {
      if (!F.isZero(M[i][c])) {
        return { op: { type: 'add', i, j: r, c: F.neg(F.div(M[i][c], M[r][c])) }, phase: 'forward' };
      }
    }
    pivots.push([r, c]);
    r++;
  }
  for (let k = pivots.length - 1; k >= 0; k--) {
    const [pr, pc] = pivots[k];
    if (!F.eq(M[pr][pc], F.one)) return { op: { type: 'scale', i: pr, c: F.div(F.one, M[pr][pc]) }, phase: 'backward' };
    for (let i = pr - 1; i >= 0; i--) {
      if (!F.isZero(M[i][pc])) return { op: { type: 'add', i, j: pr, c: F.neg(M[i][pc]) }, phase: 'backward' };
    }
  }
  return null;
}

/** Full Gauss–Jordan reduction with the list of steps taken. */
export function rref(M, F, { cols = M[0].length, record = false, maxSteps = 200 } = {}) {
  let A = clone(M);
  const steps = [];
  for (let s = 0; s < maxSteps; s++) {
    const next = nextEliminationStep(A, F, cols);
    if (!next) break;
    A = applyRowOp(A, next.op, F);
    if (!F.exact) A = A.map((row) => row.map((a) => (F.isZero(a) ? F.zero : a)));
    if (record) steps.push({ ...next, matrix: A });
  }
  const pivots = pivotColumns(A, F, cols);
  return { R: A, pivots, rank: pivots.length, steps };
}

export function isRowEchelon(M, F, cols = M[0].length) {
  let lastPivot = -1;
  let zeroRowSeen = false;
  for (const row of M) {
    let p = -1;
    for (let c = 0; c < cols; c++) if (!F.isZero(row[c])) { p = c; break; }
    if (p < 0) { zeroRowSeen = true; continue; }
    if (zeroRowSeen || p <= lastPivot) return false;
    lastPivot = p;
  }
  return true;
}

export function isRREF(M, F, cols = M[0].length) {
  if (!isRowEchelon(M, F, cols)) return false;
  for (let r = 0; r < M.length; r++) {
    let p = -1;
    for (let c = 0; c < cols; c++) if (!F.isZero(M[r][c])) { p = c; break; }
    if (p < 0) continue;
    if (!F.eq(M[r][p], F.one)) return false;
    for (let i = 0; i < M.length; i++) if (i !== r && !F.isZero(M[i][p])) return false;
  }
  return true;
}

/** Pivot columns of a matrix already in echelon form. */
export function pivotColumns(R, F, cols = R[0].length) {
  const pivots = [];
  for (const row of R) {
    for (let c = 0; c < cols; c++) {
      if (!F.isZero(row[c])) { pivots.push(c); break; }
    }
  }
  return pivots;
}

export function rank(M, F) { return rref(M, F).rank; }

export function inverse(M, F) {
  const n = M.length;
  const aug = M.map((row, i) => [...row, ...identity(n, F)[i]]);
  const { R, rank: r } = rref(aug, F, { cols: n });
  if (r < n) return null;
  return R.map((row) => row.slice(n));
}

/** Makes an exact rational vector primitive (integers, gcd 1, first non-zero entry positive). */
export function primitiveVector(v) {
  if (!v.every((x) => x instanceof Rational)) return v;
  let lcm = 1n;
  for (const x of v) lcm = (lcm * x.d) / (bigGcd(lcm, x.d) || 1n);
  let ints = v.map((x) => (x.n * lcm) / x.d);
  let g = 0n;
  for (const k of ints) g = bigGcd(g, k);
  if (g === 0n) return v;
  ints = ints.map((k) => k / g);
  const first = ints.find((k) => k !== 0n);
  if (first < 0n) ints = ints.map((k) => -k);
  return ints.map((k) => new Rational(k));
}

/** Basis of the null space {x : Mx = 0}. */
export function nullspace(M, F, { primitive = true } = {}) {
  const [, n] = shape(M);
  const { R, pivots } = rref(M, F);
  const free = [];
  for (let c = 0; c < n; c++) if (!pivots.includes(c)) free.push(c);
  const basis = free.map((f) => {
    const x = Array.from({ length: n }, () => F.zero);
    x[f] = F.one;
    pivots.forEach((pc, r) => { x[pc] = F.neg(R[r][f]); });
    return x;
  });
  return primitive && F === RationalField ? basis.map(primitiveVector) : basis;
}

/** Basis of the column space: the pivot columns of the original matrix. */
export function columnSpace(M, F) {
  const { pivots } = rref(M, F);
  return pivots.map((c) => M.map((row) => row[c]));
}

/** Basis of the row space: non-zero rows of the RREF. */
export function rowSpace(M, F) {
  const { R, rank: r } = rref(M, F);
  return R.slice(0, r);
}

/**
 * Solves Ax = b. Returns { status: 'unique' | 'infinite' | 'none', rankA, rankAb,
 * particular, homogeneous (basis of Ker A), R (RREF of [A|b]) }.
 */
export function solve(A, b, F) {
  const n = A[0].length;
  const aug = A.map((row, i) => [...row, b[i]]);
  const { R, pivots } = rref(aug, F, { cols: n });
  const rankA = pivots.length;
  // Rank of the augmented matrix: a row [0 … 0 | c] with c ≠ 0 adds one.
  const inconsistent = R.some((row) => row.slice(0, n).every((a) => F.isZero(a)) && !F.isZero(row[n]));
  const rankAb = rankA + (inconsistent ? 1 : 0);
  if (inconsistent) return { status: 'none', rankA, rankAb, R, particular: null, homogeneous: nullspace(A, F) };
  const x = Array.from({ length: n }, () => F.zero);
  pivots.forEach((pc, r) => { x[pc] = R[r][n]; });
  const homogeneous = nullspace(A, F);
  return { status: homogeneous.length ? 'infinite' : 'unique', rankA, rankAb, R, particular: x, homogeneous };
}

// ---------------------------------------------------------------------------
// Conversion helpers between exact and float matrices
// ---------------------------------------------------------------------------

export const toFloatMatrix = (M, F = RationalField) => M.map((row) => row.map((a) => F.toNumber(a)));
export const toFloatVector = (v, F = RationalField) => v.map((a) => F.toNumber(a));

/**
 * Picks the right field for a matrix of entries { x, q }: exact when every
 * entry has an exact rational value, floating point otherwise.
 * Returns { F, M } with M expressed in that field.
 */
export function fieldMatrix(entries) {
  if (entries.every((row) => row.every((e) => e.q))) {
    return { F: RationalField, M: entries.map((row) => row.map((e) => e.q)) };
  }
  const M = entries.map((row) => row.map((e) => e.x));
  return { F: floatFieldFor(M), M };
}

export function fieldVector(entries, F) {
  return F === RationalField ? entries.map((e) => e.q) : entries.map((e) => e.x);
}

// ---------------------------------------------------------------------------
// Small float helpers used by the renderers (hot paths, no field overhead)
// ---------------------------------------------------------------------------

export const mv2 = (m, x, y) => [m[0][0] * x + m[0][1] * y, m[1][0] * x + m[1][1] * y];
export const mv3 = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpMatrix = (A, B, t) => A.map((row, i) => row.map((a, j) => lerp(a, B[i][j], t)));
export const identityFloat = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const mulFloat = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
export const det2 = (m) => m[0][0] * m[1][1] - m[0][1] * m[1][0];
export const det3 = (m) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
export const inv2 = (m) => {
  const d = det2(m);
  if (Math.abs(d) < 1e-12) return null;
  return [[m[1][1] / d, -m[0][1] / d], [-m[1][0] / d, m[0][0] / d]];
};
export const norm = (v) => Math.hypot(...v);
export const dotFloat = (u, v) => u.reduce((s, a, i) => s + a * v[i], 0);
export const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
export const scaleVec = (v, c) => v.map((a) => a * c);
export const addVec = (u, v) => u.map((a, i) => a + v[i]);
export const subVec = (u, v) => u.map((a, i) => a - v[i]);
export const normalize = (v) => { const n = norm(v); return n < 1e-15 ? v.map(() => 0) : v.map((a) => a / n); };
