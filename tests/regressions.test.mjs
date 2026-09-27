// Regression tests for issues found in the code review of the rewrite.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseNumber } from '../assets/js/core/parse.js';
import { codec } from '../assets/js/ui/store.js';
import { svd } from '../assets/js/core/svd.js';
import { eigenAnalysis } from '../assets/js/core/eigen.js';
import { FloatField } from '../assets/js/core/fields.js';
import * as L from '../assets/js/core/linalg.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('commas inside function calls separate arguments; top-level commas are decimals', () => {
  near(parseNumber('max(1,2)').x, 2);
  near(parseNumber('atan2(1,2)').x, Math.atan2(1, 2));
  near(parseNumber('hypot(3,4)').x, 5);
  assert.equal(parseNumber('0,5').q.toString(), '1/2');
  assert.equal(parseNumber('-1,25').q.toString(), '-5/4');
});

test('matrix and vector codecs round-trip every valid entry', () => {
  const c = codec.matrix(2, 2);
  const texts = [['cos pi', 'max(1, 2)'], ['2 3', '0,5']];
  const m = texts.map((row) => row.map((t) => ({ text: t })));
  const back = c.parse(c.format(m));
  assert.ok(back, 'parses back');
  assert.deepEqual(back.map((r) => r.map((e) => e.text)), texts);
  near(back[0][0].x, -1); near(back[0][1].x, 2); near(back[1][0].x, 6); near(back[1][1].x, 0.5);
  const v = codec.vector(2);
  const vb = v.parse(v.format([{ text: 'atan2(1, 2)' }, { text: '1/3' }]));
  near(vb[0].x, Math.atan2(1, 2));
  // Plain URLs stay readable.
  assert.equal(c.format([[{ text: '1' }, { text: '-2' }], [{ text: '1/3' }, { text: '0.5' }]]), '1,-2;1/3,0.5');
});

test('SVD detects rank deficiency from rounding-level eigenvalues', () => {
  for (const A of [[[3, 1], [6, 2]], [[0.3, 0.1], [0.6, 0.2]], [[1e-3, 2e-3], [2e-3, 4e-3]]]) {
    const r = svd(A);
    assert.equal(r.rank, 1, JSON.stringify(A));
    assert.equal(r.S[1], 0);
    // U must stay orthogonal.
    const U = r.U;
    near(U[0][0] * U[0][1] + U[1][0] * U[1][1], 0, 1e-9);
    near(Math.hypot(U[0][1], U[1][1]), 1, 1e-9);
  }
});

test('numeric eigenvalues: multiple roots are recognised (scalar and Jordan-like)', () => {
  const s = Math.SQRT2;
  const r = eigenAnalysis({ exact: null, float: [[s, 0, 0], [0, s, 0], [0, 0, s]] });
  assert.equal(r.eigen.length, 1);
  assert.equal(r.eigen[0].alg, 3);
  assert.equal(r.eigen[0].geo, 3);
  near(r.eigen[0].approx.re, s, 1e-9);
  assert.ok(r.eigen.every((e) => e.real));
  const J = eigenAnalysis({ exact: null, float: [[s, 1, 0], [0, s, 1], [0, 0, s]] });
  assert.equal(J.eigen.length, 1);
  assert.equal(J.eigen[0].alg, 3);
  assert.equal(J.eigen[0].geo, 1);
  // Close but distinct eigenvalues must not be merged.
  const D = eigenAnalysis({ exact: null, float: [[1, 0, 0], [0, 1 + 1e-4, 0], [0, 0, 2 * s]] });
  assert.equal(D.eigen.length, 3);
});

test('float elimination with full-precision coefficients reaches RREF', () => {
  const F = FloatField(1e-10 * 2);
  let M = [[Math.sqrt(3), 1, 1], [1, 2, 1]];
  for (let k = 0; k < 20; k++) {
    const next = L.nextEliminationStep(M, F, 2);
    if (!next) break;
    const op = { ...next.op };
    if (op.c !== undefined) op.c = parseFloat(String(op.c)); // what the URL stores
    M = L.applyRowOp(M, op, F).map((row) => row.map((v) => (F.isZero(v) ? 0 : v)));
  }
  assert.ok(L.isRREF(M, F, 2));
});
