import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Rational, sqrtRational, squareFreeDecomposition } from '../assets/js/core/rational.js';
import { RationalField, SurdField, FloatField, ComplexField } from '../assets/js/core/fields.js';
import * as L from '../assets/js/core/linalg.js';
import { parseNumber, compileFormula, makeEntry } from '../assets/js/core/parse.js';
import { eigenAnalysis, rotationScalingForm, realEigenDirections } from '../assets/js/core/eigen.js';
import { svd, symmetricEigen } from '../assets/js/core/svd.js';
import { texValue, texRational, texSurd, texSurdPair, texPoly, recognize, fmtDecimal, plainValue } from '../assets/js/core/format.js';

const q = (n, d = 1) => Rational.of(n, d);
const Qm = (rows) => rows.map((r) => r.map((x) => (x instanceof Rational ? x : Array.isArray(x) ? q(x[0], x[1]) : q(x))));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('rational arithmetic and normalization', () => {
  assert.equal(q(2, -4).toString(), '-1/2');
  assert.equal(q(1, 3).add(q(1, 6)).toString(), '1/2');
  assert.equal(q(3, 4).div(q(-3, 2)).toString(), '-1/2');
  assert.equal(q(2, 3).pow(-2).toString(), '9/4');
  assert.equal(Rational.fromDecimalString('-0.125').toString(), '-1/8');
  assert.equal(Rational.fromDecimalString('.5').toString(), '1/2');
  assert.equal(Rational.fromNumber(1.3).toString(), '13/10');
  assert.equal(Rational.approximate(-1 / 3).toString(), '-1/3');
  assert.equal(Rational.approximate(Math.PI, 1000, 1e-10), null);
});

test('square roots of rationals', () => {
  assert.deepEqual(squareFreeDecomposition(72n), { k: 6n, m: 2n });
  const s = sqrtRational(q(8, 9)); // 2√2/3
  assert.equal(s.coef.toString(), '2/3');
  assert.equal(s.m, 2n);
});

test('parser: exact values', () => {
  const cases = {
    '1/3': '1/3', '-0.25': '-1/4', '0,5': '1/2', '2^-2': '1/4', '√4/6': '1/3',
    'cos(pi/3)': '1/2', 'sin(7π/6)': '-1/2', 'tan(3pi/4)': '-1', 'cos(-2pi/3)': '-1/2',
    '(1+2)(3-1)': '6', '−3/2': '-3/2', '|−2|': '2', '3²': '9', '2(1/4)': '1/2',
  };
  for (const [src, exp] of Object.entries(cases)) {
    const r = parseNumber(src);
    assert.ok(r.ok, src);
    assert.ok(r.q, `${src} should be exact`);
    assert.equal(r.q.toString(), exp, src);
  }
});

test('parser: irrational values and errors', () => {
  const r = parseNumber('√2/2');
  assert.ok(r.ok && !r.q);
  near(r.x, Math.SQRT1_2);
  near(parseNumber('2π').x, 2 * Math.PI);
  near(parseNumber('sqrt2').x, Math.SQRT2);
  near(parseNumber('1e-3').x, 0.001);
  near(parseNumber('2e').x, 2 * Math.E);
  for (const bad of ['', '1/', '(2', 'foo', '2**', '1/0']) assert.equal(parseNumber(bad).ok, false, bad);
});

test('formula compilation', () => {
  const f = compileFormula('x + 0.8 sin(1.5y)');
  assert.ok(f.ok);
  near(f.fn(1, 2), 1 + 0.8 * Math.sin(3));
  const g = compileFormula('xy + atan2(y, x)');
  near(g.fn(2, 3), 6 + Math.atan2(3, 2));
  assert.equal(compileFormula('x + z').ok, false);
});

test('determinant, inverse and rank (exact)', () => {
  const A = Qm([[2, 1, 0], [1, 2, 0], [0, 0, 1]]);
  assert.equal(L.det(A, RationalField).toString(), '3');
  const inv = L.inverse(A, RationalField);
  assert.deepEqual(inv.map((r) => r.map(String)), [['2/3', '-1/3', '0'], ['-1/3', '2/3', '0'], ['0', '0', '1']]);
  const S = Qm([[1, 2, 3], [2, 4, 6], [1, 0, 1]]);
  assert.equal(L.rank(S, RationalField), 2);
  assert.equal(L.inverse(S, RationalField), null);
  const K = L.nullspace(S, RationalField);
  assert.equal(K.length, 1);
  assert.deepEqual(K[0].map(String), ['1', '1', '-1']);
  assert.ok(L.matVec(S, K[0], RationalField).every((x) => x.isZero()));
});

test('elimination steps reach RREF and elementary matrices reproduce them', () => {
  const A = Qm([[0, 2, 4], [1, 1, 1], [2, 4, 8]]);
  const { R, steps } = L.rref(A, RationalField, { record: true });
  assert.ok(L.isRREF(R, RationalField));
  let E = L.identity(3, RationalField);
  for (const s of steps) E = L.matMul(L.elementaryMatrix(3, s.op, RationalField), E, RationalField);
  assert.ok(L.matEq(L.matMul(E, A, RationalField), R, RationalField));
  assert.equal(steps[0].op.type, 'swap');
});

test('solve classifies systems (Rouché–Frobenius)', () => {
  const F = RationalField;
  const unique = L.solve(Qm([[1, 1], [1, -1]]), [q(3), q(1)], F);
  assert.equal(unique.status, 'unique');
  assert.deepEqual(unique.particular.map(String), ['2', '1']);
  const none = L.solve(Qm([[1, 1], [2, 2]]), [q(1), q(3)], F);
  assert.equal(none.status, 'none');
  assert.equal(none.rankAb, 2);
  const inf = L.solve(Qm([[1, 1, 1], [2, 2, 2]]), [q(1), q(2)], F);
  assert.equal(inf.status, 'infinite');
  assert.equal(inf.homogeneous.length, 2);
});

test('float field with tolerance', () => {
  const F = FloatField(1e-9);
  const A = [[0.1, 0.2], [0.3, 0.6]];
  assert.equal(L.rank(A, F), 1);
});

test('eigen 2×2 exact: rational, surd, complex, defective', () => {
  const rat = eigenAnalysis({ exact: Qm([[2, 1], [1, 2]]), float: [[2, 1], [1, 2]] });
  assert.ok(rat.exact);
  assert.deepEqual(rat.eigen.map((e) => e.value.toString()), ['3', '1']);
  assert.deepEqual(rat.eigen[0].vectors[0].map(String), ['1', '1']);

  const fib = eigenAnalysis({ exact: Qm([[1, 1], [1, 0]]), float: [[1, 1], [1, 0]] });
  assert.equal(texSurd(fib.eigen[0].value), '\\frac{1 + \\sqrt{5}}{2}');
  near(fib.eigen[0].approx.re, (1 + Math.sqrt(5)) / 2);

  const rot = eigenAnalysis({ exact: Qm([[0, -1], [1, 0]]), float: [[0, -1], [1, 0]] });
  assert.equal(rot.eigen.every((e) => !e.real), true);
  assert.equal(texSurd(rot.eigen[0].value), 'i');
  assert.equal(texSurdPair(rot.eigen[0].value), '\\pm i');
  const rs = rotationScalingForm(rot);
  near(rs.theta, Math.PI / 2);

  const shear = eigenAnalysis({ exact: Qm([[1, 1], [0, 1]]), float: [[1, 1], [0, 1]] });
  assert.equal(shear.eigen.length, 1);
  assert.equal(shear.eigen[0].alg, 2);
  assert.equal(shear.eigen[0].geo, 1);
});

test('eigen 3×3 exact via rational root, and numeric fallback', () => {
  const A = Qm([[2, 0, 0], [0, 1, 1], [0, 1, 0]]); // 2 and (1 ± √5)/2
  const r = eigenAnalysis({ exact: A, float: L.toFloatMatrix(A) });
  assert.ok(r.exact);
  const approx = r.eigen.map((e) => e.approx.re).sort((a, b) => a - b);
  near(approx[0], (1 - Math.sqrt(5)) / 2);
  near(approx[2], 2);

  const I = Qm([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const ri = eigenAnalysis({ exact: I, float: L.toFloatMatrix(I) });
  assert.equal(ri.eigen.length, 1);
  assert.equal(ri.eigen[0].alg, 3);
  assert.equal(ri.eigen[0].geo, 3);

  // Irreducible cubic λ³ − 2 (companion matrix): numeric path.
  const C = Qm([[0, 0, 2], [1, 0, 0], [0, 1, 0]]);
  const rc = eigenAnalysis({ exact: C, float: L.toFloatMatrix(C) });
  assert.equal(rc.exact, false);
  near(rc.eigen[0].approx.re, Math.cbrt(2), 1e-9);
  assert.equal(rc.eigen.filter((e) => !e.real).length, 2);

  // Rotation with irrational entries (numeric) keeps its real axis.
  const c = Math.cos(1), s = Math.sin(1);
  const Rz = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  const rr = eigenAnalysis({ exact: null, float: Rz });
  const dirs = realEigenDirections(rr);
  assert.equal(dirs.length, 1);
  near(Math.abs(dirs[0].dirs[0][2]), 1);
});

test('symmetric eigen and SVD', () => {
  const { values } = symmetricEigen([[2, 1], [1, 2]]);
  near(values[0], 3); near(values[1], 1);
  const A = [[3, 0], [4, 5]];
  const { U, S, V } = svd(A);
  near(S[0], 3 * Math.sqrt(5)); near(S[1], Math.sqrt(5));
  const rebuilt = L.mulFloat(L.mulFloat(U, [[S[0], 0], [0, S[1]]]), L.transpose(V));
  rebuilt.forEach((row, i) => row.forEach((x, j) => near(x, A[i][j], 1e-9)));
  assert.ok(L.det2(V) > 0);
  const R1 = svd([[1, 2], [2, 4]]);
  assert.equal(R1.rank, 1);
  const B = [[1, 0], [0, 1], [1, 1]];
  const b = svd(B);
  near(b.S[0], Math.sqrt(3)); near(b.S[1], 1);
});

test('formatting', () => {
  assert.equal(texRational(q(-1, 3)), '-\\frac{1}{3}');
  assert.equal(texValue(Math.SQRT1_2), '\\frac{\\sqrt{2}}{2}');
  assert.equal(texValue(-0.5), '-\\frac{1}{2}');
  assert.equal(texValue(Math.PI), '3.142');
  assert.equal(recognize(Math.sqrt(3) / 2).m, 3);
  assert.equal(fmtDecimal(-1e-15), '0');
  assert.equal(fmtDecimal(-0.0001), '−1.0e−4');
  assert.equal(fmtDecimal(-1.25), '−1.25');
  assert.equal(texPoly([q(1), q(-3), q(2)]), '\\lambda^{2} - 3\\lambda + 2');
  assert.equal(texPoly([q(1), q(0), q(1)]), '\\lambda^{2} + 1');
  assert.equal(plainValue(q(-3, 2)), '−3/2');
  assert.equal(texRational(q(1234567, 1000)).startsWith('\\approx'), true);
  const F = SurdField(-4n);
  assert.ok(F);
});

test('complex nullspace', () => {
  const F = ComplexField(1e-9);
  // A − iI for A = rotation by 90°
  const M = [[{ re: 0, im: -1 }, { re: -1, im: 0 }], [{ re: 1, im: 0 }, { re: 0, im: -1 }]];
  const K = L.nullspace(M, F);
  assert.equal(K.length, 1);
});

test('entries', () => {
  const e = makeEntry('1/3');
  assert.equal(e.ok, true);
  assert.equal(e.q.toString(), '1/3');
  assert.equal(makeEntry('x').ok, false);
});
