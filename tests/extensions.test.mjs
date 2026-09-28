// Tests for the mathematics behind the modules added after the first release:
// LU, determinant by elimination, e^{tA}, polynomial spaces and interpolation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Rational } from '../assets/js/core/rational.js';
import { parseNumber } from '../assets/js/core/parse.js';
import { RationalField as F } from '../assets/js/core/fields.js';
import * as L from '../assets/js/core/linalg.js';
import { basisPolys, operatorMatrix, vandermonde, polyMul, evalAsc } from '../assets/js/core/polyspace.js';

const q = (x) => (typeof x === 'string' ? parseNumber(x).q : Rational.of(x));
const R = (rows) => rows.map((row) => row.map((x) => q(x)));
const Rv = (v) => v.map((x) => q(x));
const str = (M) => M.map((row) => row.map((x) => x.toString()));
const near = (a, b, eps = 1e-10) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('LU: A = LU without swaps and PA = LU with them, exactly', () => {
  const A = R([[1, 2], [3, -1]]);
  const f = L.lu(A, F);
  assert.equal(f.swapped, false);
  assert.deepEqual(str(f.L), [['1', '0'], ['3', '1']]);
  assert.deepEqual(str(f.U), [['1', '2'], ['0', '-7']]);
  for (const M of [R([[0, 1, 2], [2, 3, 1], [4, 1, 5]]), R([[2, 1, 1], [4, 3, 3], [8, 7, 9]]), R([[0, 2, 1], [0, 1, 1], [3, 1, 2]]), R([['1/2', '-1/3', 2], [1, 0, '5/7'], [-3, 4, 1]])]) {
    const { L: Lm, U, P } = L.lu(M, F);
    assert.ok(L.matEq(L.matMul(P, M, F), L.matMul(Lm, U, F), F), 'PA = LU');
    Lm.forEach((row, i) => row.forEach((x, j) => { if (j > i) assert.ok(x.isZero()); if (j === i) assert.ok(x.isOne()); }));
    U.forEach((row, i) => row.forEach((x, j) => { if (j < i) assert.ok(x.isZero()); }));
  }
});

test('determinant by elimination agrees with the cofactor determinant', () => {
  for (const M of [R([[2, 1, 0], [0, 1, 1], [1, 0, 1]]), R([[0, 2, 1], [1, 1, 1], [2, 1, 3]]), R([[1, 0, 1], [0, 1, 1], [1, 1, 2]]), R([['1/2', 3, -1], [2, '2/3', 0], [1, 1, 1]])]) {
    const { U, swaps } = L.triangularize(M, F);
    let d = swaps % 2 ? q(-1) : q(1);
    U.forEach((row, i) => { d = d.mul(row[i]); });
    assert.equal(d.toString(), L.det(M, F).toString());
  }
});

test('e^{tA} (Cayley–Hamilton) matches the exponential series', () => {
  const series = (A, t) => {
    let term = L.identityFloat(2), sum = L.identityFloat(2);
    for (let k = 1; k < 60; k++) {
      term = L.mulFloat(term, A).map((row) => row.map((x) => (x * t) / k));
      sum = sum.map((row, i) => row.map((x, j) => x + term[i][j]));
    }
    return sum;
  };
  const cases = [
    [[-1, -2], [2, -1]], // complex eigenvalues
    [[2, 1], [1, 2]], // real, distinct
    [[1, 1], [0, 1]], // defective (double eigenvalue)
    [[0, 1], [-1, 0]], // rotation
    [[3, 0], [0, 3]], // scalar
  ];
  for (const A of cases) for (const t of [0, 0.3, 1, 2.5]) {
    const E = L.expm2(A, t), S = series(A, t);
    E.forEach((row, i) => row.forEach((x, j) => near(x, S[i][j], 1e-9)));
  }
});

test('polynomial bases: Taylor and Lagrange coordinates, Legendre orthogonality', () => {
  const p = Rv([1, 2, -1]); // 1 + 2x − x² = 2 − (x − 1)²
  const coords = (B) => L.solve(L.transpose(B), p, F).particular.map((x) => x.toString());
  assert.deepEqual(coords(basisPolys('taylor', 2, F, { c: q(1) })), ['2', '0', '-1']);
  const nodes = Rv([-1, 0, 1]);
  const values = nodes.map((x) => p[0].add(p[1].mul(x)).add(p[2].mul(x).mul(x)).toString());
  assert.deepEqual(coords(basisPolys('lagrange', 2, F, { nodes })), values);
  assert.equal(basisPolys('lagrange', 2, F, { nodes: Rv([0, 1, 1]) }), null, 'repeated nodes');
  // ∫₋₁¹ xᵏ dx = 2/(k + 1) for even k and 0 for odd k.
  const integral = (poly) => poly.reduce((s, a, k) => (k % 2 ? s : s.add(a.mul(q(2)).div(q(k + 1)))), q(0));
  const P = basisPolys('legendre', 3, F);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const v = integral(polyMul(P[i], P[j], F));
    if (i === j) assert.equal(v.toString(), q(2).div(q(2 * i + 1)).toString());
    else assert.ok(v.isZero(), `⟨P${i}, P${j}⟩ = 0`);
  }
});

test('operators on 𝒫₃: D is nilpotent, S = e^D, x·D is diagonal', () => {
  const D = operatorMatrix('D', 3, F), S = operatorMatrix('S', 3, F), T = operatorMatrix('xD', 3, F);
  let Dk = L.identity(4, F), expD = L.identity(4, F), fact = q(1);
  for (let k = 1; k <= 4; k++) {
    Dk = L.matMul(Dk, D, F);
    fact = fact.mul(q(k));
    expD = L.matAdd(expD, L.matScale(Dk, q(1).div(fact), F), F);
  }
  assert.ok(L.isZeroMatrix(Dk, F), 'D⁴ = 0');
  assert.ok(L.matEq(expD, S, F), 'S = I + D + D²/2 + D³/6');
  T.forEach((row, i) => row.forEach((x, j) => assert.equal(x.toString(), i === j ? String(i) : '0')));
  // S(p)(x) = p(x + 1) on an example.
  const p = Rv([1, -2, 0, 1]);
  const Sp = L.matVec(S, p, F).map((x) => x.toNumber());
  for (const x of [-1.5, 0, 2]) near(evalAsc(Sp, x), evalAsc(p.map((a) => a.toNumber()), x + 1));
});

test('interpolation: Vandermonde determinant and the unique interpolant', () => {
  const xs = Rv([-1, 0, 1, 2]), ys = Rv([1, -1, 0, 2]);
  const V = vandermonde(xs, F);
  const d = L.triangularize(V, F);
  let det = d.swaps % 2 ? q(-1) : q(1);
  d.U.forEach((row, i) => { det = det.mul(row[i]); });
  assert.equal(det.toString(), '12', '∏(xⱼ − xᵢ) = 1·2·3·1·2·1');
  const sol = L.solve(V, ys, F);
  assert.equal(sol.status, 'unique');
  assert.deepEqual(sol.particular.map((x) => x.toString()), ['-1', '-1/6', '3/2', '-1/3']);
});
