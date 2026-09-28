// Scalar fields used by the generic linear-algebra routines.
//
// A field object exposes: zero, one, add, sub, mul, div, neg, isZero, fromInt,
// toNumber (real approximation), magnitude (for pivot selection) and exact (bool).
// Algorithms in linalg.js are written once against this interface, so the same
// code runs over ℚ (exact), ℚ(√m) (exact, including m < 0 for complex numbers),
// floating-point reals and floating-point complex numbers.

import { Rational, Q } from './rational.js';

export const RationalField = {
  name: 'Q',
  exact: true,
  zero: Q.ZERO,
  one: Q.ONE,
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  div: (a, b) => a.div(b),
  neg: (a) => a.neg(),
  isZero: (a) => a.isZero(),
  eq: (a, b) => a.equals(b),
  fromInt: (k) => Rational.of(k),
  toNumber: (a) => a.toNumber(),
  magnitude: (a) => Math.abs(a.toNumber()),
  // Prefer simple pivots (small complexity) to keep intermediate fractions readable.
  pivotScore: (a) => (a.isZero() ? -Infinity : -a.complexity),
};

/** Element a + b√m of the quadratic field ℚ(√m); m is a square-free integer ≠ 1 (may be negative). */
export class Surd {
  constructor(a, b, m) {
    this.a = a; // Rational
    this.b = b; // Rational
    this.m = m; // BigInt, square-free
  }
  isZero() { return this.a.isZero() && this.b.isZero(); }
  isRational() { return this.b.isZero(); }
  /** Real part approximation (for m < 0 this is the real part of a complex number). */
  re() { return this.m < 0n ? this.a.toNumber() : this.a.toNumber() + this.b.toNumber() * Math.sqrt(Number(this.m)); }
  im() { return this.m < 0n ? this.b.toNumber() * Math.sqrt(-Number(this.m)) : 0; }
}

export function SurdField(m) {
  m = BigInt(m);
  const mk = (a, b) => new Surd(a, b, m);
  const mQ = new Rational(m);
  const F = {
    name: `Q(√${m})`,
    exact: true,
    m,
    zero: mk(Q.ZERO, Q.ZERO),
    one: mk(Q.ONE, Q.ZERO),
    make: mk,
    fromRational: (r) => mk(r, Q.ZERO),
    add: (x, y) => mk(x.a.add(y.a), x.b.add(y.b)),
    sub: (x, y) => mk(x.a.sub(y.a), x.b.sub(y.b)),
    mul: (x, y) => mk(x.a.mul(y.a).add(x.b.mul(y.b).mul(mQ)), x.a.mul(y.b).add(x.b.mul(y.a))),
    neg: (x) => mk(x.a.neg(), x.b.neg()),
    conj: (x) => mk(x.a, x.b.neg()),
    norm: (x) => x.a.mul(x.a).sub(mQ.mul(x.b).mul(x.b)),
    div(x, y) {
      const n = F.norm(y);
      if (n.isZero()) throw new RangeError('Surd: division by zero');
      const num = F.mul(x, F.conj(y));
      return mk(num.a.div(n), num.b.div(n));
    },
    isZero: (x) => x.isZero(),
    eq: (x, y) => x.a.equals(y.a) && x.b.equals(y.b),
    fromInt: (k) => mk(Rational.of(k), Q.ZERO),
    toNumber: (x) => x.re(),
    magnitude: (x) => Math.hypot(x.re(), x.im()),
    pivotScore: (x) => (x.isZero() ? -Infinity : -(x.a.complexity + (x.b.isZero() ? 0 : x.b.complexity + 4))),
  };
  return F;
}

/** Floating-point reals with an absolute tolerance for zero tests. */
export function FloatField(tol = 1e-10) {
  return {
    name: 'R',
    exact: false,
    tol,
    zero: 0,
    one: 1,
    add: (a, b) => a + b,
    sub: (a, b) => a - b,
    mul: (a, b) => a * b,
    div: (a, b) => a / b,
    neg: (a) => -a,
    isZero: (a) => Math.abs(a) <= tol,
    eq: (a, b) => Math.abs(a - b) <= tol,
    fromInt: (k) => k,
    toNumber: (a) => a,
    magnitude: (a) => Math.abs(a),
    pivotScore: (a) => (Math.abs(a) <= tol ? -Infinity : Math.abs(a)),
  };
}

/** Floating-point complex numbers {re, im}. */
export function ComplexField(tol = 1e-9) {
  const c = (re, im = 0) => ({ re, im });
  return {
    name: 'C',
    exact: false,
    tol,
    zero: c(0, 0),
    one: c(1, 0),
    make: c,
    add: (x, y) => c(x.re + y.re, x.im + y.im),
    sub: (x, y) => c(x.re - y.re, x.im - y.im),
    mul: (x, y) => c(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re),
    div(x, y) {
      const d = y.re * y.re + y.im * y.im;
      return c((x.re * y.re + x.im * y.im) / d, (x.im * y.re - x.re * y.im) / d);
    },
    neg: (x) => c(-x.re, -x.im),
    isZero: (x) => Math.hypot(x.re, x.im) <= tol,
    eq: (x, y) => Math.hypot(x.re - y.re, x.im - y.im) <= tol,
    fromInt: (k) => c(k, 0),
    toNumber: (x) => x.re,
    magnitude: (x) => Math.hypot(x.re, x.im),
    pivotScore: (x) => { const m = Math.hypot(x.re, x.im); return m <= tol ? -Infinity : m; },
  };
}

/** Chooses a float tolerance proportional to the size of the entries. */
export function floatFieldFor(matrix, rel = 1e-10) {
  let scale = 1;
  for (const row of matrix) for (const v of row) scale = Math.max(scale, Math.abs(v));
  return FloatField(rel * scale);
}
