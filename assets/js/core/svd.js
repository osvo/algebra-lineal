// Singular value decomposition for small matrices (floating point).

import { transpose, mulFloat, normalize, dotFloat, det2, det3 } from './linalg.js';

/** Eigen-decomposition of a real symmetric matrix by cyclic Jacobi rotations. */
export function symmetricEigen(S) {
  const n = S.length;
  const A = S.map((row) => row.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => A[j][j] - A[i][i]);
  return {
    values: order.map((i) => A[i][i]),
    vectors: order.map((i) => V.map((row) => row[i])), // list of column vectors
  };
}

function completeOrthonormal(vectors, dim) {
  const out = vectors.map((v) => v.slice());
  for (let e = 0; e < dim && out.length < dim; e++) {
    let w = Array.from({ length: dim }, (_, i) => (i === e ? 1 : 0));
    for (const u of out) {
      const d = dotFloat(w, u);
      w = w.map((x, i) => x - d * u[i]);
    }
    if (Math.hypot(...w) > 1e-6) out.push(normalize(w));
  }
  return out;
}

const detOf = (cols) => {
  const M = transpose(cols);
  return M.length === 2 ? det2(M) : M.length === 3 ? det3(M) : 1;
};

/**
 * Thin-to-full SVD of an m×n real matrix: A = U Σ Vᵀ.
 * Returns { U (m×m), S (singular values, length min(m,n), descending), V (n×n),
 *           u (list of columns of U), v (list of columns of V), rank }.
 * For square matrices V is chosen with det V = +1 (a rotation), so that any
 * reflection lives in U; this keeps the animation "rotate, stretch, rotate(/reflect)".
 */
export function svd(A) {
  const m = A.length, n = A[0].length;
  const AtA = mulFloat(transpose(A), A);
  const { values, vectors } = symmetricEigen(AtA);
  const k = Math.min(m, n);
  const S = values.slice(0, k).map((l) => Math.sqrt(Math.max(0, l)));
  // σ = √λ inherits a relative error of order √ε from λ, so rank is decided relative to σ₁.
  const eps = Math.max(1e-7 * (S[0] || 0), 1e-300);
  let v = vectors.map((x) => normalize(x));
  if (n >= 2 && detOf(v) < 0) v[n - 1] = v[n - 1].map((x) => -x);
  const u = [];
  let rank = 0;
  for (let i = 0; i < k; i++) {
    if (S[i] > eps) {
      rank++;
      const Av = A.map((row) => dotFloat(row, v[i]));
      u.push(Av.map((x) => x / S[i]));
    } else {
      S[i] = 0;
    }
  }
  let uFull = completeOrthonormal(u.map(normalize), m);
  // For the completed columns (zero singular values) choose orientation det U = +1.
  if (m >= 2 && uFull.length === m && rank < m && detOf(uFull) < 0) {
    uFull[m - 1] = uFull[m - 1].map((x) => -x);
  }
  return { U: transpose(uFull), V: transpose(v), S, u: uFull, v, rank };
}

export function conditionNumber(S) {
  const min = S[S.length - 1];
  return min <= 0 ? Infinity : S[0] / min;
}
